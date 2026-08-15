/* Utility sharing cards, reports, notices and mess chat. */
'use strict';
(() => {
  const baseLoadData = loadData;
  let chatRealtimeChannel = null;
  let chatUnread = 0;

  function chatReadKey(){
    return profile ? `mm_chat_read:${profile.mess_id}:${profile.id}` : '';
  }
  function latestMessageStamp(){
    const list=db.messages||[];
    return list.length ? String(list[list.length-1].created_at||'') : '';
  }
  function renderUnreadBadges(){
    document.querySelectorAll('.mm-chat-unread').forEach(x=>x.remove());
    if(!chatUnread)return;
    const text=chatUnread>99?'99+':String(chatUnread);
    const targets=[document.querySelector('.nav [data-page="chat"]'),document.querySelector('#mobileMore'),document.querySelector('[data-sheet-page="chat"]')].filter(Boolean);
    targets.forEach(target=>{const badge=document.createElement('span');badge.className='mm-chat-unread';badge.textContent=text;badge.setAttribute('aria-label',`${chatUnread} unread chat messages`);target.appendChild(badge);});
  }
  function syncUnreadFromMessages(){
    if(!profile)return;
    const key=chatReadKey(),messages=db.messages||[];
    let lastRead='';
    try{lastRead=localStorage.getItem(key)||'';}catch(_){/* ignore storage errors */}
    if(!lastRead){
      const initial=latestMessageStamp()||new Date().toISOString();
      try{localStorage.setItem(key,initial);}catch(_){/* ignore storage errors */}
      chatUnread=0;
    }else{
      const cutoff=Date.parse(lastRead)||0;
      chatUnread=messages.filter(m=>m.sender_member_id!==profile.id&&(Date.parse(m.created_at)||0)>cutoff).length;
    }
    renderUnreadBadges();
  }
  function markChatRead(){
    if(!profile)return;
    const stamp=latestMessageStamp()||new Date().toISOString();
    try{localStorage.setItem(chatReadKey(),stamp);}catch(_){/* ignore storage errors */}
    chatUnread=0;
    renderUnreadBadges();
  }

  window.loadData = async function loadDataPlus(){
    await baseLoadData();
    const [messages, notices] = await Promise.all([
      client.from('mess_messages').select('*').order('created_at',{ascending:true}).limit(200),
      client.from('mess_notices').select('*').order('created_at',{ascending:false}).limit(30)
    ]);
    db.messages = messages.error ? [] : messages.data;
    db.notices = notices.error ? [] : notices.data;
    syncUnreadFromMessages();
  };

  function splitAmount(u){ return Number(u.amount||0)/(u.memberIds.length||1); }
  function initials(name){ return String(name||'M').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase(); }

  window.utilities = function utilitiesPro(c){
    const controls=profile.role==='admin';
    c.innerHTML=`<div class="section-head"><div><span class="eyebrow">Monthly shared costs</span><h2>Utility Bills</h2></div>${controls?'<button class="btn primary" data-add>+ Add Bill</button>':''}</div><div class="utility-list">${db.utilities.map(u=>{const each=splitAmount(u);return `<article class="utility-card"><div class="utility-top"><div class="utility-icon">${u.type==='Gas'?'🔥':u.type==='WiFi'?'⌁':u.type==='Current'?'⚡':'▦'}</div><div class="utility-title"><span>${esc(u.date)}</span><h3>${esc(u.type)}</h3></div><div class="utility-amount"><span>Total</span><b>${money(u.amount)}</b></div></div><div class="split-banner"><div><span>Shared by</span><b>${u.memberIds.length} member${u.memberIds.length===1?'':'s'}</b></div><div><span>Per person</span><b>${money(each)}</b></div></div><div class="member-chip-list">${u.memberIds.map(id=>`<span class="member-chip"><i>${esc(initials(memberName(id)))}</i>${esc(memberName(id))}<b>${money(each)}</b></span>`).join('')}</div>${controls?`<div class="entry-actions"><button class="btn" data-edit="${u.id}">Edit</button><button class="btn danger" data-delete="${u.id}" data-kind="utilities">Delete</button></div>`:''}</article>`;}).join('')||'<div class="card empty">No utility bills</div>'}</div>`;
    if(controls)bindCrud(c,'utilities',utilityModal);
  };

  function reportText(memberCalc){
    return `${mess.name}\nMonthly Statement — ${state.month}\n\nMember: ${memberCalc.member.name}\nMeals: ${memberCalc.units}\nDeposit: ${money(memberCalc.deposit)}\nFood: ${money(memberCalc.food)}\nUtility: ${money(memberCalc.util)}\nTotal bill: ${money(memberCalc.total)}\n${memberCalc.balance>=0?'Advance':'Due'}: ${money(Math.abs(memberCalc.balance))}`;
  }
  function downloadStatement(memberCalc){
    const html=`<!doctype html><meta charset="utf-8"><title>${esc(memberCalc.member.name)} statement</title><style>body{font-family:system-ui;padding:36px;color:#172033}.box{max-width:680px;margin:auto;border:1px solid #dde5ef;border-radius:20px;padding:28px}h1{color:#2457d6}.row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #edf1f7}.total{font-size:22px;font-weight:800}</style><div class="box"><h1>${esc(mess.name)}</h1><p>Monthly Statement · ${esc(state.month)}</p><h2>${esc(memberCalc.member.name)}</h2>${[['Meals',memberCalc.units],['Deposit',money(memberCalc.deposit)],['Food',money(memberCalc.food)],['Utility',money(memberCalc.util)],['Total bill',money(memberCalc.total)],[memberCalc.balance>=0?'Advance':'Due',money(Math.abs(memberCalc.balance))]].map(([a,b])=>`<div class="row"><span>${a}</span><b>${b}</b></div>`).join('')}<p>Generated by Mess Manager</p></div><script>window.onload=()=>window.print()<\/script>`;
    const w=window.open('','_blank'); if(!w)return notify('Allow pop-ups to generate PDF.'); w.document.write(html);w.document.close();
  }
  async function sendMemberEmail(memberId,subject,message){
    const r=await client.functions.invoke('mess-notify',{body:{member_id:memberId,subject,message}}); if(r.error)throw r.error;if(r.data?.error)throw new Error(r.data.error);return r.data;
  }
  async function saveNotice(memberId,title,body,type='general'){
    assertResult(await client.from('mess_notices').insert({mess_id:profile.mess_id,created_by:profile.id,target_member_id:memberId||null,title,body,notice_type:type}));
  }
  function noticeModal(memberId){
    const m=db.members.find(x=>x.id===memberId);modal(`<div class="modal-title"><div><span class="eyebrow">Payment reminder</span><h2>Send notice</h2></div><button class="icon-btn" data-close>×</button></div><form id="noticeForm"><div class="field"><label>Member</label><input value="${esc(m?.name||'')}" readonly/></div><div class="field gap-top"><label>Message</label><textarea name="message" rows="5" required>আপনার এই মাসের মেসের বকেয়া/জমার হিসাব দেখে প্রয়োজনীয় টাকা জমা দেওয়ার অনুরোধ রইল।</textarea></div><label class="check-row"><input type="checkbox" name="email" ${m?.email?'checked':'disabled'}/> Email-এও পাঠান ${m?.email?`(${esc(m.email)})`:'— email নেই'}</label><div class="actions gap-top"><button class="btn primary">Send notice</button><button class="btn" type="button" data-close2>Cancel</button></div></form>`);$('[data-close]').onclick=closeModal;$('[data-close2]').onclick=closeModal;$('#noticeForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),message=f.get('message').trim();await run(async()=>{await saveNotice(memberId,'টাকা জমা দেওয়ার অনুরোধ',message,'deposit');if(f.get('email'))await sendMemberEmail(memberId,`${mess.name}: Deposit reminder`,message);closeModal();await loadData();},'Notice sent.');};
  }

  window.reports = function reportsPro(c){
    const calc=calcMonth();
    c.innerHTML=`<div class="section-head"><div><span class="eyebrow">Statements & reminders</span><h2>Reports</h2></div></div><div class="report-hero"><div><h3>${esc(state.month)} হিসাব</h3><p>প্রতি member-এর complete monthly statement generate করুন, PDF হিসেবে save করুন এবং admin হলে email/notice পাঠান।</p></div><div class="report-total"><span>Total members</span><b>${calc.length}</b></div></div><div class="report-list">${calc.map(x=>`<article class="report-card"><div class="report-person"><div class="avatar">${esc(initials(x.member.name))}</div><div><h3>${esc(x.member.name)}</h3><span>${x.member.email?esc(x.member.email):'Email not added'}</span></div>${x.balance>=0?`<span class="pill advance">Advance ${money(x.balance)}</span>`:`<span class="pill due">Due ${money(-x.balance)}</span>`}</div><div class="report-mini"><span><small>Deposit</small><b>${money(x.deposit)}</b></span><span><small>Total bill</small><b>${money(x.total)}</b></span><span><small>Meals</small><b>${x.units}</b></span></div><div class="report-actions"><button class="btn" data-pdf="${x.member.id}">Generate PDF</button>${profile.role==='admin'?`<button class="btn" data-notice="${x.member.id}">Send notice</button><button class="btn primary" data-email="${x.member.id}" ${x.member.email?'':'disabled'}>Email হিসাব</button>`:''}</div></article>`).join('')}</div>`;
    c.querySelectorAll('[data-pdf]').forEach(b=>b.onclick=()=>downloadStatement(calc.find(x=>x.member.id===b.dataset.pdf)));
    c.querySelectorAll('[data-notice]').forEach(b=>b.onclick=()=>noticeModal(b.dataset.notice));
    c.querySelectorAll('[data-email]').forEach(b=>b.onclick=()=>{const x=calc.find(y=>y.member.id===b.dataset.email);run(()=>sendMemberEmail(x.member.id,`${mess.name}: ${state.month} monthly statement`,reportText(x)),'Statement emailed.');});
  };

  function pushCapable(){return 'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;}
  function isIOS(){return /iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);}
  function isStandalone(){return window.matchMedia?.('(display-mode: standalone)').matches===true||navigator.standalone===true;}
  function b64ToBytes(value){
    const padding='='.repeat((4-value.length%4)%4),base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(base64),out=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
    return out;
  }
  function notificationCard(){
    return `<div class="mm-chat-notify-card" data-mm-notify-card><div class="mm-chat-notify-icon" aria-hidden="true"></div><div class="mm-chat-notify-copy"><div class="mm-chat-notify-title"><b>Message notifications</b><span class="mm-chat-notify-status off" data-mm-notify-status>Checking</span></div><p data-mm-notify-copy>Checking notification support on this device…</p></div><button class="mm-chat-notify-action" type="button" data-mm-notify-action disabled>Checking…</button></div>`;
  }
  function setNotificationUI({label='OFF',kind='off',copy='',button='Enable',action='enable',disabled=false,secondary=false}){
    const card=document.querySelector('[data-mm-notify-card]');if(!card)return;
    const status=card.querySelector('[data-mm-notify-status]'),text=card.querySelector('[data-mm-notify-copy]'),control=card.querySelector('[data-mm-notify-action]');
    status.textContent=label;status.className=`mm-chat-notify-status ${kind}`;text.textContent=copy;control.textContent=button;control.dataset.action=action;control.disabled=disabled;control.classList.toggle('secondary',secondary);
  }
  async function refreshNotificationUI(){
    if(!document.querySelector('[data-mm-notify-card]'))return;
    if(!pushCapable())return setNotificationUI({label:'Unavailable',kind:'off',copy:'এই browser Web Push support করছে না।',button:'Unavailable',disabled:true});
    if(isIOS()&&!isStandalone())return setNotificationUI({label:'Home Screen needed',kind:'warn',copy:'iPhone/iPad-এ notification পেতে আগে Share → Add to Home Screen দিয়ে app install করুন।',button:'Install first',disabled:true});
    if(Notification.permission==='denied')return setNotificationUI({label:'Blocked',kind:'warn',copy:'Notification permission browser settings থেকে Allow করতে হবে।',button:'Blocked',disabled:true});
    try{
      const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();
      if(Notification.permission==='granted'&&sub)return setNotificationUI({label:'ON',kind:'on',copy:'এই device-এ নতুন Mess Chat message background-এও notify করবে।',button:'Turn off',action:'disable',secondary:true});
      setNotificationUI({label:'OFF',kind:'off',copy:'নতুন chat message এলে website/PWA বন্ধ থাকলেও notification পেতে চালু করুন।',button:'Enable',action:'enable'});
    }catch(error){console.warn('notification status failed',error);setNotificationUI({label:'Unavailable',kind:'warn',copy:'Notification service এখন প্রস্তুত নয়। পরে আবার চেষ্টা করুন।',button:'Retry',action:'enable'});}
  }
  async function enableChatNotifications(){
    if(!pushCapable())throw Error('এই browser Web Push support করে না।');
    if(isIOS()&&!isStandalone())throw Error('iPhone/iPad-এ আগে Add to Home Screen করুন।');
    let permission=Notification.permission;
    if(permission==='default')permission=await Notification.requestPermission();
    if(permission!=='granted')throw Error('Notification permission Allow করা হয়নি।');
    const reg=await navigator.serviceWorker.ready;
    const keyResult=await client.functions.invoke('chat-push',{body:{action:'public-key'}});
    if(keyResult.error)throw keyResult.error;if(keyResult.data?.error)throw Error(keyResult.data.error);
    const publicKey=String(keyResult.data?.public_key||'');if(!publicKey)throw Error('Push service public key পাওয়া যায়নি।');
    let subscription=await reg.pushManager.getSubscription();
    if(!subscription)subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToBytes(publicKey)});
    const serialized=subscription.toJSON(),keys=serialized.keys||{};
    const saved=await client.rpc('save_push_subscription',{p_endpoint:subscription.endpoint,p_p256dh:String(keys.p256dh||''),p_auth:String(keys.auth||''),p_user_agent:navigator.userAgent||''});
    if(saved.error)throw saved.error;
    return subscription;
  }
  async function disableChatNotifications(){
    if(!pushCapable())return;
    const reg=await navigator.serviceWorker.ready,subscription=await reg.pushManager.getSubscription();
    if(!subscription)return;
    const removed=await client.rpc('remove_push_subscription',{p_endpoint:subscription.endpoint});
    if(removed.error)throw removed.error;
    await subscription.unsubscribe();
  }
  function bindNotificationControls(){
    const button=document.querySelector('[data-mm-notify-action]');if(!button)return;
    button.onclick=async()=>{
      if(button.disabled)return;
      const action=button.dataset.action||'enable',old=button.textContent;button.disabled=true;button.textContent=action==='disable'?'Turning off…':'Enabling…';
      try{if(action==='disable'){await disableChatNotifications();notify('Chat notifications turned off.','success');}else{await enableChatNotifications();notify('Chat notifications enabled.','success');}}catch(error){notify(friendlyError(error));}finally{button.textContent=old;await refreshNotificationUI();}
    };
    refreshNotificationUI();
  }

  async function sendChatMessage(body){
    const result=await client.functions.invoke('chat-push',{body:{action:'send-message',message:body}});
    if(result.error)throw result.error;if(result.data?.error)throw Error(result.data.error);return result.data;
  }

  window.chat = async function chatPage(c){
    const messages=db.messages||[];
    c.innerHTML=`<div class="chat-shell"><div class="chat-head"><div><span class="eyebrow">Mess community</span><h2>Chat & খাবার আলোচনা</h2><p>Problem, বাজার, আগামীকালের খাবার—সবাই এখানে share করতে পারবে।</p></div></div>${notificationCard()}${(db.notices||[]).length?`<div class="notice-strip"><b>Latest notice</b><span>${esc(db.notices[0].title)} — ${esc(db.notices[0].body)}</span></div>`:''}<div class="chat-messages" id="chatMessages">${messages.map(m=>{const mine=m.sender_member_id===profile.id;return `<div class="chat-row ${mine?'mine':''}"><div class="chat-avatar">${esc(initials(memberName(m.sender_member_id)))}</div><div class="chat-bubble"><div><b>${esc(memberName(m.sender_member_id))}</b><time>${new Date(m.created_at).toLocaleString()}</time></div><p>${esc(m.body)}</p></div></div>`;}).join('')||'<div class="chat-empty">এখনও কোনো message নেই। প্রথম message লিখুন।</div>'}</div><form class="chat-compose" id="chatForm"><textarea name="body" rows="1" maxlength="2000" placeholder="Message লিখুন…" required></textarea><button class="btn primary" aria-label="Send">Send</button></form></div>`;
    markChatRead();
    const list=$('#chatMessages');if(list)list.scrollTop=list.scrollHeight;
    bindNotificationControls();
    $('#chatForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),body=f.get('body').trim();if(!body)return;await run(async()=>{await sendChatMessage(body);e.target.reset();await loadData();await chatPage(c);});};
  };

  async function handleIncomingMessage(payload){
    const message=payload?.new;if(!message||!profile||message.mess_id!==profile.mess_id)return;
    const messages=db.messages||(db.messages=[]);
    if(!messages.some(x=>x.id===message.id))messages.push(message);
    messages.sort((a,b)=>(Date.parse(a.created_at)||0)-(Date.parse(b.created_at)||0));
    if(messages.length>200)messages.splice(0,messages.length-200);
    if(message.sender_member_id===profile.id){if(state.page==='chat'&&document.visibilityState==='visible')markChatRead();return;}
    if(state.page==='chat'&&document.visibilityState==='visible'){
      markChatRead();
      const content=$('#content');if(content)await chat(content);
      return;
    }
    syncUnreadFromMessages();
    if(document.visibilityState==='visible'){
      const sender=memberName(message.sender_member_id),preview=String(message.body||'').slice(0,110);
      notify(`${sender}: ${preview}`,'success');
    }
  }

  const oldRenderPage=renderPage;
  window.renderPage=function renderPagePlus(){
    if(state.page==='chat')return chat($('#content'));
    const result=oldRenderPage();requestAnimationFrame(renderUnreadBadges);return result;
  };

  const oldSubscribe=subscribeRealtime;
  window.subscribeRealtime=function subscribeRealtimePlus(){
    oldSubscribe();
    if(chatRealtimeChannel)client.removeChannel(chatRealtimeChannel);
    if(!profile)return;
    chatRealtimeChannel=client.channel(`mess-chat:${profile.mess_id}:${profile.id}`)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'mess_messages',filter:`mess_id=eq.${profile.mess_id}`},handleIncomingMessage)
      .subscribe();
  };

  function openChatFromIntent(){
    if(!profile)return false;
    const url=new URL(location.href);if(url.searchParams.get('open')!=='chat')return false;
    url.searchParams.delete('open');history.replaceState(null,'',`${url.pathname}${url.search}${url.hash}`);go('chat');return true;
  }
  if('serviceWorker' in navigator){
    navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='open-chat'){if(profile)go('chat');}});
  }
  document.addEventListener('click',event=>{if(event.target instanceof Element&&event.target.closest('#mobileMore'))setTimeout(renderUnreadBadges,0);});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.page==='chat')markChatRead();});
  if(client)client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'&&chatRealtimeChannel){client.removeChannel(chatRealtimeChannel);chatRealtimeChannel=null;chatUnread=0;}});
  window.addEventListener('load',()=>{let tries=0;const timer=setInterval(()=>{if(openChatFromIntent()||++tries>40)clearInterval(timer);},250);});
})();
