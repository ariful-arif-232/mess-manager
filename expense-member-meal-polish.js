/* Dashboard member meal-badge polish.
 * Keeps calculation logic untouched and decorates only rendered member rows.
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

  function mealRows(){
    try{
      if(typeof calcMonth!=='function')return [];
      return calcMonth()||[];
    }catch(error){
      console.warn('Unable to read meal totals for dashboard sheet',error);
      return [];
    }
  }

  function maps(){
    const rows=mealRows();
    return {
      byId:new Map(rows.map(row=>[String(row?.member?.id||''),row])),
      byName:new Map(rows.map(row=>[String(row?.member?.name||'').trim(),row])),
    };
  }

  function isFundRow(element){
    if(!element?.matches?.('.mm-dash-member-row:not(button)'))return false;
    const helper=element.querySelector('.mm-dash-member-copy > small');
    return String(helper?.textContent||'').trim().startsWith('Bazar deposit');
  }

  function rowMemberId(element){
    return String(
      element?.dataset?.dashExpenseMember ||
      element?.dataset?.dashDepositMember ||
      ''
    );
  }

  function addBadge(element,row){
    if(!element||element.dataset.mmMealBadge==='1'||!row)return;
    const label=mealText(row?.units);
    const copy=element.querySelector('.mm-dash-member-copy');
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
    element.dataset.mmMealBadge='1';
  }

  function decorate(root=document){
    const targets=[];
    const selector='[data-dash-expense-member],[data-dash-deposit-member],.mm-dash-member-row:not(button)';
    if(root?.matches?.(selector))targets.push(root);
    root?.querySelectorAll?.(selector).forEach(row=>targets.push(row));
    if(!targets.length)return;

    const {byId,byName}=maps();
    if(!byId.size&&!byName.size)return;

    targets.forEach(element=>{
      if(element.dataset.mmMealBadge==='1')return;

      const memberId=rowMemberId(element);
      if(memberId){
        addBadge(element,byId.get(memberId));
        return;
      }

      if(isFundRow(element)){
        const name=String(element.querySelector('.mm-dash-member-copy > b')?.textContent||'').trim();
        addBadge(element,byName.get(name));
      }
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
