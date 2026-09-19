/* Global busy overlay for data-changing actions (month change, add/edit/
 * delete, activate/deactivate, ...). Wraps the final window.loadData so it
 * covers every flow that already calls loadData() before re-rendering,
 * without touching each call site individually.
 *
 * Shown only after a short delay, and held for a minimum duration once
 * shown, so a fast action never flashes it and a slow one never looks
 * abrupt. The very first (bootstrap) load is skipped — the splash screen
 * already covers that.
 */
'use strict';
(()=>{
  if(window.__mmLoadingOverlayLoaded)return;
  window.__mmLoadingOverlayLoaded=true;

  const SHOW_DELAY=160;
  const MIN_VISIBLE=260;

  let overlay=null;
  function ensureOverlay(){
    if(overlay)return overlay;
    overlay=document.createElement('div');
    overlay.className='mm-loading-overlay';
    overlay.setAttribute('aria-hidden','true');
    overlay.innerHTML='<div class="mm-loading-card"><span class="mm-loading-spinner"></span><span class="mm-loading-text">Updating…</span></div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  let depth=0;
  let showTimer=null;
  let hideTimer=null;
  let shownAt=0;

  function beginBusy(){
    depth++;
    if(depth>1)return;
    clearTimeout(hideTimer);
    showTimer=setTimeout(()=>{
      ensureOverlay().classList.add('is-visible');
      shownAt=Date.now();
    },SHOW_DELAY);
  }
  function endBusy(){
    depth=Math.max(0,depth-1);
    if(depth>0)return;
    clearTimeout(showTimer);
    if(!overlay||!overlay.classList.contains('is-visible'))return;
    const wait=Math.max(0,MIN_VISIBLE-(Date.now()-shownAt));
    hideTimer=setTimeout(()=>{overlay.classList.remove('is-visible');},wait);
  }

  let bootstrapped=false;
  const baseLoadData=window.loadData;
  if(typeof baseLoadData==='function'){
    window.loadData=async function loadDataWithOverlay(...args){
      const track=bootstrapped;
      if(track)beginBusy();
      try{
        return await baseLoadData(...args);
      }finally{
        if(track)endBusy();
        bootstrapped=true;
      }
    };
    try{loadData=window.loadData;}catch(_){/* normal window binding is enough */}
  }
})();
