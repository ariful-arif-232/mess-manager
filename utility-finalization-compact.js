/* Visual/copy polish for Utility Finalize. Bazar Finalize is intentionally untouched. */
'use strict';
(()=>{
  if(window.__mmUtilityFinalizeCompactLoaded)return;
  window.__mmUtilityFinalizeCompactLoaded=true;

  function patchStatus(root=document){
    const cards=[];
    if(root?.matches?.('[data-mm-utility-final-status]'))cards.push(root);
    root?.querySelectorAll?.('[data-mm-utility-final-status]').forEach(card=>cards.push(card));
    cards.forEach(card=>{
      card.querySelector('.mm-utility-final-status-copy span')?.remove();
      const title=card.querySelector('.mm-utility-final-status-copy b');
      if(title&&String(title.textContent||'').trim()==='Utility account is open')title.textContent='Utility is running';
    });
  }
  function patchLayer(root=document){
    const layers=[];
    if(root?.matches?.('#mmUtilityFinalizeLayer'))layers.push(root);
    root?.querySelectorAll?.('#mmUtilityFinalizeLayer').forEach(layer=>layers.push(layer));
    layers.forEach(layer=>{
      const title=String(layer.querySelector('.mm-finalize-head h2')?.textContent||'').trim();
      if(title!=='Finalize Utility')return;
      layer.classList.add('mm-utility-final-compact');
      layer.querySelector('.mm-finalize-head small')?.remove();
      layer.querySelector('.mm-finalize-date em')?.remove();
      const ready=layer.querySelector('.mm-finalize-ready');
      if(ready)ready.innerHTML='<b>Utility Calculation Okay</b>';
    });
  }
  function patch(root=document){patchStatus(root);patchLayer(root);}
  const observer=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1)patch(node);})));if(document.body){patch();observer.observe(document.body,{childList:true,subtree:true});}
})();
