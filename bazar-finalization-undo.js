/* Adds a safe audited recovery path when settlement was recorded accidentally. */
'use strict';
(()=>{
  if(window.__mmBazarUndoSettlementLoaded)return;
  window.__mmBazarUndoSettlementLoaded=true;

  if(!document.querySelector('link[data-mm-finalize-polish]')){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='bazar-finalization-ui-polish.css?v=20260828-finalize2';
    link.dataset.mmFinalizePolish='1';
    document.head.appendChild(link);
  }
  if(!document.querySelector('script[data-mm-finalize-polish]')){
    const script=document.createElement('script');
    script.src='bazar-finalization-ui-polish.js?v=20260828-finalize2';
    script.dataset.mmFinalizePolish='1';
    document.head.appendChild(script);
  }

  const monthStart=()=>`${state.month}-01`;
  const clearModalLocks=()=>{
    document.getElementById('mmBazarUndoLayer')?.remove();
    document.getElementById('mmBazarFinalizeLayer')?.remove();
    document.getElementById('mmMonthlyFoodControlLayer')?.remove();
    document.documentElement.classList.remove('mm-finalize-open','mm-food-control-open');
    document.body?.classList.remove('mm-finalize-open','mm-food-control-open');
    document.documentElement.style.removeProperty('overflow');
    document.body?.style?.removeProperty('overflow');
  };
  const closeUndo=()=>document.getElementById('mmBazarUndoLayer')?.remove();

  function openUndo(){
    closeUndo();
    document.body.insertAdjacentHTML('beforeend',`<div class="mm-undo-layer" id="mmBazarUndoLayer">
      <section class="mm-undo-sheet" role="dialog" aria-modal="true" aria-label="Undo settlement and reopen">
        <div class="mm-undo-handle"></div>
        <header><div><small>SECURE RECOVERY</small><h2>Undo Settlement & Reopen</h2></div><button type="button" data-undo-close>×</button></header>
        <div class="mm-undo-warning"><b>Accidental settlement?</b><span>Active Collect/Refund records audit history-তে void হবে, হিসাব থেকে বাদ যাবে, তারপর Finalized Bazar আগের live state-এ reopen হবে।</span></div>
        <label><span>Reopen PIN</span><input id="mmUndoPin" inputmode="numeric" maxlength="4" pattern="[0-9]*" autocomplete="off" placeholder="••••"></label>
        <div class="mm-undo-actions"><button type="button" data-undo-cancel>Cancel</button><button type="button" class="primary" data-undo-confirm>Undo & Reopen</button></div>
      </section>
    </div>`);
    const layer=document.getElementById('mmBazarUndoLayer');
    layer?.addEventListener('click',e=>{if(e.target===layer)closeUndo();});
    layer?.querySelector('[data-undo-close]')?.addEventListener('click',closeUndo);
    layer?.querySelector('[data-undo-cancel]')?.addEventListener('click',closeUndo);
    const btn=layer?.querySelector('[data-undo-confirm]');
    btn?.addEventListener('click',async()=>{
      const pin=String(layer.querySelector('#mmUndoPin')?.value||'').replace(/\D/g,'').slice(0,4);
      if(!/^\d{4}$/.test(pin))return notify('4-digit Reopen PIN দিন।');
      const old=btn.textContent;btn.disabled=true;btn.textContent='Reopening…';
      try{
        const result=assertResult(await client.rpc('undo_bazar_settlement_and_reopen',{p_month:monthStart(),p_pin:pin}));
        if(!result?.ok){notify(result?.message||'Undo & Reopen failed');btn.disabled=false;btn.textContent=old;return;}
        clearModalLocks();
        db.bazarFinalization={active:false};
        if(db.foodControl){db.foodControl.bazar_closed_from=null;db.foodControl.meal_stop_from=null;db.foodControl.active_finalization_id=null;}
        await window.loadData();
        window.render();
        requestAnimationFrame(()=>{
          clearModalLocks();
          window.scrollTo({top:window.scrollY,behavior:'auto'});
        });
        notify('Settlement undo হয়েছে এবং Bazar আগের live state-এ reopen হয়েছে।','success');
      }catch(error){
        clearModalLocks();
        notify(friendlyError(error));
      }
    });
  }

  function decorate(root=document){
    const sheets=[];
    if(root?.matches?.('.mm-finalize-sheet'))sheets.push(root);
    root?.querySelectorAll?.('.mm-finalize-sheet').forEach(sheet=>sheets.push(sheet));
    sheets.forEach(sheet=>{
      if(sheet.querySelector('[data-undo-settlement-reopen]'))return;
      const warning=[...sheet.querySelectorAll('.mm-finalize-alert')].find(el=>String(el.textContent||'').includes('Reopen locked'));
      if(!warning)return;
      warning.insertAdjacentHTML('afterend','<button type="button" class="mm-undo-settlement-link" data-undo-settlement-reopen>Undo Settlement & Reopen</button>');
      sheet.querySelector('[data-undo-settlement-reopen]')?.addEventListener('click',openUndo);
    });
  }

  const observer=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1)decorate(node);}))); 
  if(document.body){decorate();observer.observe(document.body,{childList:true,subtree:true});}
})();
