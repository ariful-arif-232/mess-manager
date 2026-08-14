/* Final app polish: display-only integer money, premium dashboard icons and confirmed logout. */
'use strict';
(()=>{
  if(window.__mmFinalAppPolishLoaded)return;
  window.__mmFinalAppPolishLoaded=true;

  const roundMoney=value=>{
    const number=Number(String(value??0).replace(/,/g,''));
    if(!Number.isFinite(number))return 0;
    const rounded=Math.floor(Math.abs(number)+0.5);
    const result=number<0?-rounded:rounded;
    return Object.is(result,-0)?0:result;
  };
  const formatInteger=value=>roundMoney(value).toLocaleString('en-BD',{minimumFractionDigits:0,maximumFractionDigits:0});
  window.roundMessMoney=roundMoney;
  window.integerMessMoney=value=>`৳${formatInteger(value)}`;

  const style=document.createElement('style');
  style.id='mm-final-app-polish-style';
  style.textContent=`
    .premium-kpi{position:relative;overflow:hidden}
    .premium-kpi .final-kpi-icon{width:54px;height:54px;flex:0 0 54px;border-radius:18px;display:grid;place-items:center;position:relative;isolation:isolate;box-shadow:inset 0 1px rgba(255,255,255,.24),0 10px 24px rgba(27,64,117,.10)}
    .premium-kpi .final-kpi-icon:before{content:"";position:absolute;inset:0;border-radius:inherit;background:linear-gradient(145deg,rgba(255,255,255,.34),transparent 55%);z-index:-1}
    .premium-kpi .final-kpi-icon svg{width:27px;height:27px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    .premium-kpi .final-kpi-bazar{color:#2868d8;background:linear-gradient(145deg,#edf4ff,#dfeaff)}
    .premium-kpi .final-kpi-deposit{color:#1679be;background:linear-gradient(145deg,#e9f7ff,#d9efff)}
    .premium-kpi .final-kpi-utility{color:#0b8b71;background:linear-gradient(145deg,#e7faf4,#d7f3e9)}
    .premium-kpi .final-kpi-due{color:#d84963;background:linear-gradient(145deg,#fff0f3,#ffe1e7)}
    html[data-theme="dark"] .premium-kpi .final-kpi-icon{box-shadow:inset 0 1px rgba(255,255,255,.11),0 10px 24px rgba(0,0,0,.18)}
    html[data-theme="dark"] .premium-kpi .final-kpi-bazar{color:#72a7ff;background:linear-gradient(145deg,#173d70,#102d52)}
    html[data-theme="dark"] .premium-kpi .final-kpi-deposit{color:#62c6ff;background:linear-gradient(145deg,#174778,#103356)}
    html[data-theme="dark"] .premium-kpi .final-kpi-utility{color:#6cddbe;background:linear-gradient(145deg,#174c55,#10383f)}
    html[data-theme="dark"] .premium-kpi .final-kpi-due{color:#ff99a8;background:linear-gradient(145deg,#573043,#3e2132)}
    html.logout-confirm-open,html.logout-confirm-open body{overflow:hidden!important}
    .logout-confirm-overlay{position:fixed;inset:0;z-index:12000;display:grid;place-items:center;padding:24px;background:rgba(12,25,44,.48);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);animation:mmLogoutFade .18s ease-out}
    .logout-confirm-card{width:min(420px,100%);position:relative;padding:31px 26px 24px;border:1px solid rgba(204,217,235,.92);border-radius:28px;background:linear-gradient(160deg,#fff,#f7faff);color:#17253b;text-align:center;box-shadow:0 30px 80px rgba(21,43,77,.25);animation:mmLogoutUp .22s cubic-bezier(.2,.8,.2,1)}
    .logout-confirm-close{position:absolute;top:14px;right:14px;width:36px;height:36px;border:1px solid #e1e8f1;border-radius:50%;background:#f1f5fa;color:#50627a;font-size:24px;line-height:1;cursor:pointer}
    .logout-confirm-icon{width:64px;height:64px;margin:0 auto 18px;border-radius:20px;display:grid;place-items:center;color:#d94d63;background:linear-gradient(145deg,#fff0f3,#ffe3e8);border:1px solid #ffd1d9}
    .logout-confirm-icon svg{width:30px;height:30px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    .logout-confirm-eyebrow{display:block;margin-bottom:8px;font:800 10px/1.2 Inter,sans-serif;letter-spacing:.16em;color:#7b8ba0}
    .logout-confirm-card h2{margin:0 0 9px;font-size:25px;letter-spacing:-.03em}
    .logout-confirm-card p{margin:0 auto 24px;max-width:330px;color:#68798f;font-size:13px;line-height:1.65}
    .logout-confirm-actions{display:grid;grid-template-columns:1fr 1.25fr;gap:10px}
    .logout-confirm-actions .btn{min-height:49px;border-radius:15px}
    .logout-confirm-cancel{background:#edf2f8!important;color:#35465d!important;border:1px solid #e0e7ef!important}
    .logout-confirm-submit{background:linear-gradient(135deg,#ec566c,#d63f58)!important;color:#fff!important;border:0!important;box-shadow:0 12px 24px rgba(213,62,86,.20)}
    html[data-theme="dark"] .logout-confirm-overlay{background:rgba(0,7,15,.68)}
    html[data-theme="dark"] .logout-confirm-card{border-color:#29445e;background:linear-gradient(160deg,#11263a,#0b1928);color:#f3f8ff;box-shadow:0 34px 90px rgba(0,0,0,.55)}
    html[data-theme="dark"] .logout-confirm-close{border-color:#304b63;background:#152a3e;color:#d6e3f1}
    html[data-theme="dark"] .logout-confirm-icon{color:#ff97a6;background:linear-gradient(145deg,#502a3d,#351d2c);border-color:#673347}
    html[data-theme="dark"] .logout-confirm-eyebrow{color:#8299b1}
    html[data-theme="dark"] .logout-confirm-card p{color:#9eb0c4}
    html[data-theme="dark"] .logout-confirm-cancel{background:#142b40!important;color:#e5eef8!important;border-color:#304c65!important}
    @keyframes mmLogoutFade{from{opacity:0}to{opacity:1}}
    @keyframes mmLogoutUp{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:none}}
    @keyframes mmLogoutSheet{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:none}}
    @media(max-width:600px){
      .premium-kpi .final-kpi-icon{width:42px!important;height:42px!important;flex-basis:42px!important;border-radius:14px}
      .premium-kpi .final-kpi-icon svg{width:22px;height:22px}
      .logout-confirm-overlay{place-items:end center;padding:0}
      .logout-confirm-card{width:100%;border-radius:28px 28px 0 0;padding:30px 20px max(24px,calc(18px + env(safe-area-inset-bottom)));animation:mmLogoutSheet .25s cubic-bezier(.2,.8,.2,1)}
      .logout-confirm-actions{grid-template-columns:1fr}
      .logout-confirm-submit{order:-1}
    }
    @media(prefers-reduced-motion:reduce){.logout-confirm-overlay,.logout-confirm-card{animation:none}}
  `;
  document.head.appendChild(style);

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
    for(const node of nodes){
      const next=normalizeText(node.nodeValue||'');
      if(next!==node.nodeValue)node.nodeValue=next;
    }
  }
  window.normalizeMessMoney=normalizeCurrency;

  const iconSvg={
    bazar:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h16l-1.5 10h-13L4 9Z"/><path d="m8 9 2.2-5M16 9l-2.2-5M8 13h8"/></svg>`,
    deposit:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h14.5A1.5 1.5 0 0 1 20 9v9.5A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-11Z"/><path d="M4 7.5V6a2 2 0 0 1 2-2h10.5M15 11.5h5v4h-5a2 2 0 0 1 0-4Z"/></svg>`,
    utility:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13.4 2-7 11h5.2l-1 9 7-12h-5.1l.9-8Z"/></svg>`,
    due:`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.2v6.2M12 17.2h.01"/></svg>`
  };
  const iconMap=new Map([
    ['মোট বাজার',['bazar',iconSvg.bazar]],
    ['মোট জমা',['deposit',iconSvg.deposit]],
    ['utility bills',['utility',iconSvg.utility]],
    ['মোট due',['due',iconSvg.due]]
  ]);
  function enhanceDashboardIcons(){
    document.querySelectorAll('#content .kpis .kpi').forEach(card=>{
      const label=(card.querySelector('.label')?.textContent||'').trim().replace(/\s+/g,' ');
      const match=iconMap.get(label)||iconMap.get(label.toLowerCase());
      if(!match)return;
      const[key,svg]=match;
      card.classList.add('premium-kpi',`premium-kpi-${key}`);
      let icon=card.querySelector('[data-final-kpi-icon]');
      if(!icon){
        icon=document.createElement('span');
        icon.dataset.finalKpiIcon=key;
        const previous=card.querySelector('.kpi-icon');
        if(previous)previous.replaceWith(icon);else card.prepend(icon);
      }
      icon.className=`kpi-icon final-kpi-icon final-kpi-${key}`;
      if(icon.innerHTML!==svg)icon.innerHTML=svg;
    });
  }

  let polishFrame=0;
  function schedulePolish(root){
    if(root)normalizeCurrency(root);
    if(polishFrame)return;
    polishFrame=requestAnimationFrame(()=>{
      polishFrame=0;
      enhanceDashboardIcons();
      normalizeCurrency(document.getElementById('content')||document.body);
    });
  }
  const observer=new MutationObserver(records=>{
    for(const record of records){
      if(record.type==='characterData')schedulePolish(record.target);
      else for(const node of record.addedNodes)schedulePolish(node);
    }
  });
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
  schedulePolish(document.body);

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
    document.body.insertAdjacentHTML('beforeend',`<div class="logout-confirm-overlay" id="${LOGOUT_ID}" role="presentation"><section class="logout-confirm-card" role="dialog" aria-modal="true" aria-labelledby="logoutConfirmTitle"><button type="button" class="logout-confirm-close" data-logout-cancel aria-label="Close">×</button><div class="logout-confirm-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10"/><path d="M14 8l4 4-4 4M18 12H9"/></svg></div><span class="logout-confirm-eyebrow">SECURE SIGN OUT</span><h2 id="logoutConfirmTitle">Logout করবেন?</h2><p>Mess Manager থেকে sign out করতে চাইলে নিচের button-এ confirm করুন।</p><div class="logout-confirm-actions"><button type="button" class="btn logout-confirm-cancel" data-logout-cancel>Cancel</button><button type="button" class="btn danger logout-confirm-submit" data-logout-confirm>Confirm Logout</button></div></section></div>`);
    document.documentElement.classList.add('logout-confirm-open');
    const overlay=document.getElementById(LOGOUT_ID);
    overlay.addEventListener('click',event=>{if(event.target===overlay)closeLogoutDialog();});
    overlay.querySelectorAll('[data-logout-cancel]').forEach(button=>button.addEventListener('click',closeLogoutDialog));
    overlay.querySelector('[data-logout-confirm]').addEventListener('click',async event=>{
      const button=event.currentTarget;
      const oldText=button.textContent;
      button.disabled=true;
      button.textContent='Logging out…';
      try{
        if(!client?.auth?.signOut)throw new Error('Logout service is unavailable.');
        const result=await client.auth.signOut();
        if(result?.error)throw result.error;
        document.querySelector('#moreSheet')?.remove();
        closeLogoutDialog();
      }catch(error){
        button.disabled=false;
        button.textContent=oldText;
        if(typeof notify==='function')notify(typeof friendlyError==='function'?friendlyError(error):(error?.message||'Logout failed.'));
      }
    });
    requestAnimationFrame(()=>overlay.querySelector('[data-logout-confirm]')?.focus({preventScroll:true}));
  }

  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;
    const trigger=target?.closest('#logout,#sheetLogout,.sheet-logout,[data-logout]');
    if(!trigger||trigger.closest(`#${LOGOUT_ID}`))return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openLogoutDialog(trigger);
  },true);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&document.getElementById(LOGOUT_ID))closeLogoutDialog();
  });
})();
