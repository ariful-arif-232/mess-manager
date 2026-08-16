/* Login stability guard for iOS/Safari/Chrome and multi-device sessions. */
'use strict';
(()=>{
  if(window.__mmAuthLoginStabilityLoaded)return;
  window.__mmAuthLoginStabilityLoaded=true;

  const NETWORK_RE=/load failed|failed to fetch|network(?:error)?|network request failed|internet connection|connection (?:was )?(?:lost|interrupted)|offline/i;
  const RETRY_RPCS=new Set(['claim_member_by_email','list_my_workspaces','select_workspace']);
  const PUBLIC_EDGE_RE=/\/functions\/v1\/(?:request-mess-otp|request-admin-otp|verify-admin-otp)(?:[/?#]|$)/;
  const SUPABASE_RE=/^https:\/\/[^/]+\.supabase\.co\//i;
  const delays=[0,350,900];
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const messageOf=error=>String(error?.message||error||'');
  const isNetworkError=error=>NETWORK_RE.test(messageOf(error));
  const friendlyNetworkError=()=>new Error('Connection interrupted. Please try again.');

  /* Public OTP Edge Functions are deployed with verify_jwt=false. Avoid custom
     browser headers on those calls: apikey + application/json forces a CORS
     preflight, and iOS WebKit/Chrome can abort the preflight with only
     `TypeError: Load failed`. A string body without an explicit Content-Type is
     sent as a CORS-safelisted text/plain request and the function still parses it
     with req.json(). Authenticated reset requests keep their Authorization header. */
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
          requestInit={...(init||{}),headers,cache:'no-store',credentials:'omit'};
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
    if(SUPABASE_RE.test(url)&&isNetworkError(lastError))throw friendlyNetworkError();
    throw lastError;
  };

  let domReady=document.readyState==='complete';
  let resolveDomReady;
  const domReadyPromise=new Promise(resolve=>{resolveDomReady=resolve});
  if(domReady)resolveDomReady();
  else window.addEventListener('DOMContentLoaded',()=>{
    domReady=true;
    resolveDomReady();
  },{once:true});

  function patchNotify(){
    if(typeof window.notify!=='function'||window.notify.__mmNetworkFriendly)return;
    const rawNotify=window.notify;
    const stableNotify=(message,type='error')=>{
      const text=messageOf(message);
      if(type!=='success'&&isNetworkError(text))return rawNotify('Connection interrupted. Please try again.',type);
      return rawNotify(message,type);
    };
    Object.defineProperty(stableNotify,'__mmNetworkFriendly',{value:true});
    window.notify=stableNotify;
  }

  function patchClientInstance(target){
    if(!target?.auth||target.__mmAuthNetworkPatched)return target;

    /* Defer all initial session reads and auth callbacks until DOMContentLoaded.
       Deferred scripts execute while readyState is `interactive`, so checking only
       for `loading` is insufficient and caused the previous bootstrap race. */
    if(!target.auth.__mmGetSessionGatePatched){
      const rawGetSession=target.auth.getSession.bind(target.auth);
      let initialSessionPromise=null;
      target.auth.getSession=()=>{
        if(domReady)return rawGetSession();
        if(initialSessionPromise)return initialSessionPromise;
        initialSessionPromise=domReadyPromise.then(()=>rawGetSession()).finally(()=>{
          setTimeout(()=>{initialSessionPromise=null},0);
        });
        return initialSessionPromise;
      };
      Object.defineProperty(target.auth,'__mmGetSessionGatePatched',{value:true});
    }

    if(!target.auth.__mmAuthStateGatePatched){
      const rawOnAuthStateChange=target.auth.onAuthStateChange.bind(target.auth);
      target.auth.onAuthStateChange=callback=>rawOnAuthStateChange((event,authSession)=>{
        if(domReady)return callback(event,authSession);
        domReadyPromise.then(()=>callback(event,authSession)).catch(console.warn);
      });
      Object.defineProperty(target.auth,'__mmAuthStateGatePatched',{value:true});
    }

    if(!target.auth.__mmLocalSignOutPatched){
      const rawSignOut=target.auth.signOut.bind(target.auth);
      target.auth.signOut=options=>rawSignOut(options??{scope:'local'});
      Object.defineProperty(target.auth,'__mmLocalSignOutPatched',{value:true});
    }

    if(typeof target.rpc==='function'&&!target.__mmRpcRetryPatched){
      const rawRpc=target.rpc.bind(target);
      target.rpc=function mmStableRpc(fn,args,options){
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

          /* claim_member_by_email is an identity-link optimization. The workspace
             RPC performs the same verified-email sync, so a pure transport failure
             here must not sign an otherwise valid Google user back out. */
          if(fn==='claim_member_by_email'&&isNetworkError(lastError)){
            console.warn('Member claim transport failed; continuing to workspace resolution.',lastError);
            return {data:null,error:null};
          }
          if(lastResult)return lastResult;
          throw friendlyNetworkError();
        })();
      };
      Object.defineProperty(target,'__mmRpcRetryPatched',{value:true});
    }

    Object.defineProperty(target,'__mmAuthNetworkPatched',{value:true});
    patchNotify();
    return target;
  }

  /* This file is intentionally loaded before app.js. Patch createClient so the
     Supabase SDK captures the guarded fetch and the returned client is gated
     before app.js can call getSession()/onAuthStateChange. */
  if(window.supabase?.createClient&&!window.supabase.__mmCreateClientPatched){
    const rawCreateClient=window.supabase.createClient.bind(window.supabase);
    window.supabase.createClient=(...args)=>patchClientInstance(rawCreateClient(...args));
    Object.defineProperty(window.supabase,'__mmCreateClientPatched',{value:true});
  }

  /* Fallback for unusual load orders or cached documents. */
  let attempts=0;
  const patchExisting=()=>{
    patchNotify();
    if(typeof client!=='undefined'&&client?.auth){patchClientInstance(client);return;}
    if(attempts++<80)setTimeout(patchExisting,50);
  };
  patchExisting();
})();
