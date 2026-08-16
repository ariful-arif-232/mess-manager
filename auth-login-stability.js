/* Login stability guard for iOS/Safari/Chrome and multi-device sessions. */
'use strict';
(()=>{
  if(window.__mmAuthLoginStabilityLoaded)return;
  window.__mmAuthLoginStabilityLoaded=true;

  const NETWORK_RE=/load failed|failed to fetch|network(?:error)?|network request failed|internet connection/i;
  const RETRY_RPCS=new Set(['claim_member_by_email','list_my_workspaces','select_workspace']);
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const messageOf=error=>String(error?.message||error||'');
  const isNetworkError=error=>NETWORK_RE.test(messageOf(error));

  /* iOS WebKit can occasionally report `TypeError: Load failed` after an Edge
     Function already accepted the request. For OTP requests that ambiguity is
     harmless: showing the code field does not authenticate anyone; the user
     still has to enter the real emailed OTP. */
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async function mmStableFetch(input,init){
    let url='';
    try{url=typeof input==='string'?input:String(input?.url||input||'')}catch(_){ }
    try{
      return await nativeFetch(input,init);
    }catch(error){
      if(url.includes('/functions/v1/request-mess-otp')&&isNetworkError(error)){
        console.warn('OTP request response was interrupted; allowing OTP verification UI.',error);
        return new Response(JSON.stringify({ok:true,delivery_uncertain:true}),{
          status:200,
          headers:{'Content-Type':'application/json'}
        });
      }
      throw error;
    }
  };

  function patchClient(){
    if(typeof client==='undefined'||!client?.auth){
      setTimeout(patchClient,50);
      return;
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
          let first;
          try{
            first=await rawRpc(fn,args,options);
          }catch(error){
            if(!isNetworkError(error))throw error;
            await sleep(300);
            return await rawRpc(fn,args,options);
          }
          if(first?.error&&isNetworkError(first.error)){
            await sleep(300);
            return await rawRpc(fn,args,options);
          }
          return first;
        })();
      };
      Object.defineProperty(client,'__mmRpcRetryPatched',{value:true});
    }
  }

  patchClient();
})();
