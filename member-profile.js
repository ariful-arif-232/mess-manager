/* Premium member profile and personal account dashboard. */
'use strict';
(()=>{
  const safeMoney=n=>money(Number(n||0));
  const currentMemberCalc=()=>calcMonth().find(x=>x.member.id===profile.id)||{member:profile,units:0,food:0,util:0,deposit:0,total:0,balance:0};
  const personalBazar=()=>db.bazar.filter(x=>x.buyer_member_id===profile.id).reduce((s,x)=>s+Number(x.amount||0),0);
  const avatar=()=>profile.avatar_url?`<img src="${esc(profile.avatar_url)}" alt="${esc(profile.name)}">`:`<span>${esc((profile.name||'M').split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase())}</span>`;
  const pct=(a,b)=>b?Math.min(100,Math.max(0,(a/b)*100)):0;
  const profileIcon=`<svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7.5" r="3.25"></circle><path d="M5.2 19.2c.8-3.4 3.25-5.2 6.8-5.2s6 1.8 6.8 5.2"></path></svg>`;
  function memberProfile(c){
    const x=currentMemberCalc(),bazar=personalBazar();
    const mealDays=db.meals.filter(m=>m.memberId===profile.id&&m.on).length;
    const deposits=db.deposits.filter(d=>d.memberId===profile.id).sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,4);
    const utilShare=x.util,totalOut=x.food+utilShare,status=x.balance>=0?'Advance':'Due',balanceClass=x.balance>=0?'good':'bad',depositCoverage=pct(x.deposit,totalOut);
    const mySchedules=db.schedules.filter(s=>String(s.names||'').toLowerCase().includes(String(profile.name||'').toLowerCase())).slice(0,3);
    c.innerHTML=`<div class="member-profile-page"><section class="member-profile-hero"><div class="member-profile-avatar">${avatar()}</div><div class="member-profile-identity"><span>MY MESS PROFILE</span><h2>${esc(profile.name)}</h2><p>${esc(mess.name)} · ${esc(profile.role)}</p><div class="member-profile-meta"><b>${esc(profile.phone||'Phone not added')}</b><b>${esc(profile.email||session?.user?.email||'Email not added')}</b></div></div><div class="member-profile-balance ${balanceClass}"><small>${status}</small><strong>${safeMoney(Math.abs(x.balance))}</strong></div></section><section class="member-profile-kpis"><article><span>Meal units</span><strong>${Number(x.units||0).toLocaleString('en-BD')}</strong><small>${mealDays} active meal days</small></article><article><span>Meal cost</span><strong>${safeMoney(x.food)}</strong><small>Current month</small></article><article><span>Utility share</span><strong>${safeMoney(utilShare)}</strong><small>Your portion</small></article><article><span>Total deposit</span><strong>${safeMoney(x.deposit)}</strong><small>Current month</small></article></section><section class="member-profile-card member-profile-overview"><div class="member-profile-section-head"><div><span>MONTHLY POSITION</span><h3>Your complete হিসাব</h3></div><b>${state.month}</b></div><div class="member-profile-money-grid"><div><span>Food + utility</span><strong>${safeMoney(totalOut)}</strong></div><div><span>Your bazar purchases</span><strong>${safeMoney(bazar)}</strong></div><div><span>Deposited</span><strong>${safeMoney(x.deposit)}</strong></div><div class="${balanceClass}"><span>${status}</span><strong>${safeMoney(Math.abs(x.balance))}</strong></div></div><div class="member-profile-progress"><div><span>Deposit coverage</span><b>${Math.round(depositCoverage)}%</b></div><i><u style="width:${depositCoverage}%"></u></i></div></section><section class="member-profile-card"><div class="member-profile-section-head"><div><span>BREAKDOWN</span><h3>Where your money went</h3></div></div><div class="member-profile-breakdown"><div><i>🍚</i><span><b>Meal cost</b><small>${Number(x.units||0).toLocaleString('en-BD')} meal units</small></span><strong>${safeMoney(x.food)}</strong></div><div><i>⚡</i><span><b>Utility share</b><small>Shared bills</small></span><strong>${safeMoney(utilShare)}</strong></div><div><i>🛒</i><span><b>Bazar purchased</b><small>Items bought by you</small></span><strong>${safeMoney(bazar)}</strong></div><div><i>💳</i><span><b>Deposits</b><small>Paid into mess</small></span><strong>${safeMoney(x.deposit)}</strong></div></div></section><section class="member-profile-split"><article class="member-profile-card"><div class="member-profile-section-head"><div><span>RECENT</span><h3>Deposits</h3></div></div><div class="member-profile-mini-list">${deposits.length?deposits.map(d=>`<div><span><b>${esc(d.date)}</b><small>Deposit</small></span><strong>${safeMoney(d.amount)}</strong></div>`).join(''):'<p>No deposits this month.</p>'}</div></article><article class="member-profile-card"><div class="member-profile-section-head"><div><span>BAZAR DUTY</span><h3>Upcoming schedule</h3></div></div><div class="member-profile-mini-list">${mySchedules.length?mySchedules.map(s=>`<div><span><b>${esc(s.date)}</b><small>${s.done?'Done':'Pending'}</small></span><strong>${s.done?'✓':'→'}</strong></div>`).join(''):'<p>No assigned schedule found.</p>'}</div></article></section><section class="member-profile-card member-profile-details"><div class="member-profile-section-head"><div><span>ACCOUNT</span><h3>Member details</h3></div></div><div class="member-profile-detail-grid"><div><span>Role</span><b>${esc(profile.role)}</b></div><div><span>Status</span><b>${profile.active?'Active':'Inactive'}</b></div><div><span>Join date</span><b>${esc(profile.join_date||'-')}</b></div><div><span>Mess</span><b>${esc(mess.name)}</b></div></div></section></div>`;
  }
  const previousRenderPage=renderPage;renderPage=function(){if(state.page==='profile')return memberProfile($('#content'));return previousRenderPage();};
  const previousPageTitle=pageTitle;pageTitle=function(){return state.page==='profile'?'My Profile':previousPageTitle();};
  const fixProfileMenuIcon=()=>{
    if(profile?.role==='admin')return;
    document.querySelectorAll('#moreSheet .sheet-grid button').forEach(btn=>{
      const label=btn.querySelector('b')?.textContent?.trim();
      if(label!=='Profile')return;
      btn.dataset.memberProfile='1';
      let holder=btn.querySelector('span');
      if(!holder){holder=document.createElement('span');btn.prepend(holder);}
      holder.className='member-profile-menu-icon';
      if(!holder.querySelector('svg[data-profile-icon="1"]')) holder.innerHTML=profileIcon.replace('<svg ','<svg data-profile-icon="1" ');
      btn.onclick=()=>{document.querySelector('#moreSheet')?.remove();state.page='profile';render();};
    });
  };
  const observer=new MutationObserver(()=>fixProfileMenuIcon());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',e=>{
    const trigger=e.target.closest?.('#mobileMore');if(!trigger||profile?.role==='admin')return;
    setTimeout(()=>{
      const grid=document.querySelector('#moreSheet .sheet-grid');if(!grid)return;
      let profileButton=[...grid.querySelectorAll('button')].find(b=>b.querySelector('b')?.textContent?.trim()==='Profile')||grid.querySelector('[data-member-profile]');
      if(!profileButton){profileButton=document.createElement('button');profileButton.type='button';profileButton.dataset.memberProfile='1';profileButton.innerHTML=`<span class="member-profile-menu-icon">${profileIcon}</span><b>Profile</b>`;}
      const activityButton=grid.querySelector('[data-member-activity]');
      const settingsButton=grid.querySelector('[data-member-settings]');
      if(activityButton)grid.appendChild(activityButton);
      if(settingsButton)grid.appendChild(settingsButton);
      grid.appendChild(profileButton);
      fixProfileMenuIcon();
    },40);
  },true);
})();
