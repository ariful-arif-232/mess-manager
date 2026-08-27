/* Keep the monthly Bazar-close status visible when the separated dashboard loads after other dashboard wrappers. */
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

  if(profile&&state?.page==='dashboard'&&typeof render==='function')render();
})();
