/* Final app polish: integer money, premium dashboard icons and confirmed logout. */
'use strict';
(()=>{
  if(window.__mmFinalAppPolishLoaded)return;
  window.__mmFinalAppPolishLoaded=true;

  const roundMoney=value=>{
    const number=Number(value||0);
    if(!Number.isFinite(number))return 0;
    const rounded=number<0?-Math.floor(Math.abs(number)+.5):Math.floor(number+.5);
    return Object.is(rounded,-0)?0:rounded;
  };
  const formatInteger=value=>roundMoney(value).toLocaleString('en-BD',{minimumFractionDigits:0,maximumFractionDigits:0});
  const integerMoney=value=>`৳${formatInteger(value)}`;
  window.roundMessMoney=roundMoney;
  window.integerMessMoney=integerMoney;

  /* Keep monthly হিসাব internally consistent with the integer values shown to users. */
  window.calcMonth=function calcMonthInteger(){
    const members=activeMembers();
    const bazarTotal=(db?.bazar||[]).reduce((sum,item)=>sum+roundMoney(item.amount),0);
    const totalUnits=(db?.meals||[]).filter(item=>item.on).reduce((sum,item)=>sum+Number(item.units||1),0);
    const rate=totalUnits?bazarTotal/totalUnits:0;
    return members.map(member=>{
      const units=(db?.meals||[]).filter(item=>item.memberId===member.id&&item.on).reduce((sum,item)=>sum+Number(item.units||1),0);
      const food=roundMoney(units*rate);
      const util=(db?.utilities||[]).reduce((sum,item)=>{
        const memberIds=Array.isArray(item.memberIds)?item.memberIds:[];
        if(!memberIds.includes(member.id))return sum;
        return sum+roundMoney(Number(item.amount||0)/(memberIds.length||1));
      },0);
      const deposit=(db?.deposits||[]).filter(item=>item.memberId===member.id).reduce((sum,item)=>sum+roundMoney(item.amount),0);
      const total=food+util;
      return{member,units,food,util,deposit,total,balance:deposit-total};
    });
  };

  const MONEY_PATTERN=/([+-]?\s*৳\s*)(-?\d[\d,]*(?:\.\d+)?)/g;
  const normalizeText=text=>String(text).replace(MONEY_PATTERN,(full,prefix,raw)=>{
    const number=Number(String(raw).replace(/,/g,''));
    if(!Number.isFinite(number))return full;
    return `${prefix}${formatInteger(number)}`;
  });
  function normalizeCurrency(root=document.body){
    if(!root)return;
    const nodes=[];
    if(root.nodeType===Node.TEXT_NODE){nodes.push(root);}
    else if(root.nodeType===Node.ELEMENT_NODE||root.nodeType===Node.DOCUMENT_NODE||root.nodeType===Node.DOCUMENT_FRAGMENT_NODE){
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(node){
        if(!node.nodeValue?.includes('৳'))return NodeFilter.FILTER_REJECT;
        const parent=node.parentElement;
        if(!parent||parent.closest('script,style,textarea,select,option'))return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }});
      while(walker.nextNode())nodes.push(walker.currentNode);
    }
    nodes.forEach(node=>{
      const next=normalizeText(node.nodeValue||'');
      if(next!==node.nodeValue)node.nodeValue=next;
    });
  }
  window.normalizeMessMoney=normalizeCurrency;

  const iconSvg={
    bazar:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h16l-1.5 10h-13L4 9Z"/><path d="m8 9 2.2-5M16 9l-2.2-5M8 13h8"/></svg>`,
    deposit:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h14.5A1.5 1.5 0 0 1 20 9v9.5A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-11Z"/><path d="M4 7.5V6a2 2 0 0 1 2-2h10.5M15 11.5h5v4h-5a2 2 0 0 1 0-4Z"/></svg>`,
    utility:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13.4 2-7 11h5.2l-1 9 7-12h-5.1l.9-8Z"/></svg>`,
    due:`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.2v6.2"/><path d="M12 17.2h.01"/></svg>`
  };

  window.dashboard=function premiumDashboard(container){
    const calc=calcMonth();
    const bazarTotal=(db?.bazar||[]).reduce((sum,item)=>sum+roundMoney(item.amount),0);
    const depositTotal=calc.reduce((sum,item)=>sum+item.deposit,0);
    const utilityTotal=(db?.utilities||[]).reduce((sum,item)=>sum+roundMoney(item.amount),0);
    const dueTotal=calc.reduce((sum,item)=>sum+Math.max(0,-item.balance),0);
    container.innerHTML=`<section class="kpis premium-kpis">
      <article class="kpi card premium-kpi premium-kpi-bazar"><span class="kpi-icon kpi-icon-bazar">${iconSvg.bazar}</span><div><div class="label">মোট বাজার</div><div class="value">${integerMoney(bazarTotal)}</div></div></article>
      <article class="kpi card premium-kpi premium-kpi-deposit"><span class="kpi-icon kpi-icon-deposit">${iconSvg.deposit}</span><div><div class="label">মোট জমা</div><div class="value">${integerMoney(depositTotal)}</div></div></article>
      <article class="kpi card premium-kpi premium-kpi-utility"><span class="kpi-icon kpi-icon-utility">${iconSvg.utility}</span><div><div class="label">Utility Bills</div><div class="value">${integerMoney(utilityTotal)}</div></div></article>
      <article class="kpi card premium-kpi premium-kpi-due"><span class="kpi-icon kpi-icon-due">${iconSvg.due}</span><div><div class="label">মোট Due</div><div class="value">${integerMoney(dueTotal)}</div></div></article>
    </section><div class="section-head"><div><span class="eyebrow">This month</span><h2>Member Summary</h2></div></div>${settlementTable(calc)}`;
    normalizeCurrency(container);
  };

  const currentRenderPage=window.renderPage;
  if(typeof currentRenderPage==='function'){
    window.renderPage=function renderPageWithIntegerMoney(...args){
      const result=currentRenderPage.apply(this,args);
      normalizeCurrency(document.getElementById('content')||document.body);
      return result;
    };
  }

  const observer=new MutationObserver(records=>{
    records.forEach(record=>{
      if(record.type==='characterData')normalizeCurrency(record.target);
      else record.addedNodes.forEach(node=>normalizeCurrency(node));
    });
  });
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
  normalizeCurrency(document.body);

  const LOGOUT_ID='logoutConfirmDialog';
  let logoutReturnFocus=null;
  function closeLogoutDialog(){
    document.getElementById(LOGOUT_ID)?.remove();
    document.documentElement.classList.remove('logout-confirm-open');
    if(logoutReturnFocus?.isConnected)logoutReturnFocus.focus({preventScroll:true});
    logoutReturnFocus=null;
  }
  function openLogoutDialog(trigger){
    if(document.getElementById(LOGOUT_ID))return;
    logoutReturnFocus=trigger||null;
    document.body.insertAdjacentHTML('beforeend',`<div class="logout-confirm-overlay" id="${LOGOUT_ID}" role="presentation"><section class="logout-confirm-card" role="dialog" aria-modal="true" aria-labelledby="logoutConfirmTitle"><button type="button" class="logout-confirm-close" data-logout-cancel aria-label="Close">×</button><div class="logout-confirm-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10"/><path d="M14 8l4 4-4 4M18 12H9"/></svg></div><span class="logout-confirm-eyebrow">SECURE SIGN OUT</span><h2 id="logoutConfirmTitle">Logout করবেন?</h2><p>আপনি Mess Manager থেকে sign out হতে যাচ্ছেন। আবার প্রবেশ করতে verification প্রয়োজন হতে পারে।</p><div class="logout-confirm-actions"><button type="button" class="btn logout-confirm-cancel" data-logout-cancel>Cancel</button><button type="button" class="btn danger logout-confirm-submit" data-logout-confirm>Confirm Logout</button></div></section></div>`);
    document.documentElement.classList.add('logout-confirm-open');
    const overlay=document.getElementById(LOGOUT_ID);
    overlay.addEventListener('click',event=>{if(event.target===overlay)closeLogoutDialog();});
    overlay.querySelectorAll('[data-logout-cancel]').forEach(button=>button.addEventListener('click',closeLogoutDialog));
    overlay.querySelector('[data-logout-confirm]').addEventListener('click',async event=>{
      const button=event.currentTarget;
      const old=button.textContent;
      button.disabled=true;
      button.textContent='Logging out…';
      try{
        const result=await client.auth.signOut();
        if(result?.error)throw result.error;
        document.querySelector('#moreSheet')?.remove();
        closeLogoutDialog();
      }catch(error){
        button.disabled=false;
        button.textContent=old;
        notify(friendlyError(error));
      }
    });
    requestAnimationFrame(()=>overlay.querySelector('[data-logout-confirm]')?.focus({preventScroll:true}));
  }

  document.addEventListener('click',event=>{
    const trigger=event.target.closest?.('#logout,#sheetLogout,.sheet-logout,[data-logout]');
    if(!trigger)return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openLogoutDialog(trigger);
  },true);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&document.getElementById(LOGOUT_ID))closeLogoutDialog();
  });
})();
