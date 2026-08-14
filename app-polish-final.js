/* Final app polish: integer money, premium KPI icons and stable in-app logout confirmation. */
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

    html.mm-logout-open,html.mm-logout-open body{overflow:hidden!important}
    .mm-logout-backdrop{position:fixed;inset:0;z-index:16000;display:grid;place-items:center;padding:18px;background:rgba(8,18,32,.58);backdrop-filter:blur(18px) saturate(115%);-webkit-backdrop-filter:blur(18px) saturate(115%);animation:mmLogoutFade .16s ease-out}
    .mm-logout-dialog{width:min(390px,calc(100vw - 36px));position:relative;overflow:hidden;border:1px solid rgba(213,223,237,.94);border-radius:28px;background:linear-gradient(165deg,rgba(255,255,255,.99),rgba(246,249,254,.99));color:#17243a;box-shadow:0 32px 90px rgba(13,30,55,.32);animation:mmLogoutRise .22s cubic-bezier(.2,.8,.2,1)}
    .mm-logout-dialog::before{content:"";position:absolute;inset:0 0 auto;height:5px;background:linear-gradient(90deg,#ff6578,#e94861 55%,#c93751)}
    .mm-logout-body{padding:28px 25px 18px;text-align:center}
    .mm-logout-mark{width:70px;height:70px;margin:2px auto 17px;border-radius:22px;display:grid;place-items:center;color:#df4560;background:linear-gradient(145deg,rgba(240,92,114,.12),rgba(217,64,89,.18));border:1px solid rgba(217,64,89,.18);box-shadow:0 10px 24px rgba(221,66,91,.10)}
    .mm-logout-mark::before{content:"";width:31px;height:31px;background:currentColor;-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10 M14 8l4 4-4 4 M18 12H9' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/contain no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10 M14 8l4 4-4 4 M18 12H9' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/contain no-repeat}
    .mm-logout-kicker{display:block;margin-bottom:8px;font:800 10px/1.2 Inter,sans-serif;letter-spacing:.18em;color:#8290a3;text-transform:uppercase}
    .mm-logout-dialog h2{margin:0;font-size:27px;line-height:1.08;letter-spacing:-.035em;color:inherit}
    .mm-logout-dialog p{margin:11px auto 0;max-width:305px;color:#6f7d91;font-size:13px;line-height:1.6}
    .mm-logout-actions{display:grid;grid-template-columns:1fr 1.08fr;gap:10px;padding:0 20px 21px}
    .mm-logout-actions button{min-height:50px;border-radius:16px;font:800 13px/1 Inter,"Noto Sans Bengali",sans-serif;cursor:pointer}
    .mm-logout-stay{border:1px solid #dce4ef;background:#eef3f8;color:#35465d}
    .mm-logout-confirm{border:0;background:linear-gradient(135deg,#f05c72,#d94059);color:#fff;box-shadow:0 12px 24px rgba(211,58,83,.22)}
    .mm-logout-actions button:disabled{opacity:.68;cursor:default}
    .mm-logout-close{position:absolute;top:14px;right:14px;width:36px;height:36px;border:1px solid #e1e8f0;border-radius:50%;background:rgba(241,245,250,.92);color:#5c6d83;font-size:22px;line-height:1;display:grid;place-items:center;cursor:pointer}
    html[data-theme="dark"] .mm-logout-backdrop{background:rgba(0,7,15,.74)}
    html[data-theme="dark"] .mm-logout-dialog{border-color:#2b455d;background:linear-gradient(165deg,#11263a,#0b1928);color:#f4f8fd;box-shadow:0 34px 96px rgba(0,0,0,.58)}
    html[data-theme="dark"] .mm-logout-mark{color:#ff95a5;background:linear-gradient(145deg,#512a3d,#351d2c);border-color:#693548;box-shadow:none}
    html[data-theme="dark"] .mm-logout-kicker{color:#8298af}
    html[data-theme="dark"] .mm-logout-dialog p{color:#9db0c4}
    html[data-theme="dark"] .mm-logout-stay{border-color:#304b63;background:#142a3f;color:#e7eff8}
    html[data-theme="dark"] .mm-logout-close{border-color:#304b63;background:#142a3f;color:#d8e4ef}
    @keyframes mmLogoutFade{from{opacity:0}to{opacity:1}}
    @keyframes mmLogoutRise{from{opacity:0;transform:translateY(12px) scale(.985)}to{opacity:1;transform:none}}
    @media(max-width:600px){.mm-kpi-icon{width:44px!important;height:44px!important;flex-basis:44px!important;border-radius:14px!important}.mm-kpi-icon::after{width:23px;height:23px}.mm-logout-backdrop{padding:16px}.mm-logout-dialog{width:min(380px,calc(100vw - 32px));border-radius:26px}.mm-logout-body{padding:27px 21px 17px}.mm-logout-actions{grid-template-columns:1fr 1fr;padding:0 18px 19px}.mm-logout-dialog h2{font-size:25px}}
    @media(prefers-reduced-motion:reduce){.mm-logout-backdrop,.mm-logout-dialog{animation:none}}
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

  const KPI_CLASS={'মোট বাজার':'mm-kpi-bazar','মোট জমা':'mm-kpi-deposit','utility bills':'mm-kpi-utility','মোট due':'mm-kpi-due'};
  function enhanceDashboardIcons(){
    document.querySelectorAll('#content .kpis .kpi').forEach(card=>{
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

  const auth=(typeof client!=='undefined'&&client?.auth)?client.auth:null;
  const rawSignOut=auth?.signOut?auth.signOut.bind(auth):null;
  let pendingResolve=null;
  let logoutOptions={scope:'local'};

  function finishPending(result){
    const resolve=pendingResolve;
    pendingResolve=null;
    if(resolve)resolve(result);
  }
  function closeLogoutDialog(result={error:null,cancelled:true}){
    document.getElementById('mmLogoutDialog')?.remove();
    document.documentElement.classList.remove('mm-logout-open');
    finishPending(result);
  }
  async function confirmLogout(event){
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
    const button=document.querySelector('#mmLogoutDialog [data-mm-logout-confirm]');
    if(!button||!rawSignOut)return;
    const old=button.textContent;
    button.disabled=true;
    button.textContent='Signing out…';
    try{
      const result=await rawSignOut(logoutOptions||{scope:'local'});
      if(result?.error)throw result.error;
      document.querySelector('#moreSheet')?.remove();
      closeLogoutDialog(result||{error:null});
    }catch(error){
      button.disabled=false;
      button.textContent=old;
      if(typeof notify==='function')notify(typeof friendlyError==='function'?friendlyError(error):(error?.message||'Unable to sign out.'));
    }
  }
  function cancelLogout(event){
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
    closeLogoutDialog({error:null,cancelled:true});
  }
  function showLogoutDialog(trigger=null,options={scope:'local'},resolve=null){
    if(document.getElementById('mmLogoutDialog')){
      if(resolve&&!pendingResolve)pendingResolve=resolve;
      return;
    }
    logoutOptions=options||{scope:'local'};
    pendingResolve=resolve||null;
    document.body.insertAdjacentHTML('beforeend',`<div class="mm-logout-backdrop" id="mmLogoutDialog" role="presentation"><section class="mm-logout-dialog" role="dialog" aria-modal="true" aria-labelledby="mmLogoutTitle" aria-describedby="mmLogoutText"><button type="button" class="mm-logout-close" data-mm-logout-cancel aria-label="Close">×</button><div class="mm-logout-body"><div class="mm-logout-mark" aria-hidden="true"></div><span class="mm-logout-kicker">Mess Manager</span><h2 id="mmLogoutTitle">Sign out?</h2><p id="mmLogoutText">You’ll be signed out on this device. Your mess data will remain safe and unchanged.</p></div><div class="mm-logout-actions"><button type="button" class="mm-logout-stay" data-mm-logout-cancel>Stay signed in</button><button type="button" class="mm-logout-confirm" data-mm-logout-confirm>Sign out</button></div></section></div>`);
    document.documentElement.classList.add('mm-logout-open');
    const overlay=document.getElementById('mmLogoutDialog');
    overlay.addEventListener('click',event=>{if(event.target===overlay)cancelLogout(event);});
    overlay.querySelectorAll('[data-mm-logout-cancel]').forEach(button=>button.addEventListener('click',cancelLogout,true));
    overlay.querySelector('[data-mm-logout-confirm]').addEventListener('click',confirmLogout,true);
    requestAnimationFrame(()=>overlay.querySelector('[data-mm-logout-confirm]')?.focus({preventScroll:true}));
  }
  window.requestMessLogout=(trigger=null,options={scope:'local'})=>new Promise(resolve=>showLogoutDialog(trigger,options,resolve));

  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;
    const trigger=target?.closest('#logout,#sheetLogout,.sheet-logout,[data-logout]');
    if(!trigger||trigger.closest('#mmLogoutDialog'))return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    showLogoutDialog(trigger,{scope:'local'},null);
  },true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.getElementById('mmLogoutDialog'))cancelLogout(event);});

  let frame=0;
  function polish(root=document.body){
    normalizeCurrency(root);
    if(frame)return;
    frame=requestAnimationFrame(()=>{
      frame=0;
      enhanceDashboardIcons();
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