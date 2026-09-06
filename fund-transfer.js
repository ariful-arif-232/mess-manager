/* Member-only Fund Transfer. Transfers reclassify one member's deposit between Bazar and a Utility category. */
'use strict';
(()=>{
  if(window.__mmFundTransferLoaded)return;
  window.__mmFundTransferLoaded=true;
  if(typeof client==='undefined'||!client)return;

  const LAYER='mmFundTransferLayer';
  const PURPOSES=Array.isArray(window.MM_UTILITY_TYPES)&&window.MM_UTILITY_TYPES.length
    ?window.MM_UTILITY_TYPES.map(x=>({key:x.key,label:x.label||x.key,icon:x.icon||'▦'}))
    :[
      {key:'Gas',label:'Gas',icon:'🔥'},
      {key:'Current',label:'Current',icon:'⚡'},
      {key:'WiFi',label:'WiFi',icon:'📶'},
      {key:'Bua',label:'Bua Bill',icon:'🧹'},
      {key:'Water',label:'Water',icon:'💧'},
      {key:'Other',label:'Other',icon:'▦'}
    ];
  const n=value=>Number(value||0);
  const isAdmin=()=>profile?.role==='admin';
  const monthStart=()=>`${state.month}-01`;
  const monthEnd=()=>{const [y,m]=String(state.month||'').split('-').map(Number);return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);};
  const dhakaToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const transferDate=()=>{const today=dhakaToday();if(today<monthStart())return'';return today>monthEnd()?monthEnd():today;};
  const dateText=value=>{if(!value)return'-';const d=new Date(`${value}T00:00:00Z`);return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString('en-BD',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});};
  const transfers=()=>Array.isArray(db.memberFundTransfers)?db.memberFundTransfers:[];
  let financeChannel=null,financeMess='';let realtimeTimer=null;
  let ui={memberId:'',direction:'',purpose:''};

  function closeLayer(){document.getElementById(LAYER)?.remove();document.documentElement.classList.remove('mm-transfer-open');}
  function purposeMeta(key){return PURPOSES.find(x=>x.key===key)||{key,label:key,icon:'▦'};}
  function monthRows(){const start=monthStart(),end=monthEnd();return (db.deposits||[]).filter(row=>String(row.deposit_date||row.date||'')>=start&&String(row.deposit_date||row.date||'')<=end);}
  function activeDestinationIds(){return new Set(transfers().filter(row=>!row.undone_at&&row.destination_deposit_id).map(row=>String(row.destination_deposit_id)));}
  function sourceAvailable(memberId,purpose){
    const blocked=activeDestinationIds();
    return monthRows().filter(row=>String(row.memberId||row.member_id)===String(memberId)&&String(row.purpose||'Bazar')===purpose&&!blocked.has(String(row.id))).reduce((sum,row)=>sum+n(row.amount),0);
  }
  function memberName(id){return (db.members||[]).find(row=>String(row.id)===String(id))?.name||'Member';}
  function memberAvatar(id){const member=(db.members||[]).find(row=>String(row.id)===String(id));if(member?.avatar_url)return `<img src="${esc(member.avatar_url)}" alt="${esc(member.name||'Member')}"/>`;const initials=String(member?.name||'M').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();return `<span>${esc(initials||'M')}</span>`;}
  function eligibleMembers(){
    const ids=new Set(monthRows().map(row=>String(row.memberId||row.member_id)).filter(Boolean));
    return [...ids].map(id=>(db.members||[]).find(row=>String(row.id)===id)).filter(Boolean).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
  }
  function utilityAvailable(memberId){return PURPOSES.reduce((sum,purpose)=>sum+sourceAvailable(memberId,purpose.key),0);}
  function lockedByFinalization(){return !!db.bazarFinalization?.active||!!db.utilityFinalization?.active;}

  function ensureRealtime(){
    if(!profile?.mess_id)return;
    if(financeChannel&&financeMess===profile.mess_id)return;
    if(financeChannel){try{client.removeChannel(financeChannel);}catch(_){ }financeChannel=null;}
    financeMess=profile.mess_id;
    const refresh=()=>{clearTimeout(realtimeTimer);realtimeTimer=setTimeout(async()=>{if(!session?.user||state?.busy)return;try{await window.loadData();window.render();}catch(error){console.warn('Member fund transfer realtime refresh skipped',error);}},180);};
    financeChannel=client.channel(`member-fund-transfer:${profile.mess_id}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'member_fund_transfers',filter:`mess_id=eq.${profile.mess_id}`},refresh)
      .subscribe();
  }

  const baseLoadData=window.loadData;
  async function loadDataWithMemberTransfers(){
    await baseLoadData();
    db.fundTransferSummary=null;
    if(!profile?.mess_id){db.memberFundTransfers=[];return;}
    const result=await client.from('member_fund_transfers').select('*').gte('transfer_date',monthStart()).lte('transfer_date',monthEnd()).order('created_at',{ascending:false});
    if(result.error)throw result.error;
    db.memberFundTransfers=result.data||[];
    ensureRealtime();
  }
  if(typeof baseLoadData==='function'){
    window.loadData=loadDataWithMemberTransfers;
    try{loadData=loadDataWithMemberTransfers;}catch(_){ }
  }

  function compactCard(){
    return `<button type="button" class="mm-transfer-card mm-transfer-card-compact" data-open-fund-transfer aria-label="Open Fund Transfer"><span class="mm-transfer-card-icon" aria-hidden="true">⇄</span><b>Fund Transfer</b><span>Tap to view ›</span></button>`;
  }
  function injectDepositCard(c){
    c.querySelector('[data-open-fund-transfer]')?.remove();
    const overview=c.querySelector('.mm-deposit-overview');if(!overview)return;
    overview.insertAdjacentHTML('afterend',compactCard());
    c.querySelector('[data-open-fund-transfer]')?.addEventListener('click',openSheet);
  }

  function historyRow(row){
    const undone=!!row.undone_at;const metaFrom=row.from_purpose==='Bazar'?{icon:'🛒',label:'Bazar'}:purposeMeta(row.from_purpose);const metaTo=row.to_purpose==='Bazar'?{icon:'🛒',label:'Bazar'}:purposeMeta(row.to_purpose);
    return `<article class="mm-transfer-history-row${undone?' is-undone':''}"><span class="mm-transfer-history-icon" aria-hidden="true">${metaFrom.icon}</span><div><b>${esc(memberName(row.member_id))}</b><small>${esc(metaFrom.label)} → ${esc(metaTo.label)} · ${esc(dateText(row.transfer_date))}</small></div><strong>${money(row.amount)}</strong>${undone?'<em>Undone</em>':isAdmin()?`<button type="button" data-undo-transfer="${esc(row.id)}" aria-label="Undo transfer">↶</button>`:''}</article>`;
  }

  function memberOptions(){
    const members=eligibleMembers();
    return `<option value="">Select member</option>${members.map(member=>`<option value="${esc(member.id)}" ${String(ui.memberId)===String(member.id)?'selected':''}>${esc(member.name)}</option>`).join('')}`;
  }
  function directionCards(){
    if(!ui.memberId)return'';
    const util=utilityAvailable(ui.memberId),bazar=sourceAvailable(ui.memberId,'Bazar');
    return `<div class="mm-transfer-section"><small>DIRECTION</small><div class="mm-transfer-directions"><button type="button" class="${ui.direction==='utility-bazar'?'is-selected':''}" data-member-transfer-direction="utility-bazar" ${util<=0?'disabled':''}><span>⚡</span><div><b>Utility → Bazar</b><small>Available ${money(util)}</small></div></button><button type="button" class="${ui.direction==='bazar-utility'?'is-selected':''}" data-member-transfer-direction="bazar-utility" ${bazar<=0?'disabled':''}><span>🛒</span><div><b>Bazar → Utility</b><small>Available ${money(bazar)}</small></div></button></div></div>`;
  }
  function purposeChoices(){
    if(!ui.memberId||!ui.direction)return'';
    if(ui.direction==='utility-bazar'){
      const available=PURPOSES.map(meta=>({...meta,available:sourceAvailable(ui.memberId,meta.key)})).filter(item=>item.available>0.004);
      return `<div class="mm-transfer-section"><small>UTILITY SOURCE</small><div class="mm-transfer-purpose-grid">${available.map(item=>`<button type="button" class="${ui.purpose===item.key?'is-selected':''}" data-member-transfer-purpose="${esc(item.key)}"><span>${item.icon}</span><b>${esc(item.label)}</b><small>${money(item.available)}</small></button>`).join('')||'<div class="mm-transfer-empty-inline">No Utility deposit available.</div>'}</div></div>`;
    }
    return `<div class="mm-transfer-section"><small>UTILITY DESTINATION</small><div class="mm-transfer-purpose-grid">${PURPOSES.map(item=>`<button type="button" class="${ui.purpose===item.key?'is-selected':''}" data-member-transfer-purpose="${esc(item.key)}"><span>${item.icon}</span><b>${esc(item.label)}</b></button>`).join('')}</div></div>`;
  }
  function maxAmount(){if(!ui.memberId||!ui.direction||!ui.purpose)return 0;return ui.direction==='utility-bazar'?sourceAvailable(ui.memberId,ui.purpose):sourceAvailable(ui.memberId,'Bazar');}
  function amountBox(){
    if(!ui.memberId||!ui.direction||!ui.purpose)return'';const max=maxAmount();
    return `<div class="mm-transfer-section mm-transfer-amount-section"><small>AMOUNT</small><div class="mm-transfer-money"><b>৳</b><input id="mmMemberTransferAmount" type="number" min="0.01" max="${max}" step="0.01" inputmode="decimal" placeholder="0.00"></div><span>Available ${money(max)}</span><button type="button" class="primary" data-save-member-transfer ${max<=0?'disabled':''}>Transfer</button></div>`;
  }
  function formMarkup(){
    const locked=lockedByFinalization();
    return `${locked?'<div class="mm-transfer-warning"><b>Transfer locked</b><span>Reopen finalized Bazar and Utility before changing member deposits.</span></div>':''}<label class="mm-transfer-member-select"><span>MEMBER</span><select id="mmTransferMember" ${locked?'disabled':''}>${memberOptions()}</select></label>${locked?'':directionCards()+purposeChoices()+amountBox()}`;
  }

  function bindSheet(layer){
    layer.querySelector('#mmTransferMember')?.addEventListener('change',event=>{ui={memberId:event.target.value,direction:'',purpose:''};renderForm(layer);});
    layer.querySelectorAll('[data-member-transfer-direction]').forEach(button=>button.addEventListener('click',()=>{ui.direction=button.dataset.memberTransferDirection;ui.purpose='';renderForm(layer);}));
    layer.querySelectorAll('[data-member-transfer-purpose]').forEach(button=>button.addEventListener('click',()=>{ui.purpose=button.dataset.memberTransferPurpose;renderForm(layer);}));
    layer.querySelector('[data-save-member-transfer]')?.addEventListener('click',()=>saveTransfer(layer));
  }
  function renderForm(layer){const body=layer.querySelector('[data-member-transfer-form]');if(!body)return;body.innerHTML=formMarkup();bindSheet(layer);}

  function openSheet(){
    closeLayer();document.documentElement.classList.add('mm-transfer-open');
    document.body.insertAdjacentHTML('beforeend',`<div class="mm-transfer-layer" id="${LAYER}"><section class="mm-transfer-sheet" role="dialog" aria-modal="true" aria-label="Fund Transfer"><div class="mm-transfer-handle"></div><header class="mm-transfer-sheet-head"><div><small>MEMBER DEPOSIT</small><h2>Fund Transfer</h2></div><button type="button" data-transfer-close aria-label="Close">×</button></header><div class="mm-transfer-form-body" data-member-transfer-form>${formMarkup()}</div><div class="mm-transfer-history-title"><div><b>Transfer History</b><small>${transfers().length} record${transfers().length===1?'':'s'} this month</small></div></div><div class="mm-transfer-history">${transfers().length?transfers().map(historyRow).join(''):'<div class="mm-transfer-empty"><span>⇄</span><b>No transfers yet</b><small>Member deposit transfers will appear here.</small></div>'}</div></section></div>`);
    const layer=document.getElementById(LAYER);layer?.addEventListener('click',event=>{if(event.target===layer)closeLayer();});layer?.querySelector('[data-transfer-close]')?.addEventListener('click',closeLayer);bindSheet(layer);layer?.querySelectorAll('[data-undo-transfer]').forEach(button=>button.addEventListener('click',()=>openUndoConfirm(button.dataset.undoTransfer)));
  }

  async function saveTransfer(layer){
    if(state.busy)return;const amount=n(layer.querySelector('#mmMemberTransferAmount')?.value);if(!(amount>0))return notify('Enter a valid amount.');const max=maxAmount();if(amount>max+0.004)return notify(`Only ${money(max)} is available.`);const date=transferDate();if(!date)return notify('Fund Transfer is not available for a future month.');
    const from=ui.direction==='utility-bazar'?ui.purpose:'Bazar';const to=ui.direction==='utility-bazar'?'Bazar':ui.purpose;const button=layer.querySelector('[data-save-member-transfer]');const old=button.textContent;button.disabled=true;button.textContent='Transferring…';state.busy=true;
    try{const result=await client.rpc('create_member_fund_transfer',{p_member_id:ui.memberId,p_transfer_date:date,p_from_purpose:from,p_to_purpose:to,p_amount:amount});if(result.error)throw result.error;ui={memberId:ui.memberId,direction:'',purpose:''};await window.loadData();window.render();openSheet();notify(`${money(amount)} moved for ${memberName(ui.memberId)}.`,'success');}
    catch(error){notify(friendlyError(error));button.disabled=false;button.textContent=old;}finally{state.busy=false;}
  }

  function openUndoConfirm(id){
    const row=transfers().find(item=>String(item.id)===String(id));if(!row||row.undone_at)return;const from=row.from_purpose==='Bazar'?'Bazar':purposeMeta(row.from_purpose).label;const to=row.to_purpose==='Bazar'?'Bazar':purposeMeta(row.to_purpose).label;
    closeLayer();document.documentElement.classList.add('mm-transfer-open');document.body.insertAdjacentHTML('beforeend',`<div class="mm-transfer-layer" id="${LAYER}"><section class="mm-transfer-sheet mm-transfer-confirm-sheet" role="dialog" aria-modal="true" aria-label="Undo Fund Transfer"><div class="mm-transfer-handle"></div><header class="mm-transfer-sheet-head"><div><small>CONFIRM UNDO</small><h2>Undo Fund Transfer?</h2></div><button type="button" data-transfer-close aria-label="Close">×</button></header><div class="mm-transfer-confirm"><span>↶</span><b>${money(row.amount)}</b><p>${esc(memberName(row.member_id))}: ${esc(from)} → ${esc(to)}</p><small>The destination deposit will be removed and the amount will return to the original member deposit.</small></div><div class="mm-transfer-form-actions"><button type="button" data-undo-cancel>Cancel</button><button type="button" class="primary is-danger" data-undo-confirm>Undo Transfer</button></div></section></div>`);
    const layer=document.getElementById(LAYER);layer?.querySelector('[data-transfer-close]')?.addEventListener('click',openSheet);layer?.querySelector('[data-undo-cancel]')?.addEventListener('click',openSheet);layer?.querySelector('[data-undo-confirm]')?.addEventListener('click',()=>undoTransfer(row.id,layer));
  }

  async function undoTransfer(id,layer){
    if(state.busy)return;const button=layer.querySelector('[data-undo-confirm]');const old=button.textContent;button.disabled=true;button.textContent='Undoing…';state.busy=true;
    try{const result=await client.rpc('undo_member_fund_transfer',{p_transfer_id:id});if(result.error)throw result.error;await window.loadData();window.render();openSheet();notify('Fund Transfer undone. Member deposits were restored.','success');}
    catch(error){notify(friendlyError(error));button.disabled=false;button.textContent=old;}finally{state.busy=false;}
  }

  const baseDeposits=window.deposits;
  if(typeof baseDeposits==='function'){
    window.deposits=function depositsWithMemberFundTransfer(c){baseDeposits(c);injectDepositCard(c);};
    try{deposits=window.deposits;}catch(_){ }
  }

  window.openFundTransfer=openSheet;
  window.openAccountFundDetails=null;
  client.auth.onAuthStateChange?.(event=>{if(event==='SIGNED_OUT'&&financeChannel){try{client.removeChannel(financeChannel);}catch(_){ }financeChannel=null;financeMess='';}});
})();
