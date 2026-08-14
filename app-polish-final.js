/* Final app polish: display-only integer money, premium KPI icons and safe logout confirmation. */
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
    .mm-kpi-icon{width:52px!important;height:52px!important;flex:0 0 52px!important;border-radius:17px!important;display:grid!important;place-items:center!important;font-size:0!important;line-height:0!important;position:relative!important;overflow:hidden!important;box-shadow:inset 0 1px rgba(255,255,255,.28),0 9px 22px rgba(28,64,115,.11)!important}
    .mm-kpi-icon::after{content:"";width:27px;height:27px;display:block;background:currentColor!important;-webkit-mask-image:var(--mm-kpi-mask)!important;mask-image:var(--mm-kpi-mask)!important;-webkit-mask-repeat:no-repeat!important;mask-repeat:no-repeat!important;-webkit-mask-position:center!important;mask-position:center!important;-webkit-mask-size:contain!important;mask-size:contain!important}
    .mm-kpi-bazar{--mm-kpi-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M4 9h16l-1.5 10h-13L4 9Z M8 9l2.2-5 M16 9l-2.2-5 M8 13h8' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");color:#2b70df!important;background:linear-gradient(145deg,#edf4ff,#dce9ff)!important}
    .mm-kpi-deposit{--mm-kpi-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M4 7.5h14.5A1.5 1.5 0 0 1 20 9v9.5A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-11Z M4 7.5V6a2 2 0 0 1 2-2h10.5 M15 11.5h5v4h-5a2 2 0 0 1 0-4Z' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");color:#167fc6!important;background:linear-gradient(145deg,#e9f8ff,#d8f0ff)!important}
    .mm-kpi-utility{--mm-kpi-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M6 3h9l4 4v14H6z M15 3v5h4 M9 12h6 M9 16h3 M14.5 12.5l-2 3h1.8l-.5 3 2.4-4h-1.8l.1-2Z' fill='none' stroke='black' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");color:#0c9275!important;background:linear-gradient(145deg,#e9faf4,#d7f3e9)!important}
    .mm-kpi-due{--mm-kpi-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='9' fill='none' stroke='black' stroke-width='1.8'/%3E%3Cpath d='M12 7.2v5.6 M12 16.8h.01' fill='none' stroke='black' stroke-width='1.9' stroke-linecap='round'/%3E%3C/svg%3E");color:#d94b65!important;background:linear-gradient(145deg,#fff0f3,#ffe0e7)!important}
    html[data-theme="dark"] .mm-kpi-icon{box-shadow:inset 0 1px rgba(255,255,255,.10),0 10px 24px rgba(0,0,0,.18)!important}
    html[data-theme="dark"] .mm-kpi-bazar{color:#72a9ff!important;background:linear-gradient(145deg,#173d70,#102d52)!important}
    html[data-theme="dark"] .mm-kpi-deposit{color:#68c9ff!important;background:linear-gradient(145deg,#174777,#103453)!important}
    html[data-theme="dark"] .mm-kpi-utility{color:#6ce0bd!important;background:linear-gradient(145deg,#174e56,#103a41)!important}
    html[data-theme="dark"] .mm-kpi-due{color:#ff9aa9!important;background:linear-gradient(145deg,#583044,#3e2232)!important}
    html.logout-confirm-open,html.logout-confirm-open body{overflow:hidden!important}
    .logout-confirm-overlay{position:fixed;inset:0;z-index:14000;display:grid;place-items:center;padding:24px;background:rgba(9,21,38,.54);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);animation:mmLogoutFade .18s ease-out}
    .logout-confirm-card{width:min(420px,100%);position:relative;padding:31px 26px 24px;border:1px solid rgba(207,220,237,.95);border-radius:28px;background:linear-gradient(160deg,#fff,#f7faff);color:#17253b;text-align:center;box-shadow:0 30px 80px rgba(21,43,77,.26);animation:mmLogoutUp .22s cubic-bezier(.2,.8,.2,1)}
    .logout-confirm-close{position:absolute;top:14px;right:14px;width:36px;height:36px;border:1px solid #e0e8f2;border-radius:50%;background:#f1f5fa;color:#52647b;font-size:24px;line-height:1;cursor:pointer}
    .logout-confirm-icon{width:64px;height:64px;margin:0 auto 18px;border-radius:20px;display:grid;place-items:center;color:#d94b63;background:linear-gradient(145deg,#fff0f3,#ffe2e8);border:1px solid #ffd0d8}
    .logout-confirm-icon::before{content:"";width:30px;height:30px;background:currentColor;-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10 M14 8l4 4-4 4 M18 12H9' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/contain no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10 M14 8l4 4-4 4 M18 12H9' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/contain no-repeat}
    .logout-confirm-eyebrow{display:block;margin-bottom:8px;font:800 10px/1.2 Inter,sans-serif;letter-spacing:.16em;color:#7b8ba0}
    .logout-confirm-card h2{margin:0 0 9px;font-size:25px;letter-spacing:-.03em}
    .logout-confirm-card p{margin:0 auto 24px;max-width:330px;color:#68798f;font-size:13px;line-height:1.65}
    .logout-confirm-actions{display:grid;grid-template-columns:1fr 1.25fr;gap:10px}
    .logout-confirm-actions .btn{min-height:49px;border-radius:15px}
    .logout-confirm-cancel{background:#edf2f8!important;color:#35465d!important;border:1px solid #e0e7ef!important}
    .logout-confirm-submit{background:linear-gradient(135deg,#ec566c,#d63f58)!important;color:#fff!important;border:0!important;box-shadow:0 12px 24px rgba(213,62,86,.20)}
    html[data-theme="dark"] .logout-confirm-overlay{background:rgba(0,7,15,.72)}
    html[data-theme="dark"] .logout-confirm-card{border-color:#29445e;background:linear-gradient(160deg,#11263a,#0b1928);color:#f3f8ff;box-shadow:0 34px 90px rgba(0,0,0,.56)}
    html[data-theme="dark"] .logout-confirm-close{border-color:#304b63;background:#152a3e;color:#d6e3f1}
    html[data-theme="dark"] .logout-confirm-icon{color:#ff97a6;background:linear-gradient(145deg,#502a3d,#351d2c);border-color:#673347}
    html[data-theme="dark"] .logout-confirm-eyebrow{color:#8299b1}
    html[data-theme="dark"] .logout-confirm-card p{color:#9eb0c4}
    html[data-theme="dark"] .logout-confirm-cancel{background:#142b40!important;color:#e5eef8!important;border-color:#304c65!important}
    @keyframes mmLogoutFade{from{opacity:0}to{opacity:1}}
    @keyframes mmLogoutUp{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:none}}
    @keyframes mmLogoutSheet{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:none}}
    @media(max-width:600px){.mm-kpi-icon{width:44px!important;height:44px!important;flex-basis:44px!important;border-radius:14px!important}.mm-kpi-icon::after{width:23px;height:23px}.logout-confirm-overlay{place-items:end center;padding:0}.logout-confirm-card{width:100%;border-radius:28px 28px 0 0;padding:30px 20px max(24px,calc(18px + env(safe-area-inset-bottom)));animation:mmLogoutSheet .25s cubic-bezier(.2,.8,.2,1)}.logout-confirm-actions{grid-template-columns:1fr}.logout-confirm-submit{order:-1}}
    @media(prefers-reduced-motion:reduce){.logout-confirm-overlay,.logout-confirm-card{animation:none}}
  `;
  document.head.appendChild(style);

  const CURRENCY_PATTERN=/([+-]?\s*৳\s*)(-?\d[\d,]*(?:\.\d+)?)/g;
  const BDT_PATTERN=/(\bBDT\s+)(-?\d[\d,]*(?:\.\d+)?)/gi;
  const normalizeText=text=>String(text)
    .replace(CURRENCY_PATTERN,(full,prefix,raw)=>{const n=Number(String(raw).replace(/,/g,''));return Number.isFinite(n)?`${prefix}${formatInteger(n)}`:full;})
    .replace(BDT_PATTERN,(full,prefix,raw)=>{const n=Number(String(raw).replace(/,/g,''));return Number.isFinite(n)?`${prefix}${formatInteger(n)}`:full;});
  function normalizeCurrency(root=document.body){
    if(!root)return;
    const nodes=[];
    if(root.nodeType===Node.TEXT_NODE)nodes.push(root);
    else if(root.nodeType===Node.ELEMENT_NODE||root.nodeType===Node.DOCUMENT_NODE||root.nodeType===Node.DOCUMENT_FRAGMENT_NODE){
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(node){
        const value=node.nodeValue||'';
        if(!value.includes('৳')&&!/\bBDT\b/i.test(value))return NodeFilter.FILTER_REJECT;
        const parent=node.parentElement;
        if(!parent||parent.closest('script,style,textarea,select,option,input'))return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }});
      while(walker.nextNode())nodes.push(walker.currentNode);
    }
    for(const node of nodes){const next=normalizeText(node.nodeValue||'');if(next!==node.nodeValue)node.nodeValue=next;}
  }
  window.normalizeMessMoney=normalizeCurrency;

  const KPI_CLASS={
    'মোট বাজার':'mm-kpi-bazar',
    'মোট জমা':'mm-kpi-deposit',
    'utility bills':'mm-kpi-utility',
    'মোট due':'mm-kpi-due'
  };
  function enhanceDashboardIcons(root=document){
    const scope=root?.querySelectorAll?root:document;
    scope.querySelectorAll('#content .kpis .kpi').forEach(card=>{
      const label=(card.querySelector('.label')?.textContent||'').trim().replace(/\s+/g,' ');
      const cls=KPI_CLASS[label]||KPI_CLASS[label.toLowerCase()];
      if(!cls)return;
      let icon=card.querySelector('.kpi-icon');
      if(!icon){icon=document.createElement('span');card.prepend(icon);}
      icon.textContent='';
      icon.removeAttribute('style');
      icon.className=`kpi-icon mm-kpi-icon ${cls}`;
      icon.setAttribute('aria-hidden','true');
    });
  }

  const LOGOUT_ID='logoutConfirmDialog';
  let logoutReturnFocus=null;
  function closeLogoutDialog(){
    document.getElementById(LOGOUT_ID)?.remove();
    document.documentElement.classList.remove('logout-confirm-open');
    if(logoutReturnFocus?.isConnected)logoutReturnFocus.focus({preventScroll:true});
    logoutReturnFocus=null;
  }
  async function performLogout(button){
    const old=button.textContent;
    button.disabled=true;
    button.textContent='Logging out…';
    try{
      if(!client?.auth?.signOut)throw new Error('Logout service is unavailable.');
      const result=await client.auth.signOut({scope:'local'});
      if(result?.error)throw result.error;
      document.querySelector('#moreSheet')?.remove();
      closeLogoutDialog();
    }catch(error){
      button.disabled=false;
      button.textContent=old;
      if(typeof notify==='function')notify(typeof friendlyError==='function'?friendlyError(error):(error?.message||'Logout failed.'));
    }
  }
  function openLogoutDialog(trigger){
    if(document.getElementById(LOGOUT_ID))return;
    logoutReturnFocus=trigger||null;
    document.body.insertAdjacentHTML('beforeend',`<div class="logout-confirm-overlay" id="${LOGOUT_ID}" role="presentation"><section class="logout-confirm-card" role="dialog" aria-modal="true" aria-labelledby="logoutConfirmTitle"><button type="button" class="logout-confirm-close" data-logout-cancel aria-label="Close">×</button><div class="logout-confirm-icon" aria-hidden="true"></div><span class="logout-confirm-eyebrow">SECURE SIGN OUT</span><h2 id="logoutConfirmTitle">Logout করবেন?</h2><p>Confirm করলে এই device থেকে sign out হবে। আবার ঢুকতে OTP verification লাগবে।</p><div class="logout-confirm-actions"><button type="button" class="btn logout-confirm-cancel" data-logout-cancel>Cancel</button><button type="button" class="btn danger logout-confirm-submit" data-logout-confirm>Confirm Logout</button></div></section></div>`);
    document.documentElement.classList.add('logout-confirm-open');
    const overlay=document.getElementById(LOGOUT_ID);
    overlay.addEventListener('click',event=>{if(event.target===overlay)closeLogoutDialog();});
    overlay.querySelectorAll('[data-logout-cancel]').forEach(button=>button.addEventListener('click',closeLogoutDialog));
    overlay.querySelector('[data-logout-confirm]').addEventListener('click',event=>performLogout(event.currentTarget));
    requestAnimationFrame(()=>overlay.querySelector('[data-logout-confirm]')?.focus({preventScroll:true}));
  }
  function stopAndConfirm(event,trigger){
    if(!trigger||trigger.closest(`#${LOGOUT_ID}`))return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();openLogoutDialog(trigger);
  }
  function bindLogoutTriggers(root=document){
    const scope=root?.querySelectorAll?root:document;
    scope.querySelectorAll('#logout,#sheetLogout,.sheet-logout,[data-logout]').forEach(trigger=>{
      if(trigger.dataset.mmLogoutConfirmBound==='1')return;
      trigger.dataset.mmLogoutConfirmBound='1';
      trigger.addEventListener('click',event=>stopAndConfirm(event,trigger),true);
    });
  }
  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;
    const trigger=target?.closest('#logout,#sheetLogout,.sheet-logout,[data-logout]');
    if(trigger)stopAndConfirm(event,trigger);
  },true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.getElementById(LOGOUT_ID))closeLogoutDialog();});

  let frame=0;
  function polish(root=document.body){
    normalizeCurrency(root);
    if(frame)return;
    frame=requestAnimationFrame(()=>{
      frame=0;
      enhanceDashboardIcons(document);
      bindLogoutTriggers(document);
      normalizeCurrency(document.getElementById('content')||document.body);
    });
  }
  const observer=new MutationObserver(records=>{
    for(const record of records){
      if(record.type==='characterData')normalizeCurrency(record.target);
      else for(const node of record.addedNodes)polish(node);
    }
  });
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
  polish(document.body);
})();
