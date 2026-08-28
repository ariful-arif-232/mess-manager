/* Finalize Bazar visual/copy polish only. Accounting and Supabase RPC behavior stay unchanged. */
'use strict';
(()=>{
  if(window.__mmBazarFinalizationUiPolishLoaded)return;
  window.__mmBazarFinalizationUiPolishLoaded=true;

  const numberFromText=value=>Number(String(value||'').replace(/[^0-9.-]/g,''))||0;
  const fixedMoney=value=>`৳${Number(value||0).toLocaleString('en-BD',{minimumFractionDigits:2,maximumFractionDigits:2})}`;

  function mainFinalizeSheet(sheet){
    return String(sheet?.querySelector('.mm-finalize-head h2')?.textContent||'').trim()==='Finalize Bazar';
  }

  function pinSheet(sheet){
    return String(sheet?.querySelector('.mm-finalize-head h2')?.textContent||'').trim()==='Set Reopen PIN';
  }

  function polishMainSheet(sheet){
    sheet.classList.add('mm-finalize-ui-main');
    sheet.querySelector('.mm-finalize-head small')?.remove();
    sheet.querySelector('.mm-finalize-date em')?.remove();

    const stats=[...sheet.querySelectorAll('.mm-finalize-stats:not(.compact)>div')];
    const cardByLabel=label=>stats.find(card=>String(card.querySelector('span')?.textContent||'').trim()===label);
    const advanceCard=cardByLabel('Bazar Advance');
    const mealCard=cardByLabel('Meal Units');
    const costCard=cardByLabel('Bazar Cost');

    if(advanceCard&&mealCard&&costCard){
      const mealUnits=numberFromText(mealCard.querySelector('b')?.textContent);
      const bazarCost=numberFromText(costCard.querySelector('b')?.textContent);
      const perMeal=mealUnits>0?bazarCost/mealUnits:0;

      const advanceLabel=advanceCard.querySelector('span');
      const advanceValue=advanceCard.querySelector('b');
      if(advanceLabel)advanceLabel.textContent='Meal Units';
      if(advanceValue){advanceValue.textContent=mealUnits.toLocaleString('en-BD',{maximumFractionDigits:2});advanceValue.classList.remove('advance','due');}

      const mealLabel=mealCard.querySelector('span');
      const mealValue=mealCard.querySelector('b');
      if(mealLabel)mealLabel.textContent='Per Meal Cost';
      if(mealValue){mealValue.textContent=fixedMoney(perMeal);mealValue.classList.remove('advance','due');}
    }

    const ready=sheet.querySelector('.mm-finalize-ready');
    if(ready&&!ready.classList.contains('mm-finalize-ready-polished')){
      ready.classList.add('mm-finalize-ready-polished');
      ready.innerHTML='<span class="mm-finalize-ready-icon" aria-hidden="true">✓</span><div><b>Bazar Calculation Okay</b></div>';
    }
  }

  function polishPinSheet(sheet){
    sheet.classList.add('mm-finalize-ui-pin');
    sheet.querySelector('.mm-finalize-confirm-card > span')?.remove();
    sheet.querySelector('.mm-finalize-lock-note > span')?.remove();
  }

  function polishStatusCard(root=document){
    const cards=new Set();
    if(root?.matches?.('[data-mm-food-status]'))cards.add(root);
    root?.closest?.('[data-mm-food-status]')&&cards.add(root.closest('[data-mm-food-status]'));
    root?.querySelectorAll?.('[data-mm-food-status]').forEach(card=>cards.add(card));
    cards.forEach(card=>{
      const copy=card.querySelector('.mm-food-status-copy');
      const stateLabel=String(copy?.querySelector('b')?.textContent||'').trim();
      if(stateLabel==='Bazar is running')copy?.querySelector('span')?.remove();
    });
  }

  function polishSheets(root=document){
    const sheets=new Set();
    if(root?.matches?.('.mm-finalize-sheet'))sheets.add(root);
    root?.closest?.('.mm-finalize-sheet')&&sheets.add(root.closest('.mm-finalize-sheet'));
    root?.querySelectorAll?.('.mm-finalize-sheet').forEach(sheet=>sheets.add(sheet));
    sheets.forEach(sheet=>{
      if(mainFinalizeSheet(sheet))polishMainSheet(sheet);
      else if(pinSheet(sheet))polishPinSheet(sheet);
    });
  }

  function removeSuccessToast(){
    document.querySelector('.mm-bazar-finalized-toast')?.remove();
  }

  function showSuccessToast(){
    document.querySelector('.toast')?.remove();
    removeSuccessToast();
    document.body.insertAdjacentHTML('beforeend',`<div class="mm-bazar-finalized-toast" role="status" aria-live="polite">
      <span class="mm-bazar-finalized-toast-icon" aria-hidden="true">✓</span>
      <div><b>Bazar finalized successfully</b><span>Reopen PIN saved.</span></div>
      <button type="button" aria-label="Close notification">×</button>
    </div>`);
    const toast=document.querySelector('.mm-bazar-finalized-toast');
    toast?.querySelector('button')?.addEventListener('click',removeSuccessToast);
    window.setTimeout(()=>toast?.remove(),4600);
  }

  const baseNotify=window.notify;
  if(typeof baseNotify==='function'){
    window.notify=function polishedFinalizeNotify(message,type='error'){
      const text=String(message||'');
      if(type==='success'&&/finalized/i.test(text)&&/PIN/i.test(text)){
        showSuccessToast();
        return;
      }
      return baseNotify(message,type);
    };
    try{notify=window.notify;}catch(_){/* global property is enough */}
  }

  function fallbackToastCheck(root){
    const candidates=[];
    if(root?.matches?.('.toast'))candidates.push(root);
    root?.querySelectorAll?.('.toast').forEach(toast=>candidates.push(toast));
    candidates.forEach(toast=>{
      const text=String(toast.textContent||'');
      if(toast.classList.contains('success')&&/finalized/i.test(text)&&/PIN/i.test(text)){
        toast.remove();
        showSuccessToast();
      }
    });
  }

  function polish(root=document){
    polishStatusCard(root);
    polishSheets(root);
    fallbackToastCheck(root);
  }

  const observer=new MutationObserver(records=>{
    records.forEach(record=>record.addedNodes.forEach(node=>{
      if(node.nodeType===1)polish(node);
    }));
  });

  if(document.body){
    polish();
    observer.observe(document.body,{childList:true,subtree:true});
  }
})();
