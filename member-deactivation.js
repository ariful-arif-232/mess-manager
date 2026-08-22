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

  /* Load selected-month cutoff history alongside the existing monthly data. */
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

  /*
   * Chronological cutoff allocation:
   * - each cutoff freezes that member's currently-unlocked meal units at the
   *   cumulative bazar average through the cutoff date;
   * - already locked cost/units are removed before the next cutoff rate;
   * - the month-end residual bazar is divided only across remaining unlocked units.
   * This preserves total bazar allocation while preventing later bazar from
   * changing an inactive member's food share.
   */
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

  function addStatusIcon(card,member){
    const copy=card.querySelector('.member-identity > span');
    const name=copy?.querySelector(':scope > b');
    if(!copy||!name||copy.querySelector('.member-name-state-icon'))return;
    const line=document.createElement('span');
    line.className='member-name-state-line';
    copy.insertBefore(line,name);
    line.appendChild(name);
    const status=document.createElement('span');
    status.className=`member-name-state-icon ${member.active?'is-active':'is-inactive'}`;
    status.setAttribute('role','img');
    status.setAttribute('aria-label',member.active?'Active member':'Inactive member');
    status.title=member.active?'Active':'Inactive';
    status.textContent=member.active?'✓':'–';
    line.appendChild(status);
    card.classList.toggle('is-member-inactive',!member.active);
  }

  function deactivateConfirm(member){
    const cutoff=localToday();
    modal(`<div class="modal-title member-state-modal-title"><div><span class="eyebrow">Deactivate member</span><h2>Deactivate ${esc(member.name)}?</h2></div><button class="icon-btn" data-close aria-label="Close">×</button></div>
      <div class="member-state-confirm">
        <div class="member-state-person">${avatar(member)}<div><b>${esc(member.name)}</b><span>Food cutoff · ${esc(friendlyDate(cutoff))}</span></div></div>
        <div class="member-state-note"><span class="member-state-note-icon" aria-hidden="true">!</span><div><b>What will happen</b><ul><li>Meal will be OFF from ${esc(friendlyDate(cutoff))}.</li><li>Bazar up to this date stays in the member's food average.</li><li>From tomorrow, new bazar will not increase this member's food bill.</li><li>Existing deposit, due/advance and history stay saved.</li></ul></div></div>
        <div class="member-state-actions"><button type="button" class="btn" data-state-cancel>Cancel</button><button type="button" class="btn member-deactivate-confirm" data-state-confirm>Deactivate</button></div>
      </div>`);
    $('[data-close]').onclick=closeModal;
    $('[data-state-cancel]').onclick=closeModal;
    $('[data-state-confirm]').onclick=async event=>{
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

  function decorateMemberPage(c){
    const cards=[...c.querySelectorAll('.member-clean-card')];
    cards.forEach(card=>{
      const identity=card.querySelector('[data-view-member]');
      const member=db.members.find(row=>String(row.id)===String(identity?.dataset?.viewMember||''));
      if(!member)return;
      addStatusIcon(card,member);
      if(profile?.role!=='admin')return;

      const actions=card.querySelector('.member-admin-actions');
      if(!actions||actions.dataset.cutoffReady==='1')return;
      actions.dataset.cutoffReady='1';
      actions.classList.add('member-admin-actions-cutoff');

      const row=document.createElement('div');
      row.className='member-admin-primary-row';
      [...actions.children].forEach(child=>row.appendChild(child));
      actions.appendChild(row);

      if(String(member.id)===String(profile.id))return;
      const stateButton=document.createElement('button');
      stateButton.type='button';
      stateButton.className=`btn member-state-toggle ${member.active?'is-deactivate':'is-activate'}`;
      stateButton.textContent=member.active?'Deactivate':'Activate';
      if(member.active)stateButton.addEventListener('click',()=>deactivateConfirm(member));
      else stateButton.addEventListener('click',()=>activateMember(member,stateButton));
      actions.appendChild(stateButton);
    });
  }

  const baseMembers=window.members;
  if(typeof baseMembers==='function'){
    window.members=function membersWithDeactivation(c){
      baseMembers(c);
      decorateMemberPage(c);
    };
    try{members=window.members;}catch(_){/* normal window binding is enough */}
  }
})();
