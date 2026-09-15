/* "Download Android App" link for the login screens and the signed-in shell.
   Purely additive: it only appends a link into areas the app already renders
   (auth page, sidebar footer, More sheet) and never touches auth, data or
   navigation logic. */
'use strict';
(() => {
  /* Always the newest published release — no version is hardcoded. */
  const APK='https://github.com/ariful-arif-232/mess-manager/releases/latest/download/app-release.apk';
  const LABEL='Download Android App';
  const ICON='<svg class="mm-apk-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v11m-4.2-4.1L12 14.2l4.2-4.3M4.5 19.5h15"/></svg>';

  function makeLink(cls){
    const a=document.createElement('a');
    a.className=cls;
    a.href=APK;
    a.target='_blank';
    a.rel='noopener noreferrer';
    /* GitHub serves the asset as an attachment, so this downloads the APK
       directly on Android instead of navigating away from the app. */
    a.setAttribute('download','app-release.apk');
    a.dataset.apkLink='1';
    a.innerHTML=`${ICON}<span>${LABEL}</span>`;
    return a;
  }
  const missing=host=>host&&!host.querySelector('[data-apk-link]');

  function mount(){
    /* Login / signup screens. */
    const authWrap=document.querySelector('.auth-page .auth-wrap');
    if(missing(authWrap))authWrap.appendChild(makeLink('mm-apk-link mm-apk-auth'));

    /* Signed-in desktop shell: sidebar footer, above Logout. */
    const sidebarFoot=document.querySelector('.layout .sidebar-foot');
    if(missing(sidebarFoot))sidebarFoot.insertBefore(makeLink('mm-apk-link mm-apk-side'),sidebarFoot.querySelector('#logout'));

    /* Signed-in mobile shell: the "More" sheet, above Logout. */
    const sheet=document.querySelector('#moreSheet .action-sheet');
    if(missing(sheet))sheet.insertBefore(makeLink('mm-apk-link mm-apk-sheet'),sheet.querySelector('.sheet-logout'));
  }

  let queued=false;
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;mount()})};
  new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true});
  addEventListener('DOMContentLoaded',schedule);
  addEventListener('pageshow',schedule);
  schedule();
})();
