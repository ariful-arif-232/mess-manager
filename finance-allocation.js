/* Final financial allocation layer: split deposits + fixed/shared utility bills. */
'use strict';
(()=>{
  if(window.__mmFinanceAllocationLoaded)return;
  window.__mmFinanceAllocationLoaded=true;

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
  const typeByKey=key=>TYPES.find(type=>type.key===key)||TYPES[TYPES.length-1];
  const typeKey=value=>{
    const raw=String(value||'').trim();
    const lower=raw.toLowerCase();
    if(lower==='gas')return'Gas';
    if(['current','electricity','electric'].includes(lower))return'Current';
    if(['wifi','wi-fi','internet'].includes(lower))return'WiFi';
    if(['bua','bua bill','maid'].includes(lower))return'Bua';
    if(lower==='water')return'Water';
    return TYPES.some(x=>x.key===raw)?raw:'Other';
  };
  const utilityMode=row=>String(row?.mode||row?.bill_mode||'shared').toLowerCase()==='fixed'?'fixed':'shared';
  const depositPurpose=row=>typeof window.mmDepositPurposeOf==='function'?window.mmDepositPurposeOf(row):String(row?.purpose||row?.note||'Bazar');
  const initials=name=>String(name||'M').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'M';
  const memberById=id=>db.members.find(m=>m.id===id)||null;
  const avatar=(member,cls='')=>member?.avatar_url
    ?`<img class="mm-fin-avatar ${cls}" src="${esc(member.avatar_url)}" alt="${esc(member.name||'Member')}"/>`
    :`<span class="mm-fin-avatar mm-fin-avatar-fallback ${cls}" aria-hidden="true">${esc(initials(member?.name))}</span>`;
  const formatDate=value=>{
    if(!value)return'-';
    const date=new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime())?String(value):date.toLocaleDateString('en-BD',{day:'numeric',month:'short',year:'numeric'});
  };
  const sum=(rows,key='amount')=>rows.reduce((total,row)=>total+Number(typeof key==='function'?key(row):row?.[key]||0),0);
  const closeLayer=id=>document.getElementById(id)?.remove();

  function financeData(){
    const calc=calcMonth();
    const bazarBill=sum(db.bazar);
    const foodDeposit=sum(calc,row=>row.foodDeposit);
    const utilityDeposit=sum(calc,row=>row.utilityDeposit);
    const totalDeposit=foodDeposit+utilityDeposit;
    const utilityLedger=typeof window.mmUtilityLedger==='function'?window.mmUtilityLedger():{categories:[],totalActual:sum(db.utilities)};
    const utilityBill=Number(utilityLedger.totalActual||0);
    const totalBill=bazarBill+utilityBill;
    const bazarFund=foodDeposit-bazarBill;
    const due=sum(calc,row=>Math.max(0,-Number(row.balance||0)));
    return{calc,bazarBill,foodDeposit,utilityDeposit,totalDeposit,utilityLedger,utilityBill,totalBill,bazarFund,due};
  }

  function kpi(label,value,kind,{negative=false}={}){
    return `<article class="kpi card mm-dashboard-kpi mm-dashboard-kpi-${kind}${negative?' is-negative':''}"><span class="kpi-icon mm-dashboard-kpi-icon mm-dashboard-icon-${kind}" aria-hidden="true"></span><div class="mm-dashboard-kpi-copy"><div class="label">${esc(label)}</div><div class="value">${money(value)}</div></div></article>`;
  }

  function finalSettlementTable(calc){
    const desktop=calc.map(x=>`<tr>
      <td><b>${esc(x.member.name)}</b></td><td>${x.units}</td>
      <td>${money(x.deposit)}</td><td>${money(x.util)}</td><td>${money(x.food)}</td>
      <td>${money(x.foodDeposit)}</td><td>${money(x.utilityDeposit)}</td><td>${money(x.total)}</td>
      <td>${x.balance>=0?`<span class="pill advance">Advance ${money(x.balance)}</span>`:`<span class="pill due">Due ${money(-x.balance)}</span>`}</td>
    </tr>`).join('');
    const mobile=calc.map(x=>`<article class="member-summary-card mm-fin-member-summary">
      <div class="member-summary-head mm-fin-member-head">
        ${avatar(x.member,'mm-fin-summary-avatar')}
        <div><b>${esc(x.member.name)}</b><small>${x.units} meal units</small></div>
        ${x.balance>=0?`<span class="pill advance">+${money(x.balance)}</span>`:`<span class="pill due">-${money(-x.balance)}</span>`}
      </div>
      <div class="member-summary-grid mm-fin-member-grid">
        <div><span>Total Deposit</span><b>${money(x.deposit)}</b></div>
        <div><span>Utility Bill</span><b>${money(x.util)}</b></div>
        <div><span>Food Bill</span><b>${money(x.food)}</b></div>
        <div><span>Food Deposit</span><b>${money(x.foodDeposit)}</b></div>
        <div><span>Utility Deposit</span><b>${money(x.utilityDeposit)}</b></div>
        <div><span>Total Bill</span><b>${money(x.total)}</b></div>
      </div>
    </article>`).join('');
    return `<div class="desktop-summary table-wrap"><table><thead><tr><th>Member</th><th>Meals</th><th>Total Deposit</th><th>Utility Bill</th><th>Food Bill</th><th>Food Deposit</th><th>Utility Deposit</th><th>Total Bill</th><th>Due/Advance</th></tr></thead><tbody>${desktop}</tbody></table></div><div class="mobile-summary">${mobile}</div>`;
  }

  function finalDashboard(c){
    const data=financeData();
    c.innerHTML=`<section class="kpis mm-dashboard-kpis" aria-label="Monthly mess summary">
      ${kpi('মোট খরচ',data.totalBill,'expense')}
      ${kpi('Utility Bills',data.utilityBill,'utility')}
      ${kpi('মোট জমা',data.totalDeposit,'deposit')}
      ${kpi('মোট বাজার',data.bazarBill,'bazar')}
      ${kpi('বাজার ফান্ড',data.bazarFund,'fund',{negative:data.bazarFund<0})}
      ${kpi('মোট Due',data.due,'due')}
    </section><div class="section-head mm-dashboard-member-head"><div><span class="eyebrow">This month</span><h2>Members Summary</h2></div></div>${finalSettlementTable(data.calc)}`;
  }

  function categoryCard(category,mode){
    const meta=typeByKey(category.key);
    const fixed=mode==='fixed';
    const amount=fixed?category.fixedTotal:category.sharedTotal;
    const count=fixed?category.fixedMembers.length:category.sharedMemberIds.size;
    const copy=fixed
      ?(count?`${count} fixed ${count===1?'member':'members'}`:'No fixed member')
      :(count?`${count} ${count===1?'member':'members'} in bill`:'No shared bill');
    return `<button type="button" class="mm-fin-utility-category ${fixed?'is-fixed':'is-shared'}" data-fin-utility-view="${mode}" data-fin-utility-type="${esc(category.key)}">
      <span class="mm-fin-type-icon" aria-hidden="true">${meta.icon}</span>
      <span class="mm-fin-type-copy"><b>${esc(meta.label)}</b><small>${esc(copy)}</small></span>
      <span class="mm-fin-type-money"><strong>${money(amount)}</strong><small>Tap to view ›</small></span>
    </button>`;
  }

  function finalUtilities(c){
    const controls=profile.role==='admin';
    const ledger=typeof window.mmUtilityLedger==='function'?window.mmUtilityLedger():{categories:[]};
    const categories=TYPES.map(meta=>ledger.categories.find(x=>x.key===meta.key)||{...meta,fixedEntries:[],sharedEntries:[],fixedTotal:0,sharedTotal:0,total:0,fixedMembers:[],sharedMembers:[],sharedMemberIds:new Set(),fixedByMember:new Map(),memberCharges:new Map(),remainder:0,fixedDeduction:0});
    c.innerHTML=`<section class="mm-fin-utility-head">
      <div><span class="eyebrow">Monthly utility allocation</span><h2>Utility Bills</h2><p>Fixed amount আগে allocate হবে; বাকি bill non-fixed selected members-এর মধ্যে ভাগ হবে।</p></div>
      ${controls?'<button class="btn primary mm-fin-add-bill" type="button" data-fin-add-bill>+ Add Bill</button>':''}
    </section>
    <section class="mm-fin-utility-section">
      <header><div><span>Fixed allocation</span><h3>Fixed Utility Bill</h3></div><small>Per selected member</small></header>
      <div class="mm-fin-utility-grid">${categories.map(category=>categoryCard(category,'fixed')).join('')}</div>
    </section>
    <section class="mm-fin-utility-section">
      <header><div><span>Monthly totals</span><h3>Shared Bill</h3></div><small>Remaining amount is divided</small></header>
      <div class="mm-fin-utility-grid">${categories.map(category=>categoryCard(category,'shared')).join('')}</div>
    </section>`;
    c.querySelector('[data-fin-add-bill]')?.addEventListener('click',()=>finalUtilityModal());
    c.querySelectorAll('[data-fin-utility-view]').forEach(button=>button.addEventListener('click',()=>openUtilityDetail(button.dataset.finUtilityType,button.dataset.finUtilityView)));
  }

  function sourceEntry(row,controls){
    const fixed=utilityMode(row)==='fixed';
    const people=(row.memberIds||[]).map(memberById).filter(Boolean);
    const names=people.map(member=>member.name).join(', ')||'No member';
    return `<article class="mm-fin-source-row">
      <div><span>${esc(formatDate(row.date))}</span><b>${fixed?'Fixed':'Shared'} · ${money(row.amount)}</b><small>${esc(names)}${fixed?' · per member':''}</small></div>
      ${controls?`<div><button type="button" data-fin-edit="${esc(row.id)}">Edit</button><button type="button" class="danger" data-fin-delete="${esc(row.id)}">Delete</button></div>`:''}
    </article>`;
  }

  function openUtilityDetail(type,mode){
    const ledger=typeof window.mmUtilityLedger==='function'?window.mmUtilityLedger():{categories:[]};
    const category=ledger.categories.find(x=>x.key===type);
    if(!category)return;
    const meta=typeByKey(type);
    const controls=profile.role==='admin';
    const fixedMode=mode==='fixed';
    const entries=fixedMode?category.fixedEntries:category.sharedEntries;
    const memberRows=fixedMode
      ?[...category.fixedByMember.entries()].map(([memberId,amount])=>({memberId,amount,kind:'Fixed'}))
      :[...category.memberCharges.entries()].map(([memberId,amount])=>({memberId,amount,kind:category.fixedByMember.has(memberId)?'Fixed':'Shared'}));
    closeLayer('mmFinanceUtilitySheet');
    document.body.insertAdjacentHTML('beforeend',`<div class="mm-fin-layer" id="mmFinanceUtilitySheet">
      <section class="mm-fin-sheet" role="dialog" aria-modal="true" aria-label="${esc(meta.label)} utility details">
        <div class="mm-fin-sheet-handle" aria-hidden="true"></div>
        <header class="mm-fin-sheet-head"><div class="mm-fin-sheet-title"><span class="mm-fin-type-icon">${meta.icon}</span><div><small>${fixedMode?'Fixed utility bill':'Shared bill allocation'}</small><h3>${esc(meta.label)}</h3></div></div><button type="button" class="mm-fin-close" data-fin-sheet-close>×</button></header>
        ${fixedMode?`<div class="mm-fin-detail-stats"><div><span>Fixed total</span><b>${money(category.fixedTotal)}</b></div><div><span>Members</span><b>${category.fixedMembers.length}</b></div><div><span>Shared bill</span><b>${money(category.sharedTotal)}</b></div></div>`:`<div class="mm-fin-detail-stats"><div><span>Bill total</span><b>${money(category.total)}</b></div><div><span>Fixed offset</span><b>${money(category.fixedDeduction)}</b></div><div><span>Shared remainder</span><b>${money(category.remainder)}</b></div></div>`}
        <div class="mm-fin-allocation-list">${memberRows.length?memberRows.map(row=>{
          const member=memberById(row.memberId);
          return `<div class="mm-fin-allocation-row">${avatar(member)}<div><b>${esc(member?.name||'Member')}</b><small>${esc(row.kind)} charge</small></div><strong>${money(row.amount)}</strong></div>`;
        }).join(''):'<div class="mm-fin-empty">No member allocation yet.</div>'}</div>
        <div class="mm-fin-source-head"><span>Source entries</span><b>${entries.length}</b></div>
        <div class="mm-fin-source-list">${entries.length?entries.map(row=>sourceEntry(row,controls)).join(''):'<div class="mm-fin-empty compact">No entries in this section.</div>'}</div>
        ${controls?`<button type="button" class="btn primary mm-fin-sheet-add" data-fin-sheet-add>+ Add ${esc(meta.label)} ${fixedMode?'Fixed':'Shared'} Bill</button>`:''}
      </section>
    </div>`);
    const layer=document.getElementById('mmFinanceUtilitySheet');
    layer?.addEventListener('click',event=>{if(event.target===layer)closeLayer('mmFinanceUtilitySheet');});
    layer?.querySelector('[data-fin-sheet-close]')?.addEventListener('click',()=>closeLayer('mmFinanceUtilitySheet'));
    layer?.querySelector('[data-fin-sheet-add]')?.addEventListener('click',()=>{closeLayer('mmFinanceUtilitySheet');finalUtilityModal(null,{type,mode});});
    layer?.querySelectorAll('[data-fin-edit]').forEach(button=>button.addEventListener('click',()=>{const id=button.dataset.finEdit;closeLayer('mmFinanceUtilitySheet');finalUtilityModal(id);}));
    layer?.querySelectorAll('[data-fin-delete]').forEach(button=>button.addEventListener('click',async()=>{
      const id=button.dataset.finDelete;
      if(!confirm('Delete this utility bill?'))return;
      await run(async()=>{
        assertResult(await client.from('utility_bills').delete().eq('id',id));
        await logActivity('delete','utility_bill',id);
        closeLayer('mmFinanceUtilitySheet');
        await loadData();
        render();
      },'Utility bill deleted.');
    }));
  }

  function closeChoice(){closeLayer('mmFinanceChoiceSheet');}
  function choiceSheet(kicker,title,rows){
    closeChoice();
    document.body.insertAdjacentHTML('beforeend',`<div class="mm-fin-choice-layer" id="mmFinanceChoiceSheet"><section class="mm-fin-choice-sheet" role="dialog" aria-modal="true"><div class="mm-fin-sheet-handle"></div><header><div><small>${esc(kicker)}</small><h3>${esc(title)}</h3></div><button type="button" class="mm-fin-close" data-fin-choice-close>×</button></header><div class="mm-fin-choice-list">${rows}</div></section></div>`);
    const layer=document.getElementById('mmFinanceChoiceSheet');
    layer?.addEventListener('click',event=>{if(event.target===layer)closeChoice();});
    layer?.querySelector('[data-fin-choice-close]')?.addEventListener('click',closeChoice);
    return layer;
  }

  function previewCategory(type,mode,amount,memberIds,excludeId=null){
    const rows=db.utilities.filter(row=>row.id!==excludeId&&typeKey(row.type)===type);
    let sharedTotal=0;
    const fixedByMember=new Map();
    const sharedMembers=new Set();
    for(const row of rows){
      if(utilityMode(row)==='fixed'){
        for(const id of row.memberIds||[])fixedByMember.set(id,(fixedByMember.get(id)||0)+Number(row.amount||0));
      }else{
        sharedTotal+=Number(row.amount||0);
        for(const id of row.memberIds||[])sharedMembers.add(id);
      }
    }
    if(mode==='fixed')for(const id of memberIds)fixedByMember.set(id,(fixedByMember.get(id)||0)+Number(amount||0));
    else{sharedTotal+=Number(amount||0);for(const id of memberIds)sharedMembers.add(id)}
    const fixedTotal=[...fixedByMember.values()].reduce((total,value)=>total+Number(value||0),0);
    const remainder=Math.max(0,sharedTotal-fixedTotal);
    const remainderMembers=[...sharedMembers].filter(id=>!fixedByMember.has(id));
    return{sharedTotal,fixedTotal,remainder,remainderMembers};
  }

  async function saveUtilityRecord(id,payload,memberIds){
    const query=id?client.from('utility_bills').update(payload).eq('id',id):client.from('utility_bills').insert(payload);
    const result=await query.select('id').single();
    if(result.error)throw result.error;
    const billId=result.data?.id||id;
    if(!billId)throw new Error('Utility bill id তৈরি হয়নি।');
    const current=id?(db.utilities.find(row=>row.id===id)?.memberIds||[]):[];
    const wanted=new Set(memberIds),existing=new Set(current);
    const added=memberIds.filter(memberId=>!existing.has(memberId));
    const removed=current.filter(memberId=>!wanted.has(memberId));
    if(added.length){
      const inserted=await client.from('utility_bill_members').insert(added.map(member_id=>({utility_bill_id:billId,member_id})));
      if(inserted.error)throw inserted.error;
    }
    if(removed.length){
      const deleted=await client.from('utility_bill_members').delete().eq('utility_bill_id',billId).in('member_id',removed);
      if(deleted.error)throw deleted.error;
    }
    await logActivity(id?'update':'create','utility_bill',billId,{bill_type:payload.bill_type,bill_mode:payload.bill_mode,member_count:memberIds.length});
    return billId;
  }

  function finalUtilityModal(id=null,preset={}){
    if(profile.role!=='admin')return;
    const existing=id?db.utilities.find(row=>row.id===id):null;
    let selectedType=existing?.type||preset.type||'';
    let mode=existing?utilityMode(existing):(preset.mode||'');
    let selectedMembers=new Set(existing?.memberIds||[]);
    if(!existing&&mode==='shared')selectedMembers=new Set(activeMembers().map(member=>member.id));
    if(!existing&&mode==='fixed')selectedMembers.clear();
    closeModal();

    const renderMemberOptions=()=>activeMembers().map(member=>`<label class="utility-member-option ${selectedMembers.has(member.id)?'selected':''}"><input type="checkbox" value="${esc(member.id)}" ${selectedMembers.has(member.id)?'checked':''}>${avatar(member,'utility-member-avatar')}<span class="utility-member-name">${esc(member.name)}</span><span class="utility-member-check" aria-hidden="true">✓</span></label>`).join('');
    const modeLabel=()=>!mode?'Select fixed or shared':mode==='fixed'?`Fixed ${typeByKey(selectedType).label} Bill`:`Shared ${typeByKey(selectedType).label} Bill`;

    modal(`<div class="entry-form-pro entry-utility mm-fin-utility-editor"><div class="entry-form-hero"><div class="entry-form-icon">${selectedType?typeByKey(selectedType).icon:'⚡'}</div><div><span>Utility allocation</span><h2>${id?'Edit':'Add'} Utility Bill</h2></div><button type="button" class="entry-form-close" data-close aria-label="Close">×</button></div>
      <form id="mmFinUtilityForm" class="entry-pro-form"><div class="entry-form-grid">
        <div class="field"><label>Date</label><div class="entry-date-wrap"><input name="bill_date" type="date" value="${esc(existing?.date||today())}" required></div></div>
        <div class="field"><label>Type</label><button type="button" class="entry-select-button utility-type-button" data-fin-type-picker><span class="entry-type-icon" data-fin-type-icon>${selectedType?typeByKey(selectedType).icon:'▦'}</span><span class="entry-select-copy"><small>Bill category</small><b data-fin-type-label>${selectedType?esc(typeByKey(selectedType).label):'Select utility type'}</b></span><span class="entry-select-chevron">⌄</span></button></div>
        <div class="field ${selectedType?'':'hidden'}" data-fin-mode-wrap><label>Bill method</label><button type="button" class="entry-select-button mm-fin-mode-button" data-fin-mode-picker><span class="entry-type-icon" data-fin-mode-icon>${mode==='fixed'?'◆':'⇄'}</span><span class="entry-select-copy"><small>${mode==='fixed'?'Per selected member':'Monthly shared total'}</small><b data-fin-mode-label>${esc(modeLabel())}</b></span><span class="entry-select-chevron">⌄</span></button></div>
        <div class="field entry-amount-field ${mode?'':'hidden'}" data-fin-amount-wrap><label data-fin-amount-label>${mode==='fixed'?'Fixed amount per selected member':'Total bill amount'}</label><div class="entry-money-input"><span>৳</span><input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" value="${esc(existing?.amount??'')}" placeholder="0.00"></div></div>
        <div class="utility-share-card ${mode?'':'hidden'}" data-fin-members-wrap><div class="utility-share-head"><div><h4 data-fin-member-title>${mode==='fixed'?'Fixed bill members':'Share with members'}</h4><small data-fin-member-help>${mode==='fixed'?'প্রতি selected member-এর fixed amount':'বাকি bill যাদের মধ্যে ভাগ হবে'}</small></div><small data-share-count>${selectedMembers.size} selected</small></div><div class="utility-member-list" data-fin-member-list>${renderMemberOptions()}</div></div>
      </div><div class="entry-form-actions"><button class="btn primary entry-save" type="submit">${id?'Update Bill':'Save Utility Bill'}</button><button class="btn entry-cancel" type="button" data-cancel>Cancel</button></div></form></div>`);

    const form=document.getElementById('mmFinUtilityForm');
    const syncMembers=()=>{
      const list=form.querySelector('[data-fin-member-list]');
      list.innerHTML=renderMemberOptions();
      list.querySelectorAll('input').forEach(input=>input.addEventListener('change',()=>{
        input.checked?selectedMembers.add(input.value):selectedMembers.delete(input.value);
        input.closest('.utility-member-option')?.classList.toggle('selected',input.checked);
        form.querySelector('[data-share-count]').textContent=`${selectedMembers.size} selected`;
      }));
      form.querySelector('[data-share-count]').textContent=`${selectedMembers.size} selected`;
    };
    const syncUi=()=>{
      form.querySelector('[data-fin-mode-wrap]').classList.toggle('hidden',!selectedType);
      form.querySelector('[data-fin-amount-wrap]').classList.toggle('hidden',!mode);
      form.querySelector('[data-fin-members-wrap]').classList.toggle('hidden',!mode);
      form.querySelector('[data-fin-type-label]').textContent=selectedType?typeByKey(selectedType).label:'Select utility type';
      form.querySelector('[data-fin-type-icon]').textContent=selectedType?typeByKey(selectedType).icon:'▦';
      form.querySelector('[data-fin-mode-label]').textContent=modeLabel();
      form.querySelector('[data-fin-mode-icon]').textContent=mode==='fixed'?'◆':'⇄';
      form.querySelector('[data-fin-amount-label]').textContent=mode==='fixed'?'Fixed amount per selected member':'Total bill amount';
      form.querySelector('[data-fin-member-title]').textContent=mode==='fixed'?'Fixed bill members':'Share with members';
      form.querySelector('[data-fin-member-help]').textContent=mode==='fixed'?'প্রতি selected member-এর fixed amount':'বাকি bill যাদের মধ্যে ভাগ হবে';
      const hero=document.querySelector('.mm-fin-utility-editor .entry-form-icon');if(hero)hero.textContent=selectedType?typeByKey(selectedType).icon:'⚡';
      syncMembers();
    };
    const pickMode=()=>{
      if(!selectedType)return;
      const meta=typeByKey(selectedType);
      const layer=choiceSheet('Bill method',`${meta.label}: fixed or shared?`,
        `<button type="button" class="mm-fin-choice-row" data-fin-mode="fixed"><span class="mm-fin-choice-icon fixed">◆</span><span><b>Fixed ${esc(meta.label)} Bill</b><small>Selected member-এর জন্য fixed amount</small></span><i>›</i></button>
         <button type="button" class="mm-fin-choice-row" data-fin-mode="shared"><span class="mm-fin-choice-icon shared">⇄</span><span><b>Shared ${esc(meta.label)} Bill</b><small>Remaining amount selected members-এর মধ্যে ভাগ হবে</small></span><i>›</i></button>`);
      layer.querySelectorAll('[data-fin-mode]').forEach(button=>button.addEventListener('click',()=>{
        const next=button.dataset.finMode;
        if(next!==mode){
          mode=next;
          selectedMembers=next==='shared'?new Set(activeMembers().map(member=>member.id)):new Set();
        }
        closeChoice();syncUi();
      }));
    };
    form.querySelector('[data-fin-type-picker]').addEventListener('click',()=>{
      const layer=choiceSheet('Utility category','Select bill type',TYPES.map(meta=>`<button type="button" class="mm-fin-choice-row ${selectedType===meta.key?'selected':''}" data-fin-type="${esc(meta.key)}"><span class="mm-fin-choice-icon type">${meta.icon}</span><span><b>${esc(meta.label)}</b><small>${meta.key==='Bua'?'Bua / maid bill':meta.key==='Current'?'Electricity':meta.key==='WiFi'?'Internet / WiFi':meta.key==='Other'?'Other utility cost':`${meta.label} bill`}</small></span><i>${selectedType===meta.key?'✓':'›'}</i></button>`).join(''));
      layer.querySelectorAll('[data-fin-type]').forEach(button=>button.addEventListener('click',()=>{
        const next=button.dataset.finType;
        if(next!==selectedType){selectedType=next;mode='';selectedMembers=new Set();}
        closeChoice();syncUi();setTimeout(pickMode,90);
      }));
    });
    form.querySelector('[data-fin-mode-picker]').addEventListener('click',pickMode);
    form.querySelector('[data-cancel]').addEventListener('click',closeModal);
    document.querySelector('.mm-fin-utility-editor [data-close]')?.addEventListener('click',closeModal);
    syncUi();
    if(!existing&&preset.type&&preset.mode)syncUi();

    form.addEventListener('submit',async event=>{
      event.preventDefault();
      if(state.busy)return;
      const data=new FormData(form);
      const amount=Number(data.get('amount')||0);
      const memberIds=[...selectedMembers];
      if(!selectedType)return notify('Utility type select করুন।');
      if(!mode)return notify('Fixed or Shared bill select করুন।');
      if(!(amount>0))return notify('Valid amount দিন।');
      if(!memberIds.length)return notify('কমপক্ষে একজন member select করুন।');
      const preview=previewCategory(selectedType,mode,amount,memberIds,id);
      if(preview.sharedTotal>0&&preview.fixedTotal>preview.sharedTotal+0.001){
        return notify(`Fixed allocation ${money(preview.fixedTotal)} shared bill ${money(preview.sharedTotal)}-এর বেশি হতে পারবে না।`);
      }
      if(preview.sharedTotal>preview.fixedTotal+0.001&&!preview.remainderMembers.length){
        return notify('Remaining shared bill ভাগ করার জন্য অন্তত একজন non-fixed member select করুন।');
      }
      const button=event.submitter||form.querySelector('.entry-save');
      const old=button.textContent;button.disabled=true;button.textContent='Saving…';state.busy=true;
      try{
        await saveUtilityRecord(id,{mess_id:profile.mess_id,bill_date:String(data.get('bill_date')||today()),bill_type:selectedType,bill_mode:mode,amount},memberIds);
        closeChoice();closeModal();await loadData();render();notify(id?'Utility bill updated.':'Utility bill saved.','success');
      }catch(error){notify(friendlyError(error));button.disabled=false;button.textContent=old;}
      finally{state.busy=false;}
    });
  }

  window.settlementTable=finalSettlementTable;
  window.dashboard=finalDashboard;
  window.utilities=finalUtilities;
  window.utilityModal=finalUtilityModal;
  window.openUtilityAllocationDetail=openUtilityDetail;
  try{
    settlementTable=finalSettlementTable;
    dashboard=finalDashboard;
    utilities=finalUtilities;
    utilityModal=finalUtilityModal;
  }catch(_){/* window assignments are sufficient when globals are lexical. */}
})();
