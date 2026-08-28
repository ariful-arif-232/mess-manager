/* Compact Bazar Settlement hero copy. No accounting behavior changes. */
'use strict';
(()=>{
  if(window.__mmSettlementBazarCompactPolishLoaded)return;
  window.__mmSettlementBazarCompactPolishLoaded=true;

  function polishHero(hero){
    if(!hero)return;
    const helper=hero.querySelector(':scope > span');
    if(helper)helper.textContent=hero.classList.contains('settled')
      ?'Settlement complete.'
      :'Collect dues and refund advances to clear the fund.';
    hero.classList.add('mm-settle-hero-compact');
  }

  function polish(root=document){
    const heroes=new Set();
    if(root?.matches?.('.mm-settle-hero'))heroes.add(root);
    root?.closest?.('.mm-settle-hero')&&heroes.add(root.closest('.mm-settle-hero'));
    root?.querySelectorAll?.('.mm-settle-hero').forEach(hero=>heroes.add(hero));
    heroes.forEach(polishHero);
  }

  const observer=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{
    if(node.nodeType===1)polish(node);
  })));

  if(document.body){
    polish();
    observer.observe(document.body,{childList:true,subtree:true});
  }
})();
