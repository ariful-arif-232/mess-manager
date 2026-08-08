/* Compact page-aware mobile header matching the visual reference. */
'use strict';
(() => {
  const META={
    'dashboard':['Dashboard','home'],
    'members':['Member Management','users'],
    'daily meal':['Meal Management','meal'],
    'meal':['Meal Management','meal'],
    'bazar':['Bazar Management','bag'],
    'deposit':['Deposit Management','wallet'],
    'bills':['Bills Management','bill'],
    'schedule':['Schedule','calendar'],
    'settlement':['Settlement','check'],
    'reports':['Reports','report'],
    'mess chat':['Mess Chat','chat'],
    'chat':['Mess Chat','chat'],
    'activity':['Activity','activity'],
    'settings':['Settings','settings'],
    'voice assistant':['Voice Assistant','mic']
  };
  const icons={
    home:'<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3"/>',
    users:'<circle cx="9" cy="8" r="3"/><path d="M3.5 20v-1.3A5.5 5.5 0 0 1 9 13.2a5.5 5.5 0 0 1 5.5 5.5V20M16 7.5a2.5 2.5 0 1 1 0 5M16.5 14.2A4.5 4.5 0 0 1 21 18.7V20"/>',
    meal:'<path d="M6 3v7M3.5 3v5a2.5 2.5 0 0 0 5 0V3M6 10v11M16 3v18M16 3c3 1.8 4.5 4 4.5 6.7 0 2.2-1.4 3.8-4.5 4.3"/>',
    bag:'<path d="M5 8h14l-1 12H6L5 8Zm3 0V6a4 4 0 0 1 8 0v2"/>',
    wallet:'<path d="M4 6h16v13H4zM7 6V4h10v2M15 12h5"/>',
    bill:'<path d="M6 3h9l4 4v14H6zM15 3v5h4M9 12h6M9 16h6"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h1M12 14h1M16 14h1"/>',
    check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16.5 9"/>',
    report:'<path d="M5 20V10M10 20V4M15 20v-7M20 20V7M3 20h19"/>',
    chat:'<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8M8 13h5"/>',
    activity:'<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6M4 4v4.6h4.6M12 7v5l3 2"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
    mic:'<rect x="8" y="3" width="8" height="12" rx="4"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>'
  };
  const svg=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.home}</svg>`;
  function metaFor(text){
    const t=String(text||'').trim().toLowerCase();
    if(META[t])return META[t];
    for(const [key,value] of Object.entries(META)){if(t.includes(key))return value;}
    return [text||'Mess Manager','home'];
  }
  function apply(){
    const top=document.querySelector('.topbar');
    const heading=top?.querySelector('.page-heading');
    const title=heading?.querySelector('h1');
    if(!top||!heading||!title)return;
    const [label,icon]=metaFor(title.dataset.rawTitle||title.textContent);
    if(!title.dataset.rawTitle)title.dataset.rawTitle=title.textContent.trim();
    title.textContent=label;
    let mark=heading.querySelector('.page-icon');
    if(!mark){mark=document.createElement('span');mark.className='page-icon';heading.prepend(mark);}
    if(mark.dataset.icon!==icon){mark.dataset.icon=icon;mark.innerHTML=svg(icon);}
    const month=top.querySelector('#month');
    if(month&&!month.closest('.month-chip')){
      const wrap=document.createElement('label');wrap.className='top-chip month-chip';
      wrap.innerHTML=`<span class="chip-icon">${svg('calendar')}</span>`;
      month.parentNode.insertBefore(wrap,month);wrap.appendChild(month);
    }
    const badge=top.querySelector('.badge');
    if(badge&&!badge.classList.contains('user-chip')){
      badge.classList.add('top-chip','user-chip');
      badge.insertAdjacentHTML('afterbegin',`<span class="chip-icon">${svg('users')}</span>`);
    }
  }
  let queued=false;
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply();});};
  new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true});
  addEventListener('DOMContentLoaded',schedule);
  addEventListener('pageshow',schedule);
})();
