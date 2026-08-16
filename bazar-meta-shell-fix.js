/* Equal-height visual shells for Add/Edit Bazar metadata controls on iOS. */
'use strict';
(()=>{
  if(window.__mmBazarMetaShellFixLoaded)return;
  window.__mmBazarMetaShellFixLoaded=true;

  function wrap(control){
    if(!control||control.parentElement?.classList.contains('bazar-v2-meta-control'))return;
    const shell=document.createElement('div');
    shell.className='bazar-v2-meta-control';
    control.parentNode.insertBefore(shell,control);
    shell.appendChild(control);
  }

  function normalize(root=document){
    const form=root.querySelector?.('#bazarForm') || (root.id==='bazarForm'?root:null);
    if(!form)return;
    wrap(form.querySelector('input[name="entry_date"]'));
    wrap(form.querySelector('select[name="buyer_member_id"]'));
  }

  const observer=new MutationObserver(records=>{
    for(const record of records){
      for(const node of record.addedNodes){
        if(node.nodeType!==1)continue;
        normalize(node);
        if(node.querySelector)normalize(node);
      }
    }
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  normalize(document);
})();
