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
    const barColor=dark?'#07111d':'#f7f9ff';
    document.documentElement.style.backgroundColor=barColor;
    document.body.style.backgroundColor=barColor;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',barColor);
  }catch(_){/* keep the light fallback if storage is unavailable */}
})();
