/* Final auth coordinator for iOS/PWA.
 *
 * Keep one owner for session restoration. Known workspaces are resolved directly
 * and then handed to the original app bootstrap, avoiding the stacked
 * workspace/OAuth wrapper loop that could leave the UI on "Restoring secure
 * session..." forever. Every recovery stage is bounded and has a usable fallback.
 */
'use strict';
(()=>{
  if(window.__mmAuthSessionRecoveryLoaded)return;
  window.__mmAuthSessionRecoveryLoaded=true;
  if(typeof client==='undefined'||!client?.auth||typeof window.bootstrap!=='function')return;

  const wrappedBootstrap=window.bootstrap;
  const coreBootstrap=window.__mmAppBootstrap||wrappedBootstrap;
  const GOOGLE_INTENT_KEY='mm_google_auth_intent_v1';
  const WORKSPACE_CHOICE_KEY='mm_workspace_choice_v1';
  const GOOGLE_INTENT_TTL=20*60*1000;
  const RPC_TIMEOUT=9000;
  const CORE_TIMEOUT=14000;
  const WRAPPER_TIMEOUT=12000;
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  let activePromise=null;
  let signedOutAt=0;
  let authGeneration=0;
  let reconcileTimer=null;

  function withTimeout(work,ms,label){
    let timer;
    const timeout=new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(new Error(`${label} timed out. Please retry.`)),ms);
    });
    return Promise.race([Promise.resolve(work),timeout]).finally(()=>clearTimeout(timer));
  }

  async function storedSession(){
    try{
      const result=await withTimeout(client.auth.getSession(),5000,'Session check');
      return result?.data?.session||null;
    }catch(error){
      console.warn('Session check failed',error);
      return null;
    }
  }

  function appIsOpen(s){
    if(!s?.user||!document.querySelector('.layout'))return false;
    try{return !!(session?.user?.id===s.user.id&&profile);}
    catch(_){return true;}
  }

  function chooserIsOpen(){return !!document.querySelector('.workspace-choice-card');}
  function authUiIsOpen(){return !!document.querySelector('.auth-page,.login');}

  function showRestoring(){
    if(document.querySelector('.layout')||chooserIsOpen())return;
    const app=document.getElementById('app');
    if(!app)return;
    app.innerHTML='<div class="login"><div class="card"><h1>Mess Manager</h1><p class="muted">Restoring secure session…</p></div></div>';
  }

  function readGoogleIntent(){
    try{
      const value=JSON.parse(localStorage.getItem(GOOGLE_INTENT_KEY)||'null');
      if(!value?.id||!value?.kind||Date.now()-Number(value.startedAt||0)>GOOGLE_INTENT_TTL){
        localStorage.removeItem(GOOGLE_INTENT_KEY);
        return null;
      }
      return value;
    }catch(_){
      try{localStorage.removeItem(GOOGLE_INTENT_KEY)}catch(__){ }
      return null;
    }
  }

  function finishExistingGoogleIntent(){
    try{localStorage.removeItem(GOOGLE_INTENT_KEY)}catch(_){ }
    try{
      const url=new URL(location.href);
      if(url.searchParams.has('google_flow')){
        url.searchParams.delete('google_flow');
        history.replaceState({},document.title,`${url.pathname}${url.search}${url.hash}`);
      }
    }catch(_){ }
  }

  function rememberedWorkspace(userId,spaces){
    try{
      const value=JSON.parse(localStorage.getItem(WORKSPACE_CHOICE_KEY)||'null');
      if(value?.userId!==userId||!value?.memberId)return null;
      return spaces.find(space=>String(space.member_id)===String(value.memberId))||null;
    }catch(_){return null;}
  }

  async function selectWorkspace(space){
    if(!space?.member_id)throw new Error('Workspace membership is unavailable.');
    if(space.selected)return;
    const selected=await withTimeout(
      client.rpc('select_workspace',{p_member_id:space.member_id}),
      RPC_TIMEOUT,
      'Workspace selection'
    );
    if(selected?.error)throw selected.error;
  }

  async function openCore(s,{retry=true}={}){
    await withTimeout(coreBootstrap(s),CORE_TIMEOUT,'App data');
    if(appIsOpen(s))return true;
    if(!retry)return false;
    await sleep(260);
    await withTimeout(coreBootstrap(s),CORE_TIMEOUT,'App data retry');
    return appIsOpen(s);
  }

  async function directWorkspaceOpen(s){
    const result=await withTimeout(client.rpc('list_my_workspaces'),RPC_TIMEOUT,'Workspace list');
    if(result?.error)throw result.error;
    const spaces=Array.isArray(result?.data)?result.data:[];

    if(!spaces.length)return{opened:false,empty:true};

    /* A returned membership means Google/OTP identity resolution is already done.
       Clear a completed OAuth intent so a later refresh cannot re-run onboarding. */
    finishExistingGoogleIntent();

    if(spaces.length===1){
      await selectWorkspace(spaces[0]);
      return{opened:await openCore(s),empty:false};
    }

    const selected=spaces.find(space=>space.selected);
    const remembered=selected||rememberedWorkspace(s.user.id,spaces);
    if(remembered){
      await selectWorkspace(remembered);
      return{opened:await openCore(s),empty:false};
    }

    /* Preserve the existing multi-workspace chooser UI. It has its own secure
       select_workspace call and opens the core app after the user chooses. */
    if(typeof window.openWorkspaceChooser==='function'){
      await withTimeout(window.openWorkspaceChooser(),RPC_TIMEOUT,'Workspace chooser');
      if(chooserIsOpen())return{opened:true,chooser:true,empty:false};
    }

    return{opened:false,multi:true,empty:false};
  }

  function renderRecoveryError(error){
    if(document.querySelector('.layout')||chooserIsOpen())return;
    const app=document.getElementById('app');
    if(!app)return;
    const message=String(error?.message||'Secure session could not be opened.');
    app.innerHTML=`<div class="login"><div class="card"><h1>Mess Manager</h1><p class="muted">${esc(message)}</p><div class="actions gap-top"><button class="btn primary" type="button" id="mmAuthRetry">Retry</button><button class="btn" type="button" id="mmAuthSignOut">Sign in again</button></div></div></div>`;
    document.getElementById('mmAuthRetry')?.addEventListener('click',async()=>{
      const current=await storedSession();
      if(current?.user)return run(current);
      return wrappedBootstrap(null);
    });
    document.getElementById('mmAuthSignOut')?.addEventListener('click',async()=>{
      try{await client.auth.signOut({scope:'local'});}catch(signOutError){console.warn(signOutError);}
      return wrappedBootstrap(null);
    });
  }

  async function resolveAuthenticated(s,generation){
    if(!s?.user)return;

    /* Realtime refreshes and token callbacks still need fresh app data, but never
       need to travel through the whole OAuth/workspace wrapper stack again. */
    if(appIsOpen(s)){
      try{await openCore(s,{retry:false});}
      catch(error){console.warn('Background app refresh failed',error);}
      return;
    }

    showRestoring();
    try{
      let direct=await directWorkspaceOpen(s);
      if(generation!==authGeneration)return;
      if(direct.opened)return;

      /* A genuine new Google admin can have a valid auth session before its first
         workspace exists. Only that zero-workspace case needs the older onboarding
         wrappers; ordinary logins stay on the direct deterministic path above. */
      const intent=readGoogleIntent();
      if(direct.empty&&intent){
        await withTimeout(wrappedBootstrap(s),WRAPPER_TIMEOUT,'Google account setup');
        if(generation!==authGeneration)return;
        if(appIsOpen(s)||chooserIsOpen())return;

        const current=await storedSession();
        if(current?.user&&current.user.id===s.user.id){
          direct=await directWorkspaceOpen(current);
          if(direct.opened)return;
        }
      }

      if(direct.empty)throw new Error('No active Mess workspace is linked to this account.');
      if(direct.multi)throw new Error('Workspace chooser could not be opened.');
      throw new Error('Workspace data could not be opened.');
    }catch(error){
      if(generation!==authGeneration)return;
      console.error('Auth bootstrap failed',error);
      renderRecoveryError(error);
    }
  }

  async function resolveNullSession(generation){
    /* Explicit logout is authoritative. For other null callbacks, confirm local
       storage once because iOS can emit a stale null event during OAuth restore. */
    if(Date.now()-signedOutAt<=1400){
      return wrappedBootstrap(null);
    }
    await sleep(100);
    if(generation!==authGeneration)return;
    const current=await storedSession();
    if(current?.user)return resolveAuthenticated(current,generation);
    return wrappedBootstrap(null);
  }

  function run(s){
    if(activePromise)return activePromise;
    const generation=authGeneration;
    activePromise=(s?.user?resolveAuthenticated(s,generation):resolveNullSession(generation))
      .finally(()=>{activePromise=null;});
    return activePromise;
  }

  window.bootstrap=function authCoordinatorBootstrap(s){return run(s);};

  client.auth.onAuthStateChange((event,s)=>{
    if(event==='SIGNED_OUT'){
      signedOutAt=Date.now();
      authGeneration+=1;
      return;
    }
    if(s?.user&&event==='SIGNED_IN')signedOutAt=0;
  });

  function scheduleReconcile(delay=100){
    clearTimeout(reconcileTimer);
    reconcileTimer=setTimeout(async()=>{
      if(document.querySelector('.layout')||chooserIsOpen()||activePromise)return;
      const current=await storedSession();
      if(current?.user)return run(current);
      if(authUiIsOpen())return;
      return wrappedBootstrap(null);
    },delay);
  }

  /* Only repair a visible auth/loading screen when the iOS process returns. Do
     not reload a healthy dashboard on every focus/visibility event. */
  window.addEventListener('pageshow',()=>scheduleReconcile(80));
  window.addEventListener('focus',()=>{if(authUiIsOpen())scheduleReconcile(120);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&authUiIsOpen())scheduleReconcile(120);});

  /* Finish OTP login in-place. The previous implementation reloaded immediately
     after verifyOtp(), which could beat IndexedDB/localStorage session persistence
     on iOS and reopen the sign-in screen. */
  document.addEventListener('click',async event=>{
    const memberButton=event.target.closest?.('#verifyOtp');
    const adminButton=event.target.closest?.('#verifyAdmin');
    if(!memberButton&&!adminButton)return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const button=memberButton||adminButton;
    if(button.disabled)return;
    const old=button.innerHTML;
    button.disabled=true;
    button.setAttribute('aria-busy','true');
    button.innerHTML='<span class="mm-spin"></span>Opening…';

    try{
      if(memberButton){
        const email=String(document.getElementById('otpEmail')?.value||'').trim().toLowerCase();
        const token=String(document.getElementById('otpCode')?.value||'').trim();
        if(!email)throw new Error('Email দিন।');
        if(!/^\d{8}$/.test(token))throw new Error('8-digit OTP দিন।');
        const verified=await withTimeout(client.auth.verifyOtp({email,token,type:'email'}),RPC_TIMEOUT,'OTP verification');
        if(verified?.error)throw verified.error;
        const sess=verified?.data?.session||await storedSession();
        if(!sess?.user)throw new Error('Login session তৈরি হয়নি।');
        const claim=await withTimeout(client.rpc('claim_member_by_email'),RPC_TIMEOUT,'Member verification');
        if(claim?.error&&!/already/i.test(String(claim.error.message||'')))throw claim.error;
        await run(sess);
        return;
      }

      const setup=JSON.parse(sessionStorage.getItem('mm_admin_setup')||'{}');
      const token=String(document.getElementById('adminCode')?.value||'').trim();
      if(!setup.email)throw new Error('আগে OTP পাঠান।');
      if(!/^\d{8}$/.test(token))throw new Error('8-digit OTP দিন।');
      if(typeof window.functionJson!=='function')throw new Error('Verification service is unavailable.');
      const request=await withTimeout(window.functionJson('verify-admin-otp',{email:setup.email,token}),RPC_TIMEOUT,'OTP verification');
      if(!request?.token_hash)throw new Error('Verification session তৈরি হয়নি।');
      const verified=await withTimeout(client.auth.verifyOtp({token_hash:request.token_hash,type:'email'}),RPC_TIMEOUT,'Session verification');
      if(verified?.error)throw verified.error;
      const sess=verified?.data?.session||await storedSession();
      if(!sess?.user)throw new Error('Login session তৈরি হয়নি।');
      const created=await withTimeout(client.rpc('create_admin_workspace',{p_name:setup.name,p_mess_name:setup.messName,p_email:setup.email}),RPC_TIMEOUT,'Workspace creation');
      if(created?.error&&!/already linked/i.test(String(created.error.message||'')))throw created.error;
      sessionStorage.removeItem('mm_admin_setup');
      await run(sess);
    }catch(error){
      console.error('Login completion failed',error);
      notify(error?.message||'Login complete করা যাচ্ছে না।');
      if(document.body.contains(button)){
        button.disabled=false;
        button.removeAttribute('aria-busy');
        button.innerHTML=old;
      }
    }
  },true);

  /* Wait until all deferred enhancement scripts are installed before the first
     reconciliation. This prevents the auth coordinator itself from racing later
     UI/bootstrap overrides. */
  const initialReconcile=()=>setTimeout(async()=>{
    const current=await storedSession();
    if(current?.user)run(current);
  },80);
  if(document.readyState==='complete')initialReconcile();
  else window.addEventListener('DOMContentLoaded',initialReconcile,{once:true});
})();
