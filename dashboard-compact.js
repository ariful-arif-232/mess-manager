/* Compact six-card dashboard summary for mobile and desktop. */
'use strict';
(()=>{
  if(window.__mmDashboardCompactLoaded)return;
  window.__mmDashboardCompactLoaded=true;

  const kpi=(label,value,kind,{negative=false}={})=>`<article class="kpi card mm-dashboard-kpi mm-dashboard-kpi-${kind}${negative?' is-negative':''}"><span class="kpi-icon mm-dashboard-kpi-icon mm-dashboard-icon-${kind}" aria-hidden="true"></span><div class="mm-dashboard-kpi-copy"><div class="label">${label}</div><div class="value">${money(value)}</div></div></article>`;

  window.dashboard=function compactDashboard(c){
    const calc=calcMonth();
    const bazarTotal=db.bazar.reduce((sum,row)=>sum+Number(row.amount||0),0);
    const deposits=calc.reduce((sum,row)=>sum+Number(row.deposit||0),0);
    const utilities=db.utilities.reduce((sum,row)=>sum+Number(row.amount||0),0);
    const totalExpense=bazarTotal+utilities;
    const bazarFund=deposits-totalExpense;
    const due=calc.reduce((sum,row)=>sum+Math.max(0,-Number(row.balance||0)),0);

    c.innerHTML=`<section class="kpis mm-dashboard-kpis" aria-label="Monthly mess summary">
      ${kpi('মোট খরচ',totalExpense,'expense')}
      ${kpi('Utility Bills',utilities,'utility')}
      ${kpi('মোট জমা',deposits,'deposit')}
      ${kpi('মোট বাজার',bazarTotal,'bazar')}
      ${kpi('বাজার ফান্ড',bazarFund,'fund',{negative:bazarFund<0})}
      ${kpi('মোট Due',due,'due')}
    </section><div class="section-head mm-dashboard-member-head"><div><span class="eyebrow">This month</span><h2>Members Summary</h2></div></div>${settlementTable(calc)}`;
  };
})();
