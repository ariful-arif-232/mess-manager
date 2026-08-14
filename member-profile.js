/* Member Profile: stable More-menu integration, personal summary and self-service avatar upload. */
'use strict';
(()=>{
  const AVATAR_BUCKET='member-avatars';
  const MAX_AVATAR_BYTES=8*1024*1024;
  const profileSvg=()=>`<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7.5" r="3.25"></circle><path d="M5.25 19c.85-3.3 3.15-5 6.75-5s5.9 1.7 6.75 5"></path></svg>`;
  const cameraSvg=()=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.2-2h5.6L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.25"/></svg>`;
  const fmt=n=>money(Number(n||0));
  const myCalc=()=>calcMonth().find(x=>x.member.id===profile.id)||{units:0,food:0,util:0,deposit:0,total:0,balance:0};
  const myBazar=()=>db.bazar.filter(x=>x.buyer_member_id===profile.id).reduce((s,x)=>s+Number(x.amount||0),0);
  const initials=member=>String(member?.name||'M').trim().split(/\s+/).filter(Boolean).map(x=>x[0]).slice(0,2).join('').toUpperCase()||'M';
  const memberAvatar=(member,cls='')=>member?.avatar_url
    ? `<img class="${cls}" src="${esc(member.avatar_url)}" alt="${esc(member.name||'Member')}">`
    : `<span class="${cls}">${esc(initials(member))}</span>`;

  function avatarPickerMarkup(){
    return `<button type="button" class="member-profile-avatar member-profile-avatar-edit" id="memberAvatarPicker" aria-label="Change profile photo" title="Change profile photo">${memberAvatar(profile)}<i class="member-profile-avatar-camera">${cameraSvg()}</i><span class="member-profile-avatar-progress" aria-hidden="true"></span></button><input id="memberAvatarInput" class="member-profile-avatar-input" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" aria-hidden="true" tabindex="-1">`;
  }

  async function uploadMyAvatar(file,button,input){
    if(!file)return;
    if(!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type||'')){
      input.value='';
      return notify('JPG, PNG, WebP বা HEIC photo দিন।');
    }
    if(file.size>MAX_AVATAR_BYTES){
      input.value='';
      return notify('Profile photo 8 MB-এর মধ্যে দিন।');
    }
    if(!session?.user?.id||!profile?.id){
      input.value='';
      return notify('Login session পাওয়া যায়নি। আবার চেষ্টা করুন।');
    }

    button.disabled=true;
    button.classList.add('is-uploading');
    try{
      const ext=(String(file.name||'').split('.').pop()||file.type.split('/')[1]||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,8)||'jpg';
      const objectPath=`${session.user.id}/profile.${ext}`;
      const upload=await client.storage.from(AVATAR_BUCKET).upload(objectPath,file,{upsert:true,cacheControl:'0',contentType:file.type});
      if(upload.error)throw upload.error;
      const publicData=client.storage.from(AVATAR_BUCKET).getPublicUrl(objectPath);
      const publicUrl=publicData?.data?.publicUrl;
      if(!publicUrl)throw new Error('Uploaded photo URL পাওয়া যায়নি।');
      const versioned=`${publicUrl}?v=${Date.now()}`;
      const saved=await client.rpc('update_my_avatar',{p_avatar_url:versioned});
      if(saved.error)throw saved.error;

      profile.avatar_url=versioned;
      const row=db.members.find(member=>member.id===profile.id);
      if(row)row.avatar_url=versioned;
      await loadData();
      profile=db.members.find(member=>member.user_id===session.user.id&&member.active)||profile;
      render();
      notify('Profile photo updated.','success');
    }catch(error){
      console.error(error);
      notify(error?.message||'Profile photo upload করা যায়নি।');
    }finally{
      input.value='';
      button.disabled=false;
      button.classList.remove('is-uploading');
    }
  }

  function bindAvatarPicker(){
    const button=document.getElementById('memberAvatarPicker');
    const input=document.getElementById('memberAvatarInput');
    if(!button||!input)return;
    button.addEventListener('click',()=>input.click());
    input.addEventListener('change',()=>uploadMyAvatar(input.files?.[0],button,input));
  }

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
        ${avatarPickerMarkup()}
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
    bindAvatarPicker();
  }

  /* Dashboard/member summary uses the same avatar_url source as profile, chat, reports and bazar. */
  const previousSettlementTable=window.settlementTable;
  if(typeof previousSettlementTable==='function'){
    window.settlementTable=function settlementTableWithMemberPhotos(calc){
      const rows=calc.map(x=>`<tr><td><span class="member-table-person">${memberAvatar(x.member,'member-table-avatar')}<b>${esc(x.member.name)}</b></span></td><td>${x.units}</td><td>${money(x.deposit)}</td><td>${money(x.food)}</td><td>${money(x.util)}</td><td>${money(x.total)}</td><td>${x.balance>=0?`<span class="pill advance">Advance ${money(x.balance)}</span>`:`<span class="pill due">Due ${money(-x.balance)}</span>`}</td></tr>`).join('');
      const cards=calc.map(x=>`<article class="member-summary-card"><div class="member-summary-head"><div class="avatar member-summary-avatar">${memberAvatar(x.member)}</div><div><b>${esc(x.member.name)}</b><small>${x.units} meal units</small></div>${x.balance>=0?`<span class="pill advance">+${money(x.balance)}</span>`:`<span class="pill due">-${money(-x.balance)}</span>`}</div><div class="member-summary-grid"><div><span>Deposit</span><b>${money(x.deposit)}</b></div><div><span>Food</span><b>${money(x.food)}</b></div><div><span>Utility</span><b>${money(x.util)}</b></div><div><span>Total Bill</span><b>${money(x.total)}</b></div></div></article>`).join('');
      return `<div class="desktop-summary table-wrap"><table><thead><tr><th>Member</th><th>Meals</th><th>Deposit</th><th>Food</th><th>Utility</th><th>Total Bill</th><th>Due/Advance</th></tr></thead><tbody>${rows}</tbody></table></div><div class="mobile-summary">${cards}</div>`;
    };
  }

  function enhanceOwnSidebarAvatar(){
    if(!profile?.avatar_url)return;
    const target=document.querySelector('.sidebar-user .avatar');
    if(target&&!target.querySelector('img'))target.innerHTML=`<img src="${esc(profile.avatar_url)}" alt="${esc(profile.name||'Member')}">`;
  }

  const baseRenderPage=renderPage;
  renderPage=function(){
    if(state.page==='profile')return renderMemberProfile($('#content'));
    return baseRenderPage();
  };
  const basePageTitle=pageTitle;
  pageTitle=function(){return state.page==='profile'?'My Profile':basePageTitle();};

  const baseRender=window.render;
  window.render=function renderWithProfilePhoto(){
    const result=baseRender();
    requestAnimationFrame(enhanceOwnSidebarAvatar);
    return result;
  };

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
