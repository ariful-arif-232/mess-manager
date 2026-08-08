/* Gemini-powered admin Bangla/Banglish voice assistant. */
'use strict';
(() => {
  let recorder=null, stream=null, chunks=[], recording=false, pendingAction=null;
  const cfg=window.MESS_MANAGER_CONFIG||{};
  const supabaseUrl=String(cfg.supabaseUrl||'').replace(/\/$/,'');
  const anonKey=String(cfg.supabaseAnonKey||'');
  const escAi=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function speak(text){if(!('speechSynthesis'in window)||!text)return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='bn-BD';u.rate=.96;const v=speechSynthesis.getVoices().find(x=>/^bn/i.test(x.lang));if(v)u.voice=v;speechSynthesis.speak(u);}
  function bubble(kind,text,html=false){const log=$('#aiChatLog');if(!log)return;const el=document.createElement('div');el.className=`ai-bubble ${kind}`;if(html)el.innerHTML=text;else el.textContent=text;log.appendChild(el);log.scrollTop=log.scrollHeight;return el;}
  function removeThinking(){document.querySelector('.ai-bubble.thinking')?.remove();}
  function actionDetails(a){
    if(!a)return'';
    if(a.intent==='add_bazar')return `<div class="ai-review-list"><b>Bazar · ${escAi(a.date||'Today')}</b>${(a.items||[]).map(i=>`<div><span>${escAi(i.item_name)} · ${escAi(i.category)}</span><strong>${escAi(i.quantity)} ${escAi(i.unit)} × ৳${Number(i.unit_price||0).toFixed(2)}</strong></div>`).join('')}</div>`;
    if(a.intent==='add_deposit')return `<div class="ai-review-list"><div><span>Member</span><strong>${escAi(a.member_name||'আপনি')}</strong></div><div><span>Deposit</span><strong>৳${Number(a.amount||0).toFixed(2)}</strong></div></div>`;
    if(a.intent==='add_utility')return `<div class="ai-review-list"><div><span>${escAi(a.bill_type||'Utility')}</span><strong>৳${Number(a.amount||0).toFixed(2)}</strong></div><div><span>Members</span><strong>${escAi((a.member_names||[]).join(', '))}</strong></div></div>`;
    if(a.intent==='set_meal')return `<div class="ai-review-list"><div><span>${escAi(a.date||'Today')}</span><strong>${a.meal_enabled?'খাবে':'খাবে না'}</strong></div><div><span>Members</span><strong>${escAi((a.member_names||[]).join(', '))}</strong></div></div>`;
    return'';
  }
  function showConfirmation(data){pendingAction=data.action;const card=bubble('assistant review',`<div class="ai-review-title">${escAi(data.reply||'আমি এভাবে বুঝেছি:')}</div>${actionDetails(data.action)}<div class="ai-review-actions"><button class="btn" data-ai-cancel>Cancel</button><button class="btn primary" data-ai-confirm>Confirm & Save</button></div>`,true);card.querySelector('[data-ai-cancel]').onclick=()=>{pendingAction=null;card.remove();bubble('assistant','ঠিক আছে, save করিনি।');};card.querySelector('[data-ai-confirm]').onclick=()=>executePending(card);}
  async function callFunction({jsonBody,formBody}={}){
    if(!supabaseUrl||!anonKey)throw new Error('Supabase config পাওয়া যায়নি।');
    const {data:{session}}=await client.auth.getSession();
    if(!session?.access_token)throw new Error('Login session পাওয়া যায়নি। আবার sign in করুন।');
    const headers={Authorization:`Bearer ${session.access_token}`,apikey:anonKey};
    if(jsonBody)headers['Content-Type']='application/json';
    const r=await fetch(`${supabaseUrl}/functions/v1/admin-ai`,{method:'POST',headers,body:jsonBody?JSON.stringify(jsonBody):formBody});
    let data={};try{data=await r.json();}catch{}
    if(!r.ok)throw new Error(data?.error||data?.message||`AI service error (${r.status})`);
    if(data?.error)throw new Error(data.error);
    return data;
  }
  async function executePending(card){if(!pendingAction)return;const action=pendingAction;pendingAction=null;card.querySelector('.ai-review-actions').innerHTML='<span class="ai-saving">Saving…</span>';try{const data=await callFunction({jsonBody:{mode:'execute',action}});card.remove();bubble('assistant success',data.reply||'Save হয়েছে।');speak(data.reply);await loadData();render();}catch(e){card.remove();bubble('assistant error',e?.message||'Save করা যায়নি।');}}
  async function processResult(data){removeThinking();if(data.mode==='confirm')showConfirmation(data);else{bubble('assistant success',data.reply||'Done');speak(data.reply);}}
  async function sendText(text){const value=String(text||'').trim();if(!value)return;bubble('user',value);const input=$('#aiTextCommand');if(input)input.value='';bubble('thinking','AI বুঝছে…');try{await processResult(await callFunction({jsonBody:{text:value}}));}catch(e){removeThinking();bubble('assistant error',e?.message||'AI assistant কাজ করতে পারছে না।');}}
  async function sendAudio(blob){bubble('thinking','আপনার কথা শুনে AI বুঝছে…');try{const form=new FormData();form.append('audio',blob,blob.type.includes('mp4')?'voice.m4a':'voice.webm');await processResult(await callFunction({formBody:form}));}catch(e){removeThinking();bubble('assistant error',e?.message||'Voice command কাজ করেনি।');}}
  async function toggleRecording(button){
    if(recording&&recorder){recorder.stop();return;}
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)return notify('এই browser-এ microphone recording support নেই।');
    try{stream=await navigator.mediaDevices.getUserMedia({audio:true});const mime=MediaRecorder.isTypeSupported('audio/mp4')?'audio/mp4':MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':'';recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);chunks=[];recording=true;button.classList.add('recording');button.innerHTML='<span class="mic-dot"></span> শেষ হলে চাপুন';recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.onstop=async()=>{recording=false;button.classList.remove('recording');button.innerHTML='🎙️ কথা বলুন';stream?.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type:recorder.mimeType||'audio/webm'});if(blob.size>500)await sendAudio(blob);};recorder.start();}catch{notify('Microphone permission দিন, তারপর আবার চেষ্টা করুন।');}
  }
  function assistantPage(c){c.innerHTML=`<section class="ai-assistant-page"><div class="ai-hero"><div><span class="eyebrow">GEMINI VOICE ASSISTANT</span><h2>স্বাভাবিক বাংলায় বলুন</h2><p>AI আগে বুঝে দেখাবে। আপনি Confirm করলে তবেই হিসাব database-এ save হবে।</p></div><div class="ai-orb">✦</div></div><div class="ai-quick"><span>Examples</span><button data-example="আজ আমি চাল ৫ কেজি ৩৫০ টাকা, আলু ২ কেজি ৮০ টাকা আর তেল ১ লিটার ১৮০ টাকায় কিনেছি">Bazar</button><button data-example="Ashik আজ 1500 টাকা জমা দিয়েছে">Deposit</button><button data-example="গ্যাস বিল 1765 টাকা সবাই ভাগ করবে">Bill</button><button data-example="আগামীকাল আমি আর Ashik খাব না">Meal</button></div><div id="aiChatLog" class="ai-chat-log"><div class="ai-bubble assistant">আমি আপনার Bangla/Banglish বুঝে Bazar, Deposit, Utility Bill, Meal এবং মাসের হিসাব manage করতে পারি। নতুন bazar item/category হলেও সমস্যা নেই।</div></div><div class="ai-composer"><button id="aiMic" class="ai-mic" type="button">🎙️ কথা বলুন</button><div class="ai-text-row"><input id="aiTextCommand" placeholder="অথবা বাংলায়/Banglish-এ লিখুন…" autocomplete="off"><button id="aiSend" type="button">Send</button></div><small>Financial change সরাসরি save হবে না—আগে review করে Confirm করতে পারবেন।</small></div></section>`;const mic=$('#aiMic'),input=$('#aiTextCommand');mic.onclick=()=>toggleRecording(mic);$('#aiSend').onclick=()=>sendText(input.value);input.onkeydown=e=>{if(e.key==='Enter')sendText(input.value)};document.querySelectorAll('[data-example]').forEach(b=>b.onclick=()=>{input.value=b.dataset.example;input.focus();});}
  const oldTitle=window.pageTitle;window.pageTitle=function(){return state.page==='assistant'?'AI Assistant':oldTitle();};
  const oldPage=window.renderPage;window.renderPage=function(){if(state.page==='assistant')return assistantPage($('#content'));return oldPage();};
  function inject(){if(profile?.role!=='admin')return;if(!$('#aiFloat')){const b=document.createElement('button');b.id='aiFloat';b.className='ai-float';b.type='button';b.innerHTML='✦<span>Voice AI</span>';b.onclick=()=>{state.page='assistant';render()};document.body.appendChild(b);}const more=$('#mobileMore');if(more&&!more.dataset.aiHook){more.dataset.aiHook='1';more.addEventListener('click',()=>setTimeout(()=>{const grid=document.querySelector('#moreSheet .sheet-grid');if(!grid||grid.querySelector('[data-ai-assistant]'))return;const b=document.createElement('button');b.dataset.aiAssistant='1';b.innerHTML='<span>✦</span><b>AI Assistant</b>';b.onclick=()=>{$('#moreSheet')?.remove();state.page='assistant';render()};grid.appendChild(b)},0));}}
  const baseRender=window.render;window.render=function(){baseRender();setTimeout(inject,0)};
})();
