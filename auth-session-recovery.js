/* Final auth/session reconciliation for iOS/PWA login.
 * A successful Supabase session must never be replaced by the login screen just
 * because a stale null callback or workspace bootstrap races the fresh session.
 */
'use strict';
(()=>{
  if(window.__mmAuthSessionRecoveryLoaded)return;
  window.__mmAuthSessionRecoveryLoaded=true;
  if(typeof client==='undefined'||!client?.auth||typeof window.bootstrap!=='function')return;

  const baseBootstrap=window.bootstrap;
  const GOOGLE_INTENT_KEY='mm_google_auth_intent_v1';
  const delays=[0,180,520,1100];
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  let signedOutAt=0;
  let recoveryPromise=null;
  let queuedSession=undefined;
  let lastGoodSession=null;

  function sessionKey(s){
    const token=String(s?.access_token||'');
    const user=String(s?.user?.id||'');
    return `${user}:${token.slice(-18)}`;
  }
  async function storedSession(){
    try{return (await client.auth.getSession()).data?.session||null}
    catch(error){console.warn('Session re-check failed',error);return null}
  }
  function hasOpenedApp(s){
    if(!s?.user)return false;
    if(typeof session!=='undefined'&&session?.user?.id===s.user.id&&typeof profile!=='undefined'&&profile)return true;
    if(document.querySelector('.workspace-choice-card'))return true;
    return false;
  }
  function showRestoring(){
    const app=document.querySelector('#app');
    if(!app)return;
    app.innerHTML='<div class="login"><div class="card"><h1>Mess Manager</h1><p class="muted">Restoring secure session…</p></div></div>';
  }

  async function openValidSession(s){
    lastGoodSession=s;
    let lastError=null;
    for(let i=0;i<delays.length;i++){
      if(delays[i])await sleep(delays[i]);
      try{
        await baseBootstrap(s);
        if(hasOpenedApp(s))return true;
      }catch(error){
        lastError=error;
        console.warn(`Login bootstrap retry ${i+1}/${delays.length}`,error);
      }
      const current=await storedSession();
      if(!current?.user||current.user.id!==s.user.id)break;
      s=current;
      lastGoodSession=current;
    }
    if(lastError)console.error('Login bootstrap did not finish',lastError);
    return hasOpenedApp(s);
  }

  async function runRecovery(s){
    queuedSession=s;
    if(recoveryPromise)return recoveryPromise;
    recoveryPromise=(async()=>{
      while(queuedSession!==undefined){
        let next=queuedSession;
        queuedSession=undefined;

        if(next?.user){
          showRestoring();
          await openValidSession(next);
          continue;
        }

        /* Null auth events can be emitted while OAuth/OTP storage is still being
           reconciled. Confirm local auth storage before treating the user as signed
           out. A deliberate SIGNED_OUT event is allowed through immediately. */
        if(Date.now()-signedOutAt>1200){
          await sleep(90);
          const current=await storedSession();
          if(current?.user){
            lastGoodSession=current;
            showRestoring();
            await openValidSession(current);
            continue;
          }
        }
        lastGoodSession=null;
        await baseBootstrap(null);
      }
    })().finally(()=>{recoveryPromise=null;});
    return recoveryPromise;
  }

  window.bootstrap=function authSessionRecoveryBootstrap(s){return runRecovery(s);};

  client.auth.onAuthStateChange((event,s)=>{
    if(event==='SIGNED_OUT'){
      signedOutAt=Date.now();
      lastGoodSession=null;
      return;
    }
    if(s?.user)lastGoodSession=s;
  });

  /* OTP login used to hard-reload immediately after verifyOtp. On iOS that can
     race Supabase's persisted session and return to the login form even though the
     server session was created. Handle verification here and open the session in
     place. */
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
        const email=String(document.querySelector('#otpEmail')?.value||'').trim().toLowerCase();
        const token=String(document.querySelector('#otpCode')?.value||'').trim();
        if(!email)throw new Error('Email দিন।');
        if(!/^\d{8}$/.test(token))throw new Error('8-digit OTP দিন।');
        const verified=await client.auth.verifyOtp({email,token,type:'email'});
        if(verified.error)throw verified.error;
        const sess=verified.data?.session||(await storedSession());
        if(!sess?.user)throw new Error('Login session তৈরি হয়নি।');
        try{localStorage.removeItem(GOOGLE_INTENT_KEY)}catch(_){ }
        const claim=await client.rpc('claim_member_by_email');
        if(claim.error&&!/already/i.test(String(claim.error.message||'')))throw claim.error;
        await window.bootstrap(sess);
        return;
      }

      const setup=JSON.parse(sessionStorage.getItem('mm_admin_setup')||'{}');
      const token=String(document.querySelector('#adminCode')?.value||'').trim();
      if(!setup.email)throw new Error('আগে OTP পাঠান।');
      if(!/^\d{8}$/.test(token))throw new Error('8-digit OTP দিন।');
      if(typeof window.functionJson!=='function')throw new Error('Verification service is unavailable.');
      const verifiedRequest=await window.functionJson('verify-admin-otp',{email:setup.email,token});
      if(!verifiedRequest.token_hash)throw new Error('Verification session তৈরি হয়নি।');
      const verified=await client.auth.verifyOtp({token_hash:verifiedRequest.token_hash,type:'email'});
      if(verified.error)throw verified.error;
      const sess=verified.data?.session||(await storedSession());
      if(!sess?.user)throw new Error('Login session তৈরি হয়নি।');
      const created=await client.rpc('create_admin_workspace',{p_name:setup.name,p_mess_name:setup.messName,p_email:setup.email});
      if(created.error&&!/already linked/i.test(String(created.error.message||'')))throw created.error;
      sessionStorage.removeItem('mm_admin_setup');
      try{localStorage.removeItem(GOOGLE_INTENT_KEY)}catch(_){ }
      await window.bootstrap(sess);
    }catch(error){
      console.error('Login completion failed',error);
      notify(error?.message||'Login complete করা যাচ্ছে না।');
      button.disabled=false;
      button.removeAttribute('aria-busy');
      button.innerHTML=old;
    }
  },true);

  /* Reconcile once after every wrapper has loaded. This also recovers users who
     already have a valid persisted session but are currently seeing the login UI. */
  setTimeout(async()=>{
    const current=await storedSession();
    if(current?.user){lastGoodSession=current;window.bootstrap(current);}
  },140);
})();
