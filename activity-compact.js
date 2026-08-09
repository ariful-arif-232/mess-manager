/* Force grouped Recent Activity after the legacy renderer runs. */
'use strict';
(()=>{
  const labels={bazar:'Bazar',utility_bill:'Utility Bill',deposit:'Deposit',schedule:'Schedule',meal:'Meal',member:'Member',settlement:'Settlement',monthly_settlement:'Settlement',report:'Report',settings:'Settings'};
  const verbs={create:'Created',update:'Updated',delete:'Deleted',toggle:'Changed',toggle_meal:'Meal changed',status_change:'Status changed',save_draft:'Draft saved'};
  const escHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const actorName=id=>db.members.find(m=>m.user_id===id)?.name||profile?.name||'Admin';
  const dateKey=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toISOString().slice(0,10)};
  const niceDay=v=>new Date(`${v}T00:00:00`).toLocaleDateString('en-BD',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
  const niceTime=v=>new Date(v).toLocaleTimeString('en-BD',{hour:'2-digit',minute:'2-digit'});
  const cleanType=v=>labels[v]||String(v||'Activity').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  const cleanAction=v=>verbs[v]||String(v||'Updated').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());

  function renderGrouped(){
    if(typeof state==='undefined'||state.page!=='activity')return;
    const c=document.querySelector('#content');
    if(!c||c.dataset.activityGrouped==='1')return;
    const logs=[...(db.logs||[])].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    const groups=new Map();
    for(const log of logs){const k=dateKey(log.created_at);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(log)}
    c.dataset.activityGrouped='1';
    c.innerHTML=`<div class="activity-page"><div class="activity-head"><div><h2>Recent Activity</h2><p>Admin updates grouped by date</p></div></div>${groups.size?[...groups.entries()].map(([day,items])=>`<section class="activity-day"><div class="activity-day-title"><strong>${escHtml(niceDay(day))}</strong><span>${items.length} ${items.length===1?'activity':'activities'}</span></div><div class="activity-list-compact">${items.map(log=>{const action=String(log.action||'update');const type=cleanType(log.entity_type);const id=log.entity_id?String(log.entity_id):'';return `<div class="activity-row"><div class="activity-meta-left"><div class="activity-time">${escHtml(niceTime(log.created_at))}</div><div class="activity-actor">${escHtml(actorName(log.actor_id))}</div></div><div class="activity-main"><div class="activity-title ${escHtml(action.split('_')[0])}"><span class="activity-dot"></span><span>${escHtml(cleanAction(action))} ${escHtml(type)}</span></div>${id?`<div class="activity-sub">Ref ${escHtml(id.slice(0,8))}<span class="activity-badge">${escHtml(type)}</span></div>`:''}</div></div>`}).join('')}</div></section>`).join('):'<div class="activity-day"><div class="activity-empty">No activity yet.</div></div>'}</div>`;
  }

  const observer=new MutationObserver(()=>{
    const c=document.querySelector('#content');
    if(c&&typeof state!=='undefined'&&state.page==='activity'&&!c.dataset.activityGrouped)requestAnimationFrame(renderGrouped);
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',e=>{if(e.target.closest('[data-page="activity"]'))setTimeout(renderGrouped,0)},true);
  setTimeout(renderGrouped,0);
})();