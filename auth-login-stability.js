/* Login stability guard for iOS/Safari/Chrome and multi-device sessions. */
'use strict';
(()=>{
  if(window.__mmAuthLoginStabilityLoaded)return;
  window.__mmAuthLoginStabilityLoaded=true;

  const NETWORK_RE=/load failed|failed to fetch|network(?:error)?|network request failed|internet connection|connection (?:was )?(?:lost|interrupted)|offline/i;
  const RETRY_RPCS=new Set(['claim_member_by_email','list_my_workspaces','select_workspace']);
  const PUBLIC_EDGE_RE=/\/functions\/v1\/(?:request-mess-otp|request-admin-otp|verify-admin-otp)(?:[/?#]|$)/;
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const messageOf=error=>String(error?.message||error||'');
  const isNetworkError=error=>NETWORK_RE.test(messageOf(error));
  const delays=[0,350,900];

  /* Never expose WebKit's raw `TypeError: Load failed` to the user. It is a
     transport-level browser error, not a useful account/authentication error. */
  if(typeof window.notify==='function'&&!window.notify.__mmNetworkFriendly){
    const rawNotify=window.notify;
    const stableNotify=(message,type='error')=>{
      const text=messageOf(message);
      if(type!=='success'&&isNetworkError(text)){
        return rawNotify('Connection interrupted. Please try again.',type);
      }
      return rawNotify(message,type);
    };
    Object.defineProperty(stableNotify,'__mmNetworkFriendly',{value:true});
    window.notify=stableNotify;
  }

  /* The public OTP edge functions have verify_jwt=false. Sending `apikey` plus
     application/json from a browser forces a CORS preflight before the real POST.
     iOS WebKit/Chrome can abort that preflight and surface only `Load failed`.
     For unauthenticated OTP calls, strip non-safelisted headers so the request is
     a simple cross-origin POST, then retry only genuine transport failures.
     Authenticated reset requests keep their Authorization/header set unchanged. */
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async function mmStableFetch(input,init){
    let url='';
    try{url=typeof input==='string'?input:String(input?.url||input||'')}catch(_){ }

    const edgeCall=PUBLIC_EDGE_RE.test(url);
    let requestInit=init;
    if(edgeCall){
      try{
        const headers=new Headers(init?.headers||{});
        if(!headers.has('authorization')){
          headers.delete('apikey');
          headers.delete('content-type');
          headers.delete('x-client-info');
          requestInit={...(init||{}),headers,cache:'no-store'};
        }
      }catch(_){ }
    }

    const attempts=edgeCall?delays:[0];
    let lastError;
    for(let i=0;i<attempts.length;i++){
      if(attempts[i])await sleep(attempts[i]);
      try{
        return await nativeFetch(input,requestInit);
      }catch(error){
        lastError=error;
        if(!isNetworkError(error)||i===attempts.length-1)break;
        console.warn(`Auth edge request interrupted; retry ${i+1}/${attempts.length-1}.`,error);
      }
    }
    if(edgeCall&&isNetworkError(lastError)){
      throw new Error('Connection interrupted. Please try again.');
    }
    throw lastError;
  };

  function patchClient(){
    if(typeof client==='undefined'||!client?.auth){
      setTimeout(patchClient,50);
      return;
    }

    /* app.js, workspace-switch.js, otp-auth.js and google-auth-final.js all need
       the initial session. During deferred-script execution those calls used to
       race one another before the final bootstrap wrappers were installed. Gate
       and de-duplicate that first lookup until DOMContentLoaded, then let normal
       getSession calls behave exactly as Supabase intended. */
    if(!client.auth.__mmGetSessionGatePatched){
      const rawGetSession=client.auth.getSession.bind(client.auth);
      let initialSessionPromise=null;
      client.auth.getSession=()=>{
        if(initialSessionPromise)return initialSessionPromise;
        if(document.readyState!=='loading')return rawGetSession();
        initialSessionPromise=new Promise((resolve,reject)=>{
          window.addEventListener('DOMContentLoaded',()=>{
            rawGetSession().then(resolve,reject).finally(()=>{
              setTimeout(()=>{initialSessionPromise=null},0);
            });
          },{once:true});
        });
        return initialSessionPromise;
      };
      Object.defineProperty(client.auth,'__mmGetSessionGatePatched',{value:true});
    }

    if(!client.auth.__mmLocalSignOutPatched){
      const rawSignOut=client.auth.signOut.bind(client.auth);
      client.auth.signOut=(options)=>rawSignOut(options??{scope:'local'});
      Object.defineProperty(client.auth,'__mmLocalSignOutPatched',{value:true});
    }

    if(typeof client.rpc==='function'&&!client.__mmRpcRetryPatched){
      const rawRpc=client.rpc.bind(client);
      client.rpc=function mmStableRpc(fn,args,options){
        if(!RETRY_RPCS.has(fn))return rawRpc(fn,args,options);
        return (async()=>{
          let lastResult=null;
          let lastError=null;
          for(let i=0;i<delays.length;i++){
            if(delays[i])await sleep(delays[i]);
            try{
              lastResult=await rawRpc(fn,args,options);
              lastError=lastResult?.error||null;
              if(!lastError||!isNetworkError(lastError))return lastResult;
            }catch(error){
              lastError=error;
              if(!isNetworkError(error))throw error;
            }
            if(i<delays.length-1)console.warn(`${fn} transport interrupted; retrying.`,lastError);
          }

          /* claim_member_by_email is an optimization/identity-link step. The
             workspace RPC independently syncs verified-email memberships, so a
             transport failure here must not sign an otherwise valid Google user
             back out. Do not mask real database/auth errors. */
          if(fn==='claim_member_by_email'&&isNetworkError(lastError)){
            console.warn('Member claim transport failed; continuing to workspace resolution.',lastError);
            return {data:null,error:null};
          }
          if(lastResult)return lastResult;
          throw new Error('Connection interrupted. Please try again.');
        })();
      };
      Object.defineProperty(client,'__mmRpcRetryPatched',{value:true});
    }
  }

  patchClient();
})();
