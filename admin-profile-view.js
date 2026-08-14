/* View mess admin profiles by tapping the unchanged Settings workspace hero. */
'use strict';
(()=>{
  const OVERLAY_ID='adminProfileViewer';
  const closeIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';
  const chevronIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';

  const admins=()=>{
    const all=(db?.members||[]).filter(member=>member?.role==='admin');
    const active=all.filter(member=>member.active!==false);
    return (active.length?active:all).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
  };
  const initials=member=>String(member?.name||'A').trim().split(/\s+/).filter(Boolean).map(part=>part[0]).slice(0,2).join('').toUpperCase()||'A';
  const avatar=member=>member?.avatar_url
    ? `<img src="${esc(member.avatar_url)}" alt="${esc(member.name||'Admin')}">`
    : `<span>${esc(initials(member))}</span>`;
  const memberCalc=member=>calcMonth().find(row=>row.member.id===member.id)||{units:0,food:0,util:0,deposit:0,total:0,balance:0};
  const adminBazar=member=>(db?.bazar||[]).filter(entry=>entry.buyer_member_id===member.id).reduce((sum,entry)=>sum+Number(entry.amount||0),0);
  const adminSchedules=member=>{
    const name=String(member?.name||'').trim().toLowerCase();
    if(!name)return [];
    return (db?.schedules||[]).filter(item=>String(item.names||'').toLowerCase().includes(name));
  };
  const recentDeposits=member=>(db?.deposits||[]).filter(item=>item.memberId===member.id).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,4);

  function closeViewer(){
    document.getElementById(OVERLAY_ID)?.remove();
    document.documentElement.classList.remove('admin-profile-view-open');
  }
  function mount(content){
    closeViewer();
    document.body.insertAdjacentHTML('beforeend',`<div class="admin-profile-overlay" id="${OVERLAY_ID}" role="presentation"><section class="admin-profile-sheet" role="dialog" aria-modal="true">${content}</section></div>`);
    document.documentElement.classList.add('admin-profile-view-open');
    const overlay=document.getElementById(OVERLAY_ID);
    overlay.addEventListener('click',event=>{if(event.target===overlay)closeViewer();});
    overlay.querySelectorAll('[data-admin-profile-close]').forEach(button=>button.addEventListener('click',closeViewer));
  }

  function openPicker(list=admins()){
    mount(`<header class="admin-profile-picker-head"><div><span>MESS ADMINISTRATORS</span><h2>Select an admin</h2><p>যার profile দেখতে চান তার নাম নির্বাচন করুন।</p></div><button type="button" class="admin-profile-close" data-admin-profile-close aria-label="Close">${closeIcon}</button></header><div class="admin-profile-choice-list">${list.map(member=>`<button type="button" class="admin-profile-choice" data-admin-profile-id="${esc(member.id)}"><span class="admin-profile-choice-avatar">${avatar(member)}</span><span class="admin-profile-choice-copy"><b>${esc(member.name||'Admin')}</b><small>${member.active===false?'Inactive':'Active'} admin · ${esc(member.email||member.phone||mess?.name||'Mess Manager')}</small></span><span class="admin-profile-choice-arrow">${chevronIcon}</span></button>`).join('')}</div>`);
    const overlay=document.getElementById(OVERLAY_ID);
    overlay.querySelectorAll('[data-admin-profile-id]').forEach(button=>button.addEventListener('click',()=>{
      const member=list.find(item=>String(item.id)===String(button.dataset.adminProfileId));
      if(member)openProfile(member,list);
    }));
  }

  function openProfile(member,list=admins()){
    const calc=memberCalc(member);
    const balancePositive=Number(calc.balance||0)>=0;
    const schedules=adminSchedules(member);
    const deposits=recentDeposits(member);
    const totalAdmins=list.length;
    const managerName=(db?.members||[]).find(item=>item.role==='admin'&&item.active!==false)?.name||member.name||'Admin';
    const contact=member.email||member.phone||'Not added';
    mount(`<header class="admin-profile-hero"><div class="admin-profile-avatar">${avatar(member)}</div><div class="admin-profile-identity"><span>MESS ADMIN PROFILE</span><h2>${esc(member.name||'Admin')}</h2><p>${esc(mess?.name||'Mess Manager')} · Administrator</p><div class="admin-profile-badges"><b>${member.active===false?'Inactive':'Active'}</b><b>${totalAdmins>1?`${totalAdmins} admins`:'Primary admin'}</b></div></div><button type="button" class="admin-profile-close admin-profile-close-on-hero" data-admin-profile-close aria-label="Close">${closeIcon}</button></header><div class="admin-profile-toolbar">${list.length>1?'<button type="button" data-admin-profile-back>‹ All admins</button>':'<span></span>'}<small>Managed by ${esc(managerName)}</small></div><section class="admin-profile-stat-grid"><article><span>Meal units</span><strong>${Number(calc.units||0).toLocaleString('en-BD')}</strong><small>Current month</small></article><article><span>Meal cost</span><strong>${money(calc.food)}</strong><small>Personal হিসাব</small></article><article><span>Utility share</span><strong>${money(calc.util)}</strong><small>Current month</small></article><article class="${balancePositive?'is-positive':'is-negative'}"><span>${balancePositive?'Advance':'Due'}</span><strong>${money(Math.abs(Number(calc.balance||0)))}</strong><small>After deposit</small></article></section><section class="admin-profile-card"><div class="admin-profile-card-head"><div><span>MONTHLY OVERVIEW</span><h3>Admin হিসাব</h3></div><b>${esc(state.month)}</b></div><div class="admin-profile-money-grid"><div><span>Total deposit</span><strong>${money(calc.deposit)}</strong></div><div><span>Total bill</span><strong>${money(calc.total)}</strong></div><div><span>Bazar purchased</span><strong>${money(adminBazar(member))}</strong></div><div><span>Assigned duties</span><strong>${schedules.length}</strong></div></div></section><section class="admin-profile-card"><div class="admin-profile-card-head"><div><span>ADMIN DETAILS</span><h3>Contact & access</h3></div></div><div class="admin-profile-detail-grid"><div><span>Email / phone</span><b>${esc(contact)}</b></div><div><span>Join date</span><b>${esc(member.join_date||'-')}</b></div><div><span>Role</span><b>Admin</b></div><div><span>Status</span><b>${member.active===false?'Inactive':'Active'}</b></div></div></section><section class="admin-profile-split"><article class="admin-profile-card"><div class="admin-profile-card-head"><div><span>RECENT</span><h3>Deposits</h3></div></div><div class="admin-profile-list">${deposits.length?deposits.map(item=>`<div><span><b>${esc(item.date||'-')}</b><small>Deposit</small></span><strong>${money(item.amount)}</strong></div>`).join(''):'<p>No deposits this month.</p>'}</div></article><article class="admin-profile-card"><div class="admin-profile-card-head"><div><span>BAZAR DUTY</span><h3>Schedule</h3></div></div><div class="admin-profile-list">${schedules.length?schedules.slice(0,4).map(item=>`<div><span><b>${esc(item.date||'-')}</b><small>${item.done?'Done':'Pending'}</small></span><strong>${item.done?'✓':'→'}</strong></div>`).join(''):'<p>No assigned schedule found.</p>'}</div></article></section>`);
    document.querySelector('[data-admin-profile-back]')?.addEventListener('click',()=>openPicker(list));
  }

  function openAdminProfiles(){
    const list=admins();
    if(!list.length){notify('এই mess-এ কোনো admin profile পাওয়া যায়নি।');return;}
    if(list.length===1)openProfile(list[0],list);else openPicker(list);
  }

  document.addEventListener('click',event=>{
    const trigger=event.target.closest?.('.settings-hero');
    if(!trigger||state?.page!=='settings')return;
    event.preventDefault();
    openAdminProfiles();
  },true);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&document.getElementById(OVERLAY_ID)){closeViewer();return;}
    if((event.key==='Enter'||event.key===' ')&&event.target?.matches?.('.settings-hero')){event.preventDefault();openAdminProfiles();}
  });
  window.openMessAdminProfiles=openAdminProfiles;
})();
