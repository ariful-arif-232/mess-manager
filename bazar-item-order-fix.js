/* Newly added Bazar cards should appear first, while edit replacements keep position. */
'use strict';
(()=>{
  if(window.__mmBazarItemOrderFixLoaded)return;
  window.__mmBazarItemOrderFixLoaded=true;

  const wired=new WeakSet();

  function wire(host){
    if(!host||wired.has(host))return;
    wired.add(host);
    let moving=false;
    const observer=new MutationObserver(records=>{
      if(moving)return;
      for(const record of records){
        if(record.type!=='childList'||record.removedNodes.length)continue;
        const added=[...record.addedNodes].filter(node=>node.nodeType===1&&node.matches?.('[data-v2-card]'));
        if(!added.length)continue;
        const card=added[added.length-1];
        if(host.firstElementChild===card)continue;
        moving=true;
        host.insertBefore(card,host.firstElementChild);
        moving=false;
        break;
      }
    });
    observer.observe(host,{childList:true});
  }

  function scan(root=document){
    const host=root.querySelector?.('#bazarForm [data-v2-items]');
    if(host)wire(host);
    if(root.matches?.('#bazarForm'))wire(root.querySelector('[data-v2-items]'));
  }

  const rootObserver=new MutationObserver(records=>{
    for(const record of records){
      for(const node of record.addedNodes){if(node.nodeType===1)scan(node);}
    }
  });
  rootObserver.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>scan(),{once:true});
  else scan();
})();
