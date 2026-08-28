/* Keep Settlement member cards visually identical to the current Home Members Summary. */
'use strict';
(()=>{
  if(window.__mmSettlementHomeSummarySyncLoaded)return;
  window.__mmSettlementHomeSummarySyncLoaded=true;

  const nearZero=value=>Math.abs(Number(value||0))<0.005;
  const signedMoney=value=>{
    const amount=Number(value||0);
    if(nearZero(amount))return money(0);
    return `${amount>0?'+':'-'}${money(Math.abs(amount))}`;
  };
  const balanceState=value=>{
    const amount=Number(value||0);
    if(nearZero(amount))return{tone:'settled',status:'Settled',signed:money(0)};
    return amount>0
      ?{tone:'advance',status:'Advance',signed:signedMoney(amount)}
      :{tone:'due',status:'Due',signed:signedMoney(amount)};
  };
  const initials=name=>String(name||'M').trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'M';
  const avatar=member=>member?.avatar_url
    ?`<img class="mm-dash-avatar mm-classic-summary-avatar" src="${esc(member.avatar_url)}" alt="${esc(member.name||'Member')}"/>`
    :`<span class="mm-dash-avatar mm-dash-avatar-fallback mm-classic-summary-avatar" aria-hidden="true">${esc(initials(member?.name))}</span>`;

  function miniBalance(label,value){
    const state=balanceState(value);
    return `<span class="mm-classic-balance is-${state.tone}"><small>${esc(label)}</small><strong>${state.signed}</strong></span>`;
  }

  function homeStyleCard(row){
    const bazarBalance=Number(row.foodDeposit||0)-Number(row.food||0);
    const utilityBalance=Number(row.utilityDeposit||0)-Number(row.util||0);
    const totalBalance=bazarBalance+utilityBalance;
    const totalState=balanceState(totalBalance);
    return `<article class="member-summary-card mm-fin-member-summary mm-dash-member-summary mm-fin-separated-member-summary mm-classic-member-summary mm-settlement-home-card">
      <div class="member-summary-head mm-fin-member-head mm-classic-summary-head">
        ${avatar(row.member)}
        <div class="mm-classic-summary-identity"><b>${esc(row.member.name)}</b><small>${row.units} meal units</small></div>
        <div class="mm-classic-balance-group" aria-label="${esc(row.member.name)} account balances">
          ${miniBalance('Utility',utilityBalance)}
          ${miniBalance('Bazar',bazarBalance)}
          ${miniBalance(totalState.status,totalBalance)}
        </div>
      </div>
      <div class="member-summary-grid mm-fin-member-grid mm-dash-member-grid mm-classic-summary-grid">
        <div class="is-bill"><span>Food Bill</span><b>${money(row.food)}</b></div>
        <div class="is-bill"><span>Utility Bill</span><b>${money(row.util)}</b></div>
        <div class="is-bill is-total"><span>Total Bill</span><b>${money(row.total)}</b></div>
        <div class="is-deposit"><span>Food Deposit</span><b>${money(row.foodDeposit)}</b></div>
        <div class="is-deposit"><span>Utility Deposit</span><b>${money(row.utilityDeposit)}</b></div>
        <div class="is-deposit is-total is-${totalState.tone}"><span>Total Deposit</span><b>${money(row.deposit)}</b></div>
      </div>
    </article>`;
  }

  function decorate(c){
    if(!c||String(state?.page||'')!=='settlement')return;
    const mobile=c.querySelector('.mobile-summary');
    if(!mobile||mobile.dataset.mmSettlementHomeReady==='1')return;
    let rows=[];
    try{rows=typeof calcMonth==='function'?(calcMonth()||[]):[];}catch(error){console.warn('Unable to build Settlement member summary',error);return;}
    mobile.classList.add('mm-settlement-home-list');
    mobile.dataset.mmSettlementHomeReady='1';
    mobile.innerHTML=rows.map(homeStyleCard).join('');
    c.classList.add('mm-settlement-home-sync');
  }

  const baseSettlement=window.settlement;
  if(typeof baseSettlement==='function'){
    window.settlement=function settlementHomeSynced(c){
      const result=baseSettlement(c);
      decorate(c);
      return result;
    };
    try{settlement=window.settlement;}catch(_){/* window assignment is sufficient */}
  }

  const observer=new MutationObserver(()=>{
    if(String(state?.page||'')!=='settlement')return;
    const c=document.querySelector('#content');
    const mobile=c?.querySelector('.mobile-summary');
    if(c&&mobile&&mobile.dataset.mmSettlementHomeReady!=='1')requestAnimationFrame(()=>decorate(c));
  });
  if(document.body)observer.observe(document.body,{childList:true,subtree:true});

  if(profile&&state?.page==='settlement'&&typeof render==='function')render();
})();
