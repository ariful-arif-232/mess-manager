/* Final dashboard insight layer: keep the existing six KPI cards, add drill-down sheets. */
'use strict';
(()=>{
  if(window.__mmDashboardInsightsLoaded)return;
  window.__mmDashboardInsightsLoaded=true;

  const TYPES=Array.isArray(window.MM_UTILITY_TYPES)&&window.MM_UTILITY_TYPES.length
    ?window.MM_UTILITY_TYPES
    :[
      {key:'Gas',label:'Gas',icon:'🔥'},
      {key:'Current',label:'Current',icon:'⚡'},
      {key:'WiFi',label:'WiFi',icon:'📶'},
      {key:'Bua',label:'Bua Bill',icon:'🧹'},
      {key:'Water',label:'Water',icon:'💧'},
      {key:'Other',label:'Other',icon:'▦'}
    ];
  const typeMeta=key=>TYPES.find(x=>x.key===key)||{key,label:key,icon:'▦'};
  const memberById=id=>db.members.find(member=>member.id===id)||null;
  const sum=(rows,getter=row=>row?.amount)=>rows.reduce((total,row)=>total+Number(getter(row)||0),0);
  const purposeOf=row=>typeof window.mmDepositPurposeOf==='function'?window.mmDepositPurposeOf(row):String(row?.purpose||row?.note||'Bazar');
  const initials=name=>String(name||'M').trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'M';
  const avatar=member=>member?.avatar_url
    ?`<img class="mm-dash-avatar" src="${esc(member.avatar_url)}" alt="${esc(member.name||'Member')}"/>`
    :`<span class="mm-dash-avatar mm-dash-avatar-fallback" aria-hidden="true">${esc(initials(member?.name))}</span>`;
  const closeSheet=()=>document.getElementById('mmDashboardInsightLayer')?.remove();

  function depositsFor(memberId,purpose){
    return db.deposits
      .filter(row=>row.memberId===memberId&&purposeOf(row)===purpose)
      .reduce((total,row)=>total+Number(row.amount||0),0);
  }

  function dashboardData(){
    const calc=calcMonth();
    const bazarBill=sum(db.bazar);
    const utilityLedger=typeof window.mmUtilityLedger==='function'
      ?window.mmUtilityLedger()
      :{categories:[],totalActual:sum(db.utilities)};
    const utilityBill=Number(utilityLedger.totalActual||0);
    const foodDeposit=sum(calc,row=>row.foodDeposit);
    const utilityDeposit=sum(calc,row=>row.utilityDeposit);
    const totalDeposit=foodDeposit+utilityDeposit;
    const totalBill=bazarBill+utilityBill;
    const bazarFund=foodDeposit-bazarBill;

    const memberBreakdowns=calc.map(row=>{
      const categories=[{
        key:'Bazar',label:'Bazar',icon:'🛒',bill:Number(row.food||0),deposit:Number(row.foodDeposit||0)
      }];
      TYPES.forEach(meta=>{
        const category=utilityLedger.categories?.find(item=>item.key===meta.key);
        const bill=Number(category?.memberCharges?.get?.(row.member.id)||0);
        const deposit=depositsFor(row.member.id,meta.key);
        if(bill>0||deposit>0)categories.push({key:meta.key,label:meta.label,icon:meta.icon,bill,deposit});
      });
      categories.forEach(item=>{
        item.balance=item.deposit-item.bill;
        item.due=Math.max(0,item.bill-item.deposit);
        item.advance=Math.max(0,item.deposit-item.bill);
      });
      return{
        row,
        member:row.member,
        categories,
        bazarBalance:Number(row.foodDeposit||0)-Number(row.food||0),
        totalDue:sum(categories,item=>item.due)
      };
    });
    const due=sum(memberBreakdowns,item=>item.totalDue);
    return{calc,bazarBill,utilityLedger,utilityBill,foodDeposit,utilityDeposit,totalDeposit,totalBill,bazarFund,memberBreakdowns,due};
  }

  function kpi(label,value,kind,action,{negative=false}={}){
    return `<article class="kpi card mm-dashboard-kpi mm-dashboard-kpi-${kind}${negative?' is-negative':''}" role="button" tabindex="0" data-dashboard-action="${esc(action)}" aria-label="${esc(label)} details">
      <span class="kpi-icon mm-dashboard-kpi-icon mm-dashboard-icon-${kind}" aria-hidden="true"></span>
      <div class="mm-dashboard-kpi-copy"><div class="label">${esc(label)}</div><div class="value">${money(value)}</div></div>
    </article>`;
  }

  function sheet({kind='deposit',kicker,title,body,back=false}){
    closeSheet();
    document.body.insertAdjacentHTML('beforeend',`<div class="mm-dash-layer" id="mmDashboardInsightLayer">
      <section class="mm-dash-sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="mm-dash-handle" aria-hidden="true"></div>
        <header class="mm-dash-sheet-head">
          <div class="mm-dash-title-wrap">
            ${back?'<button type="button" class="mm-dash-back" data-dash-back aria-label="Back">‹</button>':''}
            <span class="mm-dashboard-kpi-icon mm-dashboard-icon-${kind}" aria-hidden="true"></span>
            <div><small>${esc(kicker)}</small><h3>${esc(title)}</h3></div>
          </div>
          <button type="button" class="mm-dash-close" data-dash-close aria-label="Close">×</button>
        </header>
        ${body}
      </section>
    </div>`);
    const layer=document.getElementById('mmDashboardInsightLayer');
    layer?.addEventListener('click',event=>{if(event.target===layer)closeSheet();});
    layer?.querySelector('[data-dash-close]')?.addEventListener('click',closeSheet);
    return layer;
  }

  function statGrid(items){
    return `<div class="mm-dash-stats">${items.map(item=>`<div><span>${esc(item.label)}</span><strong class="${item.tone||''}">${money(item.value)}</strong></div>`).join('')}</div>`;
  }

  function openExpense(data){
    sheet({kind:'expense',kicker:'Monthly expense',title:'মোট খরচ',body:`${statGrid([
      {label:'মোট বাজার',value:data.bazarBill},
      {label:'Utility Bills',value:data.utilityBill}
    ])}<div class="mm-dash-total-line"><span>মোট খরচ</span><strong>${money(data.totalBill)}</strong></div>`});
  }

  function openUtility(data){
    const categories=(data.utilityLedger.categories||[]).filter(category=>Number(category.total||0)>0.001);
    const body=categories.length?categories.map(category=>{
      const meta=typeMeta(category.key);
      return `<div class="mm-dash-detail-row"><span class="mm-dash-type-icon" aria-hidden="true">${meta.icon}</span><div><b>${esc(meta.label)}</b><small>Monthly total bill</small></div><strong>${money(category.total)}</strong></div>`;
    }).join(''):'<div class="mm-dash-empty">এই মাসে কোনো Utility Bill নেই।</div>';
    sheet({kind:'utility',kicker:'Utility breakdown',title:'Utility Bills',body:`<div class="mm-dash-list">${body}</div><div class="mm-dash-total-line"><span>Total Utility Bill</span><strong>${money(data.utilityBill)}</strong></div>`});
  }

  function openDeposit(data){
    sheet({kind:'deposit',kicker:'Deposit breakdown',title:'মোট জমা',body:`${statGrid([
      {label:'Bazar Deposit',value:data.foodDeposit},
      {label:'Utility Deposit',value:data.utilityDeposit}
    ])}<div class="mm-dash-total-line"><span>Total Deposit</span><strong>${money(data.totalDeposit)}</strong></div>`});
  }

  function fundRow(item){
    const member=item.member;
    const balance=item.bazarBalance;
    const due=balance<0;
    return `<div class="mm-dash-member-row">${avatar(member)}<div class="mm-dash-member-copy"><b>${esc(member?.name||'Member')}</b><small>Bazar deposit ${money(item.row.foodDeposit)} · Bill ${money(item.row.food)}</small></div><span class="mm-dash-status ${due?'due':'advance'}"><small>${due?'Due':'Advance'}</small><strong>${due?'-':'+'}${money(Math.abs(balance))}</strong></span></div>`;
  }

  function openFund(data){
    const rows=data.memberBreakdowns.map(fundRow).join('');
    sheet({kind:'fund',kicker:'Member bazar balance',title:'বাজার ফান্ড',body:`<div class="mm-dash-list">${rows||'<div class="mm-dash-empty">No member balance.</div>'}</div><div class="mm-dash-total-line ${data.bazarFund<0?'is-due':''}"><span>Mess Bazar Fund</span><strong>${money(data.bazarFund)}</strong></div>`});
  }

  function dueMemberRow(item){
    return `<button type="button" class="mm-dash-member-row mm-dash-due-member" data-dash-due-member="${esc(item.member.id)}">${avatar(item.member)}<div class="mm-dash-member-copy"><b>${esc(item.member.name)}</b><small>Tap to see where due</small></div><span class="mm-dash-status due"><small>Total Due</small><strong>${money(item.totalDue)}</strong></span><i aria-hidden="true">›</i></button>`;
  }

  function openDue(data){
    const dueMembers=data.memberBreakdowns.filter(item=>item.totalDue>0.001);
    const layer=sheet({kind:'due',kicker:'Member dues',title:'মোট Due',body:`<div class="mm-dash-list">${dueMembers.length?dueMembers.map(dueMemberRow).join(''):'<div class="mm-dash-empty">এই মাসে কোনো member-এর Due নেই।</div>'}</div><div class="mm-dash-total-line is-due"><span>Total Due</span><strong>${money(data.due)}</strong></div>`});
    layer?.querySelectorAll('[data-dash-due-member]').forEach(button=>button.addEventListener('click',()=>openDueMember(data,button.dataset.dashDueMember)));
  }

  function openDueMember(data,memberId){
    const item=data.memberBreakdowns.find(row=>row.member.id===memberId);
    if(!item)return;
    const dueCategories=item.categories.filter(category=>category.due>0.001);
    const body=dueCategories.length?dueCategories.map(category=>`<div class="mm-dash-detail-row mm-dash-due-category"><span class="mm-dash-type-icon" aria-hidden="true">${category.icon}</span><div><b>${esc(category.label)}</b><small>Bill ${money(category.bill)} · Deposit ${money(category.deposit)}</small></div><strong>${money(category.due)}</strong></div>`).join(''):'<div class="mm-dash-empty">No category due.</div>';
    const layer=sheet({kind:'due',kicker:'Due breakdown',title:item.member.name,back:true,body:`<div class="mm-dash-list">${body}</div><div class="mm-dash-total-line is-due"><span>Total Due</span><strong>${money(item.totalDue)}</strong></div>`});
    layer?.querySelector('[data-dash-back]')?.addEventListener('click',()=>openDue(data));
  }

  function handleAction(action,data){
    if(action==='bazar'){
      closeSheet();
      if(typeof go==='function')go('bazar');
      else{state.page='bazar';render();}
      return;
    }
    if(action==='expense')return openExpense(data);
    if(action==='utility')return openUtility(data);
    if(action==='deposit')return openDeposit(data);
    if(action==='fund')return openFund(data);
    if(action==='due')return openDue(data);
  }

  function settlementTableInsights(calc){
    const desktop=calc.map(x=>`<tr>
      <td><b>${esc(x.member.name)}</b></td><td>${x.units}</td>
      <td>${money(x.food)}</td><td>${money(x.util)}</td><td>${money(x.deposit)}</td>
      <td>${money(x.foodDeposit)}</td><td>${money(x.utilityDeposit)}</td><td>${money(x.total)}</td>
      <td>${x.balance>=0?`<span class="pill advance">Advance ${money(x.balance)}</span>`:`<span class="pill due">Due ${money(-x.balance)}</span>`}</td>
    </tr>`).join('');
    const mobile=calc.map(x=>`<article class="member-summary-card mm-fin-member-summary mm-dash-member-summary">
      <div class="member-summary-head mm-fin-member-head">
        ${avatar(x.member)}
        <div><b>${esc(x.member.name)}</b><small>${x.units} meal units</small></div>
        ${x.balance>=0?`<span class="pill advance">+${money(x.balance)}</span>`:`<span class="pill due">-${money(-x.balance)}</span>`}
      </div>
      <div class="member-summary-grid mm-fin-member-grid mm-dash-member-grid">
        <div><span>Food Bill</span><b>${money(x.food)}</b></div>
        <div><span>Utility Bill</span><b>${money(x.util)}</b></div>
        <div><span>Total Deposit</span><b>${money(x.deposit)}</b></div>
        <div><span>Food Deposit</span><b>${money(x.foodDeposit)}</b></div>
        <div><span>Utility Deposit</span><b>${money(x.utilityDeposit)}</b></div>
        <div><span>Total Bill</span><b>${money(x.total)}</b></div>
      </div>
    </article>`).join('');
    return `<div class="desktop-summary table-wrap"><table><thead><tr><th>Member</th><th>Meals</th><th>Food Bill</th><th>Utility Bill</th><th>Total Deposit</th><th>Food Deposit</th><th>Utility Deposit</th><th>Total Bill</th><th>Due/Advance</th></tr></thead><tbody>${desktop}</tbody></table></div><div class="mobile-summary">${mobile}</div>`;
  }

  function dashboardInsights(c){
    const data=dashboardData();
    c.innerHTML=`<section class="kpis mm-dashboard-kpis" aria-label="Monthly mess summary">
      ${kpi('মোট খরচ',data.totalBill,'expense','expense')}
      ${kpi('Utility Bills',data.utilityBill,'utility','utility')}
      ${kpi('মোট জমা',data.totalDeposit,'deposit','deposit')}
      ${kpi('মোট বাজার',data.bazarBill,'bazar','bazar')}
      ${kpi('বাজার ফান্ড',data.bazarFund,'fund','fund',{negative:data.bazarFund<0})}
      ${kpi('মোট Due',data.due,'due','due')}
    </section><div class="section-head mm-dashboard-member-head"><div><span class="eyebrow">This month</span><h2>Members Summary</h2></div></div>${settlementTableInsights(data.calc)}`;
    c.querySelectorAll('[data-dashboard-action]').forEach(card=>{
      const activate=()=>handleAction(card.dataset.dashboardAction,data);
      card.addEventListener('click',activate);
      card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();activate();}});
    });
  }

  window.dashboard=dashboardInsights;
  window.settlementTable=settlementTableInsights;
  window.openDashboardInsight=action=>handleAction(action,dashboardData());
  try{dashboard=dashboardInsights;settlementTable=settlementTableInsights;}catch(_){/* window assignments cover strict global wrappers */}
})();
