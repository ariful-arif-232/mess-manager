/* Member deactivation + food-cost cutoff accounting.
 * Deactivation keeps historical meals/deposits/utility data, disables meals from
 * the cutoff date, and excludes later-dated bazar from the member's food share.
 */
'use strict';
(()=>{
  if(window.__mmMemberDeactivationLoaded)return;
  window.__mmMemberDeactivationLoaded=true;

  const localToday=()=>{
    const d=new Date();
    const y=d.getFullYear();
    const m=String(d.getMonth()+1).padStart(2,'0');
    const day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  };
  const currentMonthStart=()=>`${localToday().slice(0,7)}-01`;
  const nextDate=value=>{
    const d=new Date(`${value}T00:00:00`);
    if(Number.isNaN(d.getTime()))return value;
    d.setDate(d.getDate()+1);
    const y=d.getFullYear();
    const m=String(d.getMonth()+1).padStart(2,'0');
    const day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  };
  const cutoffMinFor=member=>{
    const monthStart=currentMonthStart();
    const joined=String(member?.join_date||'');
    return joined&&joined>monthStart?joined:monthStart;
  };
  const unitsOf=row=>Number(row?.units||1);
  const sum=(rows,fn)=>rows.reduce((total,row)=>total+Number(fn?fn(row):row?.amount||0),0);
  const initials=name=>String(name||'M').trim().split(/\s+/).filter(Boolean).map(part=>part[0]).slice(0,2).join('').toUpperCase()||'M';
  const avatar=member=>member?.avatar_url
    ?`<img class="member-photo" src="${esc(member.avatar_url)}" alt="${esc(member.name||'Member')}"/>`
    :`<span class="member-photo fallback">${esc(initials(member?.name))}</span>`;
  const friendlyDate=value=>{
    if(!value)return'-';
    const d=new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime())?value:d.toLocaleDateString('en-BD',{day:'numeric',month:'short',year:'numeric'});
  };

  const baseLoadData=window.loadData;
  async function loadDataWithFoodCutoffs(){
    await baseLoadData();
    if(!profile?.mess_id){db.foodCutoffs=[];return;}
    const [start,end]=dateRange();
    const result=await client.from('member_food_cutoffs')
      .select('id,mess_id,member_id,cutoff_date,created_at')
      .gte('cutoff_date',start)
      .lte('cutoff_date',end)
      .order('cutoff_date',{ascending:true})
      .order('created_at',{ascending:true});
    db.foodCutoffs=assertResult(result)||[];
  }
  if(typeof baseLoadData==='function'){
    window.loadData=loadDataWithFoodCutoffs;
    try{loadData=loadDataWithFoodCutoffs;}catch(_){/* global binding may be lexical in some engines */}
  }

  function calcMonthWithFoodCutoffs(){
    const utility=typeof window.mmUtilityLedger==='function'?window.mmUtilityLedger():utilityLedger();
    const enabledMeals=(db.meals||[]).filter(row=>row.on);
    const cutoffs=[...(db.foodCutoffs||[])].sort((a,b)=>String(a.cutoff_date).localeCompare(String(b.cutoff_date))||String(a.created_at||'').localeCompare(String(b.created_at||'')));
    const lockedUnitsByMember=new Map();
    const lockedFoodByMember=new Map();
    let lockedUnitsTotal=0;
    let lockedFoodTotal=0;

    const groups=new Map();
    for(const event of cutoffs){
      const date=String(event.cutoff_date||'');
      if(!date)continue;
      if(!groups.has(date))groups.set(date,[]);
      groups.get(date).push(event);
    }

    for(const [cutoffDate,events] of groups){
      const bazarToDate=sum((db.bazar||[]).filter(row=>String(row.date)<=cutoffDate));
      const unitsToDate=sum(enabledMeals.filter(row=>String(row.date)<=cutoffDate),unitsOf);
      const poolCost=bazarToDate-lockedFoodTotal;
      const poolUnits=unitsToDate-lockedUnitsTotal;
      const poolRate=poolUnits>0?poolCost/poolUnits:0;
      const memberIds=[...new Set(events.map(event=>String(event.member_id||'')).filter(Boolean))];

      for(const memberId of memberIds){
        const cumulativeMemberUnits=sum(enabledMeals.filter(row=>String(row.memberId)===memberId&&String(row.date)<=cutoffDate),unitsOf);
        const alreadyLocked=Number(lockedUnitsByMember.get(memberId)||0);
        const unitsToLock=Math.max(0,cumulativeMemberUnits-alreadyLocked);
        const foodToLock=unitsToLock*poolRate;
        lockedUnitsByMember.set(memberId,alreadyLocked+unitsToLock);
        lockedFoodByMember.set(memberId,Number(lockedFoodByMember.get(memberId)||0)+foodToLock);
        lockedUnitsTotal+=unitsToLock;
        lockedFoodTotal+=foodToLock;
      }
    }

    const bazarTotal=sum(db.bazar||[]);
    const mealUnitsTotal=sum(enabledMeals,unitsOf);
    const residualCost=bazarTotal-lockedFoodTotal;
    const residualUnits=Math.max(0,mealUnitsTotal-lockedUnitsTotal);
    const residualRate=residualUnits>0?residualCost/residualUnits:0;
    const cutoffMemberIds=new Set(cutoffs.map(event=>String(event.member_id||'')));

    const rows=(db.members||[]).filter(member=>!member.deleted_at).map(member=>{
      const memberId=String(member.id);
      const memberUnits=sum(enabledMeals.filter(row=>String(row.memberId)===memberId),unitsOf);
      const lockedUnits=Number(lockedUnitsByMember.get(memberId)||0);
      const unlockedUnits=Math.max(0,memberUnits-lockedUnits);
      const lockedFood=Number(lockedFoodByMember.get(memberId)||0);
      const food=lockedFood+(unlockedUnits*residualRate);
      const util=Number(utility.memberTotals?.get?.(member.id)||0);
      const memberDeposits=(db.deposits||[]).filter(row=>String(row.memberId)===memberId);
      const foodDeposit=sum(memberDeposits.filter(row=>(typeof window.mmDepositPurposeOf==='function'?window.mmDepositPurposeOf(row):depositPurposeOf(row))==='Bazar'));
      const utilityDeposit=sum(memberDeposits.filter(row=>(typeof window.mmDepositPurposeOf==='function'?window.mmDepositPurposeOf(row):depositPurposeOf(row))!=='Bazar'));
      const deposit=foodDeposit+utilityDeposit;
      const total=food+util;
      const hasMonthContext=member.active||memberUnits>0||deposit>0||util>0||cutoffMemberIds.has(memberId);
      return hasMonthContext?{
        member,
        units:memberUnits,
        food,
        util,
        deposit,
        foodDeposit,
        utilityDeposit,
        total,
        balance:deposit-total,
        foodLocked:lockedFood,
        lockedMealUnits:lockedUnits,
        openMealUnits:unlockedUnits,
        foodCutoff:cutoffs.filter(event=>String(event.member_id)===memberId).at(-1)?.cutoff_date||null
      }:null;
    }).filter(Boolean);

    window.__mmFoodCutoffDebug={lockedFoodTotal,lockedUnitsTotal,residualCost,residualUnits,residualRate};
    return rows;
  }

  window.calcMonth=calcMonthWithFoodCutoffs;
  try{calcMonth=calcMonthWithFoodCutoffs;}catch(_){/* window assignment is sufficient for normal global scripts */}

  function deactivateConfirm(member){
    const todayValue=localToday();
    const minValue=cutoffMinFor(member);
    let cutoff=todayValue;

    modal(`<div class="modal-title member-state-modal-title"><div><span class="eyebrow">Deactivate member</span><h2>Deactivate ${esc(member.name)}?</h2></div><button class="icon-btn" data-close aria-label="Close">×</button></div>
      <div class="member-state-confirm">
        <div class="member-state-person">${avatar(member)}<div><b>${esc(member.name)}</b><span>Food cutoff · <span data-cutoff-person>${esc(friendlyDate(cutoff))}</span></span></div></div>
        <div class="member-state-note"><span class="member-state-note-icon" aria-hidden="true">!</span><div><b class="member-state-note-title">What will happen</b>
          <label class="member-cutoff-date-card">
            <span class="member-cutoff-calendar" aria-hidden="true"></span>
            <span class="member-cutoff-date-copy"><small>DEACTIVATE FROM</small><strong data-cutoff-label>${esc(friendlyDate(cutoff))}</strong><em>Forgot earlier? Choose the correct date.</em></span>
            <input id="memberCutoffDate" type="date" value="${esc(cutoff)}" min="${esc(minValue)}" max="${esc(todayValue)}" aria-label="Deactivate from date">
          </label>
          <ul class="member-state-points">
            <li>Meal will be OFF from <strong class="member-cutoff-inline-date" data-cutoff-meal>${esc(friendlyDate(cutoff))}</strong>.</li>
            <li>Bazar up to this date stays in the member's food average.</li>
            <li>From <strong class="member-cutoff-inline-date" data-cutoff-next>${esc(friendlyDate(nextDate(cutoff)))}</strong>, new bazar will not increase this member's food bill.</li>
            <li>Existing deposit, due/advance and history stay saved.</li>
          </ul>
        </div></div>
        <div class="member-state-actions"><button type="button" class="btn" data-state-cancel>Cancel</button><button type="button" class="btn member-deactivate-confirm" data-state-confirm>Deactivate</button></div>
      </div>`);

    const input=$('#memberCutoffDate');
    const refreshCutoffCopy=()=>{
      cutoff=String(input?.value||'');
      if(!cutoff)return;
      const label=friendlyDate(cutoff);
      const nextLabel=friendlyDate(nextDate(cutoff));
      document.querySelectorAll('[data-cutoff-person],[data-cutoff-label],[data-cutoff-meal]').forEach(node=>{node.textContent=label;});
      document.querySelectorAll('[data-cutoff-next]').forEach(node=>{node.textContent=nextLabel;});
    };
    input?.addEventListener('change',refreshCutoffCopy);
    input?.addEventListener('input',refreshCutoffCopy);

    $('[data-close]').onclick=closeModal;
    $('[data-state-cancel]').onclick=closeModal;
    $('[data-state-confirm]').onclick=async event=>{
      cutoff=String(input?.value||'');
      if(!cutoff)return notify('Deactivate date select করুন।');
      if(cutoff<minValue||cutoff>todayValue)return notify(`Date ${friendlyDate(minValue)} থেকে ${friendlyDate(todayValue)}-এর মধ্যে দিন।`);

      const button=event.currentTarget;
      const old=button.textContent;
      button.disabled=true;
      button.textContent='Deactivating…';
      try{
        const result=await client.rpc('deactivate_mess_member',{p_member_id:member.id,p_cutoff_date:cutoff});
        assertResult(result);
        closeModal();
        await loadData();
        render();
        notify(`${member.name} deactivated. Food হিসাব ${friendlyDate(cutoff)} পর্যন্ত locked.`,'success');
      }catch(error){
        notify(friendlyError(error));
        button.disabled=false;
        button.textContent=old;
      }
    };
  }

  async function activateMember(member,button){
    if(state.busy)return;
    const old=button.textContent;
    button.disabled=true;
    button.textContent='Activating…';
    state.busy=true;
    try{
      const result=await client.rpc('activate_mess_member',{p_member_id:member.id});
      assertResult(result);
      await loadData();
      render();
      notify(`${member.name} activated. Meal প্রয়োজনমতো ON করুন.`,'success');
    }catch(error){
      notify(friendlyError(error));
      button.disabled=false;
      button.textContent=old;
    }finally{state.busy=false;}
  }

  /* ---------------------------------------------------- member directory
     Members grouped as Admins / Members, each a card: status-ring avatar,
     name, joined date, role + status pills. An admin viewer gets compact
     icon actions (edit / deactivate-activate / delete); a self row never
     gets the deactivate/delete actions, only Edit plus a "Current admin"
     chip. A non-admin viewer sees the same pills read-only, plus "You" on
     their own row and a "View profile" link on everyone else's. */
  function memberFooterActions(member,isAdminViewer){
    const isSelf=String(member.id)===String(profile?.id);
    if(!isAdminViewer){
      return isSelf
        ?'<span class="member-grid-chip self">You</span>'
        :`<button type="button" class="member-grid-link" data-view-member="${member.id}">View profile →</button>`;
    }
    const editBtn=`<button type="button" class="member-grid-icon-btn primary" data-edit-member="${member.id}" title="Edit" aria-label="Edit ${esc(member.name)}"><span class="grid-ico grid-ico-edit"></span></button>`;
    if(isSelf)return `<div class="member-grid-footer-actions">${editBtn}<span class="member-grid-chip self">Current admin</span></div>`;
    return `<div class="member-grid-footer-actions">${editBtn}<button type="button" class="member-grid-icon-btn ${member.active?'warn':'good'}" data-toggle-member="${member.id}" title="${member.active?'Deactivate':'Activate'}" aria-label="${member.active?'Deactivate':'Activate'} ${esc(member.name)}"><span class="grid-ico ${member.active?'grid-ico-pause':'grid-ico-play'}"></span></button><button type="button" class="member-grid-icon-btn danger" data-delete-member="${member.id}" title="Delete" aria-label="Delete ${esc(member.name)}"><span class="grid-ico grid-ico-trash"></span></button></div>`;
  }

  function memberGridCard(member,isAdminViewer){
    const role=String(member.role||'member').toLowerCase()==='admin'?'admin':'member';
    return `<article class="member-grid-card" data-role="${role}" data-active="${!!member.active}">
      <button type="button" class="member-grid-avatar-btn" data-view-member="${member.id}" aria-label="View ${esc(member.name)}'s profile">${avatar(member)}</button>
      <b class="member-grid-name">${esc(member.name)}</b>
      <span class="member-grid-joined">Joined ${esc(friendlyDate(member.join_date))}</span>
      <div class="member-grid-pills">
        <span class="member-grid-pill role is-${role}">${role==='admin'?'Admin':'Member'}</span>
        <span class="member-grid-pill status is-${member.active?'active':'inactive'}"><i></i>${member.active?'Active':'Inactive'}</span>
      </div>
      ${memberFooterActions(member,isAdminViewer)}
    </article>`;
  }

  function memberGroupSection(title,rows,isAdminViewer){
    if(!rows.length)return'';
    return `<div class="member-grid-group-label">${esc(title)}</div><div class="member-grid">${rows.map(m=>memberGridCard(m,isAdminViewer)).join('')}</div>`;
  }

  window.members=function membersDirectoryGrid(c){
    const isAdminViewer=profile?.role==='admin';
    const visible=db.members.filter(m=>!m.deleted_at);
    const admins=visible.filter(m=>String(m.role||'').toLowerCase()==='admin');
    const regular=visible.filter(m=>String(m.role||'').toLowerCase()!=='admin');
    c.innerHTML=`<div class="section-head member-grid-head"><div><span class="eyebrow">Mess family</span><h2>All Members</h2><small class="member-grid-count">${visible.length} member${visible.length===1?'':'s'} · ${admins.length} admin${admins.length===1?'':'s'}</small></div>${isAdminViewer?'<button class="btn primary" data-add>+ Add Member</button>':''}</div>
      ${memberGroupSection('Admins',admins,isAdminViewer)}
      ${memberGroupSection('Members',regular,isAdminViewer)}`;

    // Tapping [data-view-member] opens the profile bottom sheet — handled
    // app-wide by a capturing listener in member-profile-sheet-final.js.
    if(!isAdminViewer)return;
    c.querySelector('[data-add]')?.addEventListener('click',()=>memberModal());
    c.querySelectorAll('[data-edit-member]').forEach(b=>b.onclick=()=>memberModal(b.dataset.editMember));
    c.querySelectorAll('[data-delete-member]').forEach(b=>b.onclick=()=>confirmMemberDelete(db.members.find(x=>String(x.id)===String(b.dataset.deleteMember))));
    c.querySelectorAll('[data-toggle-member]').forEach(b=>b.onclick=()=>{
      const m=db.members.find(x=>String(x.id)===String(b.dataset.toggleMember));
      if(!m)return;
      if(m.active)deactivateConfirm(m);else activateMember(m,b);
    });
  };
  try{members=window.members;}catch(_){/* normal window binding is enough */}
})();
