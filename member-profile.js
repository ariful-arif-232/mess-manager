/* Premium member profile and personal account dashboard. */
'use strict';
(()=>{
  const safeMoney=n=>money(Number(n||0));
  const currentMemberCalc=()=>calcMonth().find(x=>x.member.id===profile.id)||{member:profile,units:0,food:0,util:0,deposit:0,total:0,balance:0};
  const personalBazar=()=>db.bazar.filter(x=>x.buyer_member_id===profile.id).reduce((s,x)=>s+Number(x.amount||0),0);
  const avatar=()=>profile.avatar_url?`<img src="${esc(profile.avatar_url)}" alt="${esc(profile.name)}">`:`<span>${esc((profile.name||'M').split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase())}</span>`;
  const pct=(a,b)=>b?Math.min(100,Math.max(0,(a/b)*100)):0;

  function memberProfile(c){
    const x=currentMemberCalc();
    const bazar=personalBazar();
    const mealDays=db.meals.filter(m=>m.memberId===profile.id&&m.on).length;
    const deposits=db.deposits.filter(d=>d.memberId===profile.id).sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,4);
    const utilShare=x.util;
    const totalOut=x.food+utilShare;
    const status=x.balance>=0?'Advance':'Due';
    const balanceClass=x.balance>=0?'good':'bad';
    const depositCoverage=pct(x.deposit,totalOut);
    const mySchedules=db.schedules.filter(s=>String(s.names||'').toLowerCase().includes(String(profile.name||'').toLowerCase())).slice(0,3);

    c.innerHTML=`<div class="member-profile-page">
      <section class="member-profile-hero">
        <div class="member-profile-avatar">${avatar()}</div>
        <div class="member-profile-identity"><span>MY MESS PROFILE</span><h2>${esc(profile.name)}</h2><p>${esc(mess.name)} · ${esc(profile.role)}</p><div class="member-profile-meta"><b>${esc(profile.phone||'Phone not added')}</b><b>${esc(profile.email||session?.user?.email||'Email not added')}</b></div></div>
        <div class="member-profile-balance ${balanceClass}"><small>${status}</small><strong>${safeMoney(Math.abs(x.balance))}</strong></div>
      </section>

      <section class="member-profile-kpis">
        <article><span>Meal units</span><strong>${Number(x.units||0).toLocaleString('en-BD')}</strong><small>${mealDays} active meal days</small></article>
        <article><span>Meal cost</span><strong>${safeMoney(x.food)}</strong><small>Current month</small></article>
        <article><span>Utility share</span><strong>${safeMoney(utilShare)}</strong><small>Your portion</small></article>
        <article><span>Total deposit</span><strong>${safeMoney(x.deposit)}</strong><small>Current month</small></article>
      </section>

      <section class="member-profile-card member-profile-overview">
        <div class="member-profile-section-head"><div><span>MONTHLY POSITION</span><h3>Your complete হিসাব</h3></div><b>${state.month}</b></div>
        <div class="member-profile-money-grid">
          <div><span>Food + utility</span><strong>${safeMoney(totalOut)}</strong></div>
          <div><span>Your bazar purchases</span><strong>${safeMoney(bazar)}</strong></div>
          <div><span>Deposited</span><strong>${safeMoney(x.deposit)}</strong></div>
          <div class="${balanceClass}"><span>${status}</span><strong>${safeMoney(Math.abs(x.balance))}</strong></div>
        </div>
        <div class="member-profile-progress"><div><span>Deposit coverage</span><b>${Math.round(depositCoverage)}%</b></div><i><u style="width:${depositCoverage}%"></u></i></div>
      </section>

      <section class="member-profile-card">
        <div class="member-profile-section-head"><div><span>BREAKDOWN</span><h3>Where your money went</h3></div></div>
        <div class="member-profile-breakdown">
          <div><i>🍚</i><span><b>Meal cost</b><small>${Number(x.units||0).toLocaleString('en-BD')} meal units</small></span><strong>${safeMoney(x.food)}</strong></div>
          <div><i>⚡</i><span><b>Utility share</b><small>Shared bills</small></span><strong>${safeMoney(utilShare)}</strong></div>
          <div><i>🛒</i><span><b>Bazar purchased</b><small>Items bought by you</small></span><strong>${safeMoney(bazar)}</strong></div>
          <div><i>💳</i><span><b>Deposits</b><small>Paid into mess</small></span><strong>${safeMoney(x.deposit)}</strong></div>
        </div>
      </section>

      <section class="member-profile-split">
        <article class="member-profile-card"><div class="member-profile-section-head"><div><span>RECENT</span><h3>Deposits</h3></div></div><div class="member-profile-mini-list">${deposits.length?deposits.map(d=>`<div><span><b>${esc(d.date)}</b><small>Deposit</small></span><strong>${safeMoney(d.amount)}</strong></div>`).join(''):'<p>No deposits this month.</p>'}</div></article>
        <article class="member-profile-card"><div class="member-profile-section-head"><div><span>BAZAR DUTY</span><h3>Upcoming schedule</h3></div></div><div class="member-profile-mini-list">${mySchedules.length?mySchedules.map(s=>`<div><span><b>${esc(s.date)}</b><small>${s.done?'Done':'Pending'}</small></span><strong>${s.done?'✓':'→'}</strong></div>`).join(''):'<p>No assigned schedule found.</p>'}</div></article>
      </section>

      <section class="member-profile-card member-profile-details">
        <div class="member-profile-section-head"><div><span>ACCOUNT</span><h3>Member details</h3></div></div>
        <div class="member-profile-detail-grid"><div><span>Role</span><b>${esc(profile.role)}</b></div><div><span>Status</span><b>${profile.active?'Active':'Inactive'}</b></div><div><span>Join date</span><b>${esc(profile.join_date||'-')}</b></div><div><span>Mess</span><b>${esc(mess.name)}</b></div></div>
      </section>
    </div>`;
  }

  const previousRenderPage=renderPage;
  renderPage=function(){if(state.page==='profile')return memberProfile($('#content'));return previousRenderPage();};
  const previousPageTitle=pageTitle;
  pageTitle=function(){return state.page==='profile'?'My Profile':previousPageTitle();};

  document.addEventListener('click',e=>{
    const trigger=e.target.closest?.('#mobileMore');
    if(!trigger||profile?.role==='admin')return;
    setTimeout(()=>{
      const grid=document.querySelector('#moreSheet .sheet-grid');
      if(!grid||grid.querySelector('[data-member-profile]'))return;
      const b=document.createElement('button');
      b.type='button';b.dataset.memberProfile='1';b.innerHTML='<span>◉</span><b>Profile</b>';
      b.onclick=()=>{document.querySelector('#moreSheet')?.remove();state.page='profile';render();};
      grid.appendChild(b);
    },0);
  },true);
})();
