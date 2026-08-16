/* Final auth coordinator: fast reload, one bootstrap owner, no restore-card flash. */
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
  const SESSION_TIMEOUT=5000;
  const RPC_TIMEOUT=8000;
  const CORE_TIMEOUT=12000;
  const WRAPPER_TIMEOUT=12000;
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  let activePromise=null;
  let queuedSession=undefined;
  let signedOutAt=0;
  let generation=0;
  let reconcileTimer=null;
  let lastOpenedUser='';
  let lastOpenedAt=0;

  function withTimeout(work,ms,label){
    let timer;
    const timeout=new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(new Error(`${label} timed out. Please retry.`)),ms);
    });
    return Promise.race([Promise.resolve(work),timeout]).finally(()=>clearTimeout(timer));
  }

  async function storedSession(){
    try{
      const result=await withTimeout(client.auth.getSession(),SESSION_TIMEOUT,'Session check');
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
  const chooserIsOpen=()=>!!document.querySelector('.workspace-choice-card');
  const authUiIsOpen=()=>!!document.querySelector('.auth-page,.login');

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

  function readWorkspaceChoice(userId){
    try{
      const value=JSON.parse(localStorage.getItem(WORKSPACE_CHOICE_KEY)||'null');
      if(value?.userId!==userId||!value?.memberId)return null;
      return value;
    }catch(_){return null;}
  }
  function saveWorkspaceChoice(userId,memberId){
    try{localStorage.setItem(WORKSPACE_CHOICE_KEY,JSON.stringify({userId,memberId,at:Date.now()}));}catch(_){ }
  }

  async function selectMember(memberId){
    if(!memberId)throw new Error('Workspace membership is unavailable.');
    const result=await withTimeout(client.rpc('select_workspace',{p_member_id:memberId}),RPC_TIMEOUT,'Workspace selection');
    if(result?.error)throw result.error;
  }

  async function openCore(s,{retry=false}={}){
    await withTimeout(coreBootstrap(s),CORE_TIMEOUT,'App data');
    if(appIsOpen(s)){
      lastOpenedUser=s.user.id;
      lastOpenedAt=Date.now();
      return true;
    }
    if(!retry)return false;
    await sleep(220);
    await withTimeout(coreBootstrap(s),CORE_TIMEOUT,'App data retry');
    if(appIsOpen(s)){
      lastOpenedUser=s.user.id;
      lastOpenedAt=Date.now();
      return true;
    }
    return false;
  }

  async function tryRememberedWorkspace(s){
    const choice=readWorkspaceChoice(s.user.id);
    if(!choice?.memberId)return false;
    try{
      await selectMember(choice.memberId);
      finishExistingGoogleIntent();
      return await openCore(s,{retry:true});
    }catch(error){
      console.warn('Remembered workspace fast path failed',error);
      return false;
    }
  }

  async function resolveWorkspace(s){
    const result=await withTimeout(client.rpc('list_my_workspaces'),RPC_TIMEOUT,'Workspace list');
    if(result?.error)throw result.error;
    const spaces=Array.isArray(result?.data)?result.data:[];
    if(!spaces.length)return{opened:false,empty:true};

    finishExistingGoogleIntent();
    const localChoice=readWorkspaceChoice(s.user.id);
    const target=spaces.find(space=>space.selected)
      ||(localChoice&&spaces.find(space=>String(space.member_id)===String(localChoice.memberId)))
      ||(spaces.length===1?spaces[0]:null);

    if(target){
      if(!target.selected)await selectMember(target.member_id);
      saveWorkspaceChoice(s.user.id,target.member_id);
      return{opened:await openCore(s,{retry:true}),empty:false};
    }

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

  async function resolveAuthenticated(s,runGeneration){
    if(!s?.user)return;

    if(appIsOpen(s)&&lastOpenedUser===s.user.id&&Date.now()-lastOpenedAt<900)return;

    if(appIsOpen(s)){
      try{await openCore(s);}
      catch(error){console.warn('Background app refresh failed',error);}
      return;
    }

    try{
      if(await openCore(s))return;
    }catch(error){
      console.warn('Direct reload bootstrap did not open the app',error);
    }
    if(runGeneration!==generation)return;

    if(await tryRememberedWorkspace(s))return;
    if(runGeneration!==generation)return;

    try{
      let workspace=await resolveWorkspace(s);
      if(runGeneration!==generation)return;
      if(workspace.opened)return;

      const intent=readGoogleIntent();
      if(workspace.empty&&intent){
        await withTimeout(wrappedBootstrap(s),WRAPPER_TIMEOUT,'Google account setup');
        if(runGeneration!==generation)return;
        if(appIsOpen(s)||chooserIsOpen())return;

        const current=await storedSession();
        if(current?.user&&current.user.id===s.user.id){
          workspace=await resolveWorkspace(current);
          if(workspace.opened)return;
        }
      }

      if(workspace.empty)throw new Error('No active Mess workspace is linked to this account.');
      if(workspace.multi)throw new Error('Workspace chooser could not be opened.');
      throw new Error('Workspace data could not be opened.');
    }catch(error){
      if(runGeneration!==generation)return;
      console.error('Auth bootstrap failed',error);
      renderRecoveryError(error);
    }
  }

  async function resolveNullSession(runGeneration){
    if(Date.now()-signedOutAt<=1400)return wrappedBootstrap(null);
    await sleep(100);
    if(runGeneration!==generation)return;
    const current=await storedSession();
    if(current?.user)return resolveAuthenticated(current,runGeneration);
    return wrappedBootstrap(null);
  }

  function run(s){
    queuedSession=s;
    if(activePromise)return activePromise;
    activePromise=(async()=>{
      while(queuedSession!==undefined){
        const next=queuedSession;
        queuedSession=undefined;
        const runGeneration=generation;
        if(next?.user)await resolveAuthenticated(next,runGeneration);
        else await resolveNullSession(runGeneration);
      }
    })().finally(()=>{activePromise=null;});
    return activePromise;
  }

  window.bootstrap=function authCoordinatorBootstrap(s){return run(s);};

  client.auth.onAuthStateChange((event,s)=>{
    if(event==='SIGNED_OUT'){
      signedOutAt=Date.now();
      generation+=1;
      queuedSession=null;
      return;
    }
    if(s?.user&&event==='SIGNED_IN')signedOutAt=0;
  });

  function scheduleReconcile(delay=120){
    clearTimeout(reconcileTimer);
    reconcileTimer=setTimeout(async()=>{
      if(document.querySelector('.layout')||chooserIsOpen()||activePromise)return;
      const current=await storedSession();
      if(current?.user)return run(current);
      if(authUiIsOpen())return;
      return wrappedBootstrap(null);
    },delay);
  }

  window.addEventListener('pageshow',()=>scheduleReconcile(100));
  window.addEventListener('focus',()=>{if(authUiIsOpen())scheduleReconcile(160);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&authUiIsOpen())scheduleReconcile(160);});

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

  const initialReconcile=()=>setTimeout(async()=>{
    const current=await storedSession();
    if(current?.user)run(current);
  },60);
  if(document.readyState==='complete')initialReconcile();
  else window.addEventListener('DOMContentLoaded',initialReconcile,{once:true});
})();
