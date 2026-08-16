/* Equal-height visual shells for Add/Edit Bazar metadata controls on iOS. */
'use strict';
(()=>{
  if(window.__mmBazarMetaShellFixLoaded)return;
  window.__mmBazarMetaShellFixLoaded=true;

  const formatDate=value=>{
    if(!value)return'Date';
    const parts=String(value).split('-').map(Number);
    if(parts.length!==3||parts.some(Number.isNaN))return value;
    const date=new Date(Date.UTC(parts[0],parts[1]-1,parts[2]));
    return date.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
  };

  function wrap(control){
    if(!control)return null;
    if(control.parentElement?.classList.contains('bazar-v2-meta-control'))return control.parentElement;
    const shell=document.createElement('div');
    shell.className='bazar-v2-meta-control';
    control.parentNode.insertBefore(shell,control);
    shell.appendChild(control);
    return shell;
  }

  function enhanceDate(control){
    if(!control)return;
    const shell=wrap(control);
    if(!shell)return;
    shell.classList.add('bazar-v2-date-control');
    let display=shell.querySelector('.bazar-v2-date-display');
    if(!display){
      display=document.createElement('span');
      display.className='bazar-v2-date-display';
      display.setAttribute('aria-hidden','true');
      shell.appendChild(display);
    }
    const sync=()=>{display.textContent=formatDate(control.value);};
    if(!control.__mmDateDisplayBound){
      control.__mmDateDisplayBound=true;
      control.addEventListener('input',sync);
      control.addEventListener('change',sync);
    }
    sync();
  }

  function normalize(root=document){
    const form=root.querySelector?.('#bazarForm') || (root.id==='bazarForm'?root:null);
    if(!form)return;
    enhanceDate(form.querySelector('.bazar-v2-meta input[type="date"]'));
    wrap(form.querySelector('.bazar-v2-meta select[name="buyer_member_id"]'));
  }

  const observer=new MutationObserver(records=>{
    for(const record of records){
      for(const node of record.addedNodes){
        if(node.nodeType===1)normalize(node);
      }
    }
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>normalize(),{once:true});
  else normalize();
})();
