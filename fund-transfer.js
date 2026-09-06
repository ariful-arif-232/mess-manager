/* Separate Bazar/Utility account transfers. Member deposits and bills stay unchanged. */
'use strict';
(()=>{
  if(window.__mmFundTransferLoaded)return;
  window.__mmFundTransferLoaded=true;
  if(typeof client==='undefined'||!client)return;

  const LAYER='mmFundTransferLayer';
  const monthStart=()=>`${state.month}-01`;
  const monthEnd=()=>{const [y,m]=String(state.month||'').split('-').map(Number);return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);};
  const dhakaToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const dateText=value=>{if(!value)return'-';const d=new Date(`${value}T00:00:00Z`);return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString('en-BD',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});};
  const n=value=>Number(value||0);
  const zero=value=>Math.abs(n(value))<0.005;
  const signed=value=>zero(value)?money(0):`${n(value)>0?'+':'-'}${money(Math.abs(n(value)))}`;
  const isAdmin=()=>profile?.role==='admin';
  const transfers=()=>Array.isArray(db.fundTransfers)?db.fundTransfers:[];
  const summary=()=>db.fundTransferSummary||{bazar_current_fund:0,utility_current_fund:0,bazar_settlement_fund:0,utility_settlement_fund:0,utility_to_bazar:0,bazar_to_utility:0,bazar_transfer_net:0,utility_transfer_net:0};
  let financeChannel=null,financeChannelMess='';let realtimeTimer=null;

  function closeLayer(){document.getElementById(LAYER)?.remove();document.documentElement.classList.remove('mm-transfer-open');}
  function accountIcon(name){return name==='Utility'?'⚡':'🛒';}
  function accountCurrent(name){const s=summary();return n(name==='Utility'?s.utility_current_fund:s.bazar_current_fund);}
  function accountBase(name){const s=summary();return n(name==='Utility'?s.utility_settlement_fund:s.bazar_settlement_fund);}
  function flowTotals(name){
    const s=summary();
    if(name==='Utility')return{incoming:n(s.bazar_to_utility),outgoing:n(s.utility_to_bazar)};
    return{incoming:n(s.utility_to_bazar),outgoing:n(s.bazar_to_utility)};
  }

  function ensureRealtime(){
    if(!profile?.mess_id)return;
    if(financeChannel&&financeChannelMess===profile.mess_id)return;
    if(financeChannel){try{client.removeChannel(financeChannel);}catch(_){ }financeChannel=null;}
    financeChannelMess=profile.mess_id;
    const refresh=()=>{
      clearTimeout(realtimeTimer);
      realtimeTimer=setTimeout(async()=>{
        if(!session?.user||state?.busy)return;
        try{await window.loadData();window.render();}catch(error){console.warn('Finance account realtime refresh skipped',error);}
      },180);
    };
    financeChannel=client.channel(`finance-account:${profile.mess_id}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'fund_transfers',filter:`mess_id=eq.${profile.mess_id}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'monthly_utility_controls',filter:`mess_id=eq.${profile.mess_id}`},refresh)
      .subscribe();
  }

  const baseLoadData=window.loadData;
  async function loadDataWithTransfers(){
    await baseLoadData();
    if(!profile?.mess_id){db.fundTransfers=[];db.fundTransferSummary=null;return;}
    const start=monthStart(),end=monthEnd();
    const [rowsRes,summaryRes]=await Promise.all([
      client.from('fund_transfers').select('*').gte('transfer_date',start).lte('transfer_date',end).order('transfer_date',{ascending:false}).order('created_at',{ascending:false}),
      client.rpc('get_fund_transfer_summary',{p_month:start})
    ]);
    if(rowsRes.error)throw rowsRes.error;
    if(summaryRes.error)throw summaryRes.error;
    db.fundTransfers=rowsRes.data||[];
    db.fundTransferSummary=summaryRes.data||null;
    ensureRealtime();
  }
  if(typeof baseLoadData==='function'){
    window.loadData=loadDataWithTransfers;
    try{loadData=loadDataWithTransfers;}catch(_){ }
  }

  function transferCountCopy(){const count=transfers().length;return `${count} transfer${count===1?'':'s'} this month`;}
  function transferCard(){
    const s=summary();
    return `<button type="button" class="mm-transfer-card" data-open-fund-transfer aria-label="Open Fund Transfer">
      <span class="mm-transfer-card-icon" aria-hidden="true">⇄</span>
      <span class="mm-transfer-card-copy"><small>ACCOUNT MOVEMENT</small><b>Fund Transfer</b><em>Move cash between Utility and Bazar without changing member balances.</em></span>
      <span class="mm-transfer-card-values"><span><small>Utility</small><b class="${n(s.utility_current_fund)<0?'is-due':'is-good'}">${signed(s.utility_current_fund)}</b></span><i aria-hidden="true">↔</i><span><small>Bazar</small><b class="${n(s.bazar_current_fund)<0?'is-due':'is-good'}">${signed(s.bazar_current_fund)}</b></span><em>${esc(transferCountCopy())} · View ›</em></span>
    </button>`;
  }

  function injectDepositCard(c){
    c.querySelector('[data-open-fund-transfer]')?.remove();
    const overview=c.querySelector('.mm-deposit-overview');
    if(!overview)return;
    overview.insertAdjacentHTML('afterend',transferCard());
    c.querySelector('[data-open-fund-transfer]')?.addEventListener('click',openSheet);
    const intro=c.querySelector('.mm-deposit-page-head p');
    if(intro)intro.textContent='Bazar and Utility deposits stay separate. Open a member card for deposit history, or use Fund Transfer for internal cash movement.';
  }

  function historyRow(row){
    const from=String(row.from_account||'');const to=String(row.to_account||'');
    return `<article class="mm-transfer-history-row">
      <span class="mm-transfer-history-icon" aria-hidden="true">${accountIcon(from)}</span>
      <div><b>${esc(from)} <i>→</i> ${esc(to)}</b><small>${esc(dateText(row.transfer_date))}${row.note?` · ${esc(row.note)}`:''}</small></div>
      <strong>${money(row.amount)}</strong>
      ${isAdmin()?`<button type="button" data-delete-transfer="${esc(row.id)}" aria-label="Delete transfer">×</button>`:''}
    </article>`;
  }

  function accountStats(){
    const s=summary();
    return `<div class="mm-transfer-account-grid">
      <div class="is-utility"><span><i>⚡</i><small>UTILITY FUND</small></span><b class="${n(s.utility_current_fund)<0?'is-due':'is-good'}">${signed(s.utility_current_fund)}</b><em>Current after transfers</em></div>
      <div class="is-bazar"><span><i>🛒</i><small>BAZAR FUND</small></span><b class="${n(s.bazar_current_fund)<0?'is-due':'is-good'}">${signed(s.bazar_current_fund)}</b><em>Current after transfers</em></div>
    </div>`;
  }

  function openSheet(){
    closeLayer();document.documentElement.classList.add('mm-transfer-open');
    const history=transfers();
    document.body.insertAdjacentHTML('beforeend',`<div class="mm-transfer-layer" id="${LAYER}"><section class="mm-transfer-sheet" role="dialog" aria-modal="true" aria-label="Fund Transfer"><div class="mm-transfer-handle"></div>
      <header class="mm-transfer-sheet-head"><div><small>SEPARATE ACCOUNT CONTROL</small><h2>Fund Transfer</h2><p>Internal transfers move cash only. Member deposits, bills, Due and Advance stay unchanged.</p></div><button type="button" data-transfer-close aria-label="Close">×</button></header>
      ${accountStats()}
      ${isAdmin()?`<div class="mm-transfer-direction-title"><b>Choose direction</b><small>Tap one option to continue</small></div><div class="mm-transfer-directions">
        <button type="button" data-transfer-direction="Utility:Bazar"><span>⚡</span><div><b>Utility → Bazar</b><small>Use Utility fund for Bazar</small></div><i>›</i></button>
        <button type="button" data-transfer-direction="Bazar:Utility"><span>🛒</span><div><b>Bazar → Utility</b><small>Return or move Bazar fund</small></div><i>›</i></button>
      </div>`:''}
      <div class="mm-transfer-history-title"><div><b>Transfer History</b><small>${esc(transferCountCopy())}</small></div></div>
      <div class="mm-transfer-history">${history.length?history.map(historyRow).join(''):'<div class="mm-transfer-empty"><span>⇄</span><b>No transfers this month</b><small>Both account ledgers are still untouched by internal movement.</small></div>'}</div>
    </section></div>`);
    const layer=document.getElementById(LAYER);
    layer?.addEventListener('click',event=>{if(event.target===layer)closeLayer();});
    layer?.querySelector('[data-transfer-close]')?.addEventListener('click',closeLayer);
    layer?.querySelectorAll('[data-transfer-direction]').forEach(button=>button.addEventListener('click',()=>{
      const [from,to]=String(button.dataset.transferDirection||'').split(':');openForm(from,to);
    }));
    layer?.querySelectorAll('[data-delete-transfer]').forEach(button=>button.addEventListener('click',()=>deleteTransfer(button.dataset.deleteTransfer,button)));
  }

  function defaultTransferDate(){
    const today=dhakaToday();
    if(today<monthStart())return'';
    return today>monthEnd()?monthEnd():today;
  }

  function openForm(from,to){
    if(!isAdmin()||!['Bazar','Utility'].includes(from)||!['Bazar','Utility'].includes(to)||from===to)return;
    const available=accountCurrent(from);const date=defaultTransferDate();
    const futureMonth=!date;
    const body=`<div class="mm-transfer-form-route"><span class="from">${accountIcon(from)}</span><div><small>FROM</small><b>${esc(from)} Fund</b><em>Available ${signed(available)}</em></div><i>→</i><span class="to">${accountIcon(to)}</span><div><small>TO</small><b>${esc(to)} Fund</b><em>Internal account movement</em></div></div>
      ${available<=0?`<div class="mm-transfer-warning"><b>No transferable balance</b><span>${esc(from)} Fund currently has ${signed(available)} available.</span></div>`:''}
      ${futureMonth?'<div class="mm-transfer-warning"><b>Future month</b><span>Fund transfers can only be recorded up to today.</span></div>':''}
      <form id="mmFundTransferForm" class="mm-transfer-form">
        <label><span>Transfer Date</span><input name="transfer_date" type="date" min="${esc(monthStart())}" max="${esc(dhakaToday()<monthEnd()?dhakaToday():monthEnd())}" value="${esc(date)}" ${futureMonth?'disabled':''} required></label>
        <label><span>Amount</span><div class="mm-transfer-money"><b>৳</b><input name="amount" type="number" min="0.01" max="${Math.max(0,available)}" step="0.01" inputmode="decimal" placeholder="0.00" ${available<=0||futureMonth?'disabled':''} required></div><small>Maximum available: ${money(Math.max(0,available))}</small></label>
        <label><span>Note <em>optional</em></span><input name="note" maxlength="120" placeholder="Example: Temporary Bazar support"></label>
      </form>`;
    closeLayer();document.documentElement.classList.add('mm-transfer-open');
    document.body.insertAdjacentHTML('beforeend',`<div class="mm-transfer-layer" id="${LAYER}"><section class="mm-transfer-sheet mm-transfer-form-sheet" role="dialog" aria-modal="true" aria-label="${esc(from)} to ${esc(to)} transfer"><div class="mm-transfer-handle"></div><header class="mm-transfer-sheet-head compact"><button type="button" class="back" data-transfer-back aria-label="Back">‹</button><div><small>NEW FUND TRANSFER</small><h2>${esc(from)} → ${esc(to)}</h2></div><button type="button" data-transfer-close aria-label="Close">×</button></header><div class="mm-transfer-form-body">${body}</div><div class="mm-transfer-form-actions"><button type="button" data-transfer-cancel>Cancel</button><button type="button" class="primary" data-transfer-save ${available<=0||futureMonth?'disabled':''}>Transfer Fund</button></div></section></div>`);
    const layer=document.getElementById(LAYER);
    layer?.addEventListener('click',event=>{if(event.target===layer)closeLayer();});
    layer?.querySelector('[data-transfer-close]')?.addEventListener('click',closeLayer);
    layer?.querySelector('[data-transfer-cancel]')?.addEventListener('click',openSheet);
    layer?.querySelector('[data-transfer-back]')?.addEventListener('click',openSheet);
    layer?.querySelector('[data-transfer-save]')?.addEventListener('click',()=>saveTransfer(from,to,layer));
  }

  async function saveTransfer(from,to,layer){
    if(state.busy)return;
    const form=layer.querySelector('#mmFundTransferForm');const fd=new FormData(form);
    const transferDate=String(fd.get('transfer_date')||'');const amount=n(fd.get('amount'));const note=String(fd.get('note')||'').trim();
    if(!transferDate)return notify('Choose a transfer date.');
    if(!(amount>0))return notify('Enter a valid transfer amount.');
    const available=accountCurrent(from);
    if(amount>available+0.004)return notify(`Only ${money(Math.max(0,available))} is available in ${from} Fund.`);
    const button=layer.querySelector('[data-transfer-save]');const old=button.textContent;button.disabled=true;button.textContent='Transferring…';state.busy=true;
    try{
      const result=await client.from('fund_transfers').insert({mess_id:profile.mess_id,transfer_date:transferDate,from_account:from,to_account:to,amount,note,created_by:session.user.id});
      if(result.error)throw result.error;
      await window.loadData();window.render();closeLayer();notify(`${money(amount)} transferred from ${from} to ${to}.`,'success');
    }catch(error){notify(friendlyError(error));button.disabled=false;button.textContent=old;}
    finally{state.busy=false;}
  }

  async function deleteTransfer(id,button){
    const row=transfers().find(item=>String(item.id)===String(id));if(!row||state.busy)return;
    const old=button.textContent;button.disabled=true;button.textContent='…';state.busy=true;
    try{
      const result=await client.from('fund_transfers').delete().eq('id',id);if(result.error)throw result.error;
      await window.loadData();window.render();openSheet();notify('Fund transfer removed and both account balances were restored.','success');
    }catch(error){notify(friendlyError(error));button.disabled=false;button.textContent=old;}
    finally{state.busy=false;}
  }

  function openAccountSheet(account){
    const s=summary();const flow=flowTotals(account);const current=accountCurrent(account);const base=accountBase(account);
    const relevant=transfers().filter(row=>row.from_account===account||row.to_account===account);
    closeLayer();document.documentElement.classList.add('mm-transfer-open');
    document.body.insertAdjacentHTML('beforeend',`<div class="mm-transfer-layer" id="${LAYER}"><section class="mm-transfer-sheet mm-transfer-account-sheet" role="dialog" aria-modal="true" aria-label="${esc(account)} Fund"><div class="mm-transfer-handle"></div><header class="mm-transfer-sheet-head"><div><small>${esc(account.toUpperCase())} ACCOUNT</small><h2>${esc(account)} Fund</h2><p>Member balances stay based on deposits and bills. Transfers only change cash held by this account.</p></div><button type="button" data-transfer-close aria-label="Close">×</button></header>
      <div class="mm-transfer-account-hero ${current<0?'is-due':'is-good'}"><span>${accountIcon(account)}</span><div><small>CURRENT FUND</small><strong>${signed(current)}</strong><em>After internal transfers</em></div></div>
      <div class="mm-transfer-breakdown"><div><span>Ledger / Settlement Fund</span><b>${signed(base)}</b></div><div class="incoming"><span>Transfers In</span><b>+${money(flow.incoming)}</b></div><div class="outgoing"><span>Transfers Out</span><b>-${money(flow.outgoing)}</b></div><div class="current"><span>Current Fund</span><b>${signed(current)}</b></div></div>
      <div class="mm-transfer-history-title"><div><b>Account Transfers</b><small>${relevant.length} record${relevant.length===1?'':'s'}</small></div><button type="button" data-member-balance>Member balances ›</button></div>
      <div class="mm-transfer-history">${relevant.length?relevant.map(historyRow).join(''):'<div class="mm-transfer-empty"><span>⇄</span><b>No internal transfers</b><small>Current Fund equals the account ledger fund.</small></div>'}</div>
    </section></div>`);
    const layer=document.getElementById(LAYER);layer?.addEventListener('click',event=>{if(event.target===layer)closeLayer();});layer?.querySelector('[data-transfer-close]')?.addEventListener('click',closeLayer);
    layer?.querySelector('[data-member-balance]')?.addEventListener('click',()=>{closeLayer();if(typeof window.openDashboardInsight==='function')window.openDashboardInsight(account==='Utility'?'utility-fund':'fund');});
    layer?.querySelectorAll('[data-delete-transfer]').forEach(button=>button.addEventListener('click',()=>deleteTransfer(button.dataset.deleteTransfer,button)));
  }

  function patchFundCard(c,account){
    const selector=account==='Utility'?'[data-dashboard-action="utility-fund"],.mm-dashboard-kpi-utility-fund':'[data-dashboard-action="fund"],.mm-dashboard-kpi-fund';
    const original=c.querySelector(selector);if(!original)return;
    const current=accountCurrent(account);const existingValue=original.querySelector('.value');if(existingValue)existingValue.textContent=signed(current);
    let status=original.querySelector('.mm-transfer-kpi-status');if(!status){status=document.createElement('small');status.className='mm-transfer-kpi-status';(original.querySelector('.mm-dashboard-kpi-copy')||original).appendChild(status);}
    const flow=flowTotals(account);status.textContent=(flow.incoming>0.004||flow.outgoing>0.004)?'After fund transfers':'Account fund';
    if(original.dataset.mmTransferPatched==='1')return;
    const clone=original.cloneNode(true);clone.dataset.mmTransferPatched='1';original.replaceWith(clone);
    const activate=()=>openAccountSheet(account);
    clone.addEventListener('click',activate);
    clone.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();activate();}});
  }

  const baseDeposits=window.deposits;
  if(typeof baseDeposits==='function'){
    window.deposits=function depositsWithFundTransfer(c){baseDeposits(c);injectDepositCard(c);};
    try{deposits=window.deposits;}catch(_){ }
  }
  const baseDashboard=window.dashboard;
  if(typeof baseDashboard==='function'){
    window.dashboard=function dashboardWithFundTransfers(c){baseDashboard(c);patchFundCard(c,'Utility');patchFundCard(c,'Bazar');};
    try{dashboard=window.dashboard;}catch(_){ }
  }

  window.openFundTransfer=openSheet;
  window.openAccountFundDetails=openAccountSheet;
  client.auth.onAuthStateChange?.(event=>{if(event==='SIGNED_OUT'&&financeChannel){try{client.removeChannel(financeChannel);}catch(_){ }financeChannel=null;financeChannelMess='';}});
})();
