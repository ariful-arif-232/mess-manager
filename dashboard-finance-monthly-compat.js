/* Keep the monthly Bazar-close status visible and load the classic compact member summary. */
'use strict';
(()=>{
  if(window.__mmDashboardFinanceMonthlyCompatLoaded)return;
  window.__mmDashboardFinanceMonthlyCompatLoaded=true;

  const dhakaToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const compactDate=value=>{
    if(!value)return'-';
    const date=new Date(`${value}T00:00:00Z`);
    if(Number.isNaN(date.getTime()))return String(value);
    return date.toLocaleDateString('en-BD',{day:'numeric',month:'short',timeZone:'UTC'});
  };
  const currentControl=()=>db?.foodControl&&String(db.foodControl.month_start||'').slice(0,7)===state?.month?db.foodControl:null;

  function decorate(c){
    const control=currentControl();
    const closeDate=control?.bazar_closed_from||null;
    if(!c||!closeDate)return;
    const fund=c.querySelector('[data-dashboard-action="fund"],.mm-dashboard-kpi-fund');
    if(!fund||fund.querySelector('.mm-food-kpi-status'))return;
    const effective=dhakaToday()>=closeDate;
    const copy=fund.querySelector('.mm-dashboard-kpi-copy')||fund;
    copy.insertAdjacentHTML('beforeend',`<small class="mm-food-kpi-status">${effective?'Closed':'Closes'} ${esc(compactDate(closeDate))}${control?.meal_stop_from?' · Meals stop':''}</small>`);
  }

  const baseDashboard=window.dashboard;
  if(typeof baseDashboard==='function'){
    window.dashboard=function separatedDashboardWithMonthlyStatus(c){baseDashboard(c);decorate(c);};
    try{dashboard=window.dashboard;}catch(_){/* window assignment is sufficient */}
  }

  function loadMicroPolish(){
    if(!document.querySelector('link[data-mm-dashboard-summary-micro-polish]')){
      const link=document.createElement('link');
      link.rel='stylesheet';
      link.href='dashboard-summary-micro-polish.css?v=20260828-micro1';
      link.dataset.mmDashboardSummaryMicroPolish='1';
      document.head.appendChild(link);
    }
    if(window.__mmDashboardSummaryMicroPolishLoaded)return;
    if(document.querySelector('script[data-mm-dashboard-summary-micro-polish]'))return;
    const script=document.createElement('script');
    script.src='dashboard-summary-micro-polish.js?v=20260828-micro1';
    script.async=false;
    script.dataset.mmDashboardSummaryMicroPolish='1';
    script.addEventListener('error',()=>console.warn('Unable to load dashboard summary micro polish.'));
    document.head.appendChild(script);
  }

  function loadClassicSummary(){
    if(!document.getElementById('mmClassicSummaryAlignment')){
      const style=document.createElement('style');
      style.id='mmClassicSummaryAlignment';
      style.textContent='.mm-classic-summary-grid>div{justify-self:stretch!important}';
      document.head.appendChild(style);
    }
    if(!document.querySelector('link[data-mm-classic-member-summary]')){
      const link=document.createElement('link');
      link.rel='stylesheet';
      link.href='dashboard-member-summary-classic.css?v=20260828-classic1';
      link.dataset.mmClassicMemberSummary='1';
      document.head.appendChild(link);
    }
    if(window.__mmDashboardMemberSummaryClassicLoaded){
      loadMicroPolish();
      if(profile&&state?.page==='dashboard'&&typeof render==='function')render();
      return;
    }
    if(document.querySelector('script[data-mm-classic-member-summary]'))return;
    const script=document.createElement('script');
    script.src='dashboard-member-summary-classic.js?v=20260828-classic1';
    script.async=false;
    script.dataset.mmClassicMemberSummary='1';
    script.addEventListener('load',loadMicroPolish,{once:true});
    script.addEventListener('error',()=>console.warn('Unable to load classic member summary.'));
    document.head.appendChild(script);
  }

  loadClassicSummary();
})();
