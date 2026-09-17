/* Apply the persisted appearance before the deferred app bundle runs. */
'use strict';
(()=>{
  try{
    const saved=JSON.parse(localStorage.getItem('mm_settings_v1')||'{}');
    /* Must agree with settings-pro.js's DEFAULT_THEME: a device with no saved
       choice shows Premium first, here included, or the splash paints one
       look and the app repaints a different one the instant it boots. */
    const theme=saved.theme||'premium';
    const premium=theme==='premium';
    const dark=!premium&&(theme==='dark'||(theme==='system'&&window.matchMedia?.('(prefers-color-scheme: dark)').matches));
    document.documentElement.dataset.theme=dark?'dark':'light';
    if(premium)document.documentElement.dataset.skin='premium';
    document.documentElement.style.colorScheme=dark?'dark':'light';
    document.querySelector('.app-splash')?.classList.toggle('splash-dark',dark);
    document.querySelector('.app-splash')?.classList.toggle('splash-premium',premium);
    const barColor=premium?'#fff3e1':(dark?'#07111d':'#f7f9ff');
    document.documentElement.style.backgroundColor=barColor;
    document.body.style.backgroundColor=barColor;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',barColor);
  }catch(_){/* keep the light fallback if storage is unavailable */}
})();
