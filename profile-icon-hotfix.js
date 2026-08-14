/* Final hard fix for member More -> Profile icon. */
'use strict';
(()=>{
  const PROFILE_SVG='<svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7.5" r="3.25"></circle><path d="M5.25 19c.85-3.3 3.15-5 6.75-5s5.9 1.7 6.75 5"></path></svg>';
  function apply(){
    const grid=document.querySelector('#moreSheet .sheet-grid');
    if(!grid||window.profile?.role==='admin')return;
    const btn=[...grid.querySelectorAll('button')].find(b=>b.querySelector('b')?.textContent?.trim()==='Profile');
    if(!btn)return;
    btn.dataset.memberProfile='1';
    let span=btn.querySelector(':scope > span');
    if(!span){span=document.createElement('span');btn.prepend(span);}
    span.className='member-profile-icon-final';
    span.innerHTML=PROFILE_SVG;
  }
  const mo=new MutationObserver(apply);
  mo.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
  document.addEventListener('click',e=>{if(e.target.closest?.('#mobileMore')){requestAnimationFrame(()=>{apply();setTimeout(apply,0);setTimeout(apply,50);setTimeout(apply,150);});}},true);
  apply();
})();
