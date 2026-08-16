/* Capture the real app bootstrap before workspace/OAuth wrappers replace window.bootstrap. */
'use strict';
(()=>{
  if(window.__mmAppBootstrapCaptured)return;
  if(typeof window.bootstrap!=='function')return;
  window.__mmAppBootstrapCaptured=true;
  window.__mmAppBootstrap=window.bootstrap;
})();
