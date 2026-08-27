/* Tiny dashboard copy/layout polish. Accounting and KPI calculations stay untouched. */
'use strict';
(()=>{
  if(window.__mmDashboardSummaryMicroPolishLoaded)return;
  window.__mmDashboardSummaryMicroPolishLoaded=true;

  function polishKpiLabels(root){
    const bazar=root?.querySelector?.('[data-dashboard-action="bazar"] .label');
    const fund=root?.querySelector?.('[data-dashboard-action="fund"] .label');
    if(bazar)bazar.textContent='Bazar Cost';
    if(fund)fund.textContent='Bazar Fund';
  }

  function balanceLabel(pill,index){
    if(index===0)return'Utility';
    if(index===1)return'Bazar';
    if(pill.classList.contains('is-advance'))return'Advance';
    if(pill.classList.contains('is-due'))return'Due';
    return'Settled';
  }

  function polishMemberCards(root){
    root?.querySelectorAll?.('.mm-classic-balance-group').forEach(group=>{
      [...group.querySelectorAll('.mm-classic-balance')].forEach((pill,index)=>{
        const label=pill.querySelector('small');
        if(label)label.textContent=balanceLabel(pill,index);
      });
    });
  }

  function polish(root){
    polishKpiLabels(root);
    polishMemberCards(root);
  }

  const baseDashboard=window.dashboard;
  if(typeof baseDashboard==='function'){
    window.dashboard=function dashboardWithMicroPolish(c){
      baseDashboard(c);
      polish(c);
    };
    try{dashboard=window.dashboard;}catch(_){/* window assignment is sufficient */}
  }

  const observer=new MutationObserver(records=>{
    records.forEach(record=>record.addedNodes.forEach(node=>{
      if(node.nodeType===1)polish(node);
    }));
  });
  if(document.body)observer.observe(document.body,{childList:true,subtree:true});

  if(profile&&state?.page==='dashboard'&&typeof render==='function')render();
})();
