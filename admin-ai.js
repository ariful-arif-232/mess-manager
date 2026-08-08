/* Free admin-only Bangla voice assistant. No paid AI API required. */
'use strict';
(() => {
  let recognition = null;
  let listening = false;

  const bnDigits = {'০':'0','১':'1','২':'2','৩':'3','৪':'4','৫':'5','৬':'6','৭':'7','৮':'8','৯':'9'};
  const wordNums = new Map([
    ['এক',1],['দুই',2],['তিন',3],['চার',4],['পাঁচ',5],['ছয়',6],['ছয়',6],['সাত',7],['আট',8],['নয়',9],['নয়',9],['দশ',10],
    ['এগারো',11],['বারো',12],['তেরো',13],['চৌদ্দ',14],['পনেরো',15],['ষোল',16],['সতেরো',17],['আঠারো',18],['উনিশ',19],['বিশ',20],
    ['পঁচিশ',25],['তিরিশ',30],['ত্রিশ',30],['চল্লিশ',40],['পঞ্চাশ',50],['ষাট',60],['সত্তর',70],['আশি',80],['নব্বই',90],['একশ',100],['একশো',100],
    ['হাজার',1000]
  ]);

  const unitAliases = [
    ['kg',['kg','kgs','কেজি','কিলো','কিলোগ্রাম']],
    ['L',['l','liter','litre','লিটার','লিটার']],
    ['হালি',['হালি','hali']],
    ['pcs',['pcs','pc','piece','pieces','পিস','টা','টি']],
    ['আঁটি',['আঁটি','আটি','bundle']]
  ];
  const unitPattern = '(kg|kgs|কেজি|কিলো|কিলোগ্রাম|l|liter|litre|লিটার|হালি|hali|pcs|pc|piece|pieces|পিস|টা|টি|আঁটি|আটি|bundle)';

  function normalizeDigits(text) {
    return String(text || '').replace(/[০-৯]/g, d => bnDigits[d]).replace(/,/g,' ');
  }
  function normalize(text) {
    let s = normalizeDigits(text).toLowerCase().replace(/[।!?]/g,' ').replace(/\s+/g,' ').trim();
    for (const [word,n] of wordNums) s = s.replace(new RegExp(`(^|\\s)${word}(?=\\s|$)`, 'g'), `$1${n}`);
    return s;
  }
  function num(v) { const n = Number(normalizeDigits(v)); return Number.isFinite(n) ? n : NaN; }
  function canonicalUnit(raw) {
    const s = String(raw || '').toLowerCase();
    for (const [unit,list] of unitAliases) if (list.includes(s)) return unit;
    return 'pcs';
  }
  function guessCategory(name) {
    const n = normalize(name);
    if (/চাল|rice/.test(n)) return 'চাল';
    if (/ডাল|dal|lentil/.test(n)) return 'ডাল';
    if (/তেল|oil/.test(n)) return 'তেল';
    if (/ডিম|egg/.test(n)) return 'ডিম';
    if (/মুরগ|chicken/.test(n)) return 'মুরগি';
    if (/মাছ|fish/.test(n)) return 'মাছ';
    if (/আলু|পেঁয়াজ|পিয়াজ|রসুন|আদা|টমেটো|মরিচ|বেগুন|শসা|পটল|লাউ|কুমড়া|কুমড়া|ঢেঁড়স|ঢেঁড়স|করলা|পেঁপে|ফুলকপি|বাঁধাকপি|শিম|গাজর|লেবু|ধনেপাতা|শাক|সবজি|vegetable/.test(n)) return 'কাঁচাবাজার';
    if (/সাবান|ডিটারজেন্ট|হারপিক|ভিম|টিস্যু|clean|soap/.test(n)) return 'Cleaning';
    if (/মসলা|মশলা|spice|লবণ|হলুদ|মরিচ গুঁড়া|জিরা/.test(n)) return 'Spice';
    return 'অন্যান্য';
  }
  function guessUnit(name) {
    const n = normalize(name);
    if (/তেল|oil/.test(n)) return 'L';
    if (/ডিম|egg/.test(n)) return 'হালি';
    if (/ধনেপাতা|শাক/.test(n)) return 'আঁটি';
    if (/লাউ|ফুলকপি|বাঁধাকপি|লেবু|সাবান|টিস্যু/.test(n)) return 'pcs';
    return 'kg';
  }
  function cleanItemName(raw) {
    return String(raw || '')
      .replace(/^(আজ|কাল|গতকাল|আমি|আমরা|বাজার|বাজারে|বাজার করেছি|কিনেছি|কিনলাম|নিয়েছি|নিলাম|এবং|আর)\s*/gi,'')
      .replace(/\b(category|ক্যাটাগরি)\b.*$/i,'')
      .trim();
  }
  function resolveMember(text, fallbackCurrent=false) {
    const t = normalize(text);
    const active = db.members.filter(m => m.active);
    let matches = active.filter(m => {
      const full = normalize(m.name);
      const first = full.split(' ')[0];
      return full && (t.includes(full) || (first.length >= 3 && t.includes(first)));
    });
    if (matches.length === 1) return matches[0];
    if (fallbackCurrent) return active.find(m => m.id === profile.id) || null;
    return null;
  }
  function detectDate(text) {
    const t = normalize(text);
    const d = new Date();
    if (/কাল|tomorrow/.test(t)) d.setDate(d.getDate()+1);
    else if (/গতকাল|yesterday/.test(t)) d.setDate(d.getDate()-1);
    return d.toISOString().slice(0,10);
  }
  function speak(text) {
    if (!('speechSynthesis' in window) || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang='bn-BD'; u.rate=.96;
    const v = speechSynthesis.getVoices().find(x => /^bn/i.test(x.lang)); if (v) u.voice=v;
    speechSynthesis.speak(u);
  }
  function bubble(kind,text) {
    const log = $('#aiChatLog'); if(!log) return;
    const el=document.createElement('div'); el.className=`ai-bubble ${kind}`; el.textContent=text; log.appendChild(el); log.scrollTop=log.scrollHeight;
  }
  function answer(text, ok=false) { bubble(ok?'assistant success':'assistant',text); speak(text); }

  function parseBazarItems(text) {
    const normalized = normalize(text)
      .replace(/\s+(এবং|and|আর)\s+/g, ',')
      .replace(/\s*;\s*/g, ',');
    const pieces = normalized.split(',').map(x=>x.trim()).filter(Boolean);
    const items=[];

    for (let piece of pieces) {
      piece = piece.replace(/^(আজ|গতকাল|আমি|আমরা|[\p{L} .'-]+ বাজার করেছি|[\p{L} .'-]+ বাজার করেছে|বাজার করেছি|বাজারে|কিনেছি|কিনলাম)\s*/u,'').trim();
      const rx = new RegExp(`(.+?)\\s+(\\d+(?:\\.\\d+)?)\\s*${unitPattern}\\s+(?:দর\\s*)?(\\d+(?:\\.\\d+)?)\\s*(?:টাকা|taka|tk)(?:\\s*(?:প্রতি\\s*)?${unitPattern})?`, 'i');
      const m = piece.match(rx);
      if (m) {
        const itemName=cleanItemName(m[1]); const quantity=num(m[2]); const unit=canonicalUnit(m[3]); const stated=num(m[4]); const rateUnit=m[5] ? canonicalUnit(m[5]) : null;
        if(itemName && quantity>0 && stated>=0) items.push({item_name:itemName,category:guessCategory(itemName),quantity,unit,unit_price: rateUnit ? stated : stated/quantity});
        continue;
      }
      const simple = piece.match(new RegExp(`(.+?)\\s+(\\d+(?:\\.\\d+)?)\\s*${unitPattern}\\s+(\\d+(?:\\.\\d+)?)$`,'i'));
      if(simple){const itemName=cleanItemName(simple[1]),quantity=num(simple[2]),unit=canonicalUnit(simple[3]),total=num(simple[4]);if(itemName&&quantity>0)items.push({item_name:itemName,category:guessCategory(itemName),quantity,unit,unit_price:total/quantity});}
    }
    return items;
  }

  async function addDeposit(text) {
    const member = resolveMember(text, /আমি|amar|my/.test(normalize(text)));
    if(!member) throw new Error('কোন member টাকা জমা দিয়েছে বুঝিনি। Member-এর নামসহ আবার বলুন।');
    const t=normalize(text);
    const amountMatch=t.match(/(\d+(?:\.\d+)?)\s*(?:টাকা|taka|tk)\s*(?:জমা|deposit)/) || t.match(/(?:জমা|deposit)[^\d]*(\d+(?:\.\d+)?)\s*(?:টাকা|taka|tk)?/) || t.match(/(\d+(?:\.\d+)?)\s*(?:টাকা|taka|tk)/);
    const amount=amountMatch?num(amountMatch[1]):NaN;
    if(!(amount>0)) throw new Error('কত টাকা জমা হয়েছে বুঝিনি।');
    assertResult(await client.from('deposits').insert({mess_id:profile.mess_id,member_id:member.id,deposit_date:detectDate(text),amount,note:'Voice assistant',created_by:profile.id}));
    await logActivity('create','deposit',null,{source:'voice',member:member.name,amount});
    return `${member.name}-এর ${money(amount)} জমা যোগ করেছি।`;
  }

  async function addBazar(text) {
    const buyer=resolveMember(text,true);
    const items=parseBazarItems(text);
    if(!items.length) throw new Error('বাজারের item ঠিক বুঝিনি। এভাবে বলুন: “চাল ৫ কেজি ৩৫০ টাকা, তেল ১ লিটার ১৮০ টাকা”।');
    const total=items.reduce((s,i)=>s+i.quantity*i.unit_price,0);
    const id=assertResult(await client.rpc('save_bazar_entry',{p_entry_id:null,p_entry_date:detectDate(text),p_buyer_member_id:buyer.id,p_note:'Voice assistant',p_items:items}));
    await logActivity('create','bazar',id,{source:'voice',items:items.length,total});
    return `${buyer.name}-এর বাজার যোগ করেছি—${items.map(i=>`${i.item_name} ${i.quantity} ${i.unit}`).join(', ')}। মোট ${money(total)}।`;
  }

  async function addUtility(text) {
    const t=normalize(text); const amountMatch=t.match(/(\d+(?:\.\d+)?)\s*(?:টাকা|taka|tk)?/g);
    if(!amountMatch?.length) throw new Error('Bill-এর amount বুঝিনি।');
    const amount=num(amountMatch[amountMatch.length-1].match(/\d+(?:\.\d+)?/)[0]);
    let type=/গ্যাস|gas/.test(t)?'Gas':/কারেন্ট|current|electric|বিদ্যুৎ/.test(t)?'Current':/wifi|wi-fi|ইন্টারনেট|internet/.test(t)?'WiFi':'Other';
    const active=db.members.filter(m=>m.active); let selected=[];
    if(/সবাই|সবার|all member|all members/.test(t)) selected=active;
    else selected=active.filter(m=>{const n=normalize(m.name),f=n.split(' ')[0];return t.includes(n)||(f.length>=3&&t.includes(f));});
    if(!selected.length && active.length===1) selected=active;
    const count=t.match(/(\d+)\s*(?:জন|jon|person)/);
    if(!selected.length && count && Number(count[1])===active.length) selected=active;
    if(!selected.length) throw new Error('Bill কারা share করবে বুঝিনি। Member-দের নাম বলুন অথবা “সবাই” বলুন।');
    const bill=assertResult(await client.from('utility_bills').insert({mess_id:profile.mess_id,bill_date:detectDate(text),bill_type:type,amount,created_by:profile.id}).select('id').single());
    try { assertResult(await client.from('utility_bill_members').insert(selected.map(m=>({utility_bill_id:bill.id,member_id:m.id})))); }
    catch(e){ await client.from('utility_bills').delete().eq('id',bill.id); throw e; }
    await logActivity('create','utility_bill',bill.id,{source:'voice',members:selected.length,amount,type});
    return `${type} bill ${money(amount)} যোগ করেছি। ${selected.length} জনে জনপ্রতি ${money(amount/selected.length)}।`;
  }

  async function setMeal(text) {
    const t=normalize(text); const enabled=!/(খাবে না|খাবো না|খাব না|skip|off|বন্ধ)/.test(t); const date=detectDate(text); const active=db.members.filter(m=>m.active);
    let members=[];
    if(/সবাই|সবার|all/.test(t)) members=active; else {const m=resolveMember(text,/আমি|খাবো|খাব/.test(t)); if(m)members=[m];}
    if(!members.length) throw new Error('কার meal update করব বুঝিনি। Member-এর নাম বা “সবাই” বলুন।');
    const rows=members.map(m=>({mess_id:profile.mess_id,member_id:m.id,meal_date:date,enabled,units:enabled?1:0}));
    assertResult(await client.from('meals').upsert(rows,{onConflict:'member_id,meal_date'}));
    await logActivity('update','meal',null,{source:'voice',date,enabled,members:members.map(m=>m.name)});
    return `${date} তারিখে ${members.length===active.length?'সবার':members.map(m=>m.name).join(', ')} meal ${enabled?'খাবে':'খাবে না'} হিসেবে সেট করেছি।`;
  }

  function summary(text) {
    const t=normalize(text); const calc=calcMonth(); const bazar=db.bazar.reduce((s,x)=>s+Number(x.amount||0),0); const dep=calc.reduce((s,x)=>s+x.deposit,0); const util=db.utilities.reduce((s,x)=>s+Number(x.amount||0),0); const due=calc.reduce((s,x)=>s+Math.max(0,-x.balance),0);
    const member=resolveMember(text,false);
    if(member){const x=calc.find(y=>y.member.id===member.id);if(x)return `${member.name}: জমা ${money(x.deposit)}, meal ${x.units}, food ${money(x.food)}, utility ${money(x.util)}, total bill ${money(x.total)}, ${x.balance>=0?'advance':'due'} ${money(Math.abs(x.balance))}।`;}
    if(/জমা|deposit/.test(t)) return `এই মাসে মোট জমা ${money(dep)}। ${calc.map(x=>`${x.member.name} ${money(x.deposit)}`).join(', ')}।`;
    if(/বাজার|bazar|খরচ|cost/.test(t)) return `এই মাসে মোট বাজার ${money(bazar)}। Utility ${money(util)}।`;
    return `এই মাসে বাজার ${money(bazar)}, জমা ${money(dep)}, utility ${money(util)}, মোট due ${money(due)}।`;
  }

  async function handle(text) {
    const raw=String(text||'').trim(); if(!raw)return;
    bubble('user',raw); const input=$('#aiTextCommand');if(input)input.value=''; bubble('thinking','হিসাব বুঝছি…');
    try{
      const t=normalize(raw); let reply;
      if(/জমা|deposit/.test(t) && /টাকা|taka|tk/.test(t)) reply=await addDeposit(raw);
      else if(/গ্যাস|gas|কারেন্ট|current|electric|বিদ্যুৎ|wifi|wi-fi|ইন্টারনেট/.test(t) && /bill|বিল/.test(t)) reply=await addUtility(raw);
      else if(/খাবে|খাবো|খাব |meal|মিল/.test(t)) reply=await setMeal(raw);
      else if(/বাজার|bazar|কিনেছি|কিনলাম|কেনা/.test(t) && /টাকা|taka|tk/.test(t)) reply=await addBazar(raw);
      else if(/কত|মোট|হিসাব|hisab|summary|due|advance|জমা|বাজার|খরচ/.test(t)) reply=summary(raw);
      else throw new Error('Command বুঝিনি। বাজার, জমা, bill, meal বা হিসাব সম্পর্কে বলুন।');
      document.querySelector('.ai-bubble.thinking')?.remove(); answer(reply,true); await loadData();
    }catch(e){document.querySelector('.ai-bubble.thinking')?.remove();answer(e?.message||'কাজটি করা যায়নি।');}
  }

  function startListening(button) {
    const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SpeechRecognition){notify('এই browser-এ free voice recognition নেই। Text command ব্যবহার করুন।');return;}
    if(listening){recognition?.stop();return;}
    recognition=new SpeechRecognition(); recognition.lang='bn-BD'; recognition.interimResults=true; recognition.continuous=false; recognition.maxAlternatives=1;
    let finalText=''; listening=true; button.classList.add('recording'); button.innerHTML='<span class="mic-dot"></span> শুনছি…';
    recognition.onresult=e=>{let live='';for(let i=e.resultIndex;i<e.results.length;i++){const v=e.results[i][0].transcript;if(e.results[i].isFinal)finalText+=v;else live+=v;}const preview=$('#aiLiveText');if(preview)preview.textContent=finalText||live||'বলুন…';};
    recognition.onerror=e=>{if(e.error!=='aborted')notify(e.error==='not-allowed'?'Microphone permission দিন।':'Voice বুঝতে সমস্যা হয়েছে।');};
    recognition.onend=()=>{listening=false;button.classList.remove('recording');button.innerHTML='🎙️ কথা বলুন';const preview=$('#aiLiveText');if(finalText.trim()){if(preview)preview.textContent='';handle(finalText.trim());}};
    recognition.start();
  }

  function assistantPage(c) {
    c.innerHTML=`<section class="ai-assistant-page"><div class="ai-hero"><div><span class="eyebrow">FREE VOICE ASSISTANT</span><h2>বাংলায় বলুন, হিসাব নিজে যোগ হবে</h2><p>কোন paid AI API লাগবে না। Bazar-এর যেকোনো item, Deposit, Bill, Meal এবং মাসের হিসাব voice command-এ manage করুন।</p></div><div class="ai-orb">✦</div></div><div class="ai-quick"><span>Try:</span><button data-ai-example="Ashik 1000 টাকা জমা দিল">জমা</button><button data-ai-example="আজ বাজার করেছি চাল 5 কেজি 350 টাকা, আলু 2 কেজি 80 টাকা, তেল 1 লিটার 180 টাকা">বাজার</button><button data-ai-example="গ্যাস বিল 1765 টাকা সবাই">Bill</button><button data-ai-example="কাল সবাই খাবে">Meal</button></div><div id="aiChatLog" class="ai-chat-log"><div class="ai-bubble assistant">আমি প্রস্তুত। Item-এর নাম নতুন হলেও সমস্যা নেই—না চিনলে “অন্যান্য” category-তে item-এর আসল নাম রেখেই বাজারে যোগ করব।</div></div><div class="ai-composer"><div id="aiLiveText" class="ai-live"></div><button id="aiMic" class="ai-mic" type="button">🎙️ কথা বলুন</button><div class="ai-text-row"><input id="aiTextCommand" placeholder="অথবা command লিখুন…" autocomplete="off"><button id="aiSend" type="button">Send</button></div><small>স্পষ্ট command হলে সরাসরি save হবে। ভুল/অসম্পূর্ণ হলে save না করে কী missing তা বলবে।</small></div></section>`;
    const mic=$('#aiMic'),input=$('#aiTextCommand');mic.onclick=()=>startListening(mic);$('#aiSend').onclick=()=>handle(input.value);input.onkeydown=e=>{if(e.key==='Enter')handle(input.value);};document.querySelectorAll('[data-ai-example]').forEach(b=>b.onclick=()=>handle(b.dataset.aiExample));
  }

  const oldTitle=window.pageTitle; window.pageTitle=function(){return state.page==='assistant'?'Voice Assistant':oldTitle();};
  const oldPage=window.renderPage; window.renderPage=function(){if(state.page==='assistant')return assistantPage($('#content'));return oldPage();};

  function injectEntryPoints(){
    if(profile?.role!=='admin')return;
    if(!document.querySelector('#aiFloat')){const b=document.createElement('button');b.id='aiFloat';b.className='ai-float';b.type='button';b.innerHTML='✦<span>Voice AI</span>';b.onclick=()=>{state.page='assistant';render();};document.body.appendChild(b);}
    const more=$('#mobileMore');if(more&&!more.dataset.aiHook){more.dataset.aiHook='1';more.addEventListener('click',()=>setTimeout(()=>{const grid=document.querySelector('#moreSheet .sheet-grid');if(!grid||grid.querySelector('[data-ai-assistant]'))return;const b=document.createElement('button');b.dataset.aiAssistant='1';b.innerHTML='<span>✦</span><b>Voice AI</b>';b.onclick=()=>{$('#moreSheet')?.remove();state.page='assistant';render();};grid.appendChild(b);},0));}
  }
  const baseRender=window.render;window.render=function(){baseRender();setTimeout(injectEntryPoints,0);};
})();
