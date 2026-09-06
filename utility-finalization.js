/* Utility finalization: immutable monthly snapshot, settlement tracking and PIN-protected reopen. */
'use strict';
(()=>{
  if(window.__mmUtilityFinalizationLoaded)return;
  window.__mmUtilityFinalizationLoaded=true;
  if(typeof client==='undefined'||!client)return;

  const LAYER='mmUtilityFinalizeLayer';
  const dhakaToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const monthStart=()=>`${state.month}-01`;
  const monthEnd=()=>{const [y,m]=state.month.split('-').map(Number);return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);};
  const clipFinalDay=()=>{const now=dhakaToday();return now<monthStart()?monthStart():now>monthEnd()?monthEnd():now;};
  const dateText=value=>{if(!value)return'-';const d=new Date(`${value}T00:00:00Z`);return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString('en-BD',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});};
  const shortDate=value=>{if(!value)return'-';const d=new Date(`${value}T00:00:00Z`);return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString('en-BD',{day:'numeric',month:'short',timeZone:'UTC'});};
  const n=value=>Number(value||0);
  const zero=value=>Math.abs(n(value))<0.005;
  const signed=value=>zero(value)?money(0):`${n(value)>0?'+':'-'}${money(Math.abs(n(value)))}`;
  const finalState=()=>db.utilityFinalization?.active?db.utilityFinalization:null;
  const isAdmin=()=>profile?.role==='admin';

  function closeLayer(){document.getElementById(LAYER)?.remove();document.documentElement.classList.remove('mm-finalize-open');}
  function shell(title,kicker,body,footer=''){
    closeLayer();document.documentElement.classList.add('mm-finalize-open');
    document.body.insertAdjacentHTML('beforeend',`<div class="mm-finalize-layer mm-utility-final-layer" id="${LAYER}"><section class="mm-finalize-sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="mm-finalize-handle"></div><header class="mm-finalize-head"><div><small>${esc(kicker)}</small><h2>${esc(title)}</h2></div><button type="button" data-utility-final-close aria-label="Close">×</button></header><div class="mm-finalize-body">${body}</div>${footer}</section></div>`);
    const layer=document.getElementById(LAYER);
    layer?.addEventListener('click',e=>{if(e.target===layer)closeLayer();});
    layer?.querySelector('[data-utility-final-close]')?.addEventListener('click',closeLayer);
    return layer;
  }
  function actions(primaryLabel,primaryAttr,secondary='Cancel'){
    return `<div class="mm-finalize-actions"><button type="button" data-utility-final-cancel>${esc(secondary)}</button><button type="button" class="primary" ${primaryAttr}>${esc(primaryLabel)}</button></div>`;
  }
  function bindCancel(layer,handler=closeLayer){layer?.querySelector('[data-utility-final-cancel]')?.addEventListener('click',handler);}

  const baseLoadData=window.loadData;
  async function loadDataWithUtilityFinalization(){
    await baseLoadData();
    if(!profile?.mess_id){db.utilityFinalization=null;return;}
    try{
      const result=await client.rpc('get_utility_settlement_summary',{p_month:monthStart()});
      db.utilityFinalization=assertResult(result)||{active:false};
    }catch(error){
      db.utilityFinalization={active:false};
      console.warn('Unable to load Utility finalization',error);
    }
  }
  if(typeof baseLoadData==='function'){
    window.loadData=loadDataWithUtilityFinalization;
    try{loadData=loadDataWithUtilityFinalization;}catch(_){ }
  }

  function reorderUtilitySections(c){
    const sections=[...c.querySelectorAll('.mm-fin-utility-section')];
    const shared=sections.find(section=>/Shared Bill/i.test(section.querySelector('h3')?.textContent||''));
    const fixed=sections.find(section=>/Fixed Utility Bill/i.test(section.querySelector('h3')?.textContent||''));
    if(shared&&fixed&&shared.compareDocumentPosition(fixed)&Node.DOCUMENT_POSITION_PRECEDING){
      fixed.parentNode?.insertBefore(shared,fixed);
    }
    const intro=c.querySelector('.mm-fin-utility-head p');
    if(intro)intro.textContent='Shared totals set the monthly cost. Fixed allocations are applied first, then the remainder is split among selected members.';
    const sharedHint=shared?.querySelector('header > small');if(sharedHint)sharedHint.textContent='Monthly cost and shared members';
    const fixedHint=fixed?.querySelector('header > small');if(fixedHint)fixedHint.textContent='Fixed amount per selected member';
  }

  function statusCard(c){
    c.querySelector('[data-mm-utility-final-status]')?.remove();
    const head=c.querySelector('.mm-fin-utility-head');if(!head)return;
    const s=finalState();
    const card=document.createElement('section');
    card.className=`mm-utility-final-status ${s?'is-finalized':'is-open'}`;
    card.dataset.mmUtilityFinalStatus='1';
    const settlementCopy=s?.status==='settled'?'Settlement complete':s?.settlement_started?'Settlement in progress':'Settlement ready';
    card.innerHTML=s
      ?`<div class="mm-utility-final-status-icon" aria-hidden="true">✓</div><div class="mm-utility-final-status-copy"><small>UTILITY FINALIZED</small><b>Finalized · ${esc(shortDate(s.final_day))}</b><span>${esc(settlementCopy)} · Bill and Utility Deposit are locked</span></div><button type="button" data-utility-settlement>Settlement</button>`
      :`<div class="mm-utility-final-status-icon" aria-hidden="true">⚡</div><div class="mm-utility-final-status-copy"><small>MONTHLY UTILITY</small><b>Utility account is open</b><span>Finalize to lock this month’s Utility Bills and Utility Deposits.</span></div>${isAdmin()?'<button type="button" data-utility-finalize>Finalize Utility</button>':'<span class="mm-utility-final-viewer">Open</span>'}`;
    head.insertAdjacentElement('afterend',card);
    card.querySelector('[data-utility-finalize]')?.addEventListener('click',openFinalize);
    card.querySelector('[data-utility-settlement]')?.addEventListener('click',openSettlement);
    const add=c.querySelector('[data-fin-add-bill]');
    if(add&&s){add.disabled=true;add.textContent='Utility Locked';add.title='Reopen finalized Utility before adding or editing bills.';}
  }

  async function fetchPreview(finalDay){
    const [previewRes,conflictRes]=await Promise.all([
      client.rpc('preview_utility_finalization',{p_month:monthStart(),p_final_day:finalDay}),
      client.rpc('check_utility_finalization_conflicts',{p_month:monthStart(),p_final_day:finalDay})
    ]);
    return{preview:assertResult(previewRes),conflicts:assertResult(conflictRes)};
  }
  function previewMarkup(finalDay,data){
    if(!data)return'<div class="mm-finalize-loading">Checking final Utility account…</div>';
    const p=data.preview||{},x=data.conflicts||{};const ok=!!p.can_finalize&&!!x.can_finalize;
    const problems=[];
    if(n(x.bill_conflicts))problems.push(`${x.bill_conflicts} later Utility Bill${n(x.bill_conflicts)===1?'':'s'}`);
    if(n(x.deposit_conflicts))problems.push(`${x.deposit_conflicts} later Utility Deposit${n(x.deposit_conflicts)===1?'':'s'}`);
    if(Math.abs(n(p.allocation_difference))>=.01)problems.push('utility allocation mismatch');
    return `<div class="mm-finalize-date-summary"><span><small>FINAL UTILITY DAY</small><b>${esc(dateText(finalDay))}</b></span><em>${ok?'Ready to finalize':'Needs attention'}</em></div>
      <div class="mm-finalize-stats"><div><span>Utility Bill</span><b>${money(p.utility_bill)}</b></div><div><span>Utility Fund</span><b class="${n(p.utility_fund)<0?'due':'advance'}">${signed(p.utility_fund)}</b></div><div><span>Utility Due</span><b class="due">${money(p.utility_due)}</b></div><div><span>Utility Advance</span><b class="advance">${money(p.utility_advance)}</b></div><div><span>Deposits</span><b>${money(p.utility_deposit)}</b></div><div><span>Members</span><b>${n(p.member_count)}</b></div></div>
      ${problems.length?`<div class="mm-finalize-conflict"><b>Resolve before finalizing</b><span>${esc(problems.join(' · '))}</span><small>Move, edit or delete Utility Bill/Deposit entries dated after the selected final day.</small></div>`:`<div class="mm-finalize-ready"><b>Account is balanced</b><span>Utility Advance − Utility Due = Utility Fund. Finalizing creates a locked monthly snapshot.</span></div>`}`;
  }

  function openFinalize(){
    if(!isAdmin()||finalState())return;
    const selected=clipFinalDay();
    const body=`<label class="mm-finalize-date"><span><small>FINAL UTILITY DAY</small><b data-utility-final-date-label>${esc(dateText(selected))}</b><em>Utility Bills and Utility Deposits through this day will be finalized</em></span><input id="mmUtilityFinalDay" type="date" min="${esc(monthStart())}" max="${esc(selected)}" value="${esc(selected)}"></label><div data-utility-final-preview>${previewMarkup(selected,null)}</div>`;
    const layer=shell('Finalize Utility','FINAL MONTHLY UTILITY ACCOUNT',body,actions('Continue','data-utility-final-continue'));
    bindCancel(layer);
    const input=layer?.querySelector('#mmUtilityFinalDay');const preview=layer?.querySelector('[data-utility-final-preview]');const next=layer?.querySelector('[data-utility-final-continue]');let current=null;let serial=0;
    const refresh=async()=>{
      const token=++serial;const day=String(input?.value||selected);const label=layer?.querySelector('[data-utility-final-date-label]');if(label)label.textContent=dateText(day);if(preview)preview.innerHTML=previewMarkup(day,null);if(next)next.disabled=true;
      try{const data=await fetchPreview(day);if(token!==serial)return;current=data;if(preview)preview.innerHTML=previewMarkup(day,data);if(next)next.disabled=!(data.preview?.can_finalize&&data.conflicts?.can_finalize);}
      catch(error){if(token!==serial)return;current=null;if(preview)preview.innerHTML=`<div class="mm-finalize-conflict"><b>Check failed</b><span>${esc(friendlyError(error))}</span></div>`;}
    };
    input?.addEventListener('change',refresh);input?.addEventListener('input',refresh);refresh();
    next?.addEventListener('click',()=>{const day=String(input?.value||'');if(!current?.preview?.can_finalize||!current?.conflicts?.can_finalize)return;openPinStage(day,current.preview);});
  }

  function openPinStage(finalDay,p){
    const body=`<div class="mm-finalize-confirm-card"><small>YOU ARE FINALIZING</small><b>${esc(dateText(finalDay))}</b><span>Bill ${money(p.utility_bill)} · Fund ${signed(p.utility_fund)} · Due ${money(p.utility_due)} · Advance ${money(p.utility_advance)}</span></div>
      <div class="mm-finalize-lock-note"><b>Reopen PIN</b><span>Create a 4-digit PIN. Before settlement starts, this PIN can reopen the month. Keep it somewhere safe.</span></div>
      <label class="mm-finalize-pin"><span>4-digit PIN</span><input id="mmUtilityFinalizePin" inputmode="numeric" autocomplete="new-password" maxlength="4" pattern="[0-9]*" placeholder="••••"></label>
      <label class="mm-finalize-pin"><span>Confirm PIN</span><input id="mmUtilityFinalizePin2" inputmode="numeric" autocomplete="new-password" maxlength="4" pattern="[0-9]*" placeholder="••••"></label>`;
    const layer=shell('Set Reopen PIN','FINAL CONFIRMATION',body,actions('Finalize Now','data-utility-final-now','Back'));
    bindCancel(layer,openFinalize);const btn=layer?.querySelector('[data-utility-final-now]');
    btn?.addEventListener('click',async()=>{
      const pin=String(layer.querySelector('#mmUtilityFinalizePin')?.value||'').replace(/\D/g,'').slice(0,4);const pin2=String(layer.querySelector('#mmUtilityFinalizePin2')?.value||'').replace(/\D/g,'').slice(0,4);
      if(!/^\d{4}$/.test(pin))return notify('Enter a 4-digit Reopen PIN.');
      if(pin!==pin2)return notify('The two PINs do not match.');
      btn.disabled=true;btn.textContent='Finalizing…';
      try{db.utilityFinalization=assertResult(await client.rpc('finalize_month_utility',{p_month:monthStart(),p_final_day:finalDay,p_pin:pin}));closeLayer();await window.loadData();window.render();notify(`Utility finalized through ${dateText(finalDay)}. Keep the Reopen PIN safe.`,'success');}
      catch(error){notify(friendlyError(error));btn.disabled=false;btn.textContent='Finalize Now';}
    });
  }

  function settlementMember(row){
    const out=n(row.outstanding_balance);const done=zero(out);const due=out<0;const amount=Math.abs(out);
    return `<article class="mm-settle-member ${done?'settled':due?'due':'advance'}"><div><b>${esc(row.member_name)}</b><small>Utility Bill ${money(row.utility_bill)} · Deposit ${money(row.utility_deposit)}</small></div>${done?'<span class="mm-settle-done">✓ Settled</span>':`<button type="button" data-utility-settle-member="${esc(row.member_id)}" data-utility-settle-action="${due?'collect':'refund'}"><small>${due?'Collect':'Refund'}</small><b>${money(amount)}</b></button>`}</article>`;
  }

  function openSettlement(){
    const s=finalState();if(!s)return;
    const body=`<div class="mm-settle-hero ${zero(s.current_fund)?'settled':n(s.current_fund)<0?'due':'advance'}"><small>CURRENT UTILITY CASH</small><strong>${signed(s.current_fund)}</strong><span>${s.status==='settled'?'Utility settlement complete':'Collect Due and refund Advance to settle the account'}</span></div>
      <div class="mm-finalize-stats compact"><div><span>Final Bill</span><b>${money(s.utility_bill)}</b></div><div><span>Original Fund</span><b>${signed(s.original_fund)}</b></div><div><span>Due Left</span><b class="due">${money(s.outstanding_due)}</b></div><div><span>Advance Left</span><b class="advance">${money(s.outstanding_advance)}</b></div></div>
      <div class="mm-settle-title"><b>Member Settlement</b><span>${esc(dateText(s.final_day))} final snapshot</span></div><div class="mm-settle-list">${(s.members||[]).map(settlementMember).join('')||'<div class="mm-finalize-ready">No settlement members.</div>'}</div>
      ${isAdmin()?(s.settlement_started?'<button type="button" class="mm-reopen-link is-danger" data-utility-undo-reopen>Undo Settlement & Reopen</button>':'<button type="button" class="mm-reopen-link" data-utility-reopen>Reopen Finalized Utility</button>'):''}`;
    const layer=shell('Utility Settlement','FINALIZED UTILITY ACCOUNT',body,'<div class="mm-finalize-actions one"><button type="button" class="primary" data-utility-final-done>Done</button></div>');
    layer?.querySelector('[data-utility-final-done]')?.addEventListener('click',closeLayer);
    layer?.querySelectorAll('[data-utility-settle-member]').forEach(btn=>btn.addEventListener('click',()=>settleMember(btn.dataset.utilitySettleMember,btn.dataset.utilitySettleAction,btn)));
    layer?.querySelector('[data-utility-reopen]')?.addEventListener('click',()=>openReopenPin(false));
    layer?.querySelector('[data-utility-undo-reopen]')?.addEventListener('click',()=>openReopenPin(true));
  }

  async function settleMember(memberId,action,btn){
    const old=btn.innerHTML;btn.disabled=true;btn.innerHTML='<b>Saving…</b>';
    try{db.utilityFinalization=assertResult(await client.rpc('record_utility_settlement',{p_month:monthStart(),p_member_id:memberId,p_action:action,p_amount:null}));await window.loadData();openSettlement();notify(action==='collect'?'Utility Due received.':'Utility Advance refunded.','success');}
    catch(error){notify(friendlyError(error));btn.disabled=false;btn.innerHTML=old;}
  }

  function openReopenPin(withUndo){
    const s=finalState();if(!s)return;
    const title=withUndo?'Undo Settlement & Reopen':'Reopen Finalized Utility';
    const body=`<div class="mm-finalize-lock-note ${withUndo?'is-warning':''}"><b>${withUndo?'Recorded settlement will be voided':'PIN required'}</b><span>${withUndo?'All recorded Utility settlement transactions for this finalization will be marked void, then the live Utility account becomes editable again.':'The final snapshot becomes inactive and the previous Utility Bills and Utility Deposits become editable again.'}</span></div><label class="mm-finalize-pin"><span>Reopen PIN</span><input id="mmUtilityReopenPin" inputmode="numeric" maxlength="4" pattern="[0-9]*" placeholder="••••"></label>`;
    const layer=shell(title,'SECURE REOPEN',body,actions(withUndo?'Undo & Reopen':'Reopen',withUndo?'data-utility-undo-now':'data-utility-reopen-now','Back'));
    bindCancel(layer,openSettlement);const btn=layer?.querySelector(withUndo?'[data-utility-undo-now]':'[data-utility-reopen-now]');
    btn?.addEventListener('click',async()=>{
      const pin=String(layer.querySelector('#mmUtilityReopenPin')?.value||'').replace(/\D/g,'').slice(0,4);if(!/^\d{4}$/.test(pin))return notify('Enter the 4-digit Reopen PIN.');
      btn.disabled=true;btn.textContent='Checking…';
      try{const rpc=withUndo?'undo_utility_settlement_and_reopen':'reopen_finalized_utility';const result=assertResult(await client.rpc(rpc,{p_month:monthStart(),p_pin:pin}));if(!result?.ok){notify(result?.message||'Unable to reopen Utility.');btn.disabled=false;btn.textContent=withUndo?'Undo & Reopen':'Reopen';return;}closeLayer();await window.loadData();window.render();notify(withUndo?'Utility settlement was undone and the month was reopened.':'Finalized Utility was reopened.','success');}
      catch(error){notify(friendlyError(error));btn.disabled=false;btn.textContent=withUndo?'Undo & Reopen':'Reopen';}
    });
  }

  function patchDashboard(root=document){
    const s=finalState();if(!s)return;
    const card=root?.querySelector?.('[data-dashboard-action="utility-fund"],.mm-dashboard-kpi-utility-fund');if(!card)return;
    let tag=card.querySelector('.mm-utility-kpi-status');const copy=card.querySelector('.mm-dashboard-kpi-copy')||card;
    if(!tag){tag=document.createElement('small');tag.className='mm-utility-kpi-status';copy.appendChild(tag);}
    tag.textContent=`Finalized ${shortDate(s.final_day)}${s.status==='settled'?' · Settled':''}`;
  }

  const baseUtilities=window.utilities;
  if(typeof baseUtilities==='function'){
    window.utilities=function utilitiesWithFinalization(c){baseUtilities(c);reorderUtilitySections(c);statusCard(c);};
    try{utilities=window.utilities;}catch(_){ }
  }
  const baseDashboard=window.dashboard;
  if(typeof baseDashboard==='function'){
    window.dashboard=function dashboardWithUtilityFinalization(c){baseDashboard(c);patchDashboard(c);};
    try{dashboard=window.dashboard;}catch(_){ }
  }
  window.openUtilityFinalization=openFinalize;
  window.openUtilitySettlement=openSettlement;

  const observer=new MutationObserver(records=>{if(!finalState())return;for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)patchDashboard(node);});
  if(document.body)observer.observe(document.body,{childList:true,subtree:true});
})();
