/* Expense-sheet member meal badge polish.
 * Keeps calculation logic untouched and decorates only the Total Expense member list.
 */
'use strict';
(()=>{
  if(window.__mmExpenseMealPolishLoaded)return;
  window.__mmExpenseMealPolishLoaded=true;

  const mealText=value=>{
    const n=Number(value||0);
    if(!Number.isFinite(n))return'';
    const rounded=Math.round(n*100)/100;
    const text=Number.isInteger(rounded)?String(rounded):String(rounded);
    return `${text} meal${Math.abs(rounded-1)<0.0001?'':'s'}`;
  };

  function mealMap(){
    try{
      if(typeof calcMonth!=='function')return new Map();
      return new Map((calcMonth()||[]).map(row=>[String(row?.member?.id||''),row]));
    }catch(error){
      console.warn('Unable to read meal totals for expense sheet',error);
      return new Map();
    }
  }

  function decorate(root=document){
    const rows=[];
    if(root?.matches?.('[data-dash-expense-member]'))rows.push(root);
    root?.querySelectorAll?.('[data-dash-expense-member]').forEach(row=>rows.push(row));
    if(!rows.length)return;

    const map=mealMap();
    if(!map.size)return;

    rows.forEach(button=>{
      if(button.dataset.mmMealBadge==='1')return;
      const memberId=String(button.dataset.dashExpenseMember||'');
      const row=map.get(memberId);
      const label=mealText(row?.units);
      const copy=button.querySelector('.mm-dash-member-copy');
      const name=copy?.querySelector(':scope > b');
      if(!copy||!name||!label)return;

      const line=document.createElement('span');
      line.className='mm-dash-member-name-line';
      copy.insertBefore(line,name);
      line.appendChild(name);

      const badge=document.createElement('span');
      badge.className='mm-dash-meal-badge';
      badge.textContent=label;
      badge.setAttribute('aria-label',`${label} this month`);
      line.appendChild(badge);
      button.dataset.mmMealBadge='1';
    });
  }

  const observer=new MutationObserver(records=>{
    records.forEach(record=>record.addedNodes.forEach(node=>{
      if(node.nodeType===1)decorate(node);
    }));
  });

  const start=()=>{
    decorate();
    if(document.body)observer.observe(document.body,{childList:true,subtree:true});
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
