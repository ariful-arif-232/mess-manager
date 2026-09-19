/* "Download Android App" link for the signed-in shell. Purely additive: it
   only appends a link into areas the app already renders (sidebar footer,
   More sheet header) and never touches auth, data or navigation logic.
   Not shown on the login/signup screen — that's a first-impression page and
   the link was judged out of place there. */
'use strict';
(() => {
  /* Always the newest published release — no version is hardcoded. */
  const APK='https://github.com/ariful-arif-232/mess-manager/releases/latest/download/app-release.apk';
  const LABEL='Download Android App';
  const ICON='<svg class="mm-apk-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v11m-4.2-4.1L12 14.2l4.2-4.3M4.5 19.5h15"/></svg>';
  /* A phone outline with a download arrow inside it — compact, icon-only,
     for the More sheet's header where there's no room for a text label. */
  const COMPACT_ICON='<svg class="mm-apk-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="2.4" width="10" height="19.2" rx="2.2"/><path d="M12 7.8v6m-2.6-2.4L12 13.8l2.6-2.4"/><path d="M10.2 18.6h3.6"/></svg>';

  function makeLink(cls,icon){
    const a=document.createElement('a');
    a.className=cls;
    a.href=APK;
    a.target='_blank';
    a.rel='noopener noreferrer';
    /* GitHub serves the asset as an attachment, so this downloads the APK
       directly on Android instead of navigating away from the app. */
    a.setAttribute('download','app-release.apk');
    a.dataset.apkLink='1';
    a.setAttribute('aria-label',LABEL);
    a.title=LABEL;
    a.innerHTML=icon;
    return a;
  }
  const missing=host=>host&&!host.querySelector('[data-apk-link]');

  function mount(){
    /* Signed-in desktop shell: sidebar footer, above Logout. */
    const sidebarFoot=document.querySelector('.layout .sidebar-foot');
    if(missing(sidebarFoot)){
      const link=makeLink('mm-apk-link mm-apk-side',`${ICON}<span>${LABEL}</span>`);
      sidebarFoot.insertBefore(link,sidebarFoot.querySelector('#logout'));
    }

    /* Signed-in mobile shell: a compact icon in the More sheet's header,
       opposite the "More" title — not the old full-width button. */
    const sheetTitle=document.querySelector('#moreSheet .sheet-title');
    if(missing(sheetTitle))sheetTitle.appendChild(makeLink('mm-apk-link mm-apk-sheet',COMPACT_ICON));
  }

  let queued=false;
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;mount()})};
  new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true});
  addEventListener('DOMContentLoaded',schedule);
  addEventListener('pageshow',schedule);
  schedule();
})();
