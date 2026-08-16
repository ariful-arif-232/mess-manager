/* Final iPhone deposit editor behavior fix. */
'use strict';
(()=>{
  if(window.__mmDepositEditorMobileFinal)return;
  window.__mmDepositEditorMobileFinal=true;

  function closeEditor(wrap,event){
    if(event){event.preventDefault();event.stopPropagation();}
    try{
      if(typeof closeModal==='function') closeModal();
      else wrap?.remove();
    }catch(_){wrap?.remove();}
  }

  function fixEditor(root){
    const wrap=root?.matches?.('.mm-deposit-editor-wrap')?root:root?.querySelector?.('.mm-deposit-editor-wrap');
    if(!wrap)return;

    wrap.querySelectorAll('[data-close]').forEach(btn=>{
      if(btn.dataset.mmDepositCloseBound==='1')return;
      btn.dataset.mmDepositCloseBound='1';
      btn.addEventListener('click',event=>closeEditor(wrap,event),true);
    });

    const dateInput=wrap.querySelector('input[type="date"][name="deposit_date"]');
    if(dateInput&&!dateInput.closest('.mm-deposit-date-shell')){
      const shell=document.createElement('div');
      shell.className='mm-deposit-date-shell';
      dateInput.parentNode.insertBefore(shell,dateInput);
      shell.appendChild(dateInput);
    }
  }

  document.addEventListener('click',event=>{
    const btn=event.target.closest?.('.mm-deposit-editor-wrap [data-close]');
    if(btn) closeEditor(btn.closest('.mm-deposit-editor-wrap'),event);
  },true);

  const observer=new MutationObserver(records=>{
    for(const record of records){
      for(const node of record.addedNodes){
        if(node.nodeType===1) fixEditor(node);
      }
    }
  });

  const start=()=>{
    fixEditor(document);
    observer.observe(document.body,{childList:true,subtree:true});
  };
  if(document.body)start();else document.addEventListener('DOMContentLoaded',start,{once:true});
})();
