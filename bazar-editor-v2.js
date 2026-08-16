/* Final Add/Edit Bazar editor: compact metadata, grouped fresh-market pricing, no fresh quantities. */
'use strict';
(()=>{
  if(window.__mmBazarEditorV2Loaded)return;
  window.__mmBazarEditorV2Loaded=true;

  const STANDARD={
    'চাল':{item:'চাল',unit:'kg'},
    'ডাল':{item:'ডাল',unit:'kg'},
    'তেল':{item:'তেল',unit:'L'},
    'মুরগি':{item:'মুরগি',unit:'kg'},
    'মাছ':{item:'মাছ',unit:'kg'},
    'ডিম':{item:'ডিম',unit:'হালি'}
  };
  const CATEGORIES=[...Object.keys(STANDARD),'কাঁচাবাজার','অন্যান্য'];
  const FRESH=[
    ['আলু','kg'],['পেঁয়াজ','kg'],['রসুন','kg'],['আদা','kg'],['কাঁচামরিচ','kg'],['শুকনা মরিচ','kg'],
    ['টমেটো','kg'],['বেগুন','kg'],['শসা','kg'],['গাজর','kg'],['মুলা','kg'],['ফুলকপি','pcs'],
    ['বাঁধাকপি','pcs'],['লাউ','pcs'],['কুমড়া','kg'],['মিষ্টি কুমড়া','kg'],['করলা','kg'],['পটল','kg'],
    ['ঢেঁড়স','kg'],['শিম','kg'],['বরবটি','kg'],['ঝিঙা','kg'],['চিচিঙ্গা','kg'],['চালকুমড়া','kg'],
    ['কাঁচা পেঁপে','kg'],['কাঁচা কলা','হালি'],['কচু','kg'],['কচুর লতি','kg'],['ওল','kg'],['মিষ্টি আলু','kg'],
    ['ক্যাপসিকাম','kg'],['বিট','kg'],['লেবু','pcs'],['ধনেপাতা','আঁটি'],['পুদিনাপাতা','আঁটি'],['পালং শাক','আঁটি'],
    ['লাল শাক','আঁটি'],['পুঁই শাক','আঁটি'],['কলমি শাক','আঁটি'],['ডাটা শাক','আঁটি'],['সরিষা শাক','আঁটি'],['কচুশাক','আঁটি'],
    ['সজনে ডাটা','kg'],['কাঁকরোল','kg'],['ধুন্দল','kg'],['উচ্ছে','kg'],['বরবটি শিম','kg'],['মটরশুঁটি','kg']
  ];
  const freshMap=new Map(FRESH.map(([name,unit])=>[name,unit]));
  const itemTotal=item=>Number((item?.entered_total ?? item?.total ?? (Number(item?.quantity||0)*Number(item?.unit_price||0))) || 0);
  const isFresh=item=>item?.category==='Vegetable'||item?.category==='কাঁচাবাজার';
  const uid=()=>`bazar_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  const safeJsonArray=value=>{
    if(Array.isArray(value))return value;
    if(typeof value==='string'){
      try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed:[];}catch(_){return[];}
    }
    return[];
  };
  const closeLayer=id=>document.getElementById(id)?.remove();
  const closeAllPickers=()=>['bazarV2ChoiceLayer','bazarV2FreshLayer','bazarV2ModeLayer','bazarV2PriceLayer'].forEach(closeLayer);

  function normalizeFreshNames(item){
    const raw=safeJsonArray(item?.group_items);
    if(raw.length)return raw.map(entry=>typeof entry==='string'?entry:entry?.name).filter(Boolean);
    if(item?.item_name&&item.item_name!=='কাঁচাবাজার')return[item.item_name];
    return[];
  }

  function editorCards(items){
    const cards=[];
    const legacyFresh=[];
    const individualFresh=[];
    for(const item of items||[]){
      if(isFresh(item)){
        const mode=String(item.pricing_mode||'standard');
        if(mode==='fresh_group'){
          const names=normalizeFreshNames(item);
          cards.push({id:uid(),kind:'fresh',mode:'group',names:names.length?names:['কাঁচাবাজার'],total:itemTotal(item)});
        }else if(mode==='fresh_individual'){
          individualFresh.push({name:item.item_name,unit:item.unit==='item'?(freshMap.get(item.item_name)||'kg'):(item.unit||freshMap.get(item.item_name)||'kg'),price:itemTotal(item)});
        }else{
          legacyFresh.push({name:item.item_name,unit:item.unit||freshMap.get(item.item_name)||'kg',price:itemTotal(item),unitPrice:Number(item.unit_price||0)});
        }
        continue;
      }
      const category=STANDARD[item.category]?item.category:(STANDARD[item.item_name]?item.item_name:'অন্যান্য');
      cards.push({
        id:uid(),kind:category==='অন্যান্য'?'custom':'standard',category,
        name:item.item_name||STANDARD[category]?.item||'',unit:item.unit||STANDARD[category]?.unit||'pcs',
        quantity:Number(item.quantity||1),total:itemTotal(item)
      });
    }
    if(legacyFresh.length){
      const firstUnitPrice=legacyFresh[0]?.unitPrice||0;
      const likelyOldGrouped=legacyFresh.length>1&&firstUnitPrice>0&&legacyFresh.every(item=>Math.abs(item.unitPrice-firstUnitPrice)<0.0001);
      if(likelyOldGrouped){
        cards.unshift({id:uid(),kind:'fresh',mode:'group',names:legacyFresh.map(x=>x.name).filter(Boolean),total:legacyFresh.reduce((s,x)=>s+x.price,0),legacy:true});
      }else{
        individualFresh.push(...legacyFresh.map(item=>({name:item.name,unit:item.unit,price:item.price})));
      }
    }
    if(individualFresh.length){
      cards.unshift({id:uid(),kind:'fresh',mode:'individual',items:individualFresh,total:individualFresh.reduce((s,x)=>s+x.price,0)});
    }
    return cards;
  }

  function layerShell(id,title,subtitle,body,extra=''){
    closeLayer(id);
    document.body.insertAdjacentHTML('beforeend',`<div class="bazar-v2-layer" id="${id}"><section class="bazar-v2-picker" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="bazar-v2-picker-handle" aria-hidden="true"></div><header><div>${subtitle?`<small>${esc(subtitle)}</small>`:''}<h3>${esc(title)}</h3></div><button type="button" class="bazar-v2-picker-close" data-v2-close aria-label="Close">×</button></header>${body}${extra}</section></div>`);
    const layer=document.getElementById(id);
    layer?.addEventListener('click',event=>{if(event.target===layer)closeLayer(id);});
    layer?.querySelector('[data-v2-close]')?.addEventListener('click',()=>closeLayer(id));
    return layer;
  }

  function categoryPicker(onPick){
    const body=`<div class="bazar-v2-category-grid">${CATEGORIES.map(category=>`<button type="button" data-v2-category="${esc(category)}"><span class="bazar-v2-cat-icon bazar-v2-cat-${category==='কাঁচাবাজার'?'fresh':category==='অন্যান্য'?'other':'standard'}" aria-hidden="true"></span><b>${esc(category)}</b><small>${category==='কাঁচাবাজার'?'একসাথে অনেক item select করুন':category==='অন্যান্য'?'Custom item':'Quick add'}</small></button>`).join('')}</div>`;
    const layer=layerShell('bazarV2ChoiceLayer','Choose item','Add Bazar',body);
    layer?.querySelectorAll('[data-v2-category]').forEach(button=>button.addEventListener('click',()=>{
      const category=button.dataset.v2Category;
      closeLayer('bazarV2ChoiceLayer');
      onPick(category);
    }));
  }

  function freshPicker(existingNames,onDone){
    const selected=new Set(existingNames||[]);
    const body=`<label class="bazar-v2-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="কাঁচাবাজার item খুঁজুন" autocomplete="off"></label><div class="bazar-v2-selected-count"><span data-v2-selected-count>${selected.size} selected</span><button type="button" data-v2-clear>Clear</button></div><div class="bazar-v2-fresh-grid">${FRESH.map(([name,unit])=>`<button type="button" class="${selected.has(name)?'selected':''}" data-v2-fresh="${esc(name)}" data-unit="${esc(unit)}"><span>${esc(name)}</span><i aria-hidden="true">✓</i></button>`).join('')}</div><button type="button" class="btn primary bazar-v2-done" data-v2-fresh-done>Continue</button>`;
    const layer=layerShell('bazarV2FreshLayer','কাঁচাবাজার items','Select one or more',body);
    const search=layer?.querySelector('input[type=search]');
    const count=()=>{const el=layer?.querySelector('[data-v2-selected-count]');if(el)el.textContent=`${selected.size} selected`;};
    layer?.querySelectorAll('[data-v2-fresh]').forEach(button=>button.addEventListener('click',()=>{
      const name=button.dataset.v2Fresh;
      if(selected.has(name))selected.delete(name);else selected.add(name);
      button.classList.toggle('selected',selected.has(name));count();
    }));
    search?.addEventListener('input',()=>{
      const q=search.value.trim().toLowerCase();
      layer.querySelectorAll('[data-v2-fresh]').forEach(button=>{button.hidden=!!q&&!button.dataset.v2Fresh.toLowerCase().includes(q);});
    });
    layer?.querySelector('[data-v2-clear]')?.addEventListener('click',()=>{selected.clear();layer.querySelectorAll('[data-v2-fresh]').forEach(button=>button.classList.remove('selected'));count();});
    layer?.querySelector('[data-v2-fresh-done]')?.addEventListener('click',()=>{
      if(!selected.size)return notify('কমপক্ষে একটি কাঁচাবাজার item select করুন।');
      const result=[...selected].map(name=>({name,unit:freshMap.get(name)||'kg'}));
      closeLayer('bazarV2FreshLayer');onDone(result);
    });
  }

  function priceModePicker(selected,onMode){
    const chips=selected.map(item=>`<span>${esc(item.name)}</span>`).join('');
    const body=`<div class="bazar-v2-chip-preview">${chips}</div><div class="bazar-v2-mode-grid"><button type="button" data-v2-mode="group"><span class="bazar-v2-mode-icon total" aria-hidden="true">৳</span><div><b>সবগুলোর একসাথে দাম</b><small>একটি Total price লিখবেন</small></div><i>›</i></button><button type="button" data-v2-mode="individual"><span class="bazar-v2-mode-icon items" aria-hidden="true">≡</span><div><b>প্রতি item আলাদা দাম</b><small>প্রতিটি item-এর শুধু price লিখবেন</small></div><i>›</i></button></div>`;
    const layer=layerShell('bazarV2ModeLayer','Price method',`${selected.length} items selected`,body);
    layer?.querySelectorAll('[data-v2-mode]').forEach(button=>button.addEventListener('click',()=>{const mode=button.dataset.v2Mode;closeLayer('bazarV2ModeLayer');onMode(mode);}));
  }

  function individualPricePicker(selected,prices,onDone){
    const body=`<div class="bazar-v2-price-list">${selected.map(item=>`<label><span><b>${esc(item.name)}</b><small>Price</small></span><div><i>৳</i><input type="number" inputmode="decimal" min="0" step="0.01" data-v2-price="${esc(item.name)}" value="${esc(prices?.[item.name]||'')}" placeholder="0"></div></label>`).join('')}</div><button type="button" class="btn primary bazar-v2-done" data-v2-price-done>Done</button>`;
    const layer=layerShell('bazarV2PriceLayer','Item prices','কাঁচাবাজার',body);
    setTimeout(()=>layer?.querySelector('input')?.focus(),120);
    layer?.querySelector('[data-v2-price-done]')?.addEventListener('click',()=>{
      const priceInputs=[...layer.querySelectorAll('[data-v2-price]')];
      const items=selected.map(item=>({name:item.name,unit:item.unit,price:Number(priceInputs.find(input=>input.dataset.v2Price===item.name)?.value||0)}));
      const missing=items.find(item=>!(item.price>0));
      if(missing)return notify(`${missing.name} এর price লিখুন।`);
      closeLayer('bazarV2PriceLayer');onDone(items);
    });
  }

  function standardCard(card){
    const isCustom=card.kind==='custom';
    return `<article class="bazar-v2-card" data-v2-card data-card-id="${esc(card.id)}" data-kind="${esc(card.kind)}" data-category="${esc(card.category)}">
      <header><div><small>${isCustom?'Other item':esc(card.category)}</small><strong data-v2-title>${esc(card.name||card.category)}</strong></div><button type="button" data-v2-remove aria-label="Remove">×</button></header>
      ${isCustom?`<label class="bazar-v2-field full"><span>Item name</span><input name="v2_name" value="${esc(card.name||'')}" placeholder="Item name"></label>`:''}
      <div class="bazar-v2-standard-grid">
        <label class="bazar-v2-field"><span>Quantity</span><input name="v2_quantity" type="number" inputmode="decimal" min="0.001" step="0.001" value="${esc(card.quantity||1)}"></label>
        <div class="bazar-v2-field"><span>Unit</span><div class="bazar-v2-unit">${esc(card.unit||'pcs')}</div></div>
        <label class="bazar-v2-field"><span>Total price (৳)</span><input name="v2_total" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(card.total||'')}" placeholder="0"></label>
      </div>
    </article>`;
  }

  function freshGroupCard(card){
    return `<article class="bazar-v2-card bazar-v2-fresh-card" data-v2-card data-card-id="${esc(card.id)}" data-kind="fresh" data-mode="group">
      <header><div><small>কাঁচাবাজার</small><strong>${card.names.length} items selected</strong></div><div class="bazar-v2-card-actions"><button type="button" data-v2-edit-fresh>Change</button><button type="button" data-v2-remove aria-label="Remove">×</button></div></header>
      <div class="bazar-v2-item-chips">${card.names.map(name=>`<span>${esc(name)}</span>`).join('')}</div>
      <label class="bazar-v2-field bazar-v2-fresh-total"><span>Total price (৳)</span><div class="bazar-v2-money"><i>৳</i><input name="v2_fresh_group_total" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(card.total||'')}" placeholder="0"></div></label>
    </article>`;
  }

  function freshIndividualCard(card){
    return `<article class="bazar-v2-card bazar-v2-fresh-card" data-v2-card data-card-id="${esc(card.id)}" data-kind="fresh" data-mode="individual">
      <header><div><small>কাঁচাবাজার</small><strong>${card.items.length} item prices</strong></div><div class="bazar-v2-card-actions"><button type="button" data-v2-edit-prices>Edit prices</button><button type="button" data-v2-remove aria-label="Remove">×</button></div></header>
      <div class="bazar-v2-price-summary">${card.items.map(item=>`<div data-v2-individual-item data-name="${esc(item.name)}" data-unit="${esc(item.unit)}" data-price="${esc(item.price)}"><span>${esc(item.name)}</span><strong>${money(item.price)}</strong></div>`).join('')}</div>
    </article>`;
  }

  function cardHtml(card){return card.kind==='fresh'?(card.mode==='group'?freshGroupCard(card):freshIndividualCard(card)):standardCard(card);}

  function openEditor(id){
    if(profile?.role!=='admin')return;
    closeAllPickers();
    const existing=id?db.bazar.find(entry=>String(entry.id)===String(id)):null;
    const source=existing||{date:today(),buyer_member_id:activeMembers()[0]?.id,note:'',items:[]};
    const cards=editorCards(source.items||[]);
    closeModal();
    modal(`<div class="modal-title final-bazar-modal-title bazar-v2-title"><h2>${id?'Edit':'Add'} Bazar</h2><button class="icon-btn" type="button" data-v2-modal-close aria-label="Close">×</button></div>
      <form id="bazarForm" class="final-bazar-form bazar-v2-form" novalidate>
        <div class="bazar-v2-meta">
          <label class="bazar-v2-field"><span>Date</span><input name="entry_date" type="date" value="${esc(source.date||today())}" required></label>
          <label class="bazar-v2-field"><span>Buyer</span><select name="buyer_member_id" required>${activeMembers().map(member=>`<option value="${esc(member.id)}" ${String(source.buyer_member_id)===String(member.id)?'selected':''}>${esc(member.name)}</option>`).join('')}</select></label>
        </div>
        <div class="bazar-v2-items-head"><div><small>Shopping list</small><h3>Items</h3></div><button type="button" class="btn bazar-v2-add-item" data-v2-add-item>+ Add item</button></div>
        <div class="bazar-v2-items" data-v2-items>${cards.map(cardHtml).join('')}</div>
        <button type="button" class="bazar-v2-empty ${cards.length?'hidden':''}" data-v2-empty><span class="bazar-v2-empty-icon" aria-hidden="true">+</span><b>Choose item</b><small>চাল, ডাল, কাঁচাবাজার বা অন্য item add করুন</small></button>
        <footer class="bazar-footer final-bazar-footer bazar-v2-footer"><div><span>Grand total</span><b data-v2-grand>${money(0)}</b></div><button class="btn primary" type="submit">Save Bazar</button></footer>
      </form>`);

    const form=document.getElementById('bazarForm');
    const itemsHost=form.querySelector('[data-v2-items]');
    const empty=form.querySelector('[data-v2-empty]');
    const grand=form.querySelector('[data-v2-grand]');

    function currentCards(){return[...itemsHost.querySelectorAll('[data-v2-card]')];}
    function refresh(){
      let total=0;
      currentCards().forEach(card=>{
        if(card.dataset.kind==='fresh'){
          if(card.dataset.mode==='group')total+=Number(card.querySelector('[name=v2_fresh_group_total]')?.value||0);
          else card.querySelectorAll('[data-v2-individual-item]').forEach(row=>total+=Number(row.dataset.price||0));
        }else total+=Number(card.querySelector('[name=v2_total]')?.value||0);
      });
      grand.textContent=money(total);
      empty.classList.toggle('hidden',currentCards().length>0);
    }
    function appendCard(card){
      itemsHost.insertAdjacentHTML('beforeend',cardHtml(card));
      bindCard(itemsHost.lastElementChild);refresh();
      itemsHost.lastElementChild?.scrollIntoView?.({behavior:'smooth',block:'nearest'});
    }
    function replaceCard(node,card){
      const host=document.createElement('div');host.innerHTML=cardHtml(card);const next=host.firstElementChild;
      node.replaceWith(next);bindCard(next);refresh();
    }
    function addFreshFlow(editNode=null){
      let initial=[];
      if(editNode){
        if(editNode.dataset.mode==='group')initial=[...editNode.querySelectorAll('.bazar-v2-item-chips span')].map(span=>span.textContent.trim());
        else initial=[...editNode.querySelectorAll('[data-v2-individual-item]')].map(row=>row.dataset.name);
      }
      freshPicker(initial,selected=>{
        priceModePicker(selected,mode=>{
          if(mode==='group'){
            const oldTotal=editNode?.dataset.mode==='group'?Number(editNode.querySelector('[name=v2_fresh_group_total]')?.value||0):0;
            const card={id:editNode?.dataset.cardId||uid(),kind:'fresh',mode:'group',names:selected.map(x=>x.name),total:oldTotal};
            if(editNode)replaceCard(editNode,card);else appendCard(card);
          }else{
            const oldPrices={};
            if(editNode?.dataset.mode==='individual')editNode.querySelectorAll('[data-v2-individual-item]').forEach(row=>{oldPrices[row.dataset.name]=row.dataset.price;});
            individualPricePicker(selected,oldPrices,priced=>{
              const card={id:editNode?.dataset.cardId||uid(),kind:'fresh',mode:'individual',items:priced,total:priced.reduce((s,x)=>s+x.price,0)};
              if(editNode)replaceCard(editNode,card);else appendCard(card);
            });
          }
        });
      });
    }
    function addCategory(category){
      if(category==='কাঁচাবাজার')return addFreshFlow();
      if(category==='অন্যান্য')return appendCard({id:uid(),kind:'custom',category:'অন্যান্য',name:'',unit:'pcs',quantity:1,total:0});
      const preset=STANDARD[category];appendCard({id:uid(),kind:'standard',category,name:preset.item,unit:preset.unit,quantity:1,total:0});
    }
    function chooseItem(){categoryPicker(addCategory);}
    function bindCard(card){
      card.querySelector('[data-v2-remove]')?.addEventListener('click',()=>{card.remove();refresh();});
      card.querySelectorAll('input').forEach(input=>input.addEventListener('input',refresh));
      card.querySelector('[name=v2_name]')?.addEventListener('input',event=>{const title=card.querySelector('[data-v2-title]');if(title)title.textContent=event.target.value.trim()||'অন্যান্য';});
      card.querySelector('[data-v2-edit-fresh]')?.addEventListener('click',()=>addFreshFlow(card));
      card.querySelector('[data-v2-edit-prices]')?.addEventListener('click',()=>{
        const selected=[...card.querySelectorAll('[data-v2-individual-item]')].map(row=>({name:row.dataset.name,unit:row.dataset.unit||freshMap.get(row.dataset.name)||'kg'}));
        const oldPrices={};card.querySelectorAll('[data-v2-individual-item]').forEach(row=>{oldPrices[row.dataset.name]=row.dataset.price;});
        individualPricePicker(selected,oldPrices,priced=>replaceCard(card,{id:card.dataset.cardId,kind:'fresh',mode:'individual',items:priced,total:priced.reduce((s,x)=>s+x.price,0)}));
      });
    }
    currentCards().forEach(bindCard);
    form.querySelector('[data-v2-add-item]')?.addEventListener('click',chooseItem);
    empty.addEventListener('click',chooseItem);
    form.querySelector('[data-v2-modal-close]')?.addEventListener('click',()=>{closeAllPickers();closeModal();});
    refresh();

    form.addEventListener('submit',async event=>{
      event.preventDefault();
      const f=new FormData(form);
      if(!f.get('entry_date')||!f.get('buyer_member_id'))return notify('Date এবং Buyer নির্বাচন করুন।');
      const rows=[];
      try{
        for(const card of currentCards()){
          if(card.dataset.kind==='fresh'){
            if(card.dataset.mode==='group'){
              const names=[...card.querySelectorAll('.bazar-v2-item-chips span')].map(span=>span.textContent.trim()).filter(Boolean);
              const total=Number(card.querySelector('[name=v2_fresh_group_total]')?.value||0);
              if(!names.length)throw new Error('কাঁচাবাজার item select করুন।');
              if(!(total>0))throw new Error('কাঁচাবাজারের Total price লিখুন।');
              rows.push({item_name:'কাঁচাবাজার',category:'Vegetable',quantity:1,unit:'group',unit_price:total,total,pricing_mode:'fresh_group',group_items:names});
            }else{
              const individual=[...card.querySelectorAll('[data-v2-individual-item]')];
              if(!individual.length)throw new Error('কাঁচাবাজার item select করুন।');
              for(const row of individual){
                const price=Number(row.dataset.price||0);if(!(price>0))throw new Error(`${row.dataset.name} এর price লিখুন।`);
                rows.push({item_name:row.dataset.name,category:'Vegetable',quantity:1,unit:'item',unit_price:price,total:price,pricing_mode:'fresh_individual',group_items:null});
              }
            }
            continue;
          }
          const name=card.dataset.kind==='custom'?String(card.querySelector('[name=v2_name]')?.value||'').trim():STANDARD[card.dataset.category]?.item||'';
          const quantity=Number(card.querySelector('[name=v2_quantity]')?.value||0);
          const total=Number(card.querySelector('[name=v2_total]')?.value||0);
          const unit=card.querySelector('.bazar-v2-unit')?.textContent?.trim()||'pcs';
          if(!name)throw new Error('Item name লিখুন।');
          if(!(quantity>0))throw new Error(`${name} এর quantity লিখুন।`);
          if(!(total>0))throw new Error(`${name} এর Total price লিখুন।`);
          rows.push({item_name:name,category:card.dataset.category,quantity,unit,unit_price:total/quantity,total,pricing_mode:'standard',group_items:null});
        }
      }catch(error){return notify(error.message);}
      if(!rows.length)return notify('কমপক্ষে একটি item add করুন।');
      await run(async()=>{
        const result=await client.rpc('save_bazar_entry',{
          p_entry_id:id||null,
          p_entry_date:f.get('entry_date'),
          p_buyer_member_id:f.get('buyer_member_id'),
          p_note:String(source.note||''),
          p_items:rows
        });
        const entryId=assertResult(result);
        await logActivity(id?'update':'create','bazar',entryId);
        closeAllPickers();closeModal();await loadData();render();
      },'Bazar saved.');
    });
  }

  window.bazarModal=openEditor;
})();
