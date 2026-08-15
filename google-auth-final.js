/* Final Google OAuth bridge.
 * Keeps admin re-login zero-input and handles providers that return to the Site URL
 * without preserving the optional google_flow query string. */
'use strict';
(()=>{
  if(window.__mmGoogleAuthFinalLoaded)return;
  window.__mmGoogleAuthFinalLoaded=true;

  const KEY='mm_google_auth_intent_v1';
  const ERROR_KEY='mm_google_auth_return_error_v1';
  const TTL=20*60*1000;
  let resolving=false;
  let returnErrorNotifiedAt=0;

  const readIntent=()=>{
    try{
      const value=JSON.parse(localStorage.getItem(KEY)||'null');
      if(!value?.id||!value?.kind||Date.now()-Number(value.startedAt||0)>TTL){localStorage.removeItem(KEY);return null}
      return value;
    }catch(_){localStorage.removeItem(KEY);return null}
  };
  const clearIntent=()=>{try{localStorage.removeItem(KEY)}catch(_){}};
  const flowId=()=>{try{return new URL(location.href).searchParams.get('google_flow')||''}catch(_){return ''}};
  const isGoogleSession=s=>{
    const user=s?.user;
    if(!user)return false;
    const provider=String(user.app_metadata?.provider||'');
    const providers=Array.isArray(user.app_metadata?.providers)?user.app_metadata.providers:[];
    const identities=Array.isArray(user.identities)?user.identities:[];
    return provider==='google'||providers.includes('google')||identities.some(x=>x?.provider==='google');
  };
  const cleanUrl=()=>{
    try{
      const url=new URL(location.href);
      url.searchParams.delete('google_flow');
      history.replaceState({},document.title,`${url.pathname}${url.search}${url.hash}`);
    }catch(_){ }
  };
  const saveReturnError=(kind,message,setup={})=>{
    try{sessionStorage.setItem(ERROR_KEY,JSON.stringify({kind,message,setup,at:Date.now()}))}catch(_){ }
  };
  const readReturnError=()=>{
    try{return JSON.parse(sessionStorage.getItem(ERROR_KEY)||'null')}
    catch(_){sessionStorage.removeItem(ERROR_KEY);return null}
  };
  const clearReturnError=()=>{try{sessionStorage.removeItem(ERROR_KEY)}catch(_){}};

  /* Existing admins should not have to type their old name/workspace merely to
     sign in again. For a genuinely new Google account the saved fields may be
     empty; the callback will safely return to this form instead of creating a
     placeholder workspace. */
  async function startAdminGoogle(button){
    if(!client?.auth?.signInWithOAuth)return notify('Google sign-in is unavailable.');
    const id=crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const setup={name:$('#adminName')?.value.trim()||'',messName:$('#messName')?.value.trim()||''};
    localStorage.setItem(KEY,JSON.stringify({id,kind:'admin',setup,startedAt:Date.now()}));
    const redirect=new URL(location.href);
    redirect.hash='';redirect.search='';redirect.searchParams.set('google_flow',id);
    const old=button.innerHTML;
    button.disabled=true;button.setAttribute('aria-busy','true');
    button.innerHTML='<span class="mm-spin auth-google-spin"></span><span>Connecting to Google…</span>';
    try{
      const result=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirect.toString()}});
      if(result?.error)throw result.error;
    }catch(error){
      clearIntent();button.disabled=false;button.removeAttribute('aria-busy');button.innerHTML=old;
      const text=String(error?.message||error||'Google sign-in could not be started.');
      notify(/provider.*not.*enabled|unsupported.*provider/i.test(text)?'Google sign-in is not enabled on the authentication server yet.':text);
    }
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest?.('#adminGoogle');
    if(!button)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if(!button.disabled)startAdminGoogle(button);
  },true);

  const previousRenderLogin=window.renderLogin;
  if(typeof previousRenderLogin==='function'){
    window.renderLogin=function googleReturnAwareLogin(){
      const result=readReturnError();
      if(result&&Date.now()-Number(result.at||0)<TTL){
        if(result.kind==='admin'&&typeof window.renderAdminSignup==='function')window.renderAdminSignup(result.setup||{});
        else if(typeof window.renderMemberLogin==='function')window.renderMemberLogin();
        else previousRenderLogin();
        /* signOut can emit more than one auth callback. Keep this state briefly so
           a later callback cannot replace the intended form with the welcome page. */
        setTimeout(clearReturnError,1500);
        if(result.message&&Date.now()-returnErrorNotifiedAt>1200){
          returnErrorNotifiedAt=Date.now();
          setTimeout(()=>notify(result.message),80);
        }
        return;
      }
      clearReturnError();
      return previousRenderLogin();
    };
  }

  const previousBootstrap=window.bootstrap;
  if(typeof previousBootstrap!=='function')return;

  async function reject(kind,message,setup={}){
    clearIntent();cleanUrl();saveReturnError(kind,message,setup);
    try{await client.auth.signOut()}catch(_){ }
    session=null;profile=null;mess=null;
    return previousBootstrap(null);
  }

  window.bootstrap=async function googleRedirectFallbackBootstrap(s){
    if(!s?.user)return previousBootstrap(s);
    const intent=readIntent();
    /* otp-auth.js handles the preferred callback path when its flow id is kept.
       This wrapper only handles the Site-URL fallback case. */
    if(!intent||flowId()||!isGoogleSession(s))return previousBootstrap(s);
    if(resolving)return;
    resolving=true;
    try{
      const email=String(s.user.email||'').trim().toLowerCase();
      if(!email)return reject(intent.kind,'Your Google account does not provide a verified email.',intent.setup);

      if(intent.kind==='member'){
        const claim=await client.rpc('claim_member_by_email');
        if(claim.error)return reject('member',claim.error.message||'This Google account is not registered as an active member.');
        clearIntent();cleanUrl();
        return previousBootstrap(s);
      }

      if(intent.kind==='admin'){
        const claim=await client.rpc('claim_member_by_email');
        if(!claim.error){clearIntent();cleanUrl();return previousBootstrap(s)}
        const message=String(claim.error?.message||'');
        if(!/No active mess member is registered for this email/i.test(message)){
          return reject('admin',message||'This Google account cannot create another workspace.',intent.setup);
        }
        const name=String(intent.setup?.name||'').trim();
        const messName=String(intent.setup?.messName||'').trim();
        if(!name||!messName){
          return reject('admin','For a new admin account, enter your name and Mess name, then continue with Google again.',intent.setup);
        }
        const created=await client.rpc('create_admin_workspace',{p_name:name,p_mess_name:messName,p_email:email});
        if(created.error)return reject('admin',created.error.message||'Admin workspace could not be created.',intent.setup);
        clearIntent();cleanUrl();
        return previousBootstrap(s);
      }

      clearIntent();
      return previousBootstrap(s);
    }finally{resolving=false}
  };

  /* Re-run a missed callback once after all auth wrappers are installed. */
  client?.auth?.getSession?.().then(({data})=>{
    const intent=readIntent();
    if(data?.session&&intent&&!flowId()&&isGoogleSession(data.session))window.bootstrap(data.session);
  }).catch(console.warn);
})();
