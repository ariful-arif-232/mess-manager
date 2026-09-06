/* Late finance guard: transferred fund cards stay synced and finalized Utility stays read-only. */
'use strict';
(()=>{
  if(window.__mmFinanceAccountRuntimeLoaded)return;
  window.__mmFinanceAccountRuntimeLoaded=true;
  const n=value=>Number(value||0);
  const signed=value=>Math.abs(n(value))<0.005?money(0):`${n(value)>0?'+':'-'}${money(Math.abs(n(value)))}`;
  function patch(){
    if(String(state?.page||'')!=='dashboard'||!db?.fundTransferSummary)return;
    const root=document.getElementById('content');if(!root)return;
    const items=[
      ['Utility','[data-dashboard-action="utility-fund"],.mm-dashboard-kpi-utility-fund','utility_current_fund','utility_to_bazar','bazar_to_utility'],
      ['Bazar','[data-dashboard-action="fund"],.mm-dashboard-kpi-fund','bazar_current_fund','bazar_to_utility','utility_to_bazar']
    ];
    for(const [account,selector,valueKey,outKey,inKey] of items){
      const card=root.querySelector(selector);if(!card)continue;
      const value=card.querySelector('.value');if(value)value.textContent=signed(db.fundTransferSummary[valueKey]);
      const copy=card.querySelector('.mm-dashboard-kpi-copy')||card;
      let tag=copy.querySelector('.mm-transfer-kpi-status');if(!tag){tag=document.createElement('small');tag.className='mm-transfer-kpi-status';copy.appendChild(tag);}
      const moved=n(db.fundTransferSummary[outKey])+n(db.fundTransferSummary[inKey]);tag.textContent=moved>0.004?'After fund transfers':'Account fund';
      card.dataset.mmAccountFund=account;
    }
  }
  function fundCard(event){
    if(String(state?.page||'')!=='dashboard'||!db?.fundTransferSummary)return null;
    const card=event.target?.closest?.('[data-mm-account-fund],[data-dashboard-action="utility-fund"],[data-dashboard-action="fund"],.mm-dashboard-kpi-utility-fund,.mm-dashboard-kpi-fund');
    if(!card||!document.getElementById('content')?.contains(card))return null;
    const action=card.dataset.dashboardAction||'';
    const account=card.dataset.mmAccountFund||(action==='utility-fund'||card.classList.contains('mm-dashboard-kpi-utility-fund')?'Utility':'Bazar');
    return{card,account};
  }
  document.addEventListener('click',event=>{
    if(String(state?.page||'')==='utilities'&&db?.utilityFinalization?.active){
      const edit=event.target?.closest?.('[data-fin-add-bill],[data-fin-edit],[data-fin-delete]');
      if(edit){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();notify('Utility is finalized for this month. Reopen it with the PIN before changing bills.');return;}
    }
    const hit=fundCard(event);if(!hit||typeof window.openAccountFundDetails!=='function')return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();window.openAccountFundDetails(hit.account);
  },true);
  document.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!==' ')return;const hit=fundCard(event);if(!hit||typeof window.openAccountFundDetails!=='function')return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();window.openAccountFundDetails(hit.account);
  },true);
  let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;patch();});};
  const observer=new MutationObserver(schedule);if(document.body)observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('pageshow',schedule);document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});schedule();
})();
