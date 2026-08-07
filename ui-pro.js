/* Professional mobile UI + guided bazar entry for Mess Manager. */
'use strict';
(() => {
  const BAZAR_PRESETS = {
    'চাল': { item: 'চাল', unit: 'kg' },
    'ডাল': { item: 'ডাল', unit: 'kg' },
    'তেল': { item: 'তেল', unit: 'L' },
    'মুরগি': { item: 'মুরগি', unit: 'kg' },
    'মাছ': { item: 'মাছ', unit: 'kg' },
    'ডিম': { item: 'ডিম', unit: 'হালি' },
    'কাঁচাবাজার': { item: '', unit: 'kg' },
    'অন্যান্য': { item: '', unit: 'pcs' }
  };

  const KACHA_ITEMS = [
    ['আলু','kg'],['পেঁয়াজ','kg'],['রসুন','kg'],['আদা','kg'],['টমেটো','kg'],
    ['কাঁচামরিচ','kg'],['বেগুন','kg'],['শসা','kg'],['পটল','kg'],['লাউ','pcs'],
    ['কুমড়া','kg'],['ঢেঁড়স','kg'],['করলা','kg'],['পেঁপে','kg'],['ফুলকপি','pcs'],
    ['বাঁধাকপি','pcs'],['শিম','kg'],['গাজর','kg'],['লেবু','pcs'],['ধনেপাতা','আঁটি'],
    ['পালং শাক','আঁটি'],['লাল শাক','আঁটি'],['পুঁই শাক','আঁটি']
  ];

  function icon(name) {
    const icons = {
      dashboard:'⌂', members:'♙', meals:'◉', bazar:'▣', deposits:'৳', utilities:'⌁',
      schedule:'◷', settlement:'✓', reports:'▤', activity:'↻', settings:'⚙', more:'•••'
    };
    return icons[name] || '•';
  }

  function desktopNav() {
    const all=[['dashboard','Dashboard'],['members','Members'],['meals','Meal'],['bazar','Bazar'],['deposits','Deposit'],['utilities','Bills'],['schedule','Schedule'],['settlement','Settlement'],['reports','Reports'],['activity','Activity'],['settings','Settings']];
    const allowed = profile.role === 'admin' ? all : all.filter(([k]) => !adminPages.has(k));
    return allowed.map(([k,l])=>`<button class="${state.page===k?'active':''}" data-page="${k}"><span class="nav-ico">${icon(k)}</span><span>${l}</span></button>`).join('');
  }

  function mobileNav() {
    const main = [['dashboard','Home'],['members','Members'],['meals','Meal'],['bazar','Bazar']];
    const activeMore = ['deposits','utilities','schedule','settlement','reports','activity','settings'].includes(state.page);
    return `${main.map(([k,l])=>`<button class="${state.page===k?'active':''}" data-page="${k}"><span class="mobile-ico">${icon(k)}</span><span>${l}</span></button>`).join('')}<button class="${activeMore?'active':''}" id="mobileMore"><span class="mobile-ico">${icon('more')}</span><span>More</span></button>`;
  }

  function openMoreSheet() {
    document.querySelector('#moreSheet')?.remove();
    const items = [['deposits','Deposit'],['utilities','Bills'],['schedule','Schedule'],['settlement','Settlement'],['reports','Reports']];
    if(profile.role === 'admin') items.push(['activity','Activity'],['settings','Settings']);
    document.body.insertAdjacentHTML('beforeend', `<div class="sheet-backdrop" id="moreSheet"><div class="action-sheet"><div class="sheet-handle"></div><div class="sheet-title">More</div><div class="sheet-grid">${items.map(([k,l])=>`<button data-sheet-page="${k}"><span>${icon(k)}</span><b>${l}</b></button>`).join('')}</div><button class="sheet-logout" id="sheetLogout">Logout</button></div></div>`);
    $('#moreSheet').addEventListener('click', e => { if(e.target.id === 'moreSheet') $('#moreSheet').remove(); });
    document.querySelectorAll('[data-sheet-page]').forEach(b=>b.onclick=()=>{ $('#moreSheet').remove(); go(b.dataset.sheetPage); });
    $('#sheetLogout').onclick=()=>client.auth.signOut();
  }

  window.render = function renderPro() {
    if(!configured) return renderSetup();
    if(!session || !profile) return renderLogin();
    $('#app').innerHTML=`<div class="layout"><aside class="sidebar"><div class="brand"><span class="brand-mark">M</span><div><strong>Mess Manager</strong><small>${esc(mess.name)}</small></div></div><nav class="nav" aria-label="Main navigation">${desktopNav()}</nav><div class="sidebar-foot"><div class="sidebar-user"><div class="avatar">${esc((profile.name||'M')[0].toUpperCase())}</div><div><b>${esc(profile.name)}</b><small>${esc(profile.role)}</small></div></div><button class="btn" id="logout">Logout</button></div></aside><main class="main"><header class="topbar"><div class="page-heading"><span class="eyebrow">${esc(mess.name)}</span><h1>${pageTitle()}</h1></div><div class="top-actions"><input id="month" type="month" value="${state.month}"/><span class="badge">${esc(profile.name)} · ${esc(profile.role)}</span></div></header><div id="content"></div></main><nav class="mobilebar" aria-label="Mobile navigation">${mobileNav()}</nav></div>`;
    document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.page)));
    $('#logout')?.addEventListener('click',()=>client.auth.signOut());
    $('#mobileMore')?.addEventListener('click',openMoreSheet);
    $('#month').addEventListener('change', async e=>{state.month=e.target.value; await run(async()=>{await loadData(); render();});});
    renderPage();
  };

  window.settlementTable = function settlementTablePro(calc) {
    const rows = calc.map(x=>`<tr><td><b>${esc(x.member.name)}</b></td><td>${x.units}</td><td>${money(x.deposit)}</td><td>${money(x.food)}</td><td>${money(x.util)}</td><td>${money(x.total)}</td><td>${x.balance>=0?`<span class="pill advance">Advance ${money(x.balance)}</span>`:`<span class="pill due">Due ${money(-x.balance)}</span>`}</td></tr>`).join('');
    const cards = calc.map(x=>`<article class="member-summary-card"><div class="member-summary-head"><div class="avatar small">${esc((x.member.name||'M')[0].toUpperCase())}</div><div><b>${esc(x.member.name)}</b><small>${x.units} meal units</small></div>${x.balance>=0?`<span class="pill advance">+${money(x.balance)}</span>`:`<span class="pill due">-${money(-x.balance)}</span>`}</div><div class="member-summary-grid"><div><span>Deposit</span><b>${money(x.deposit)}</b></div><div><span>Food</span><b>${money(x.food)}</b></div><div><span>Utility</span><b>${money(x.util)}</b></div><div><span>Total Bill</span><b>${money(x.total)}</b></div></div></article>`).join('');
    return `<div class="desktop-summary table-wrap"><table><thead><tr><th>Member</th><th>Meals</th><th>Deposit</th><th>Food</th><th>Utility</th><th>Total Bill</th><th>Due/Advance</th></tr></thead><tbody>${rows||'<tr><td colspan="7" class="empty">No data</td></tr>'}</tbody></table></div><div class="mobile-summary">${cards||'<div class="card empty">No data</div>'}</div>`;
  };

  window.dashboard = function dashboardPro(c) {
    const calc=calcMonth();
    const bazarTotal=db.bazar.reduce((s,x)=>s+Number(x.amount),0);
    const dep=calc.reduce((s,x)=>s+x.deposit,0);
    const util=db.utilities.reduce((s,x)=>s+Number(x.amount),0);
    const due=calc.reduce((s,x)=>s+Math.max(0,-x.balance),0);
    c.innerHTML=`<section class="kpis"><article class="kpi card"><span class="kpi-icon">▣</span><div><div class="label">মোট বাজার</div><div class="value">${money(bazarTotal)}</div></div></article><article class="kpi card"><span class="kpi-icon">৳</span><div><div class="label">মোট জমা</div><div class="value">${money(dep)}</div></div></article><article class="kpi card"><span class="kpi-icon">⌁</span><div><div class="label">Utility Bills</div><div class="value">${money(util)}</div></div></article><article class="kpi card"><span class="kpi-icon">!</span><div><div class="label">মোট Due</div><div class="value">${money(due)}</div></div></article></section><div class="section-head"><div><span class="eyebrow">This month</span><h2>Member Summary</h2></div></div>${settlementTable(calc)}`;
  };

  function categoryButtons(selected) {
    return Object.keys(BAZAR_PRESETS).map(c=>`<button type="button" class="choice-chip ${selected===c?'selected':''}" data-category="${c}">${c}</button>`).join('');
  }

  function kachaButtons(selected) {
    return KACHA_ITEMS.map(([name,unit])=>`<button type="button" class="choice-chip ${selected===name?'selected':''}" data-kacha="${name}" data-unit="${unit}">${name}</button>`).join('');
  }

  function bazarItemRowPro(item={item_name:'',category:'চাল',quantity:1,unit:'kg',unit_price:''}) {
    const category = item.category && BAZAR_PRESETS[item.category] ? item.category : (item.category === 'Vegetable' ? 'কাঁচাবাজার' : 'অন্যান্য');
    const preset = BAZAR_PRESETS[category];
    const itemName = item.item_name || preset.item;
    const unit = item.unit || preset.unit;
    return `<div class="bazar-item pro-item" data-category-value="${esc(category)}"><div class="item-card-head"><div><span class="item-no">Item</span><b data-item-title>${esc(itemName || category)}</b></div><button class="icon-btn danger" type="button" data-remove-item aria-label="Remove item">×</button></div><div class="field"><label>Category</label><button class="select-button" type="button" data-open-category><span data-category-label>${esc(category)}</span><span>⌄</span></button></div><div class="kacha-zone ${category==='কাঁচাবাজার'?'':'hidden'}"><div class="field"><label>কাঁচাবাজার item</label><button class="select-button" type="button" data-open-kacha><span data-kacha-label>${esc(itemName || 'Item বাছাই করুন')}</span><span>⌄</span></button></div></div><div class="other-zone ${category==='অন্যান্য'?'':'hidden'}"><div class="field"><label>Item name</label><input name="item_name_custom" value="${category==='অন্যান্য'?esc(itemName):''}" placeholder="Item লিখুন" maxlength="160"/></div></div><input type="hidden" name="item_name" value="${esc(itemName)}"/><input type="hidden" name="category" value="${esc(category)}"/><div class="item-money-grid"><div class="field"><label>Quantity</label><input name="quantity" type="number" min="0.001" step="0.001" value="${esc(item.quantity ?? 1)}" required/></div><div class="field"><label>Unit</label><input name="unit" value="${esc(unit)}" readonly/></div><div class="field rate-field"><label data-rate-label>দর (৳/${esc(unit)})</label><input name="unit_price" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(item.unit_price ?? '')}" placeholder="0" required/></div><div class="line-total"><span>Total</span><b data-item-total>${money(item.total ?? Number(item.quantity||0)*Number(item.unit_price||0))}</b></div></div></div>`;
  }

  function openChoiceSheet(title, body, onBind) {
    document.querySelector('#choiceSheet')?.remove();
    document.body.insertAdjacentHTML('beforeend', `<div class="sheet-backdrop" id="choiceSheet"><div class="action-sheet choice-sheet"><div class="sheet-handle"></div><div class="sheet-title">${esc(title)}</div><div class="choice-grid">${body}</div></div></div>`);
    $('#choiceSheet').onclick=e=>{if(e.target.id==='choiceSheet')$('#choiceSheet').remove();};
    onBind();
  }

  function bindItemRow(row, updateTotal) {
    const categoryInput=row.querySelector('[name=category]');
    const itemInput=row.querySelector('[name=item_name]');
    const unitInput=row.querySelector('[name=unit]');
    const title=row.querySelector('[data-item-title]');
    const categoryLabel=row.querySelector('[data-category-label]');
    const kachaZone=row.querySelector('.kacha-zone');
    const otherZone=row.querySelector('.other-zone');
    const kachaLabel=row.querySelector('[data-kacha-label]');
    const customInput=row.querySelector('[name=item_name_custom]');
    const rateLabel=row.querySelector('[data-rate-label]');

    const applyUnit=(unit)=>{unitInput.value=unit;rateLabel.textContent=`দর (৳/${unit})`;};
    const applyCategory=(category)=>{
      const preset=BAZAR_PRESETS[category];
      categoryInput.value=category;row.dataset.categoryValue=category;categoryLabel.textContent=category;
      kachaZone.classList.toggle('hidden',category!=='কাঁচাবাজার');
      otherZone.classList.toggle('hidden',category!=='অন্যান্য');
      if(category!=='কাঁচাবাজার'&&category!=='অন্যান্য'){itemInput.value=preset.item;title.textContent=preset.item;applyUnit(preset.unit);}
      if(category==='কাঁচাবাজার'){itemInput.value='';kachaLabel.textContent='Item বাছাই করুন';title.textContent='কাঁচাবাজার';applyUnit('kg');}
      if(category==='অন্যান্য'){itemInput.value=customInput.value.trim();title.textContent=customInput.value.trim()||'অন্যান্য';applyUnit('pcs');}
      updateTotal();
    };

    row.querySelector('[data-open-category]').onclick=()=>openChoiceSheet('Category বাছাই করুন',categoryButtons(categoryInput.value),()=>document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{applyCategory(b.dataset.category);$('#choiceSheet').remove();}));
    row.querySelector('[data-open-kacha]').onclick=()=>openChoiceSheet('কাঁচাবাজার item',kachaButtons(itemInput.value),()=>document.querySelectorAll('[data-kacha]').forEach(b=>b.onclick=()=>{itemInput.value=b.dataset.kacha;kachaLabel.textContent=b.dataset.kacha;title.textContent=b.dataset.kacha;applyUnit(b.dataset.unit);$('#choiceSheet').remove();updateTotal();}));
    customInput.addEventListener('input',()=>{if(categoryInput.value==='অন্যান্য'){itemInput.value=customInput.value.trim();title.textContent=customInput.value.trim()||'অন্যান্য';}});
    row.querySelector('[data-remove-item]').onclick=()=>{if(row.parentElement.children.length>1){row.remove();updateTotal();}};
    row.querySelectorAll('input').forEach(i=>i.addEventListener('input',updateTotal));
  }

  window.bazarItemsTable = function bazarItemsTablePro(items) {
    if(!items.length) return '<div class="empty">No items</div>';
    return `<div class="bazar-read-list">${items.map(item=>`<div class="bazar-read-row"><div><b>${esc(item.item_name)}</b><span>${esc(item.category||'')} · ${esc(item.quantity)} ${esc(item.unit)}</span></div><div><span>${money(item.unit_price)}/${esc(item.unit)}</span><b>${money(item.total ?? Number(item.quantity)*Number(item.unit_price))}</b></div></div>`).join('')}</div>`;
  };

  window.bazar = function bazarPro(c) {
    const controls=profile.role==='admin';
    c.innerHTML=`<div class="section-head"><div><span class="eyebrow">Shared expense sheet</span><h2>Bazar</h2></div>${controls?'<button class="btn primary add-bazar" data-add>+ Add Bazar</button>':''}</div><div class="bazar-entry-list">${db.bazar.map(entry=>`<article class="card bazar-entry"><div class="bazar-entry-head"><div><span>${esc(entry.date)}</span><h3>${esc(memberName(entry.buyer_member_id))}</h3>${entry.note?`<p>${esc(entry.note)}</p>`:''}</div><div class="entry-total"><span>Total</span><b>${money(entry.amount)}</b></div></div>${bazarItemsTable(entry.items)}${controls?`<div class="entry-actions"><button class="btn" data-edit="${entry.id}">Edit</button><button class="btn danger" data-delete="${entry.id}" data-kind="bazar">Delete</button></div>`:''}</article>`).join('')||'<div class="card empty">No bazar entries</div>'}</div>`;
    if(controls)bindCrud(c,'bazar',bazarModal);
  };

  window.bazarModal = function bazarModalPro(id) {
    const x=db.bazar.find(z=>z.id===id)||{date:today(),buyer_member_id:activeMembers()[0]?.id,note:'',items:[{category:'চাল',item_name:'চাল',quantity:1,unit:'kg',unit_price:''}]};
    modal(`<div class="modal-title"><div><span class="eyebrow">Admin entry</span><h2>${id?'Edit':'Add'} Bazar</h2></div><button type="button" class="icon-btn" data-close>×</button></div><form id="bazarForm"><div class="bazar-meta"><div class="field"><label>Date</label><input name="entry_date" type="date" value="${x.date}" required/></div><div class="field"><label>Buyer</label><select name="buyer_member_id" required>${activeMembers().map(m=>`<option value="${m.id}" ${x.buyer_member_id===m.id?'selected':''}>${esc(m.name)}</option>`).join('')}</select></div><div class="field note-field"><label>Note (optional)</label><input name="note" value="${esc(x.note||'')}" maxlength="2000" placeholder="আজকের বাজার সম্পর্কে note"/></div></div><div class="items-title"><div><b>Bazar items</b><span>Category বাছাই করলে unit automatic হবে</span></div><button class="btn" type="button" id="addBazarItem">+ Add item</button></div><div id="bazarItems">${(x.items.length?x.items:[{}]).map(bazarItemRowPro).join('')}</div><div class="bazar-footer"><div><span>Grand total</span><b id="bazarTotal">৳0</b></div><button class="btn primary save-bazar" type="submit">Save Bazar</button></div></form>`);
    const items=$('#bazarItems');
    const updateTotal=()=>{let grand=0;items.querySelectorAll('.bazar-item').forEach(row=>{const total=Number(row.querySelector('[name=quantity]').value||0)*Number(row.querySelector('[name=unit_price]').value||0);row.querySelector('[data-item-total]').textContent=money(total);grand+=total;});$('#bazarTotal').textContent=money(grand);};
    [...items.children].forEach(row=>bindItemRow(row,updateTotal));
    $('#addBazarItem').onclick=()=>{items.insertAdjacentHTML('beforeend',bazarItemRowPro());bindItemRow(items.lastElementChild,updateTotal);updateTotal();};
    $('[data-close]').onclick=closeModal;
    updateTotal();
    $('#bazarForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const rows=[...items.querySelectorAll('.bazar-item')].map(row=>({item_name:row.querySelector('[name=item_name]').value.trim(),category:row.querySelector('[name=category]').value.trim(),quantity:Number(row.querySelector('[name=quantity]').value),unit:row.querySelector('[name=unit]').value.trim(),unit_price:Number(row.querySelector('[name=unit_price]').value)}));if(rows.some(r=>!r.item_name))return notify('প্রতিটি item বাছাই বা লিখুন।');await run(async()=>{const entryId=assertResult(await client.rpc('save_bazar_entry',{p_entry_id:id||null,p_entry_date:f.get('entry_date'),p_buyer_member_id:f.get('buyer_member_id'),p_note:f.get('note').trim(),p_items:rows}));await logActivity(id?'update':'create','bazar',entryId);closeModal();await loadData();render();},'Bazar saved.');};
  };
})();
