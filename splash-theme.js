/* Apply the persisted appearance before the deferred app bundle runs. */
'use strict';
(()=>{
  try{
    const saved=JSON.parse(localStorage.getItem('mm_settings_v1')||'{}');
    const theme=saved.theme||'system';
    const dark=theme==='dark'||(theme==='system'&&window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme=dark?'dark':'light';
    document.documentElement.style.colorScheme=dark?'dark':'light';
    document.querySelector('.app-splash')?.classList.toggle('splash-dark',dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#08131f':'#f7f9ff');
  }catch(_){/* keep the light fallback if storage is unavailable */}
})();
