/* Remove only the top-level Utility/Deposit "breakdown" kicker labels. */
'use strict';
(()=>{
  if(window.__mmDashboardSheetLabelPolishLoaded)return;
  window.__mmDashboardSheetLabelPolishLoaded=true;

  function clean(root=document){
    const sheets=[];
    if(root?.matches?.('.mm-dash-sheet'))sheets.push(root);
    root?.querySelectorAll?.('.mm-dash-sheet').forEach(sheet=>sheets.push(sheet));

    sheets.forEach(sheet=>{
      const title=sheet.querySelector('.mm-dash-title-wrap h3')?.textContent?.trim()||'';
      const kicker=sheet.querySelector('.mm-dash-title-wrap small');
      const text=kicker?.textContent?.trim()||'';
      const removeUtility=title==='Utility Bills'&&text==='Utility breakdown';
      const removeDeposit=title==='মোট জমা'&&text==='Deposit breakdown';
      if(removeUtility||removeDeposit)kicker.remove();
    });
  }

  const start=()=>{
    clean();
    if(!document.body)return;
    new MutationObserver(records=>{
      records.forEach(record=>record.addedNodes.forEach(node=>{
        if(node.nodeType===1)clean(node);
      }));
    }).observe(document.body,{childList:true,subtree:true});
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
