/* Admin-only Bangla voice AI assistant */
'use strict';
(() => {
  let recorder = null;
  let stream = null;
  let chunks = [];
  let recording = false;

  const html = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  function speak(text) {
    if (!('speechSynthesis' in window) || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'bn-BD'; u.rate = .95;
    const voice = speechSynthesis.getVoices().find(v => /^bn/i.test(v.lang));
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  }

  function addBubble(kind, text) {
    const log = document.querySelector('#aiChatLog');
    if (!log) return;
    const el = document.createElement('div');
    el.className = `ai-bubble ${kind}`;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  }

  async function sendText(text) {
    const clean = String(text || '').trim();
    if (!clean) return;
    addBubble('user', clean);
    const input = document.querySelector('#aiTextCommand'); if (input) input.value = '';
    addBubble('thinking', 'বুঝছি…');
    try {
      const { data, error } = await client.functions.invoke('admin-ai', { body: { text: clean } });
      document.querySelector('.ai-bubble.thinking')?.remove();
      if (error) throw error;
      const reply = data?.reply || data?.error || 'কাজটি সম্পন্ন হয়েছে।';
      addBubble('assistant', reply); speak(reply);
      if (data?.ok) { await loadAll(); render(); }
    } catch (e) {
      document.querySelector('.ai-bubble.thinking')?.remove();
      addBubble('assistant error', e?.message || 'AI assistant এখন কাজ করছে না।');
    }
  }

  async function sendAudio(blob) {
    addBubble('thinking', 'আপনার কথা শুনে বুঝছি…');
    try {
      const { data: { session } } = await client.auth.getSession();
      const form = new FormData();
      form.append('audio', blob, blob.type.includes('mp4') ? 'voice.m4a' : 'voice.webm');
      const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-ai`, { method:'POST', headers:{ Authorization:`Bearer ${session.access_token}`, apikey:SUPABASE_ANON_KEY }, body:form });
      const data = await response.json();
      document.querySelector('.ai-bubble.thinking')?.remove();
      if (!response.ok) throw new Error(data?.reply || data?.error || 'Voice command failed');
      if (data.transcript) addBubble('user', `🎙️ ${data.transcript}`);
      const reply = data.reply || 'কাজটি সম্পন্ন হয়েছে।';
      addBubble('assistant', reply); speak(reply);
      if (data.ok) { await loadAll(); render(); }
    } catch (e) {
      document.querySelector('.ai-bubble.thinking')?.remove();
      addBubble('assistant error', e?.message || 'Voice command কাজ করেনি।');
    }
  }

  async function toggleRecording(button) {
    if (recording && recorder) { recorder.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return notify('এই browser-এ voice recording support নেই।');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio:true });
      const preferred = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : (MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '');
      recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      chunks = []; recording = true; button.classList.add('recording'); button.innerHTML = '<span class="mic-dot"></span> থামান';
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = async () => {
        recording = false; button.classList.remove('recording'); button.innerHTML = '🎙️ কথা বলুন';
        stream?.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size > 500) await sendAudio(blob);
      };
      recorder.start();
    } catch { notify('Microphone permission দিন, তারপর আবার চেষ্টা করুন।'); }
  }

  function assistantPage(c) {
    c.innerHTML = `<section class="ai-assistant-page"><div class="ai-hero"><div><span class="eyebrow">ADMIN AI</span><h2>বাংলায় বলুন, AI হিসাব রাখবে</h2><p>বাজার, টাকা জমা এবং এই মাসের হিসাব—কথা বলেই manage করুন।</p></div><div class="ai-orb">AI</div></div><div id="aiChatLog" class="ai-chat-log"><div class="ai-bubble assistant">আমি প্রস্তুত। যেমন বলতে পারেন— “Ashik 1000 টাকা জমা দিল”, “আজ আমি ২ কেজি আলু ৪০ টাকা কেজি আর ১ লিটার তেল ১৮০ টাকায় কিনেছি”, অথবা “এই মাসে মোট কত খরচ হয়েছে?”</div></div><div class="ai-composer"><button id="aiMic" class="ai-mic" type="button">🎙️ কথা বলুন</button><div class="ai-text-row"><input id="aiTextCommand" placeholder="অথবা লিখে command দিন…" autocomplete="off"><button id="aiSend" type="button">Send</button></div><small>শুধু Admin এই assistant ব্যবহার করতে পারবে। Financial entry হলে AI database-এ সরাসরি যোগ করবে।</small></div></section>`;
    const mic = document.querySelector('#aiMic'); mic.onclick = () => toggleRecording(mic);
    const input = document.querySelector('#aiTextCommand');
    document.querySelector('#aiSend').onclick = () => sendText(input.value);
    input.onkeydown = e => { if (e.key === 'Enter') sendText(input.value); };
  }

  const oldTitle = window.pageTitle;
  window.pageTitle = function(page) { if (page === 'assistant') return 'AI Assistant'; return oldTitle(page); };
  const oldPage = window.renderPage;
  window.renderPage = function(c) { if (state.page === 'assistant') return assistantPage(c); return oldPage(c); };

  const oldMore = window.mobileMore;
  window.mobileMore = function() {
    oldMore();
    if (profile?.role !== 'admin') return;
    const grid = document.querySelector('.sheet-grid');
    if (!grid || grid.querySelector('[data-ai-assistant]')) return;
    const b = document.createElement('button');
    b.dataset.aiAssistant = '1'; b.innerHTML = '<span>✦</span><b>AI Assistant</b>';
    b.onclick = () => { closeSheet(); state.page='assistant'; render(); };
    grid.appendChild(b);
  };
})();
