/* Collapsible Recent Activity grouped by date. */
'use strict';
(()=>{
  const labels={bazar:'Bazar',utility_bill:'Utility Bill',deposit:'Deposit',schedule:'Schedule',meal:'Meal',member:'Member',settlement:'Settlement',monthly_settlement:'Settlement',report:'Report',settings:'Settings'};
  const verbs={create:'Created',update:'Updated',delete:'Deleted',toggle:'Changed',toggle_meal:'Meal changed',status_change:'Status changed',save_draft:'Draft saved'};
  const escHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const actorName=id=>{
    const member=(db.members||[]).find(m=>m.user_id===id||m.id===id);
    if(member?.name)return member.name;
    if(profile&&(profile.user_id===id||profile.id===id)&&profile.name)return profile.name;
    return profile?.name||'Admin';
  };
  const dateKey=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toISOString().slice(0,10)};
  const todayKey=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const niceDay=v=>new Date(`${v}T00:00:00`).toLocaleDateString('en-BD',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
  const niceTime=v=>new Date(v).toLocaleTimeString('en-BD',{hour:'2-digit',minute:'2-digit'});
  const cleanType=v=>labels[v]||String(v||'Activity').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  const cleanAction=v=>verbs[v]||String(v||'Updated').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());

  function row(log){
    const action=String(log.action||'update');
    const type=cleanType(log.entity_type);
    const actor=actorName(log.actor_id);
    return `<div class="activity-row"><div class="activity-meta-left"><div class="activity-time">${escHtml(niceTime(log.created_at))}</div><div class="activity-actor">${escHtml(actor)}</div></div><div class="activity-main"><div class="activity-title ${escHtml(action.split('_')[0])}"><span class="activity-dot"></span><span>${escHtml(cleanAction(action))} ${escHtml(type)}</span></div><div class="activity-sub">Edited by <strong>${escHtml(actor)}</strong></div></div></div>`;
  }

  function dayCard(day,items,isOpen){
    const isToday=day===todayKey();
    const label=isToday?'Today':niceDay(day);
    return `<section class="activity-day ${isOpen?'open':''}" data-activity-day="${escHtml(day)}"><button class="activity-day-title" type="button" data-toggle-activity-day aria-expanded="${isOpen?'true':'false'}"><span class="activity-day-main"><strong>${escHtml(label)}</strong><small>${escHtml(niceDay(day))}</small></span><span class="activity-day-side"><em>${items.length} ${items.length===1?'activity':'activities'}</em><b>${isOpen?'Tap to hide':'Tap to view'}</b><i aria-hidden="true">⌄</i></span></button><div class="activity-list-compact" ${isOpen?'':'hidden'}>${items.map(row).join('')}</div></section>`;
  }

  function bindToggles(c){
    c.querySelectorAll('[data-toggle-activity-day]').forEach(btn=>btn.addEventListener('click',()=>{
      const card=btn.closest('[data-activity-day]');
      const list=card?.querySelector('.activity-list-compact');
      if(!card||!list)return;
      const open=!card.classList.contains('open');
      card.classList.toggle('open',open);
      list.hidden=!open;
      btn.setAttribute('aria-expanded',String(open));
      const hint=btn.querySelector('.activity-day-side b');
      if(hint)hint.textContent=open?'Tap to hide':'Tap to view';
    }));
  }

  function renderGrouped(){
    if(typeof state==='undefined'||state.page!=='activity')return;
    const c=document.querySelector('#content');
    if(!c||c.dataset.activityGrouped==='1')return;
    const logs=[...(db.logs||[])].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    const groups=new Map();
    for(const log of logs){const k=dateKey(log.created_at);if(!k)continue;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(log)}
    c.dataset.activityGrouped='1';
    const entries=[...groups.entries()];
    const today=todayKey();
    c.innerHTML=`<div class="activity-page"><div class="activity-head"><div><h2>Recent Activity</h2><p>Tap a date to view all activity for that day</p></div></div>${entries.length?entries.map(([day,items],index)=>dayCard(day,items,day===today||(index===0&&!groups.has(today)))).join(''):'<div class="activity-day"><div class="activity-empty">No activity yet.</div></div>'}</div>`;
    bindToggles(c);
  }

  const observer=new MutationObserver(()=>{
    const c=document.querySelector('#content');
    if(c&&typeof state!=='undefined'&&state.page==='activity'&&!c.dataset.activityGrouped)requestAnimationFrame(renderGrouped);
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',e=>{if(e.target.closest('[data-page="activity"]'))setTimeout(renderGrouped,0)},true);
  setTimeout(renderGrouped,0);
})();