/* Final Bazar flow: multi-select fresh market, quantity + total only, compact cards. */
'use strict';
(() => {
  const PRESETS={
    'চাল':{item:'চাল',unit:'kg'},'ডাল':{item:'ডাল',unit:'kg'},'তেল':{item:'তেল',unit:'L'},
    'মুরগি':{item:'মুরগি',unit:'kg'},'মাছ':{item:'মাছ',unit:'kg'},'ডিম':{item:'ডিম',unit:'হালি'},
    'কাঁচাবাজার':{item:'',unit:'kg'},'অন্যান্য':{item:'',unit:'pcs'}
  };
  const FRESH=[
    ['আলু','kg'],['পেঁয়াজ','kg'],['রসুন','kg'],['আদা','kg'],['টমেটো','kg'],['কাঁচামরিচ','kg'],
    ['বেগুন','kg'],['শসা','kg'],['পটল','kg'],['লাউ','pcs'],['কুমড়া','kg'],['ঢেঁড়স','kg'],
    ['করলা','kg'],['পেঁপে','kg'],['ফুলকপি','pcs'],['বাঁধাকপি','pcs'],['শিম','kg'],['গাজর','kg'],
    ['লেবু','pcs'],['ধনেপাতা','আঁটি'],['পালং শাক','আঁটি'],['লাল শাক','আঁটি'],['পুঁই শাক','আঁটি']
  ];
  const normalizeCategory=item=>item?.category==='Vegetable'?'কাঁচাবাজার':(PRESETS[item?.category]?item.category:'অন্যান্য');
  const itemTotal=item=>Number(item?.total ?? (Number(item?.quantity||0)*Number(item?.unit_price||0)) || 0);

  function rowHtml(item={}){
    const category=normalizeCategory(item);
    const preset=PRESETS[category];
    const name=item.item_name || preset.item || '';
    const quantity=Number(item.quantity||1);
    const total=itemTotal(item);
    const unit=item.unit || preset.unit || 'pcs';
    return `<article class="bazar-form-item" data-bazar-row>
      <div class="bazar-form-item-head"><div><small>Item</small><b data-title>${esc(name||category)}</b></div><button type="button" class="mini-remove" data-remove>×</button></div>
      <div class="field"><label>Category</label><button type="button" class="clean-select" data-category-button><span data-category-label>${esc(category)}</span><span>⌄</span></button></div>
      <div class="fresh-picker ${category==='কাঁচাবাজার'?'':'hidden'}"><div class="field"><label>Items</label><button type="button" class="clean-select multi-select-trigger" data-fresh-button><span data-fresh-label>${esc(name||'এক বা একাধিক item বাছাই করুন')}</span><span>+</span></button></div></div>
      <div class="custom-picker ${category==='অন্যান্য'?'':'hidden'}"><div class="field"><label>Item name</label><input name="custom_name" value="${category==='অন্যান্য'?esc(name):''}" placeholder="Item লিখুন"/></div></div>
      <input type="hidden" name="item_name" value="${esc(name)}"/>
      <input type="hidden" name="category" value="${esc(category)}"/>
      <input type="hidden" name="unit" value="${esc(unit)}"/>
      <div class="bazar-money-grid">
        <div class="field"><label>Quantity</label><input name="quantity" type="number" min="0.001" step="0.001" value="${esc(quantity)}" required/></div>
        <div class="field"><label>Total price (৳)</label><input name="total_price" type="number" min="0" step="0.01" value="${esc(total||'')}" placeholder="0" required/></div>
      </div>
    </article>`;
  }

  function categorySheet(row,refresh){
    document.querySelector('#choiceSheet')?.remove();
    const current=row.querySelector('[name=category]').value;
    document.body.insertAdjacentHTML('beforeend',`<div class="sheet-backdrop" id="choiceSheet"><div class="action-sheet compact-choice-sheet"><div class="sheet-handle"></div><div class="sheet-title">Category</div><div class="choice-grid">${Object.keys(PRESETS).map(c=>`<button type="button" class="choice-chip ${c===current?'selected':''}" data-cat="${c}">${c}</button>`).join('')}</div></div></div>`);
    const sheet=$('#choiceSheet');
    sheet.onclick=e=>{if(e.target===sheet)sheet.remove();};
    sheet.querySelectorAll('[data-cat]').forEach(btn=>btn.onclick=()=>{
      const c=btn.dataset.cat,p=PRESETS[c],cat=row.querySelector('[name=category]'),name=row.querySelector('[name=item_name]'),unit=row.querySelector('[name=unit]');
      cat.value=c;row.querySelector('[data-category-label]').textContent=c;
      row.querySelector('.fresh-picker').classList.toggle('hidden',c!=='কাঁচাবাজার');
      row.querySelector('.custom-picker').classList.toggle('hidden',c!=='অন্যান্য');
      if(c!=='কাঁচাবাজার'&&c!=='অন্যান্য'){name.value=p.item;unit.value=p.unit;row.querySelector('[data-title]').textContent=p.item;}
      if(c==='কাঁচাবাজার'){name.value='';unit.value='kg';row.querySelector('[data-title]').textContent='কাঁচাবাজার';row.querySelector('[data-fresh-label]').textContent='এক বা একাধিক item বাছাই করুন';}
      if(c==='অন্যান্য'){const custom=row.querySelector('[name=custom_name]').value.trim();name.value=custom;unit.value='pcs';row.querySelector('[data-title]').textContent=custom||'অন্যান্য';}
      sheet.remove();refresh();
    });
  }

  function freshSheet(row,items,bindRow,refresh){
    document.querySelector('#choiceSheet')?.remove();
    const selected=new Set();
    document.body.insertAdjacentHTML('beforeend',`<div class="sheet-backdrop" id="choiceSheet"><div class="action-sheet fresh-multi-sheet"><div class="sheet-handle"></div><div class="sheet-title">কাঁচাবাজার items</div><p class="sheet-help">একসাথে যতগুলো দরকার select করুন</p><div class="choice-grid fresh-choice-grid">${FRESH.map(([name,unit])=>`<button type="button" class="choice-chip" data-fresh-name="${esc(name)}" data-fresh-unit="${esc(unit)}">${esc(name)}</button>`).join('')}</div><button type="button" class="btn primary add-selected-fresh" data-add-selected disabled>Add selected</button></div></div>`);
    const sheet=$('#choiceSheet'),add=sheet.querySelector('[data-add-selected]');
    sheet.onclick=e=>{if(e.target===sheet)sheet.remove();};
    sheet.querySelectorAll('[data-fresh-name]').forEach(btn=>btn.onclick=()=>{const key=btn.dataset.freshName;if(selected.has(key)){selected.delete(key);btn.classList.remove('selected');}else{selected.add(key);btn.classList.add('selected');}add.disabled=!selected.size;});
    add.onclick=()=>{
      const picked=FRESH.filter(([name])=>selected.has(name));if(!picked.length)return;
      const first=picked.shift();
      const apply=(target,[name,unit])=>{target.querySelector('[name=category]').value='কাঁচাবাজার';target.querySelector('[data-category-label]').textContent='কাঁচাবাজার';target.querySelector('[name=item_name]').value=name;target.querySelector('[name=unit]').value=unit;target.querySelector('[data-title]').textContent=name;target.querySelector('[data-fresh-label]').textContent=name;target.querySelector('.fresh-picker').classList.remove('hidden');target.querySelector('.custom-picker').classList.add('hidden');};
      apply(row,first);
      picked.forEach(pair=>{items.insertAdjacentHTML('beforeend',rowHtml({category:'কাঁচাবাজার',item_name:pair[0],unit:pair[1],quantity:1,total:0}));const r=items.lastElementChild;bindRow(r);});
      sheet.remove();refresh();
    };
  }

  function bindBazarRow(row,items,refresh){
    row.querySelector('[data-category-button]').onclick=()=>categorySheet(row,refresh);
    row.querySelector('[data-fresh-button]').onclick=()=>freshSheet(row,items,r=>bindBazarRow(r,items,refresh),refresh);
    const custom=row.querySelector('[name=custom_name]');
    if(custom)custom.oninput=()=>{if(row.querySelector('[name=category]').value==='অন্যান্য'){const v=custom.value.trim();row.querySelector('[name=item_name]').value=v;row.querySelector('[data-title]').textContent=v||'অন্যান্য';}};
    row.querySelector('[data-remove]').onclick=()=>{if(items.children.length>1){row.remove();refresh();}};
    row.querySelectorAll('input').forEach(input=>input.addEventListener('input',refresh));
  }

  function renderBazar(c){
    const controls=profile.role==='admin';
    c.innerHTML=`<div class="section-head clean-section-head"><h2>Bazar</h2>${controls?'<button class="btn primary" data-add>+ Add Bazar</button>':''}</div><div class="bazar-entry-list">${db.bazar.map(entry=>`<article class="card bazar-entry final-bazar-card"><div class="bazar-entry-head"><div><span>${esc(entry.date)}</span><h3>${esc(memberName(entry.buyer_member_id))}</h3></div><div class="entry-total"><span>Total</span><b>${money(entry.amount)}</b></div></div><div class="bazar-read-list">${(entry.items||[]).map(item=>`<div class="bazar-read-row final-bazar-row"><div><b>${esc(item.item_name)}</b><span>Quantity ${esc(item.quantity)}</span></div><strong>${money(itemTotal(item))}</strong></div>`).join('')}</div>${controls?`<div class="entry-actions"><button class="btn" data-edit="${entry.id}">Edit</button><button class="btn danger" data-delete="${entry.id}" data-kind="bazar">Delete</button></div>`:''}</article>`).join('')||'<div class="card empty">No bazar entries</div>'}</div>`;
    if(controls){
      c.querySelector('[data-add]').onclick=()=>window.bazarModal();
      c.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>window.bazarModal(b.dataset.edit));
      if(typeof bindCrud==='function')bindCrud(c,'bazar',window.bazarModal);
    }
  }

  window.bazar=renderBazar;
  window.bazarModal=function finalBazarModal(id){
    const x=db.bazar.find(z=>z.id===id)||{date:today(),buyer_member_id:activeMembers()[0]?.id,note:'',items:[{category:'চাল',item_name:'চাল',quantity:1,unit:'kg',total:0}]};
    modal(`<div class="modal-title final-bazar-modal-title"><h2>${id?'Edit':'Add'} Bazar</h2><button class="icon-btn" data-close>×</button></div><form id="bazarForm" class="final-bazar-form"><div class="bazar-meta final-bazar-meta"><div class="field"><label>Date</label><input name="entry_date" type="date" value="${esc(x.date)}" required/></div><div class="field"><label>Buyer</label><select name="buyer_member_id" required>${activeMembers().map(m=>`<option value="${m.id}" ${x.buyer_member_id===m.id?'selected':''}>${esc(m.name)}</option>`).join('')}</select></div><div class="field note-field"><label>Note</label><input name="note" value="${esc(x.note||'')}" placeholder="Optional"/></div></div><div class="items-title final-items-title"><b>Items</b><button class="btn" type="button" id="addBazarItem">+ Add item</button></div><div id="bazarItems">${(x.items?.length?x.items:[{}]).map(rowHtml).join('')}</div><div class="bazar-footer final-bazar-footer"><div><span>Grand total</span><b id="bazarTotal">৳0</b></div><button class="btn primary" type="submit">Save Bazar</button></div></form>`);
    const items=$('#bazarItems');
    const refresh=()=>{let total=0;items.querySelectorAll('[data-bazar-row]').forEach(r=>{total+=Number(r.querySelector('[name=total_price]').value||0);});$('#bazarTotal').textContent=money(total);};
    [...items.children].forEach(r=>bindBazarRow(r,items,refresh));
    $('#addBazarItem').onclick=()=>{items.insertAdjacentHTML('beforeend',rowHtml({category:'চাল',item_name:'চাল',quantity:1,unit:'kg',total:0}));bindBazarRow(items.lastElementChild,items,refresh);refresh();};
    $('[data-close]').onclick=closeModal;refresh();
    $('#bazarForm').onsubmit=async e=>{
      e.preventDefault();
      const f=new FormData(e.target);
      const rows=[...items.querySelectorAll('[data-bazar-row]')].map(r=>{
        const quantity=Math.max(Number(r.querySelector('[name=quantity]').value||0),0.001);
        const total=Math.max(Number(r.querySelector('[name=total_price]').value||0),0);
        return {item_name:r.querySelector('[name=item_name]').value.trim(),category:r.querySelector('[name=category]').value.trim(),quantity,unit:r.querySelector('[name=unit]').value.trim()||'pcs',unit_price:total/quantity};
      });
      if(rows.some(r=>!r.item_name))return notify('প্রতিটি item বাছাই বা লিখুন।');
      await run(async()=>{const entryId=assertResult(await client.rpc('save_bazar_entry',{p_entry_id:id||null,p_entry_date:f.get('entry_date'),p_buyer_member_id:f.get('buyer_member_id'),p_note:f.get('note').trim(),p_items:rows}));await logActivity(id?'update':'create','bazar',entryId);closeModal();await loadData();render();},'Bazar saved.');
    };
  };

  const previousRenderPage=window.renderPage;
  window.renderPage=function finalRenderPage(){
    if(state.page==='bazar')return renderBazar($('#content'));
    const result=previousRenderPage();
    requestAnimationFrame(()=>document.querySelectorAll('#content .eyebrow').forEach(el=>el.remove()));
    return result;
  };
})();
