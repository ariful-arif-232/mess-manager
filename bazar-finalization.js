/* Finalize Bazar: immutable food snapshot, settlement tracking and PIN-protected reopen. */
'use strict';
(()=>{
  if(window.__mmBazarFinalizationLoaded)return;
  window.__mmBazarFinalizationLoaded=true;

  const LAYER='mmBazarFinalizeLayer';
  const dhakaToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const monthStart=()=>`${state.month}-01`;
  const monthEnd=()=>{const [y,m]=state.month.split('-').map(Number);return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);};
  const clipFinalDay=()=>{const today=dhakaToday();return today<monthStart()?monthStart():today>monthEnd()?monthEnd():today;};
  const dateText=value=>{if(!value)return'-';const d=new Date(`${value}T00:00:00Z`);return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString('en-BD',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});};
  const shortDate=value=>{if(!value)return'-';const d=new Date(`${value}T00:00:00Z`);return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString('en-BD',{day:'numeric',month:'short',timeZone:'UTC'});};
  const n=value=>Number(value||0);
  const almostZero=value=>Math.abs(n(value))<0.005;
  const signed=value=>almostZero(value)?money(0):`${n(value)>0?'+':'-'}${money(Math.abs(n(value)))}`;
  const finalState=()=>db.bazarFinalization?.active?db.bazarFinalization:null;
  const legacyClosed=()=>!finalState()&&!!db.foodControl?.bazar_closed_from;
  const isAdmin=()=>profile?.role==='admin';

  function closeLayer(){document.getElementById(LAYER)?.remove();document.documentElement.classList.remove('mm-finalize-open');}
  function shell(title,kicker,body,actions=''){
    closeLayer();document.documentElement.classList.add('mm-finalize-open');
    document.body.insertAdjacentHTML('beforeend',`<div class="mm-finalize-layer" id="${LAYER}"><section class="mm-finalize-sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="mm-finalize-handle"></div><header class="mm-finalize-head"><div><small>${esc(kicker)}</small><h2>${esc(title)}</h2></div><button type="button" data-finalize-close aria-label="Close">×</button></header><div class="mm-finalize-body">${body}</div>${actions}</section></div>`);
    const layer=document.getElementById(LAYER);layer?.addEventListener('click',e=>{if(e.target===layer)closeLayer();});layer?.querySelector('[data-finalize-close]')?.addEventListener('click',closeLayer);return layer;
  }
  function actions(primaryLabel,primaryAttr,secondary='Cancel'){
    return `<div class="mm-finalize-actions"><button type="button" data-finalize-cancel>${esc(secondary)}</button><button type="button" class="primary" ${primaryAttr}>${esc(primaryLabel)}</button></div>`;
  }
  function bindCancel(layer){layer?.querySelector('[data-finalize-cancel]')?.addEventListener('click',closeLayer);}

  const baseLoadData=window.loadData;
  async function loadDataWithFinalization(){
    await baseLoadData();
    if(!profile?.mess_id){db.bazarFinalization=null;return;}
    try{
      const result=await client.rpc('get_bazar_settlement_summary',{p_month:monthStart()});
      db.bazarFinalization=assertResult(result)||{active:false};
    }catch(error){db.bazarFinalization={active:false};console.warn('Unable to load Bazar finalization',error);}
  }
  if(typeof baseLoadData==='function'){window.loadData=loadDataWithFinalization;try{loadData=loadDataWithFinalization;}catch(_){}}

  function statusCardPatch(c){
    const card=c?.querySelector?.('[data-mm-food-status]');if(!card)return;
    const copy=card.querySelector('.mm-food-status-copy');const oldBtn=card.querySelector('[data-mm-food-control-action]');
    if(finalState()){
      const s=finalState();card.classList.remove('mm-food-status-open','mm-food-status-scheduled');card.classList.add('mm-food-status-closed','mm-finalized-status');
      if(copy)copy.innerHTML=`<small>BAZAR FINALIZED</small><b>Finalized · ${esc(shortDate(s.final_day))}</b><span>${s.settlement_started?'Settlement in progress':'Food bill locked · Settlement ready'}</span>`;
      if(oldBtn){const btn=oldBtn.cloneNode(true);oldBtn.replaceWith(btn);btn.textContent='Settlement';btn.classList.remove('is-reopen');btn.addEventListener('click',openSettlement);}
      return;
    }
    if(legacyClosed()){
      if(copy){copy.querySelector('small')&&(copy.querySelector('small').textContent='LEGACY BAZAR CLOSE');}
      if(oldBtn){const btn=oldBtn.cloneNode(true);oldBtn.replaceWith(btn);btn.textContent='Reopen Close';btn.classList.add('is-reopen');btn.addEventListener('click',reopenLegacyClose);}
      return;
    }
    if(copy){copy.innerHTML='<small>MONTHLY BAZAR</small><b>Bazar is running</b><span>Finalize করলে Bazar, Meal ও Bazar Deposit হিসাব lock হবে।</span>';}
    if(oldBtn){const btn=oldBtn.cloneNode(true);oldBtn.replaceWith(btn);btn.textContent='Finalize Bazar';btn.classList.remove('is-reopen');btn.addEventListener('click',openFinalize);}
  }

  async function reopenLegacyClose(){
    const body=`<div class="mm-finalize-alert"><b>Existing Close Bazar আছে</b><span>Finalize Bazar ব্যবহার করতে আগে পুরনো Close state reopen করতে হবে। এতে কোনো হিসাব delete হবে না।</span></div>`;
    const layer=shell('Reopen old Close','BAZAR CONTROL',body,actions('Reopen Close','data-finalize-reopen-legacy'));
    bindCancel(layer);const btn=layer?.querySelector('[data-finalize-reopen-legacy]');btn?.addEventListener('click',async()=>{btn.disabled=true;btn.textContent='Reopening…';try{assertResult(await client.rpc('reopen_month_bazar',{p_month:monthStart()}));closeLayer();await window.loadData();window.render();notify('Old Close Bazar reopened. এখন Finalize Bazar ব্যবহার করুন।','success');}catch(e){notify(friendlyError(e));btn.disabled=false;btn.textContent='Reopen Close';}});
  }

  async function fetchPreview(finalDay){
    const [previewRes,conflictRes]=await Promise.all([
      client.rpc('preview_bazar_finalization',{p_month:monthStart(),p_final_day:finalDay}),
      client.rpc('check_bazar_finalization_conflicts',{p_month:monthStart(),p_final_day:finalDay})
    ]);
    return{preview:assertResult(previewRes),conflicts:assertResult(conflictRes)};
  }
  function previewMarkup(finalDay,data){
    if(!data)return'<div class="mm-finalize-loading">Final হিসাব check করা হচ্ছে…</div>';
    const p=data.preview||{},x=data.conflicts||{};const ok=!!p.can_finalize&&!!x.can_finalize;
    const problems=[];if(n(x.bazar_conflicts))problems.push(`${x.bazar_conflicts} Bazar entry`);if(n(x.deposit_conflicts))problems.push(`${x.deposit_conflicts} Bazar deposit`);if(n(x.meal_conflicts))problems.push(`${x.meal_conflicts} active meal row`);if(Math.abs(n(p.allocation_difference))>=.01)problems.push('food allocation mismatch');
    return `<div class="mm-finalize-date-summary"><span><small>FINAL BAZAR & MEAL DAY</small><b>${esc(dateText(finalDay))}</b></span><em>${ok?'Ready to finalize':'Needs attention'}</em></div>
      <div class="mm-finalize-stats"><div><span>Bazar Cost</span><b>${money(p.bazar_cost)}</b></div><div><span>Bazar Fund</span><b class="${n(p.bazar_fund)<0?'due':'advance'}">${signed(p.bazar_fund)}</b></div><div><span>Bazar Due</span><b class="due">${money(p.bazar_due)}</b></div><div><span>Bazar Advance</span><b class="advance">${money(p.bazar_advance)}</b></div><div><span>Meal Units</span><b>${n(p.meal_units)}</b></div><div><span>Members</span><b>${n(p.member_count)}</b></div></div>
      ${problems.length?`<div class="mm-finalize-conflict"><b>Finalize করার আগে ঠিক করুন</b><span>${esc(problems.join(' · '))}</span><small>Selected final day-এর পরের Bazar/Bazar Deposit remove বা correct করুন এবং Meal OFF করুন।</small></div>`:`<div class="mm-finalize-ready"><b>হিসাব মিলেছে</b><span>Bazar Advance − Bazar Due = Bazar Fund. Finalize-এর পর এই Food/Bazar হিসাব আর বদলাবে না।</span></div>`}`;
  }

  function openFinalize(){
    if(!isAdmin())return;if(legacyClosed())return reopenLegacyClose();
    const selected=clipFinalDay();
    const body=`<label class="mm-finalize-date"><span><small>FINAL BAZAR & MEAL DAY</small><b data-final-date-label>${esc(dateText(selected))}</b><em>এই দিন পর্যন্ত Bazar + Meal final হবে</em></span><input id="mmFinalDay" type="date" min="${esc(monthStart())}" max="${esc(selected)}" value="${esc(selected)}"></label><div data-final-preview>${previewMarkup(selected,null)}</div>`;
    const layer=shell('Finalize Bazar','FINAL MONTHLY FOOD ACCOUNT',body,actions('Continue','data-finalize-continue'));
    bindCancel(layer);const input=layer?.querySelector('#mmFinalDay');const preview=layer?.querySelector('[data-final-preview]');const next=layer?.querySelector('[data-finalize-continue]');let current=null;let serial=0;
    const refresh=async()=>{const token=++serial;const day=String(input?.value||selected);const label=layer?.querySelector('[data-final-date-label]');if(label)label.textContent=dateText(day);if(preview)preview.innerHTML=previewMarkup(day,null);if(next)next.disabled=true;try{const data=await fetchPreview(day);if(token!==serial)return;current=data;if(preview)preview.innerHTML=previewMarkup(day,data);if(next)next.disabled=!(data.preview?.can_finalize&&data.conflicts?.can_finalize);}catch(e){if(token!==serial)return;current=null;if(preview)preview.innerHTML=`<div class="mm-finalize-conflict"><b>Check failed</b><span>${esc(friendlyError(e))}</span></div>`;}};
    input?.addEventListener('change',refresh);input?.addEventListener('input',refresh);refresh();
    next?.addEventListener('click',()=>{const day=String(input?.value||'');if(!current?.preview?.can_finalize||!current?.conflicts?.can_finalize)return;openPinStage(day,current.preview);});
  }

  function openPinStage(finalDay,p){
    const body=`<div class="mm-finalize-confirm-card"><small>YOU ARE FINALIZING</small><b>${esc(dateText(finalDay))}</b><span>Bazar ${money(p.bazar_cost)} · Fund ${signed(p.bazar_fund)} · Due ${money(p.bazar_due)} · Advance ${money(p.bazar_advance)}</span></div>
      <div class="mm-finalize-lock-note"><b>Reopen PIN</b><span>একটি 4-digit PIN দিন। পরে settlement শুরু হওয়ার আগে এই PIN দিয়েই month reopen করা যাবে। PIN হারালে app থেকে reopen করা যাবে না।</span></div>
      <label class="mm-finalize-pin"><span>4-digit PIN</span><input id="mmFinalizePin" inputmode="numeric" autocomplete="new-password" maxlength="4" pattern="[0-9]*" placeholder="••••"></label>
      <label class="mm-finalize-pin"><span>Confirm PIN</span><input id="mmFinalizePin2" inputmode="numeric" autocomplete="new-password" maxlength="4" pattern="[0-9]*" placeholder="••••"></label>`;
    const layer=shell('Set Reopen PIN','FINAL CONFIRMATION',body,actions('Finalize Now','data-finalize-now','Back'));
    bindCancel(layer);layer?.querySelector('[data-finalize-cancel]')?.addEventListener('click',openFinalize,{once:true});const btn=layer?.querySelector('[data-finalize-now]');
    btn?.addEventListener('click',async()=>{const pin=String(layer.querySelector('#mmFinalizePin')?.value||'').replace(/\D/g,'').slice(0,4);const pin2=String(layer.querySelector('#mmFinalizePin2')?.value||'').replace(/\D/g,'').slice(0,4);if(!/^\d{4}$/.test(pin))return notify('4-digit Reopen PIN দিন।');if(pin!==pin2)return notify('PIN দুটো match করছে না।');btn.disabled=true;btn.textContent='Finalizing…';try{const result=assertResult(await client.rpc('finalize_month_bazar',{p_month:monthStart(),p_final_day:finalDay,p_pin:pin}));db.bazarFinalization=result;closeLayer();await window.loadData();window.render();notify(`Bazar ${dateText(finalDay)} পর্যন্ত finalized. PIN নিরাপদে রাখুন।`,'success');}catch(e){notify(friendlyError(e));btn.disabled=false;btn.textContent='Finalize Now';}});
  }

  function settlementMember(row){
    const out=n(row.outstanding_balance);const done=almostZero(out);const due=out<0;const amount=Math.abs(out);
    return `<article class="mm-settle-member ${done?'settled':due?'due':'advance'}"><div><b>${esc(row.member_name)}</b><small>Food Bill ${money(row.food_bill)} · Deposit ${money(row.food_deposit)}</small></div>${done?'<span class="mm-settle-done">✓ Settled</span>':`<button type="button" data-settle-member="${esc(row.member_id)}" data-settle-action="${due?'collect':'refund'}"><small>${due?'Collect':'Refund'}</small><b>${money(amount)}</b></button>`}</article>`;
  }
  function openSettlement(){
    const s=finalState();if(!s)return;
    const body=`<div class="mm-settle-hero ${almostZero(s.current_fund)?'settled':n(s.current_fund)<0?'due':'advance'}"><small>CURRENT BAZAR CASH</small><strong>${signed(s.current_fund)}</strong><span>${s.status==='settled'?'Bazar settlement complete':'Collect Due + Refund Advance করলে Fund 0 হবে'}</span></div>
      <div class="mm-finalize-stats compact"><div><span>Final Cost</span><b>${money(s.bazar_cost)}</b></div><div><span>Original Fund</span><b>${signed(s.original_fund)}</b></div><div><span>Due Left</span><b class="due">${money(s.outstanding_due)}</b></div><div><span>Advance Left</span><b class="advance">${money(s.outstanding_advance)}</b></div></div>
      <div class="mm-settle-title"><b>Member Settlement</b><span>${esc(dateText(s.final_day))} final snapshot</span></div><div class="mm-settle-list">${(s.members||[]).map(settlementMember).join('')||'<div class="mm-finalize-ready">No settlement members.</div>'}</div>
      ${s.settlement_started?'<div class="mm-finalize-alert muted"><b>Reopen locked</b><span>Settlement transaction শুরু হয়েছে, তাই accidental reopen বন্ধ।</span></div>':'<button type="button" class="mm-reopen-link" data-finalize-reopen>Reopen Finalized Bazar</button>'}`;
    const layer=shell('Bazar Settlement','FINALIZED FOOD ACCOUNT',body,`<div class="mm-finalize-actions one"><button type="button" class="primary" data-finalize-close-sheet>Done</button></div>`);
    layer?.querySelector('[data-finalize-close-sheet]')?.addEventListener('click',closeLayer);
    layer?.querySelectorAll('[data-settle-member]').forEach(btn=>btn.addEventListener('click',()=>settleMember(btn.dataset.settleMember,btn.dataset.settleAction,btn)));
    layer?.querySelector('[data-finalize-reopen]')?.addEventListener('click',openReopenPin);
  }
  async function settleMember(memberId,action,btn){
    const old=btn.innerHTML;btn.disabled=true;btn.innerHTML='<b>Saving…</b>';try{const result=assertResult(await client.rpc('record_bazar_settlement',{p_month:monthStart(),p_member_id:memberId,p_action:action,p_amount:null}));db.bazarFinalization=result;openSettlement();await window.loadData();patchVisibleUI();notify(action==='collect'?'Bazar Due received.':'Bazar Advance refunded.','success');}catch(e){notify(friendlyError(e));btn.disabled=false;btn.innerHTML=old;}
  }
  function openReopenPin(){
    const s=finalState();if(!s||s.settlement_started)return;
    const body=`<div class="mm-finalize-lock-note"><b>PIN required</b><span>Correct PIN দিলে final snapshot inactive হবে এবং আগের live Bazar/Meal/Bazar Deposit data ঠিক আগের অবস্থায় editable হবে।</span></div><label class="mm-finalize-pin"><span>Reopen PIN</span><input id="mmReopenPin" inputmode="numeric" maxlength="4" pattern="[0-9]*" placeholder="••••"></label>`;
    const layer=shell('Reopen Finalized Bazar','SECURE REOPEN',body,actions('Reopen','data-reopen-now','Back'));bindCancel(layer);layer?.querySelector('[data-finalize-cancel]')?.addEventListener('click',openSettlement,{once:true});const btn=layer?.querySelector('[data-reopen-now]');
    btn?.addEventListener('click',async()=>{const pin=String(layer.querySelector('#mmReopenPin')?.value||'').replace(/\D/g,'').slice(0,4);if(!/^\d{4}$/.test(pin))return notify('4-digit PIN দিন।');btn.disabled=true;btn.textContent='Checking…';try{const res=assertResult(await client.rpc('reopen_finalized_bazar',{p_month:monthStart(),p_pin:pin}));if(!res?.ok){notify(res?.message||'Reopen failed');btn.disabled=false;btn.textContent='Reopen';return;}closeLayer();await window.loadData();window.render();notify('Finalized Bazar reopened. আগের live state ফিরে এসেছে।','success');}catch(e){notify(friendlyError(e));btn.disabled=false;btn.textContent='Reopen';}});
  }

  function patchDashboardStatus(root=document){
    const s=finalState();if(!s)return;const fund=root?.querySelector?.('[data-dashboard-action="fund"],.mm-dashboard-kpi-fund');if(!fund)return;let tag=fund.querySelector('.mm-food-kpi-status');const copy=fund.querySelector('.mm-dashboard-kpi-copy')||fund;if(!tag){tag=document.createElement('small');tag.className='mm-food-kpi-status';copy.appendChild(tag);}tag.textContent=`Finalized ${shortDate(s.final_day)}${s.status==='settled'?' · Settled':''}`;
  }
  function patchVisibleUI(root=document){const content=document.querySelector('#content');if(content&&state?.page==='bazar')statusCardPatch(content);patchDashboardStatus(root);}

  const baseBazar=window.bazar;if(typeof baseBazar==='function'){window.bazar=function bazarWithFinalization(c){baseBazar(c);statusCardPatch(c);};try{bazar=window.bazar;}catch(_){}}
  const baseDashboard=window.dashboard;if(typeof baseDashboard==='function'){window.dashboard=function dashboardWithFinalizedStatus(c){baseDashboard(c);patchDashboardStatus(c);};try{dashboard=window.dashboard;}catch(_){}}
  const observer=new MutationObserver(records=>{if(!finalState())return;for(const r of records)for(const node of r.addedNodes)if(node.nodeType===1)patchDashboardStatus(node);});
  if(document.body)observer.observe(document.body,{childList:true,subtree:true});
})();
