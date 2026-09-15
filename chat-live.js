/* Live Mess Chat.
 *
 * The chat page used to be the only screen with no live delivery at all:
 *   - app.js subscribeRealtime() filters postgres_changes down to a table
 *     whitelist that never included mess_messages;
 *   - chat-notifications.js does listen to that table, but it returns early
 *     when state.page === 'chat', because it only exists to raise a toast on
 *     other pages.
 * So a message sent by someone else appeared only after the reader left the
 * page and came back. Sending was slow for a different reason: it awaited a
 * full loadData() (≈10 queries covering meals, bazar, deposits, bills…)
 * before the new bubble was painted.
 *
 * This file owns the chat screen instead: one realtime channel for
 * mess_messages, optimistic send, and a catch-up fetch whenever the tab wakes,
 * the network returns or the socket resubscribes — so nothing is lost while a
 * phone is asleep or offline. It never calls loadData().
 *
 * Toasts are deliberately left to chat-notifications.js, so a message that
 * arrives while another page is open still raises exactly one toast.
 */
'use strict';
(() => {
  if (window.__mmChatLive) return;
  window.__mmChatLive = true;

  const LIMIT = 200;
  const GROUP_WINDOW = 5 * 60 * 1000;   // same sender inside 5 min = one visual group
  const POLL_MS = 20000;

  let channel = null;
  let channelKey = '';
  let live = false;
  let catching = null;
  let pendingSeq = 0;
  let tick = 0;

  const ready = () => typeof client !== 'undefined' && client
    && typeof profile !== 'undefined' && profile?.id && profile?.mess_id;
  const onChatPage = () => typeof state !== 'undefined' && state?.page === 'chat';
  const rows = () => (db.messages = db.messages || []);
  const listEl = () => document.getElementById('chatMessages');

  /* ---------------------------------------------------------------- format */
  const memberById = id => (db.members || []).find(m => m.id === id);
  const initials = name => String(name || 'M').trim().split(/\s+/).slice(0, 2)
    .map(x => x[0]).join('').toUpperCase();
  const senderOf = m => memberById(m.sender_member_id)
    || {name: typeof memberName === 'function' ? memberName(m.sender_member_id) : 'Member'};
  const avatarHtml = m => m?.avatar_url
    ? `<img class="detail-avatar chat-profile-avatar" src="${esc(m.avatar_url)}" alt="${esc(m.name || 'Member')}" loading="lazy"/>`
    : `<span class="detail-avatar detail-avatar-fallback chat-profile-avatar">${esc(initials(m?.name))}</span>`;

  const timeOf = value => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'});
  };
  const dayKey = value => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };
  const dayLabel = value => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    if (dayKey(d) === dayKey(now)) return 'Today';
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (dayKey(d) === dayKey(yesterday)) return 'Yesterday';
    return d.toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric'});
  };

  /* ------------------------------------------------------------------ store */
  function merge(incoming) {
    const list = rows();
    const byId = new Map(list.map(m => [m.id, m]));
    let added = 0;
    for (const row of incoming || []) {
      if (!row?.id) continue;
      const known = byId.get(row.id);
      if (known) { Object.assign(known, row); continue; }
      // drop the optimistic twin this row confirms
      const twin = list.findIndex(m => m.__pending
        && m.sender_member_id === row.sender_member_id && m.body === row.body);
      if (twin >= 0) list.splice(twin, 1);
      list.push(row);
      byId.set(row.id, row);
      added += 1;
    }
    if (!added) return 0;
    list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)
      || String(a.id).localeCompare(String(b.id)));
    if (list.length > LIMIT * 2) list.splice(0, list.length - LIMIT * 2);
    return added;
  }

  /* ----------------------------------------------------------------- markup */
  function bubbleHtml(m, previous) {
    const mine = m.sender_member_id === profile.id;
    const sender = senderOf(m);
    const newDay = !previous || dayKey(previous.created_at) !== dayKey(m.created_at);
    const grouped = !newDay && previous
      && previous.sender_member_id === m.sender_member_id
      && Math.abs(new Date(m.created_at) - new Date(previous.created_at)) < GROUP_WINDOW;
    const status = m.__failed
      ? '<i class="chat-state failed" title="Tap to retry">retry</i>'
      : m.__pending ? '<i class="chat-state pending" aria-label="Sending"></i>'
      : '<i class="chat-state sent" aria-label="Sent"></i>';
    return `${newDay ? `<div class="chat-day"><span>${esc(dayLabel(m.created_at))}</span></div>` : ''}
      <div class="chat-row chat-row-pro chat-row-live${mine ? ' mine' : ''}${grouped ? ' grouped' : ''}${m.__pending ? ' is-pending' : ''}${m.__failed ? ' is-failed' : ''}" data-mid="${esc(m.id)}">
        ${grouped ? '<span class="chat-avatar-spacer" aria-hidden="true"></span>' : avatarHtml(sender)}
        <div class="chat-message-wrap">
          ${grouped || mine ? '' : `<div class="chat-message-meta"><b>${esc(sender.name || 'Member')}</b></div>`}
          <div class="chat-bubble chat-bubble-pro"${m.__failed ? ' data-retry="1" role="button" tabindex="0"' : ''}>
            <p>${esc(m.body)}</p>
            <span class="chat-stamp"><time>${esc(timeOf(m.created_at))}</time>${mine ? status : ''}</span>
          </div>
        </div>
      </div>`;
  }

  function listHtml() {
    const list = rows();
    if (!list.length) return '<div class="chat-empty">এখনও কোনো message নেই। প্রথম message লিখুন।</div>';
    let out = '';
    let previous = null;
    for (const m of list) { out += bubbleHtml(m, previous); previous = m; }
    return out;
  }

  /* ------------------------------------------------------------------ paint */
  const nearBottom = el => el.scrollHeight - el.scrollTop - el.clientHeight < 90;
  const toBottom = el => { el.scrollTop = el.scrollHeight; };

  function paint({stick = null} = {}) {
    const el = listEl();
    if (!el) return;
    const keepBottom = stick === null ? nearBottom(el) : stick;
    const previousTop = el.scrollTop;
    el.innerHTML = listHtml();
    if (keepBottom) { toBottom(el); hideJump(); } else { el.scrollTop = previousTop; }
  }

  const jumpEl = () => document.getElementById('chatJump');
  const showJump = () => jumpEl()?.classList.add('is-on');
  const hideJump = () => jumpEl()?.classList.remove('is-on');

  function setLiveDot() {
    document.querySelector('.chat-live-dot')?.setAttribute('data-live', live ? 'on' : 'off');
  }

  /* ------------------------------------------------------------- networking */
  async function dispatchPush(messageId) {
    if (!messageId) return;
    try {
      const result = await client.functions.invoke('chat-push', {
        body: {action: 'dispatch-message', message_id: messageId},
      });
      if (result.error) throw result.error;
      if (result.data?.error) throw new Error(result.data.error);
    } catch (error) {
      console.warn('Chat push dispatch failed; the message itself was saved.', error);
    }
  }

  /* Pulls anything this device has not seen yet. Overlapping by one timestamp
     (gte, not gt) and de-duplicating on id is deliberate: two messages can
     share a created_at, and losing one of them is worse than re-reading it. */
  async function catchUp({full = false} = {}) {
    if (!ready() || catching) return catching || 0;
    const last = [...rows()].reverse().find(m => !m.__pending && m.created_at)?.created_at;
    catching = (async () => {
      try {
        let query = client.from('mess_messages').select('*').eq('mess_id', profile.mess_id);
        // A catch-up walks forward from what we already have; a cold read must
        // take the NEWEST rows, so it orders descending (merge re-sorts either
        // way). Ordering ascending on a cold read returns the oldest 200
        // messages the mess ever sent and nothing recent.
        query = last && !full
          ? query.gte('created_at', last).order('created_at', {ascending: true}).limit(LIMIT)
          : query.order('created_at', {ascending: false}).limit(LIMIT);
        const result = await query;
        if (result.error) throw result.error;
        const added = merge(result.data);
        if (added && onChatPage()) {
          const el = listEl();
          const stuck = el ? nearBottom(el) : true;
          paint({stick: stuck});
          if (!stuck) showJump();
        }
        return added;
      } catch (error) {
        console.warn('Chat catch-up failed', error);
        return 0;
      } finally {
        catching = null;
      }
    })();
    return catching;
  }

  function dropChannel() {
    if (channel) { try { client.removeChannel(channel); } catch (_) {} }
    channel = null;
    channelKey = '';
    live = false;
    setLiveDot();
  }

  function ensureChannel() {
    if (!ready()) return;
    const key = `${profile.mess_id}:${profile.id}`;
    if (channel && channelKey === key) return;
    dropChannel();
    channelKey = key;
    channel = client
      .channel(`mess-chat-live:${key}:${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'mess_messages',
        filter: `mess_id=eq.${profile.mess_id}`,
      }, payload => {
        if (!merge([payload?.new])) return;
        if (!onChatPage()) return;
        const el = listEl();
        const stuck = el ? nearBottom(el) : true;
        paint({stick: stuck});
        if (!stuck) showJump();
      })
      .subscribe(status => {
        live = status === 'SUBSCRIBED';
        setLiveDot();
        if (live) catchUp();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setTimeout(() => { dropChannel(); ensureChannel(); }, 4000);
        }
      });
  }

  /* -------------------------------------------------------------- composing */
  function autosize(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }

  async function send(form) {
    const textarea = form.querySelector('textarea');
    const body = String(textarea?.value || '').trim();
    if (!body || !ready()) return;
    textarea.value = '';
    autosize(textarea);

    const optimistic = {
      id: `pending-${Date.now()}-${++pendingSeq}`,
      mess_id: profile.mess_id,
      sender_member_id: profile.id,
      body,
      created_at: new Date().toISOString(),
      __pending: true,
    };
    rows().push(optimistic);
    paint({stick: true});

    try {
      const result = await client.from('mess_messages')
        .insert({mess_id: profile.mess_id, sender_member_id: profile.id, body})
        .select('*')
        .single();
      if (result.error) throw result.error;
      const index = rows().indexOf(optimistic);
      if (index >= 0) rows().splice(index, 1);
      merge([result.data]);
      paint({stick: true});
      void dispatchPush(result.data?.id);
    } catch (error) {
      optimistic.__pending = false;
      optimistic.__failed = true;
      paint({stick: true});
      if (typeof notify === 'function') notify(error?.message || 'Message পাঠানো যায়নি। আবার চেষ্টা করুন।');
    }
  }

  async function retry(id) {
    const list = rows();
    const index = list.findIndex(m => String(m.id) === String(id) && m.__failed);
    if (index < 0) return;
    const [failed] = list.splice(index, 1);
    const form = document.getElementById('chatForm');
    const textarea = form?.querySelector('textarea');
    if (!textarea) return;
    textarea.value = failed.body;
    await send(form);
  }

  /* ----------------------------------------------------------------- screen */
  window.chat = async function chatLivePage(container) {
    ensureChannel();
    container.innerHTML = `<div class="chat-shell chat-shell-pro chat-shell-live">
      <div class="chat-simple-head chat-head-live">
        <span class="eyebrow">Mess community</span>
        <h2>Chat</h2>
      </div>
      <!-- Outside the head on purpose: mobile-shell-final.css hides
           .chat-simple-head on phones, and the connection state is worth
           showing there too. It is absolutely positioned, so it never takes a
           row in the chat page's grid layout. -->
      <span class="chat-live-dot" data-live="${live ? 'on' : 'off'}"><i></i>Live</span>
      <div class="chat-messages chat-messages-pro chat-messages-live" id="chatMessages">${listHtml()}</div>
      <button type="button" class="chat-jump" id="chatJump" aria-label="Jump to latest message">New messages ↓</button>
      <form class="chat-compose chat-compose-pro chat-compose-live" id="chatForm">
        <textarea name="body" rows="1" maxlength="2000" placeholder="Message লিখুন…" required></textarea>
        <button class="btn primary" aria-label="Send">Send</button>
      </form>
    </div>`;

    const list = listEl();
    if (list) {
      toBottom(list);
      list.addEventListener('scroll', () => { if (nearBottom(list)) hideJump(); }, {passive: true});
      list.addEventListener('click', event => {
        const target = event.target.closest?.('[data-retry]');
        if (target) retry(target.closest('[data-mid]')?.dataset.mid);
      });
    }
    jumpEl()?.addEventListener('click', () => { const el = listEl(); if (el) toBottom(el); hideJump(); });

    const form = document.getElementById('chatForm');
    const textarea = form?.querySelector('textarea');
    if (form) form.onsubmit = event => { event.preventDefault(); send(form); };

    /* Send fires on pointerdown, not click. While the keyboard is open the
       composer sits in normal flow; the moment the textarea blurs,
       mobile-composer-stability.css flips it back to position:fixed above the
       nav. Pressing Send blurs the textarea, so the button moved out from
       under the finger between press and release and the click never landed —
       a tap that silently did nothing. Acting on the press (and preventing the
       default so focus never leaves) removes the race entirely. onsubmit stays
       as the path for Enter and for browsers without pointer events; send()
       clears the textarea synchronously, so a follow-up submit is a no-op. */
    const sendButton = form?.querySelector('button');
    if (sendButton && window.PointerEvent) {
      sendButton.addEventListener('pointerdown', event => {
        if (event.button && event.button !== 0) return;
        event.preventDefault();
        send(form);
      });
    }
    if (textarea) {
      textarea.addEventListener('input', () => autosize(textarea));
      // Enter sends on a pointer device; on touch it stays a newline.
      textarea.addEventListener('keydown', event => {
        if (event.key !== 'Enter' || event.shiftKey) return;
        if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return;
        event.preventDefault();
        send(form);
      });
      autosize(textarea);
    }

    catchUp();
  };

  /* ------------------------------------------------------------- lifecycle */
  /* No renderPage wrapper on purpose: page-detail-fixes.js already routes the
     chat page to window.chat (looked up late, so it lands here), and its
     wrapper is also what sets the mm-chat-page class the viewport-locked chat
     layout depends on. Intercepting renderPage skipped that and left the
     message list at its fixed desktop height with dead space beneath it. */

  const baseSubscribe = window.subscribeRealtime;
  window.subscribeRealtime = function subscribeRealtimeWithChat() {
    if (typeof baseSubscribe === 'function') baseSubscribe();
    ensureChannel();
  };

  const wake = () => {
    if (document.visibilityState !== 'visible' || !ready()) return;
    ensureChannel();
    catchUp();
  };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('online', wake);
  window.addEventListener('pageshow', wake);
  window.addEventListener('focus', wake);

  /* Safety net for a socket that died without reporting it: cheap on the chat
     page, rare elsewhere, and silent when the tab is hidden. */
  setInterval(() => {
    if (document.visibilityState !== 'visible' || !ready()) return;
    tick += 1;
    if (onChatPage() || !live) { if (onChatPage() || tick % 3 === 0) catchUp(); }
  }, POLL_MS);

  if (client?.auth?.onAuthStateChange) {
    client.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') dropChannel(); });
  }
})();
