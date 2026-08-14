/* Member Profile: stable More-menu integration and personal summary page. */
'use strict';
(()=>{
  const profileSvg=()=>`<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7.5" r="3.25"></circle><path d="M5.25 19c.85-3.3 3.15-5 6.75-5s5.9 1.7 6.75 5"></path></svg>`;
  const fmt=n=>money(Number(n||0));
  const myCalc=()=>calcMonth().find(x=>x.member.id===profile.id)||{units:0,food:0,util:0,deposit:0,total:0,balance:0};
  const myBazar=()=>db.bazar.filter(x=>x.buyer_member_id===profile.id).reduce((s,x)=>s+Number(x.amount||0),0);
  const avatar=()=>profile.avatar_url?`<img src="${esc(profile.avatar_url)}" alt="${esc(profile.name)}">`:`<span>${esc((profile.name||'M').split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase())}</span>`;

  function renderMemberProfile(c){
    const x=myCalc();
    const bazar=myBazar();
    const status=x.balance>=0?'Advance':'Due';
    const balanceClass=x.balance>=0?'good':'bad';
    const mealDays=db.meals.filter(m=>m.memberId===profile.id&&m.on).length;
    const deposits=db.deposits.filter(d=>d.memberId===profile.id).sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,4);
    const schedules=db.schedules.filter(s=>String(s.names||'').toLowerCase().includes(String(profile.name||'').toLowerCase())).slice(0,3);
    c.innerHTML=`<div class="member-profile-page">
      <section class="member-profile-hero">
        <div class="member-profile-avatar">${avatar()}</div>
        <div class="member-profile-identity"><span>MY MESS PROFILE</span><h2>${esc(profile.name)}</h2><p>${esc(mess.name)} · ${esc(profile.role)}</p><div class="member-profile-meta"><b>${esc(profile.phone||'Phone not added')}</b><b>${esc(profile.email||session?.user?.email||'Email not added')}</b></div></div>
        <div class="member-profile-balance ${balanceClass}"><small>${status}</small><strong>${fmt(Math.abs(x.balance))}</strong></div>
      </section>
      <section class="member-profile-kpis">
        <article><span>Meal units</span><strong>${Number(x.units||0).toLocaleString('en-BD')}</strong><small>${mealDays} active meal days</small></article>
        <article><span>Meal cost</span><strong>${fmt(x.food)}</strong><small>Current month</small></article>
        <article><span>Utility share</span><strong>${fmt(x.util)}</strong><small>Your portion</small></article>
        <article><span>Total deposit</span><strong>${fmt(x.deposit)}</strong><small>Current month</small></article>
      </section>
      <section class="member-profile-card"><div class="member-profile-section-head"><div><span>MONTHLY POSITION</span><h3>Your হিসাব summary</h3></div><b>${esc(state.month)}</b></div><div class="member-profile-money-grid"><div><span>Total bill</span><strong>${fmt(x.total)}</strong></div><div><span>Your bazar</span><strong>${fmt(bazar)}</strong></div><div><span>Deposited</span><strong>${fmt(x.deposit)}</strong></div><div class="${balanceClass}"><span>${status}</span><strong>${fmt(Math.abs(x.balance))}</strong></div></div></section>
      <section class="member-profile-split">
        <article class="member-profile-card"><div class="member-profile-section-head"><div><span>RECENT</span><h3>Deposits</h3></div></div><div class="member-profile-mini-list">${deposits.length?deposits.map(d=>`<div><span><b>${esc(d.date)}</b><small>Deposit</small></span><strong>${fmt(d.amount)}</strong></div>`).join(''):'<p>No deposits this month.</p>'}</div></article>
        <article class="member-profile-card"><div class="member-profile-section-head"><div><span>BAZAR DUTY</span><h3>Schedule</h3></div></div><div class="member-profile-mini-list">${schedules.length?schedules.map(s=>`<div><span><b>${esc(s.date)}</b><small>${s.done?'Done':'Pending'}</small></span><strong>${s.done?'✓':'→'}</strong></div>`).join(''):'<p>No assigned schedule found.</p>'}</div></article>
      </section>
      <section class="member-profile-card"><div class="member-profile-section-head"><div><span>ACCOUNT</span><h3>Member details</h3></div></div><div class="member-profile-detail-grid"><div><span>Role</span><b>${esc(profile.role)}</b></div><div><span>Status</span><b>${profile.active?'Active':'Inactive'}</b></div><div><span>Join date</span><b>${esc(profile.join_date||'-')}</b></div><div><span>Mess</span><b>${esc(mess.name)}</b></div></div></section>
    </div>`;
  }

  const baseRenderPage=renderPage;
  renderPage=function(){
    if(state.page==='profile')return renderMemberProfile($('#content'));
    return baseRenderPage();
  };
  const basePageTitle=pageTitle;
  pageTitle=function(){return state.page==='profile'?'My Profile':basePageTitle();};

  function addProfileTile(){
    if(profile?.role==='admin')return;
    const grid=document.querySelector('#moreSheet .sheet-grid');
    if(!grid)return;
    let button=grid.querySelector('[data-member-profile]');
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.dataset.memberProfile='1';
      button.innerHTML=`<span class="member-profile-menu-icon">${profileSvg()}</span><b>Profile</b>`;
      button.addEventListener('click',()=>{document.querySelector('#moreSheet')?.remove();state.page='profile';render();});
      grid.appendChild(button);
    }
    const activity=grid.querySelector('[data-member-activity]');
    const settings=grid.querySelector('[data-member-settings]');
    if(activity)grid.appendChild(activity);
    if(settings)grid.appendChild(settings);
    grid.appendChild(button);
  }

  document.addEventListener('click',e=>{
    if(!e.target.closest?.('#mobileMore')||profile?.role==='admin')return;
    setTimeout(addProfileTile,25);
  },true);
})();
