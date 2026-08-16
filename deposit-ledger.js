/* Member-first deposit ledger with dedicated Bazar and Utility purposes. */
'use strict';
(()=>{
  if(window.__mmDepositLedgerLoaded)return;
  window.__mmDepositLedgerLoaded=true;

  const PURPOSES=[
    {key:'Bazar',label:'Bazar',hint:'Bazar fund',icon:'basket'},
    {key:'Gas',label:'Gas',hint:'Gas utility',icon:'flame'},
    {key:'Current',label:'Current',hint:'Electricity',icon:'bolt'},
    {key:'WiFi',label:'WiFi',hint:'Internet bill',icon:'wifi'},
    {key:'Bua',label:'Bua Bill',hint:'Bua / maid bill',icon:'broom'},
    {key:'Water',label:'Water',hint:'Water bill',icon:'drop'},
    {key:'Other',label:'Other',hint:'Other utility',icon:'note'}
  ];
  const purposeKeys=new Set(PURPOSES.map(x=>x.key));

  const fmtDate=value=>{
    if(!value)return '-';
    const d=new Date(`${value}T00:00:00`);
    if(Number.isNaN(d.getTime()))return String(value);
    return d.toLocaleDateString('en-BD',{day:'numeric',month:'short',year:'numeric'});
  };
  const memberById=id=>db.members.find(m=>m.id===id)||null;
  const depositsFor=id=>db.deposits.filter(x=>x.memberId===id).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.created_at||'').localeCompare(String(a.created_at||'')));
  const initials=name=>String(name||'M').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'M';
  const avatarMarkup=member=>member?.avatar_url
    ?`<img class="mm-deposit-avatar" src="${esc(member.avatar_url)}" alt="${esc(member.name||'Member')}"/>`
    :`<span class="mm-deposit-avatar mm-deposit-avatar-fallback" aria-hidden="true">${esc(initials(member?.name))}</span>`;

  function purposeOf(row){
    if(typeof window.mmDepositPurposeOf==='function')return window.mmDepositPurposeOf(row);
    const raw=String(row?.purpose||row?.note||'').trim();
    if(purposeKeys.has(raw))return raw;
    const lower=raw.toLowerCase();
    if(lower==='gas')return'Gas';
    if(['current','electricity','electric'].includes(lower))return'Current';
    if(['wifi','wi-fi','internet'].includes(lower))return'WiFi';
    if(['bua','bua bill','maid'].includes(lower))return'Bua';
    if(lower==='water')return'Water';
    if(lower==='other')return'Other';
    return'Bazar';
  }
  const purposeMeta=row=>PURPOSES.find(x=>x.key===purposeOf(row))||PURPOSES[0];
  const purposeClass=row=>`mm-deposit-note mm-deposit-note-${purposeOf(row).toLowerCase()}`;
  const totalOf=rows=>rows.reduce((sum,row)=>sum+Number(row.amount||0),0);
  const splitTotals=rows=>{
    const bazar=totalOf(rows.filter(row=>purposeOf(row)==='Bazar'));
    const utility=totalOf(rows.filter(row=>purposeOf(row)!=='Bazar'));
    return{bazar,utility,total:bazar+utility};
  };

  function visibleMembers(){
    const depositMemberIds=new Set(db.deposits.map(x=>x.memberId));
    return db.members
      .filter(m=>m.active||depositMemberIds.has(m.id))
      .slice()
      .sort((a,b)=>Number(Boolean(b.active))-Number(Boolean(a.active))||String(a.name||'').localeCompare(String(b.name||'')));
  }

  function memberCard(member){
    const rows=depositsFor(member.id);
    const totals=splitTotals(rows);
    const latest=rows[0]?.date;
    return `<button type="button" class="mm-deposit-member-card" data-deposit-member="${esc(member.id)}">
      <span class="mm-deposit-member-main">
        ${avatarMarkup(member)}
        <span class="mm-deposit-member-copy">
          <strong>${esc(member.name||'Member')}</strong>
          <small>${rows.length} ${rows.length===1?'entry':'entries'}${latest?` · Last ${esc(fmtDate(latest))}`:''}</small>
        </span>
      </span>
      <span class="mm-deposit-member-total">
        <small>Total deposit</small>
        <strong>${money(totals.total)}</strong>
        <span class="mm-deposit-tap">Tap to view <i aria-hidden="true">›</i></span>
      </span>
    </button>`;
  }

  function renderDeposits(c){
    const controls=profile.role==='admin';
    const members=visibleMembers();
    const totals=splitTotals(db.deposits);
    c.innerHTML=`<section class="mm-deposit-page-head">
      <div>
        <span class="eyebrow">${esc(state.month)} overview</span>
        <h2>Member Deposits</h2>
        <p>Bazar এবং Utility deposit আলাদা fund হিসেবে track হবে। Member card tap করলে purpose-wise history দেখবেন।</p>
      </div>
      ${controls?'<button type="button" class="btn primary mm-deposit-add" data-deposit-add><span aria-hidden="true">+</span> Add Deposit</button>':''}
    </section>
    <section class="mm-deposit-overview" aria-label="Deposit overview">
      <div><span>Bazar Deposit</span><strong>${money(totals.bazar)}</strong></div>
      <div><span>Utility Deposit</span><strong>${money(totals.utility)}</strong></div>
      <div><span>Entries</span><strong>${db.deposits.length}</strong></div>
    </section>
    <div class="mm-deposit-member-grid">
      ${members.length?members.map(memberCard).join(''):'<div class="mm-deposit-empty">No members available.</div>'}
    </div>`;

    c.querySelector('[data-deposit-add]')?.addEventListener('click',()=>openDepositEditor());
    c.querySelectorAll('[data-deposit-member]').forEach(card=>card.addEventListener('click',()=>openMemberLedger(card.dataset.depositMember)));
  }

  function closeLayer(id){document.getElementById(id)?.remove();}

  function transactionRow(row,controls){
    const meta=purposeMeta(row);
    return `<article class="mm-deposit-entry-row">
      <div class="mm-deposit-entry-date">
        <span class="mm-deposit-entry-calendar" aria-hidden="true"></span>
        <div><strong>${esc(fmtDate(row.date))}</strong><span class="${purposeClass(row)}"><i class="mm-deposit-purpose-icon mm-deposit-purpose-${meta.icon}" aria-hidden="true"></i>${esc(meta.label)}</span></div>
      </div>
      <div class="mm-deposit-entry-side">
        <strong class="mm-deposit-entry-amount">${money(row.amount)}</strong>
        ${controls?`<div class="mm-deposit-entry-actions"><button type="button" data-deposit-edit="${esc(row.id)}">Edit</button><button type="button" class="danger" data-deposit-delete="${esc(row.id)}">Delete</button></div>`:''}
      </div>
    </article>`;
  }

  function openMemberLedger(memberId){
    const member=memberById(memberId);
    if(!member)return;
    closeLayer('mmDepositLedgerSheet');
    const rows=depositsFor(memberId);
    const totals=splitTotals(rows);
    const controls=profile.role==='admin';
    document.body.insertAdjacentHTML('beforeend',`<div class="mm-deposit-layer" id="mmDepositLedgerSheet" role="presentation">
      <section class="mm-deposit-sheet" role="dialog" aria-modal="true" aria-label="${esc(member.name||'Member')} deposits">
        <div class="mm-deposit-sheet-handle" aria-hidden="true"></div>
        <header class="mm-deposit-sheet-head">
          <div class="mm-deposit-sheet-person">${avatarMarkup(member)}<div><small>Deposit history</small><h3>${esc(member.name||'Member')}</h3></div></div>
          <button type="button" class="mm-deposit-close" data-deposit-sheet-close aria-label="Close">×</button>
        </header>
        <div class="mm-deposit-sheet-summary">
          <div><span>Bazar Deposit</span><strong>${money(totals.bazar)}</strong></div>
          <div><span>Utility Deposit</span><strong>${money(totals.utility)}</strong></div>
          <div><span>Transactions</span><strong>${rows.length}</strong></div>
        </div>
        <div class="mm-deposit-entry-list">${rows.length?rows.map(row=>transactionRow(row,controls)).join(''):'<div class="mm-deposit-empty mm-deposit-empty-sheet">No deposit added for this member this month.</div>'}</div>
        ${controls?`<button type="button" class="btn primary mm-deposit-sheet-add" data-deposit-sheet-add>+ Add for ${esc(member.name||'Member')}</button>`:''}
      </section>
    </div>`);
    const layer=document.getElementById('mmDepositLedgerSheet');
    layer?.addEventListener('click',event=>{if(event.target===layer)closeLayer('mmDepositLedgerSheet');});
    layer?.querySelector('[data-deposit-sheet-close]')?.addEventListener('click',()=>closeLayer('mmDepositLedgerSheet'));
    layer?.querySelector('[data-deposit-sheet-add]')?.addEventListener('click',()=>{closeLayer('mmDepositLedgerSheet');openDepositEditor(null,memberId);});
    layer?.querySelectorAll('[data-deposit-edit]').forEach(btn=>btn.addEventListener('click',()=>{closeLayer('mmDepositLedgerSheet');openDepositEditor(btn.dataset.depositEdit,memberId);}));
    layer?.querySelectorAll('[data-deposit-delete]').forEach(btn=>btn.addEventListener('click',()=>openDeleteConfirm(btn.dataset.depositDelete,memberId)));
  }

  function purposeButtonLabel(purpose){
    if(!purpose)return'Select purpose';
    return PURPOSES.find(x=>x.key===purpose)?.label||purpose;
  }

  function openPurposePicker(selected,onPick){
    closeLayer('mmDepositPurposeSheet');
    document.body.insertAdjacentHTML('beforeend',`<div class="mm-deposit-purpose-layer" id="mmDepositPurposeSheet">
      <section class="mm-deposit-purpose-sheet" role="dialog" aria-modal="true" aria-label="Choose deposit purpose">
        <div class="mm-deposit-sheet-handle" aria-hidden="true"></div>
        <header><div><small>Purpose</small><h3>Select purpose</h3></div><button type="button" class="mm-deposit-close" data-purpose-close aria-label="Close">×</button></header>
        <div class="mm-deposit-purpose-grid">${PURPOSES.map(item=>`<button type="button" class="mm-deposit-purpose-option ${selected===item.key?'selected':''}" data-purpose="${item.key}"><i class="mm-deposit-purpose-icon mm-deposit-purpose-${item.icon}" aria-hidden="true"></i><span><strong>${item.label}</strong><small>${item.hint}</small></span><b aria-hidden="true">✓</b></button>`).join('')}</div>
      </section>
    </div>`);
    const layer=document.getElementById('mmDepositPurposeSheet');
    const close=()=>closeLayer('mmDepositPurposeSheet');
    layer?.addEventListener('click',event=>{if(event.target===layer)close();});
    layer?.querySelector('[data-purpose-close]')?.addEventListener('click',close);
    layer?.querySelectorAll('[data-purpose]').forEach(btn=>btn.addEventListener('click',()=>{onPick(btn.dataset.purpose);close();}));
  }

  function openDepositEditor(id=null,preferredMemberId=null){
    if(profile.role!=='admin')return;
    const existing=id?db.deposits.find(row=>row.id===id):null;
    const defaultMember=existing?.memberId||preferredMemberId||activeMembers()[0]?.id||'';
    const selectedPurpose=existing?purposeOf(existing):'';
    closeModal();
    modal(`<div class="mm-deposit-editor-head"><div><span class="eyebrow">${id?'Update entry':'New entry'}</span><h2>${id?'Edit':'Add'} Deposit</h2></div><button type="button" class="mm-deposit-close" data-close aria-label="Close">×</button></div>
      <form id="mmDepositForm" class="mm-deposit-editor-form">
        <div class="mm-deposit-field-grid">
          <label class="mm-deposit-field"><span>Member</span><select name="member_id" required>${activeMembers().map(member=>`<option value="${esc(member.id)}" ${member.id===defaultMember?'selected':''}>${esc(member.name)}</option>`).join('')}</select></label>
          <label class="mm-deposit-field"><span>Date</span><input name="deposit_date" type="date" value="${esc(existing?.date||today())}" required></label>
        </div>
        <label class="mm-deposit-field mm-deposit-amount-field"><span>Amount</span><div class="mm-deposit-amount-input"><b aria-hidden="true">৳</b><input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" value="${esc(existing?.amount??'')}" placeholder="0" required></div></label>
        <div class="mm-deposit-field"><span>Purpose</span><button type="button" class="mm-deposit-note-picker" id="mmDepositNotePicker"><i class="mm-deposit-purpose-icon mm-deposit-purpose-${esc(PURPOSES.find(x=>x.key===selectedPurpose)?.icon||'note')}" aria-hidden="true"></i><span><small>Select purpose</small><strong data-purpose-label>${esc(purposeButtonLabel(selectedPurpose))}</strong></span><b aria-hidden="true">›</b></button><input type="hidden" name="purpose" value="${esc(selectedPurpose)}"></div>
        <div class="mm-deposit-editor-actions"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn primary">${id?'Save Changes':'Add Deposit'}</button></div>
      </form>`);
    const wrap=document.getElementById('modal');
    const modalEl=wrap?.querySelector('.modal');
    wrap?.classList.add('mm-deposit-editor-wrap');
    modalEl?.classList.add('mm-deposit-editor');
    const form=document.getElementById('mmDepositForm');
    const picker=document.getElementById('mmDepositNotePicker');
    const hidden=form?.querySelector('[name=purpose]');
    const label=form?.querySelector('[data-purpose-label]');

    form?.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',closeModal));
    picker?.addEventListener('click',()=>openPurposePicker(hidden?.value||'',purpose=>{
      if(hidden)hidden.value=purpose;
      if(label)label.textContent=purposeButtonLabel(purpose);
      const icon=picker.querySelector('.mm-deposit-purpose-icon');
      if(icon)icon.className=`mm-deposit-purpose-icon mm-deposit-purpose-${PURPOSES.find(x=>x.key===purpose)?.icon||'note'}`;
    }));

    form?.addEventListener('submit',async event=>{
      event.preventDefault();
      const fd=new FormData(form);
      const purpose=String(fd.get('purpose')||'').trim();
      if(!purposeKeys.has(purpose)){notify('Please select a purpose.');return;}
      const payload={
        mess_id:profile.mess_id,
        member_id:String(fd.get('member_id')||''),
        deposit_date:String(fd.get('deposit_date')||''),
        amount:Number(fd.get('amount')||0),
        purpose,
        note:purpose
      };
      if(!payload.member_id||!payload.deposit_date||!(payload.amount>0)){notify('Member, date and valid amount are required.');return;}
      await persist('deposits',id,payload,'deposit');
    });
  }

  function openDeleteConfirm(id){
    closeLayer('mmDepositDeleteConfirm');
    const row=db.deposits.find(x=>x.id===id);
    if(!row)return;
    document.body.insertAdjacentHTML('beforeend',`<div class="mm-deposit-confirm-layer" id="mmDepositDeleteConfirm"><section class="mm-deposit-confirm" role="alertdialog" aria-modal="true"><span class="mm-deposit-confirm-icon" aria-hidden="true"></span><h3>Delete this deposit?</h3><p>${esc(fmtDate(row.date))} · ${money(row.amount)} · ${esc(purposeMeta(row).label)}</p><div><button type="button" class="btn" data-delete-cancel>Cancel</button><button type="button" class="btn danger" data-delete-confirm>Delete</button></div></section></div>`);
    const layer=document.getElementById('mmDepositDeleteConfirm');
    layer?.querySelector('[data-delete-cancel]')?.addEventListener('click',()=>closeLayer('mmDepositDeleteConfirm'));
    layer?.querySelector('[data-delete-confirm]')?.addEventListener('click',async()=>{
      await run(async()=>{
        assertResult(await client.from('deposits').delete().eq('id',id));
        await logActivity('delete','deposit',id);
        closeLayer('mmDepositDeleteConfirm');
        closeLayer('mmDepositLedgerSheet');
        await loadData();
        render();
      },'Deposit deleted.');
    });
  }

  window.openMemberDepositLedger=openMemberLedger;
  window.openDepositEditor=openDepositEditor;
  window.deposits=renderDeposits;
  window.depositModal=openDepositEditor;
  try{deposits=renderDeposits;depositModal=openDepositEditor;}catch(_){/* window assignments above are enough in browsers */}
})();
