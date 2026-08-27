/* Dashboard finance separation: Utility and Bazar stay independent while preserving existing drilldown patterns. */
'use strict';
(()=>{
  if(window.__mmDashboardFinanceSeparationLoaded)return;
  window.__mmDashboardFinanceSeparationLoaded=true;

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

  const sum=(rows,getter=row=>row?.amount)=>rows.reduce((total,row)=>total+Number(getter(row)||0),0);
  const purposeOf=row=>typeof window.mmDepositPurposeOf==='function'?window.mmDepositPurposeOf(row):String(row?.purpose||row?.note||'Bazar');
  const initials=name=>String(name||'M').trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'M';
  const typeMeta=key=>TYPES.find(type=>type.key===key)||{key,label:key,icon:'▦'};
  const closeSheet=()=>document.getElementById('mmDashboardInsightLayer')?.remove();
  const nearZero=value=>Math.abs(Number(value||0))<0.005;

  const signedMoney=value=>{
    const amount=Number(value||0);
    if(nearZero(amount))return money(0);
    return `${amount>0?'+':'-'}${money(Math.abs(amount))}`;
  };
  const balanceMeta=value=>{
    const amount=Number(value||0);
    if(nearZero(amount))return{tone:'settled',status:'Settled',amount:money(0),signed:money(0)};
    if(amount>0)return{tone:'advance',status:'Advance',amount:money(amount),signed:signedMoney(amount)};
    return{tone:'due',status:'Due',amount:money(Math.abs(amount)),signed:signedMoney(amount)};
  };
  const avatar=member=>member?.avatar_url
    ?`<img class="mm-dash-avatar" src="${esc(member.avatar_url)}" alt="${esc(member.name||'Member')}"/>`
    :`<span class="mm-dash-avatar mm-dash-avatar-fallback" aria-hidden="true">${esc(initials(member?.name))}</span>`;

  function depositsFor(memberId,purpose){
    return (db.deposits||[])
      .filter(row=>String(row.memberId)===String(memberId)&&purposeOf(row)===purpose)
      .reduce((total,row)=>total+Number(row.amount||0),0);
  }

  function dashboardData(){
    const calc=typeof calcMonth==='function'?(calcMonth()||[]):[];
    const bazarBill=sum(db.bazar||[]);
    const utilityLedger=typeof window.mmUtilityLedger==='function'
      ?window.mmUtilityLedger()
      :{categories:[],totalActual:sum(db.utilities||[]),memberTotals:new Map()};
    const utilityBill=Number(utilityLedger.totalActual||0);
    const foodDeposit=sum(calc,row=>row.foodDeposit);
    const utilityDeposit=sum(calc,row=>row.utilityDeposit);
    const bazarFund=foodDeposit-bazarBill;
    const utilityFund=utilityDeposit-utilityBill;

    const memberBreakdowns=calc.map(row=>{
      const categories=TYPES.map(meta=>{
        const category=utilityLedger.categories?.find(item=>item.key===meta.key);
        const bill=Number(category?.memberCharges?.get?.(row.member.id)||0);
        const deposit=depositsFor(row.member.id,meta.key);
        const balance=deposit-bill;
        return{key:meta.key,label:meta.label,icon:meta.icon,bill,deposit,balance,due:Math.max(0,-balance),advance:Math.max(0,balance)};
      }).filter(item=>item.bill>0.001||item.deposit>0.001);

      const bazarBalance=Number(row.foodDeposit||0)-Number(row.food||0);
      const utilityBalance=Number(row.utilityDeposit||0)-Number(row.util||0);
      const totalBalance=bazarBalance+utilityBalance;
      return{
        row,
        member:row.member,
        categories,
        bazarBalance,
        utilityBalance,
        totalBalance,
        bazarDue:Math.max(0,-bazarBalance),
        utilityDue:Math.max(0,-utilityBalance),
        bazarAdvance:Math.max(0,bazarBalance),
        utilityAdvance:Math.max(0,utilityBalance)
      };
    });

    const bazarDue=sum(memberBreakdowns,item=>item.bazarDue);
    const utilityDue=sum(memberBreakdowns,item=>item.utilityDue);
    const bazarAdvance=sum(memberBreakdowns,item=>item.bazarAdvance);
    const utilityAdvance=sum(memberBreakdowns,item=>item.utilityAdvance);
    return{
      calc,bazarBill,utilityLedger,utilityBill,foodDeposit,utilityDeposit,bazarFund,utilityFund,
      memberBreakdowns,bazarDue,utilityDue,bazarAdvance,utilityAdvance
    };
  }

  function kpi(label,value,kind,action,{signed=false,negative=false}={}){
    const display=signed?signedMoney(value):money(value);
    const positive=signed&&Number(value)>0.004;
    return `<article class="kpi card mm-dashboard-kpi mm-dashboard-kpi-${kind}${negative?' is-negative':''}${positive?' is-positive':''}" role="button" tabindex="0" data-dashboard-action="${esc(action)}" aria-label="${esc(label)} details">
      <span class="kpi-icon mm-dashboard-kpi-icon mm-dashboard-icon-${kind}" aria-hidden="true"></span>
      <div class="mm-dashboard-kpi-copy"><div class="label">${esc(label)}</div><div class="value">${display}</div></div>
    </article>`;
  }

  function sheet({kind='utility',kicker,title,body,back=false}){
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
    return `<div class="mm-dash-stats">${items.map(item=>`<div><span>${esc(item.label)}</span><strong class="${item.tone||''}">${item.signed?signedMoney(item.value):money(item.value)}</strong></div>`).join('')}</div>`;
  }

  function memberSectionTitle(label='Member breakdown',copy='Tap a member to view details'){
    return `<div class="mm-dash-member-section-title"><span>${esc(label)}</span><small>${esc(copy)}</small></div>`;
  }

  function memberBillRow(item,{type='utility',amount=0,label='Bill',copy='Tap to view breakdown'}={}){
    const attr=type==='utility'?'data-dash-utility-member':'data-dash-bazar-member';
    return `<button type="button" class="mm-dash-member-row mm-dash-drill-member" ${attr}="${esc(item.member.id)}">
      ${avatar(item.member)}
      <div class="mm-dash-member-copy"><b>${esc(item.member.name)}</b><small>${esc(copy)}</small></div>
      <span class="mm-dash-status neutral"><small>${esc(label)}</small><strong>${money(amount)}</strong></span>
      <i aria-hidden="true">›</i>
    </button>`;
  }

  function balanceMemberRow(item,{scope='utility',mode='fund'}={}){
    const isUtility=scope==='utility';
    const balance=isUtility?item.utilityBalance:item.bazarBalance;
    const meta=balanceMeta(balance);
    const bill=isUtility?Number(item.row.util||0):Number(item.row.food||0);
    const deposit=isUtility?Number(item.row.utilityDeposit||0):Number(item.row.foodDeposit||0);
    const attr=`data-dash-${scope}-${mode}-member`;
    return `<button type="button" class="mm-dash-member-row mm-dash-drill-member mm-dash-account-row" ${attr}="${esc(item.member.id)}">
      ${avatar(item.member)}
      <div class="mm-dash-member-copy"><b>${esc(item.member.name)}</b><small>${isUtility?'Utility':'Bazar'} deposit ${money(deposit)} · Bill ${money(bill)}</small></div>
      <span class="mm-dash-status ${meta.tone}"><small>${meta.status}</small><strong>${meta.signed}</strong></span>
      <i aria-hidden="true">›</i>
    </button>`;
  }

  function utilityCategoryRow(category,{balance=false}={}){
    const meta=typeMeta(category.key);
    if(!balance){
      return `<div class="mm-dash-detail-row"><span class="mm-dash-type-icon" aria-hidden="true">${meta.icon}</span><div><b>${esc(meta.label)}</b><small>Monthly utility bill</small></div><strong>${money(category.total)}</strong></div>`;
    }
    const state=balanceMeta(category.balance);
    return `<div class="mm-dash-detail-row mm-dash-balance-category is-${state.tone}">
      <span class="mm-dash-type-icon" aria-hidden="true">${meta.icon}</span>
      <div><b>${esc(meta.label)}</b><small>Bill ${money(category.bill)} · Deposit ${money(category.deposit)}</small></div>
      <span class="mm-dash-category-balance"><small>${state.status}</small><strong>${state.signed}</strong></span>
    </div>`;
  }

  function openUtility(data){
    const categories=(data.utilityLedger.categories||[]).filter(category=>Number(category.total||0)>0.001);
    const categoryRows=categories.length?categories.map(category=>utilityCategoryRow(category)).join(''):'<div class="mm-dash-empty">এই মাসে কোনো Utility Bill নেই।</div>';
    const members=data.memberBreakdowns.filter(item=>Number(item.row.util||0)>0.001||Number(item.row.utilityDeposit||0)>0.001);
    const memberRows=members.map(item=>memberBillRow(item,{type:'utility',amount:Number(item.row.util||0),label:'Utility bill',copy:'Tap to view utility breakdown'})).join('');
    const layer=sheet({kind:'utility',kicker:'Utility account',title:'Utility Bills',body:`<div class="mm-dash-list">${categoryRows}</div><div class="mm-dash-total-line"><span>Total Utility Bill</span><strong>${money(data.utilityBill)}</strong></div>
      ${memberSectionTitle('Member utility bills')}
      <div class="mm-dash-list">${memberRows||'<div class="mm-dash-empty">এই মাসে কোনো member utility charge নেই।</div>'}</div>`});
    layer?.querySelectorAll('[data-dash-utility-member]').forEach(button=>button.addEventListener('click',()=>openUtilityMember(data,button.dataset.dashUtilityMember)));
  }

  function openUtilityMember(data,memberId){
    const item=data.memberBreakdowns.find(row=>String(row.member.id)===String(memberId));
    if(!item)return;
    const categories=item.categories.filter(category=>Number(category.bill||0)>0.001);
    const body=categories.length?categories.map(category=>`<div class="mm-dash-detail-row"><span class="mm-dash-type-icon" aria-hidden="true">${category.icon}</span><div><b>${esc(category.label)}</b><small>Member utility charge</small></div><strong>${money(category.bill)}</strong></div>`).join(''):'<div class="mm-dash-empty">এই member-এর কোনো Utility Bill নেই।</div>';
    const layer=sheet({kind:'utility',kicker:'Member utility bill',title:item.member.name,back:true,body:`<div class="mm-dash-list">${body}</div><div class="mm-dash-total-line"><span>Total Utility Bill</span><strong>${money(item.row.util)}</strong></div>`});
    layer?.querySelector('[data-dash-back]')?.addEventListener('click',()=>openUtility(data));
  }

  function openUtilityFund(data){
    const rows=data.memberBreakdowns.map(item=>balanceMemberRow(item,{scope:'utility',mode:'fund'})).join('');
    const layer=sheet({kind:'utility-fund',kicker:'Utility account',title:'Utility Fund',body:`${statGrid([
      {label:'Utility Deposit',value:data.utilityDeposit},
      {label:'Utility Bills',value:data.utilityBill}
    ])}<div class="mm-dash-total-line ${data.utilityFund<0?'is-due':'is-advance'}"><span>Utility Fund</span><strong>${signedMoney(data.utilityFund)}</strong></div>
      ${memberSectionTitle('Member utility balance','Tap to see bill, deposit and category balance')}
      <div class="mm-dash-list">${rows||'<div class="mm-dash-empty">No member utility balance.</div>'}</div>`});
    layer?.querySelectorAll('[data-dash-utility-fund-member]').forEach(button=>button.addEventListener('click',()=>openUtilityBalanceMember(data,button.dataset.dashUtilityFundMember,'fund')));
  }

  function openUtilityDue(data){
    const dueMembers=data.memberBreakdowns.filter(item=>item.utilityDue>0.001);
    const rows=dueMembers.map(item=>balanceMemberRow(item,{scope:'utility',mode:'due'})).join('');
    const layer=sheet({kind:'utility-due',kicker:'Utility account',title:'Utility Due',body:`<div class="mm-dash-list">${rows||'<div class="mm-dash-empty">এই মাসে কোনো Utility Due নেই।</div>'}</div><div class="mm-dash-total-line is-due"><span>Total Utility Due</span><strong>${money(data.utilityDue)}</strong></div>`});
    layer?.querySelectorAll('[data-dash-utility-due-member]').forEach(button=>button.addEventListener('click',()=>openUtilityBalanceMember(data,button.dataset.dashUtilityDueMember,'due')));
  }

  function openUtilityBalanceMember(data,memberId,backMode='fund'){
    const item=data.memberBreakdowns.find(row=>String(row.member.id)===String(memberId));
    if(!item)return;
    const categories=item.categories.filter(category=>Math.abs(category.balance)>0.001||category.bill>0.001||category.deposit>0.001);
    const body=categories.length?categories.map(category=>utilityCategoryRow(category,{balance:true})).join(''):'<div class="mm-dash-empty">No utility activity.</div>';
    const meta=balanceMeta(item.utilityBalance);
    const layer=sheet({kind:backMode==='due'?'utility-due':'utility-fund',kicker:'Member utility balance',title:item.member.name,back:true,body:`<div class="mm-dash-list">${body}</div><div class="mm-dash-total-line ${meta.tone==='due'?'is-due':'is-advance'}"><span>Utility ${meta.status}</span><strong>${meta.signed}</strong></div>`});
    layer?.querySelector('[data-dash-back]')?.addEventListener('click',()=>backMode==='due'?openUtilityDue(data):openUtilityFund(data));
  }

  function openBazar(data){
    const rows=data.memberBreakdowns.map(item=>memberBillRow(item,{type:'bazar',amount:Number(item.row.food||0),label:'Bazar bill',copy:`${Number(item.row.units||0)} meal units · Tap to view details`})).join('');
    const layer=sheet({kind:'bazar',kicker:'Bazar account',title:'মোট বাজার',body:`${statGrid([
      {label:'Bazar Deposit',value:data.foodDeposit},
      {label:'Bazar Fund',value:data.bazarFund,signed:true}
    ])}<div class="mm-dash-total-line"><span>Total Bazar Cost</span><strong>${money(data.bazarBill)}</strong></div>
      ${memberSectionTitle('Member bazar bills','Tap a member to view food bill and deposit')}
      <div class="mm-dash-list">${rows||'<div class="mm-dash-empty">এই মাসে কোনো member bazar bill নেই।</div>'}</div>`});
    layer?.querySelectorAll('[data-dash-bazar-member]').forEach(button=>button.addEventListener('click',()=>openBazarMember(data,button.dataset.dashBazarMember,'bazar')));
  }

  function openBazarFund(data){
    const rows=data.memberBreakdowns.map(item=>balanceMemberRow(item,{scope:'bazar',mode:'fund'})).join('');
    const layer=sheet({kind:'fund',kicker:'Bazar account',title:'বাজার ফান্ড',body:`${statGrid([
      {label:'Bazar Deposit',value:data.foodDeposit},
      {label:'Bazar Cost',value:data.bazarBill}
    ])}<div class="mm-dash-total-line ${data.bazarFund<0?'is-due':'is-advance'}"><span>Bazar Fund</span><strong>${signedMoney(data.bazarFund)}</strong></div>
      ${memberSectionTitle('Member bazar balance','Tap to see food bill and deposit')}
      <div class="mm-dash-list">${rows||'<div class="mm-dash-empty">No member bazar balance.</div>'}</div>`});
    layer?.querySelectorAll('[data-dash-bazar-fund-member]').forEach(button=>button.addEventListener('click',()=>openBazarMember(data,button.dataset.dashBazarFundMember,'fund')));
  }

  function openBazarDue(data){
    const dueMembers=data.memberBreakdowns.filter(item=>item.bazarDue>0.001);
    const rows=dueMembers.map(item=>balanceMemberRow(item,{scope:'bazar',mode:'due'})).join('');
    const layer=sheet({kind:'bazar-due',kicker:'Bazar account',title:'Bazar Due',body:`<div class="mm-dash-list">${rows||'<div class="mm-dash-empty">এই মাসে কোনো Bazar Due নেই।</div>'}</div><div class="mm-dash-total-line is-due"><span>Total Bazar Due</span><strong>${money(data.bazarDue)}</strong></div>`});
    layer?.querySelectorAll('[data-dash-bazar-due-member]').forEach(button=>button.addEventListener('click',()=>openBazarMember(data,button.dataset.dashBazarDueMember,'due')));
  }

  function openBazarMember(data,memberId,backMode='bazar'){
    const item=data.memberBreakdowns.find(row=>String(row.member.id)===String(memberId));
    if(!item)return;
    const meta=balanceMeta(item.bazarBalance);
    const cutoff=item.row.foodCutoff?` · Cutoff ${item.row.foodCutoff}`:'';
    const body=`<div class="mm-dash-list">
      <div class="mm-dash-detail-row"><span class="mm-dash-type-icon" aria-hidden="true">🍚</span><div><b>Food / Bazar Bill</b><small>${Number(item.row.units||0)} meal units${esc(cutoff)}</small></div><strong>${money(item.row.food)}</strong></div>
      <div class="mm-dash-detail-row"><span class="mm-dash-type-icon" aria-hidden="true">💳</span><div><b>Food Deposit</b><small>Member bazar deposit</small></div><strong>${money(item.row.foodDeposit)}</strong></div>
    </div><div class="mm-dash-total-line ${meta.tone==='due'?'is-due':'is-advance'}"><span>Bazar ${meta.status}</span><strong>${meta.signed}</strong></div>`;
    const layer=sheet({kind:backMode==='due'?'bazar-due':backMode==='fund'?'fund':'bazar',kicker:'Member bazar balance',title:item.member.name,back:true,body});
    layer?.querySelector('[data-dash-back]')?.addEventListener('click',()=>backMode==='due'?openBazarDue(data):backMode==='fund'?openBazarFund(data):openBazar(data));
  }

  function balancePill(label,value){
    const meta=balanceMeta(value);
    return `<span class="mm-fin-balance-pill is-${meta.tone}" aria-label="${esc(label)} ${meta.status} ${esc(meta.amount)}"><small>${esc(label)}</small><span><em>${esc(meta.status)}</em><strong>${meta.signed}</strong></span></span>`;
  }

  function settlementTableSeparated(calc){
    const rows=calc.map(row=>{
      const bazarBalance=Number(row.foodDeposit||0)-Number(row.food||0);
      const utilityBalance=Number(row.utilityDeposit||0)-Number(row.util||0);
      const totalBalance=bazarBalance+utilityBalance;
      return{row,bazarBalance,utilityBalance,totalBalance};
    });

    const desktop=rows.map(item=>{
      const x=item.row;
      const bazar=balanceMeta(item.bazarBalance),utility=balanceMeta(item.utilityBalance),total=balanceMeta(item.totalBalance);
      return `<tr>
        <td><b>${esc(x.member.name)}</b></td><td>${x.units}</td>
        <td>${money(x.food)}</td><td>${money(x.util)}</td><td>${money(x.foodDeposit)}</td><td>${money(x.utilityDeposit)}</td>
        <td><span class="pill ${bazar.tone==='due'?'due':'advance'}">${bazar.status} ${bazar.signed}</span></td>
        <td><span class="pill ${utility.tone==='due'?'due':'advance'}">${utility.status} ${utility.signed}</span></td>
        <td><span class="pill ${total.tone==='due'?'due':'advance'}">${total.status} ${total.signed}</span></td>
      </tr>`;
    }).join('');

    const mobile=rows.map(item=>{
      const x=item.row;
      return `<article class="member-summary-card mm-fin-member-summary mm-dash-member-summary mm-fin-separated-member-summary">
        <div class="mm-fin-premium-head">
          ${avatar(x.member)}
          <div class="mm-fin-premium-identity"><b>${esc(x.member.name)}</b><small>${x.units} meal units</small></div>
          <div class="mm-fin-premium-totals">
            <div><span>Total Bill</span><b>${money(x.total)}</b></div>
            <div><span>Total Deposit</span><b class="${Number(x.deposit||0)>=Number(x.total||0)?'is-good':'is-warn'}">${money(x.deposit)}</b></div>
          </div>
          <div class="mm-fin-premium-balances">
            ${balancePill('Utility',item.utilityBalance)}
            ${balancePill('Bazar',item.bazarBalance)}
            ${balancePill('Total',item.totalBalance)}
          </div>
        </div>
        <div class="mm-fin-premium-grid" aria-label="${esc(x.member.name)} bill and deposit breakdown">
          <div class="is-bill"><span>Food Bill</span><b>${money(x.food)}</b></div>
          <div class="is-bill"><span>Utility Bill</span><b>${money(x.util)}</b></div>
          <div class="is-deposit"><span>Food Deposit</span><b>${money(x.foodDeposit)}</b></div>
          <div class="is-deposit"><span>Utility Deposit</span><b>${money(x.utilityDeposit)}</b></div>
        </div>
      </article>`;
    }).join('');

    return `<div class="desktop-summary table-wrap"><table><thead><tr><th>Member</th><th>Meals</th><th>Food Bill</th><th>Utility Bill</th><th>Food Deposit</th><th>Utility Deposit</th><th>Bazar</th><th>Utility</th><th>Total</th></tr></thead><tbody>${desktop}</tbody></table></div><div class="mobile-summary">${mobile}</div>`;
  }

  function handleAction(action,data){
    if(action==='utility')return openUtility(data);
    if(action==='utility-fund')return openUtilityFund(data);
    if(action==='utility-due')return openUtilityDue(data);
    if(action==='bazar')return openBazar(data);
    if(action==='fund')return openBazarFund(data);
    if(action==='bazar-due')return openBazarDue(data);
  }

  function dashboardSeparated(c){
    const data=dashboardData();
    c.innerHTML=`<section class="kpis mm-dashboard-kpis mm-dashboard-account-kpis" aria-label="Utility and Bazar monthly summary">
      ${kpi('Utility Bills',data.utilityBill,'utility','utility')}
      ${kpi('Utility Fund',data.utilityFund,'utility-fund','utility-fund',{signed:true,negative:data.utilityFund<0})}
      ${kpi('Utility Due',data.utilityDue,'utility-due','utility-due')}
      ${kpi('মোট বাজার',data.bazarBill,'bazar','bazar')}
      ${kpi('বাজার ফান্ড',data.bazarFund,'fund','fund',{signed:true,negative:data.bazarFund<0})}
      ${kpi('Bazar Due',data.bazarDue,'bazar-due','bazar-due')}
    </section><div class="section-head mm-dashboard-member-head"><div><span class="eyebrow">This month</span><h2>Members Summary</h2></div></div>${settlementTableSeparated(data.calc)}`;

    c.querySelectorAll('[data-dashboard-action]').forEach(card=>{
      const activate=()=>handleAction(card.dataset.dashboardAction,data);
      card.addEventListener('click',activate);
      card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();activate();}});
    });
  }

  window.dashboard=dashboardSeparated;
  window.settlementTable=settlementTableSeparated;
  window.openDashboardInsight=action=>handleAction(action,dashboardData());
  window.mmDashboardFinanceData=dashboardData;
  try{dashboard=dashboardSeparated;settlementTable=settlementTableSeparated;}catch(_){/* window assignments cover strict global wrappers */}
})();
