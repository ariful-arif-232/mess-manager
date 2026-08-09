/* Group Recent Activity by day and show compact human-readable rows. */
'use strict';
(()=>{
  const labels={
    bazar:'Bazar',utility_bill:'Utility Bill',deposit:'Deposit',schedule:'Schedule',meal:'Meal',member:'Member',settlement:'Settlement',monthly_settlement:'Settlement',report:'Report',settings:'Settings'
  };
  const verbs={create:'Created',update:'Updated',delete:'Deleted',toggle:'Changed',toggle_meal:'Meal changed',status_change:'Status changed',save_draft:'Draft saved'};
  const actorName=id=>db.members.find(m=>m.user_id===id)?.name||'Admin';
  const dateKey=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toISOString().slice(0,10)};
  const niceDay=v=>{const d=new Date(`${v}T00:00:00`);return d.toLocaleDateString('en-BD',{weekday:'short',day:'numeric',month:'short',year:'numeric'});};
  const niceTime=v=>{const d=new Date(v);return d.toLocaleTimeString('en-BD',{hour:'2-digit',minute:'2-digit'});};
  const cleanType=v=>labels[v]||String(v||'Activity').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  const cleanAction=v=>verbs[v]||String(v||'Updated').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  function activityCompact(c){
    const logs=[...(db.logs||[])].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    const groups=new Map();
    logs.forEach(log=>{const k=dateKey(log.created_at);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(log);});
    c.innerHTML=`<div class="activity-page"><div class="activity-head"><div><h2>Recent Activity</h2><p>Admin updates grouped by date</p></div></div>${groups.size?[...groups.entries()].map(([day,items])=>`<section class="activity-day"><div class="activity-day-title"><strong>${esc(niceDay(day))}</strong><span>${items.length} ${items.length===1?'activity':'activities'}</span></div><div class="activity-list-compact">${items.map(log=>{const action=String(log.action||'update');const type=cleanType(log.entity_type);const actor=actorName(log.actor_id);const id=log.entity_id?String(log.entity_id):'';return `<div class="activity-row"><div class="activity-meta-left"><div class="activity-time">${esc(niceTime(log.created_at))}</div><div class="activity-actor">${esc(actor)}</div></div><div class="activity-main"><div class="activity-title ${esc(action.split('_')[0])}"><span class="activity-dot"></span><span>${esc(cleanAction(action))} ${esc(type)}</span></div>${id?`<div class="activity-sub">Ref ${esc(id.slice(0,8))}<span class="activity-badge">${esc(type)}</span></div>`:''}</div></div>`}).join('')}</div></section>`).join('):'<div class="activity-day"><div class="activity-empty">No activity yet.</div></div>'}</div>`;
  }
  window.activity=activityCompact;
  const prev=window.renderPage;
  window.renderPage=function(){if(state.page==='activity')return activityCompact(document.querySelector('#content'));return prev();};
})();