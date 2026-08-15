/* Runtime form enhancer for the five premium entry flows. */
'use strict';
(()=>{
  if(window.__mmPremiumFormDatePolishLoaded)return;
  window.__mmPremiumFormDatePolishLoaded=true;

  const FORM_MAP={
    memberForm:'mm-form-member',
    bazarForm:'mm-form-bazar',
    depositProForm:'mm-form-deposit',
    utilityProForm:'mm-form-utility',
    scheduleProForm:'mm-form-schedule'
  };

  function enhanceDate(input){
    if(!input||input.dataset.mmDateEnhanced==='1')return;
    input.dataset.mmDateEnhanced='1';
    let wrap=input.parentElement;
    if(!wrap?.classList.contains('entry-date-wrap')){
      const next=document.createElement('div');
      next.className='mm-date-control';
      wrap?.insertBefore(next,input);
      next.appendChild(input);
      wrap=next;
    }else{
      wrap.classList.add('mm-date-control');
    }
    if(!wrap.querySelector(':scope > .mm-date-icon')){
      const icon=document.createElement('span');
      icon.className='mm-date-icon';
      icon.setAttribute('aria-hidden','true');
      wrap.insertBefore(icon,wrap.firstChild);
    }
  }

  function enhanceModal(modal){
    if(!modal)return;
    let matched=false;
    Object.entries(FORM_MAP).forEach(([id,cls])=>{
      if(modal.querySelector(`#${id}`)){
        modal.classList.add('mm-premium-modal',cls);
        matched=true;
      }
    });
    if(!matched)return;
    modal.querySelectorAll('input[type="date"],input[type="month"]').forEach(enhanceDate);
  }

  function scan(root=document){
    if(root?.matches?.('.modal'))enhanceModal(root);
    root?.querySelectorAll?.('.modal').forEach(enhanceModal);
  }

  const observer=new MutationObserver(records=>{
    records.forEach(record=>record.addedNodes.forEach(node=>{
      if(node.nodeType!==Node.ELEMENT_NODE)return;
      scan(node);
      if(node.matches?.('input[type="date"],input[type="month"]')){
        const modal=node.closest('.modal');
        if(modal?.classList.contains('mm-premium-modal'))enhanceDate(node);
      }
    }));
  });

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{
      scan(document);
      observer.observe(document.body,{childList:true,subtree:true});
    },{once:true});
  }else{
    scan(document);
    observer.observe(document.body,{childList:true,subtree:true});
  }
})();
