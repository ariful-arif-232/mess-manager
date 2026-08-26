/* Monthly Bazar close + optional Meal stop control.
 * Close date is the first blocked date. Example: close from Aug 27 => Aug 26 is the last Bazar day.
 * Backend triggers remain the authority; this module adds status, previews and friendly UI guards.
 */
'use strict';
(()=>{
  if(window.__mmMonthlyFoodControlLoaded)return;
  window.__mmMonthlyFoodControlLoaded=true;

  const CONTROL_TABLE='monthly_food_controls';
  const CONTROL_CHANNEL='mm-monthly-food-control';
  const dhakaToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const monthStart=()=>`${state.month}-01`;
  const monthEnd=()=>{
    const [y,m]=state.month.split('-').map(Number);
    return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
  };
  const addDays=(value,days)=>{
    const d=new Date(`${value}T00:00:00Z`);
    if(Number.isNaN(d.getTime()))return value;
    d.setUTCDate(d.getUTCDate()+days);
    return d.toISOString().slice(0,10);
  };
  const friendlyDate=value=>{
    if(!value)return'-';
    const d=new Date(`${value}T00:00:00Z`);
    if(Number.isNaN(d.getTime()))return String(value);
    return d.toLocaleDateString('en-BD',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
  };
  const compactDate=value=>{
    if(!value)return'-';
    const d=new Date(`${value}T00:00:00Z`);
    if(Number.isNaN(d.getTime()))return String(value);
    return d.toLocaleDateString('en-BD',{day:'numeric',month:'short',timeZone:'UTC'});
  };
  const sum=(rows,getter=row=>row?.amount)=>rows.reduce((total,row)=>total+Number(getter(row)||0),0);
  const purposeOf=row=>typeof window.mmDepositPurposeOf==='function'?window.mmDepositPurposeOf(row):String(row?.purpose||row?.note||'Bazar');
  const control=()=>db.foodControl&&String(db.foodControl.month_start||'').slice(0,7)===state.month?db.foodControl:null;
  const closeDate=()=>control()?.bazar_closed_from||null;
  const mealStopDate=()=>control()?.meal_stop_from||null;
  const isClosed=()=>!!closeDate();
  const isMealStopped=()=>!!mealStopDate();
  const isCloseEffective=()=>!!closeDate()&&dhakaToday()>=closeDate();
  const isSelectedCurrentMonth=()=>state.month===dhakaToday().slice(0,7);
  const calcData=()=>{
    const calc=typeof calcMonth==='function'?calcMonth():[];
    const bazarTotal=sum(db.bazar||[]);
    const foodDeposit=sum(calc,row=>row.foodDeposit);
    return{calc,bazarTotal,foodDeposit,bazarFund:foodDeposit-bazarTotal};
  };

  function closeLayer(id='mmMonthlyFoodControlLayer'){
    document.getElementById(id)?.remove();
    document.documentElement.classList.remove('mm-food-control-open');
  }

  /* Load the selected month's control after the normal monthly data (and member cutoff data) is ready. */
  const baseLoadData=window.loadData;
  async function loadDataWithMonthlyFoodControl(){
    await baseLoadData();
    if(!profile?.mess_id){db.foodControl=null;return;}
    const result=await client.from(CONTROL_TABLE)
      .select('id,mess_id,month_start,bazar_closed_from,meal_stop_from,closed_at,reopened_at,updated_at')
      .eq('month_start',monthStart())
      .maybeSingle();
    db.foodControl=assertResult(result)||null;
    ensureControlRealtime();
  }
  if(typeof baseLoadData==='function'){
    window.loadData=loadDataWithMonthlyFoodControl;
    try{loadData=loadDataWithMonthlyFoodControl;}catch(_){/* window assignment is enough */}
  }

  let controlRealtime=null;
  let realtimeMessId='';
  let realtimeRefresh=null;
  function ensureControlRealtime(){
    const messId=String(profile?.mess_id||'');
    if(!client||!messId)return;
    if(controlRealtime&&realtimeMessId===messId)return;
    if(controlRealtime)client.removeChannel(controlRealtime);
    realtimeMessId=messId;
    controlRealtime=client.channel(`${CONTROL_CHANNEL}:${messId}`)
      .on('postgres_changes',{event:'*',schema:'public',table:CONTROL_TABLE,filter:`mess_id=eq.${messId}`},()=>{
        clearTimeout(realtimeRefresh);
        realtimeRefresh=setTimeout(async()=>{
          try{await window.loadData();window.render();}catch(error){console.warn('Monthly food control realtime refresh failed',error);}
        },120);
      }).subscribe();
  }
  client?.auth?.onAuthStateChange?.(event=>{
    if(event==='SIGNED_OUT'){
      if(controlRealtime)client.removeChannel(controlRealtime);
      controlRealtime=null;realtimeMessId='';db.foodControl=null;
    }
  });

  function statusTone(){
    if(!isClosed())return'open';
    return isCloseEffective()?'closed':'scheduled';
  }
  function statusTitle(){
    if(!isClosed())return'Bazar is running';
    return isCloseEffective()?`Bazar closed · ${compactDate(closeDate())}`:`Closes · ${compactDate(closeDate())}`;
  }
  function statusSub(){
    if(!isClosed())return'এই মাসের Bazar ও meal হিসাব স্বাভাবিকভাবে চলছে।';
    const last=addDays(closeDate(),-1);
    return isMealStopped()
      ?`Last Bazar ${compactDate(last)} · Meal stops ${compactDate(mealStopDate())}`
      :`Last Bazar ${compactDate(last)} · Meals continue counting`;
  }

  function controlCard(){
    const admin=profile?.role==='admin';
    return `<section class="mm-food-status mm-food-status-${statusTone()}" data-mm-food-status>
      <div class="mm-food-status-mark" aria-hidden="true"></div>
      <div class="mm-food-status-copy"><small>MONTHLY FOOD CONTROL</small><b>${esc(statusTitle())}</b><span>${esc(statusSub())}</span></div>
      ${admin?`<button type="button" class="mm-food-status-action ${isClosed()?'is-reopen':''}" data-mm-food-control-action>${isClosed()?'Reopen':'Close Bazar'}</button>`:''}
    </section>`;
  }

  function decorateBazarPage(c){
    if(!c||c.querySelector('[data-mm-food-status]'))return;
    const head=c.querySelector('.section-head');
    if(!head)return;
    head.insertAdjacentHTML('afterend',controlCard());
    c.querySelector('[data-mm-food-control-action]')?.addEventListener('click',()=>isClosed()?openReopenSheet():openCloseSheet());
  }

  function dateDefault(){
    const start=monthStart(),end=monthEnd(),today=dhakaToday();
    if(today<start)return start;
    if(today>end)return end;
    return today;
  }
  function conflictCount(date){return (db.bazar||[]).filter(row=>String(row.date)>=date&&String(row.date)<=monthEnd()).length;}

  function closeSheetShell(id,title,kicker,body,actions=''){
    closeLayer(id);
    document.documentElement.classList.add('mm-food-control-open');
    document.body.insertAdjacentHTML('beforeend',`<div class="mm-food-layer" id="${id}">
      <section class="mm-food-sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="mm-food-sheet-handle" aria-hidden="true"></div>
        <header class="mm-food-sheet-head"><div><small>${esc(kicker)}</small><h2>${esc(title)}</h2></div><button type="button" data-mm-food-close aria-label="Close">×</button></header>
        ${body}${actions}
      </section>
    </div>`);
    const layer=document.getElementById(id);
    layer?.addEventListener('click',event=>{if(event.target===layer)closeLayer(id);});
    layer?.querySelector('[data-mm-food-close]')?.addEventListener('click',()=>closeLayer(id));
    return layer;
  }

  function closePreview(date,stopMeals){
    const data=calcData();
    const last=addDays(date,-1);
    const conflicts=conflictCount(date);
    return `<div class="mm-food-preview-grid">
      <div><span>Last Bazar Day</span><b>${esc(compactDate(last))}</b></div>
      <div><span>Bazar Total</span><b>${money(data.bazarTotal)}</b></div>
      <div><span>Bazar Fund</span><b class="${data.bazarFund<0?'is-due':''}">${money(data.bazarFund)}</b></div>
      <div><span>Settlement Members</span><b>${data.calc.length}</b></div>
    </div>
    ${conflicts?`<div class="mm-food-conflict"><b>${conflicts} Bazar ${conflicts===1?'entry':'entries'} need attention</b><span>${esc(friendlyDate(date))} বা তার পরের entry আগে Edit/Delete করুন। তারপর Close করুন।</span></div>`:''}
    <div class="mm-food-effect-list">
      <div><i>1</i><span><b>${esc(compactDate(last))} পর্যন্ত Bazar</b><small>এই date পর্যন্ত Bazar bill-এ থাকবে।</small></span></div>
      <div><i>2</i><span><b>${esc(compactDate(date))} থেকে নতুন Bazar বন্ধ</b><small>Old cache/other device থেকেও এই date বা পরের date-এ Save হবে না।</small></span></div>
      <div><i>3</i><span><b>${stopMeals?'Meal count-ও একই date থেকে বন্ধ':'Meal count চলতে থাকবে'}</b><small>${stopMeals?'Existing future meal ON থাকলে Close করার সময় OFF হবে।':'Stock থাকলে meal count বাড়তে পারবে; total Bazar fixed থাকবে।'}</small></span></div>
      <div><i>4</i><span><b>Member cutoff respected</b><small>আগে Deactivate হওয়া member-এর locked food হিসাব পরিবর্তন হবে না।</small></span></div>
    </div>`;
  }

  function openCloseSheet(){
    if(profile?.role!=='admin')return;
    const selected=dateDefault();
    const body=`<div class="mm-food-date-card">
        <span class="mm-food-date-icon" aria-hidden="true"></span>
        <span><small>CLOSE BAZAR FROM</small><b data-mm-close-date-label>${esc(friendlyDate(selected))}</b><em>${esc(compactDate(addDays(selected,-1)))} হবে last Bazar day</em></span>
        <input id="mmBazarCloseDate" type="date" min="${esc(monthStart())}" max="${esc(monthEnd())}" value="${esc(selected)}" aria-label="Close Bazar from date">
      </div>
      <label class="mm-food-toggle-row">
        <span><b>Also stop meal count</b><small>Selected date থেকে সব member-এর নতুন meal ON বন্ধ হবে</small></span>
        <input id="mmStopMealsToo" type="checkbox"><i aria-hidden="true"></i>
      </label>
      <div data-mm-close-preview>${closePreview(selected,false)}</div>`;
    const actions=`<div class="mm-food-sheet-actions"><button type="button" data-mm-food-cancel>Cancel</button><button type="button" class="primary" data-mm-food-confirm>Close Bazar</button></div>`;
    const layer=closeSheetShell('mmMonthlyFoodControlLayer','Close Monthly Bazar','MONTHLY FOOD CONTROL',body,actions);
    const dateInput=layer?.querySelector('#mmBazarCloseDate');
    const mealToggle=layer?.querySelector('#mmStopMealsToo');
    const preview=layer?.querySelector('[data-mm-close-preview]');
    const confirm=layer?.querySelector('[data-mm-food-confirm]');
    const refresh=()=>{
      const date=String(dateInput?.value||selected);
      const stop=!!mealToggle?.checked;
      const label=layer?.querySelector('[data-mm-close-date-label]');
      if(label)label.textContent=friendlyDate(date);
      const em=layer?.querySelector('.mm-food-date-card em');
      if(em)em.textContent=`${compactDate(addDays(date,-1))} হবে last Bazar day`;
      if(preview)preview.innerHTML=closePreview(date,stop);
      if(confirm)confirm.disabled=conflictCount(date)>0;
    };
    dateInput?.addEventListener('input',refresh);dateInput?.addEventListener('change',refresh);mealToggle?.addEventListener('change',refresh);refresh();
    layer?.querySelector('[data-mm-food-cancel]')?.addEventListener('click',()=>closeLayer('mmMonthlyFoodControlLayer'));
    confirm?.addEventListener('click',async()=>{
      const date=String(dateInput?.value||'');
      if(!date)return notify('Bazar close date select করুন।');
      if(conflictCount(date)>0)return notify('Selected date বা তার পরের Bazar entry আগে Edit/Delete করুন।');
      const old=confirm.textContent;confirm.disabled=true;confirm.textContent='Closing…';
      try{
        const result=await client.rpc('close_month_bazar',{p_month:monthStart(),p_closed_from:date,p_stop_meals:!!mealToggle?.checked});
        assertResult(result);
        closeLayer('mmMonthlyFoodControlLayer');
        await window.loadData();window.render();
        notify(`Bazar ${friendlyDate(date)} থেকে closed.${mealToggle?.checked?' Meal count-ও stopped.':''}`,'success');
      }catch(error){notify(friendlyError(error));confirm.disabled=false;confirm.textContent=old;}
    });
  }

  function openReopenSheet(){
    if(profile?.role!=='admin'||!isClosed())return;
    const body=`<div class="mm-food-reopen-summary">
      <span class="mm-food-lock-icon" aria-hidden="true"></span>
      <div><small>CURRENT STATUS</small><b>Bazar closed from ${esc(friendlyDate(closeDate()))}</b><span>${isMealStopped()?`Meal count stopped from ${esc(friendlyDate(mealStopDate()))}`:'Meal count is still running'}</span></div>
    </div>
    <div class="mm-food-reopen-note"><b>After reopening</b><span>Bazar entries আবার save করা যাবে।${isMealStopped()?' Close করার সময় OFF হওয়া meal rows auto-ON হবে না—যে date দরকার Admin নিজে ON করবেন।':''}</span></div>`;
    const actions=`<div class="mm-food-sheet-actions"><button type="button" data-mm-food-cancel>Cancel</button><button type="button" class="primary is-reopen" data-mm-food-reopen>Reopen Bazar</button></div>`;
    const layer=closeSheetShell('mmMonthlyFoodControlLayer','Reopen Monthly Bazar','MONTHLY FOOD CONTROL',body,actions);
    layer?.querySelector('[data-mm-food-cancel]')?.addEventListener('click',()=>closeLayer('mmMonthlyFoodControlLayer'));
    const button=layer?.querySelector('[data-mm-food-reopen]');
    button?.addEventListener('click',async()=>{
      const old=button.textContent;button.disabled=true;button.textContent='Reopening…';
      try{
        const result=await client.rpc('reopen_month_bazar',{p_month:monthStart()});assertResult(result);
        closeLayer('mmMonthlyFoodControlLayer');await window.loadData();window.render();notify('Bazar reopened. Meal rows আগের OFF অবস্থাতেই রাখা হয়েছে।','success');
      }catch(error){notify(friendlyError(error));button.disabled=false;button.textContent=old;}
    });
  }

  /* Final Bazar page wrapper. */
  const baseBazar=window.bazar;
  if(typeof baseBazar==='function'){
    window.bazar=function bazarWithMonthlyControl(c){baseBazar(c);decorateBazarPage(c);};
    try{bazar=window.bazar;}catch(_){/* window assignment is sufficient */}
  }

  /* Keep the final Bazar editor inside the allowed date range. DB trigger is still authoritative. */
  const baseBazarModal=window.bazarModal;
  if(typeof baseBazarModal==='function'){
    window.bazarModal=function bazarModalWithMonthlyControl(id){
      if(isClosed()&&closeDate()===monthStart()&&!id){notify('এই মাসের শুরু থেকেই Bazar closed. আগে Reopen করুন।');return;}
      baseBazarModal(id);
      queueMicrotask(()=>{
        const form=document.getElementById('bazarForm');
        if(!form)return;
        const input=form.querySelector('[name="entry_date"]');
        if(!input||!isClosed())return;
        const lastAllowed=addDays(closeDate(),-1);
        input.max=lastAllowed;
        if(!id&&String(input.value)>=closeDate())input.value=lastAllowed;
        const anchor=form.querySelector('.bazar-v2-meta-grid,.bazar-meta-grid,.form-grid')||input.closest('.field')||form.firstElementChild;
        anchor?.insertAdjacentHTML('beforebegin',`<div class="mm-food-editor-note"><span aria-hidden="true"></span><div><b>Bazar ${isCloseEffective()?'closed':'scheduled to close'} from ${esc(friendlyDate(closeDate()))}</b><small>Only dates through ${esc(friendlyDate(lastAllowed))} can be saved.</small></div></div>`);
        form.addEventListener('submit',event=>{
          if(String(input.value)>=closeDate()){
            event.preventDefault();event.stopImmediatePropagation();notify(`${friendlyDate(closeDate())} বা তার পরের Bazar save করা যাবে না।`);
          }
        },true);
      });
    };
    try{bazarModal=window.bazarModal;}catch(_){/* window assignment is sufficient */}
  }

  function decorateMealsPage(c){
    if(!c||c.querySelector('[data-mm-meal-control-status]'))return;
    const head=c.querySelector('.section-head');
    if(head&&isClosed())head.insertAdjacentHTML('afterend',`<section class="mm-meal-control-status ${isMealStopped()?'is-stopped':'is-running'}" data-mm-meal-control-status><span aria-hidden="true"></span><div><b>${isMealStopped()?`Meal count stopped · ${compactDate(mealStopDate())}`:`Bazar ${isCloseEffective()?'closed':'closes'} · Meals continue`}</b><small>${isMealStopped()?`No meal can be enabled on/after ${friendlyDate(mealStopDate())}.`:`Bazar closes from ${friendlyDate(closeDate())}, but meal count remains active.`}</small></div></section>`);
    if(!isMealStopped())return;
    const stop=mealStopDate(),lastAllowed=addDays(stop,-1);
    c.querySelectorAll('[data-meal-date]').forEach(button=>{
      if(String(button.dataset.mealDate)<stop)return;
      button.disabled=true;button.classList.add('mm-meal-locked');button.setAttribute('aria-label',`Meal stopped from ${friendlyDate(stop)}`);
      button.innerHTML='<span aria-hidden="true">🔒</span><b>বন্ধ</b>';
    });
    const allDate=c.querySelector('#mealAllDate');
    const allButton=c.querySelector('#allEatDate');
    if(allDate){allDate.max=lastAllowed;if(String(allDate.value)>=stop)allDate.value=lastAllowed;}
    if(allButton){
      const sync=()=>{allButton.disabled=!allDate?.value||String(allDate.value)>=stop;};
      allDate?.addEventListener('change',sync);sync();
    }
  }

  const baseMeals=window.meals;
  if(typeof baseMeals==='function'){
    window.meals=function mealsWithMonthlyControl(c){baseMeals(c);decorateMealsPage(c);};
    try{meals=window.meals;}catch(_){/* window assignment is sufficient */}
  }

  function decorateDashboard(c){
    if(!c)return;
    const fund=[...c.querySelectorAll('[data-dashboard-action="fund"],.mm-dashboard-kpi-fund')][0];
    if(fund&&isClosed()&&!fund.querySelector('.mm-food-kpi-status')){
      const copy=fund.querySelector('.mm-dashboard-kpi-copy')||fund;
      copy.insertAdjacentHTML('beforeend',`<small class="mm-food-kpi-status">${isCloseEffective()?'Closed':'Closes'} ${esc(compactDate(closeDate()))}${isMealStopped()?' · Meals stop':''}</small>`);
    }
  }

  const baseDashboard=window.dashboard;
  if(typeof baseDashboard==='function'){
    window.dashboard=function dashboardWithMonthlyControl(c){baseDashboard(c);decorateDashboard(c);};
    try{dashboard=window.dashboard;}catch(_){/* window assignment is sufficient */}
  }

  /* When the fund drilldown is opened by dashboard-insights, add a compact close-status strip. */
  document.addEventListener('click',event=>{
    const trigger=event.target.closest?.('[data-dashboard-action="fund"]');
    if(!trigger||!isClosed())return;
    setTimeout(()=>{
      const sheet=document.querySelector('#mmDashboardInsightLayer .mm-dash-sheet');
      if(!sheet||sheet.querySelector('[data-mm-fund-control-status]'))return;
      const head=sheet.querySelector('.mm-dash-sheet-head');
      head?.insertAdjacentHTML('afterend',`<div class="mm-fund-control-status" data-mm-fund-control-status><span aria-hidden="true"></span><div><b>${isCloseEffective()?'Bazar closed':'Bazar scheduled'} from ${esc(friendlyDate(closeDate()))}</b><small>Last Bazar ${esc(friendlyDate(addDays(closeDate(),-1)))} · ${isMealStopped()?'Meal count stopped too':'Meal count continues'}</small></div></div>`);
    },0);
  },true);
})();
