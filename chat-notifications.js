/* Isolated Web Push controller for Mess Chat.
 * This file intentionally does not override chat(), render(), loadData(),
 * subscribeRealtime(), or any existing CRUD flow.
 */
'use strict';
(() => {
  if (window.__mmChatNotificationsLoaded) return;
  window.__mmChatNotificationsLoaded = true;

  const CARD_ID = 'mmChatNotificationCard';
  const STYLE_ID = 'mmChatNotificationStyle';
  const OPEN_PARAM = 'open';
  let lastSyncedEndpoint = '';
  let observerQueued = false;

  const safeNotify = (message, type = 'error') => {
    if (typeof notify === 'function') notify(message, type);
    else console[type === 'error' ? 'error' : 'log'](message);
  };

  const isPushSupported = () => (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );

  const isIOS = () => (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );

  const isStandalone = () => (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    navigator.standalone === true
  );

  const injectStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${CARD_ID}{margin:14px 16px 0;padding:13px 14px;border:1px solid #d8e5f2;border-radius:16px;background:linear-gradient(145deg,#f9fcff,#f0f6ff);display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:11px;align-items:center;box-shadow:0 8px 22px rgba(31,67,118,.06)}
      #${CARD_ID} .mm-push-icon{width:42px;height:42px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(145deg,#e7f1ff,#d8e9ff);color:#276fda;box-shadow:inset 0 1px rgba(255,255,255,.72)}
      #${CARD_ID} .mm-push-icon::before{content:"";width:22px;height:22px;background:currentColor;-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M18 9a6 6 0 1 0-12 0c0 7-3 7-3 8.5h18C21 16 18 16 18 9Z M9.5 20h5' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/contain no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M18 9a6 6 0 1 0-12 0c0 7-3 7-3 8.5h18C21 16 18 16 18 9Z M9.5 20h5' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/contain no-repeat}
      #${CARD_ID} .mm-push-copy{min-width:0}#${CARD_ID} .mm-push-title{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:3px}#${CARD_ID} .mm-push-title b{font-size:13px;color:#17365f}#${CARD_ID} .mm-push-copy p{margin:0;color:#72839b;font-size:10px;line-height:1.45}
      #${CARD_ID} .mm-push-status{display:inline-flex;align-items:center;gap:5px;padding:4px 7px;border-radius:999px;background:#eaf0f8;color:#66788f;font:800 9px/1 Inter,sans-serif;white-space:nowrap}#${CARD_ID} .mm-push-status::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.8}#${CARD_ID} .mm-push-status.on{background:#e2f8ef;color:#14805f}#${CARD_ID} .mm-push-status.warn{background:#fff2da;color:#9f670e}
      #${CARD_ID} .mm-push-action{min-width:94px;min-height:38px;padding:0 12px;border:0;border-radius:12px;background:linear-gradient(135deg,#2e7be6,#1764ce);color:#fff;font:800 11px/1 Inter,"Noto Sans Bengali",sans-serif;box-shadow:0 8px 18px rgba(32,105,207,.16);cursor:pointer}#${CARD_ID} .mm-push-action.secondary{border:1px solid #d5e1ee;background:#fff;color:#4d6179;box-shadow:none}#${CARD_ID} .mm-push-action:disabled{opacity:.58;cursor:default}
      html[data-theme="dark"] #${CARD_ID}{border-color:#29465f;background:linear-gradient(145deg,#10263a,#0c1e30);box-shadow:0 8px 22px rgba(0,0,0,.16)}html[data-theme="dark"] #${CARD_ID} .mm-push-icon{background:linear-gradient(145deg,#173e67,#12304f);color:#7db5ff}html[data-theme="dark"] #${CARD_ID} .mm-push-title b{color:#f0f6ff}html[data-theme="dark"] #${CARD_ID} .mm-push-copy p{color:#91a4b9}html[data-theme="dark"] #${CARD_ID} .mm-push-status{background:#162b40;color:#a3b4c6}html[data-theme="dark"] #${CARD_ID} .mm-push-status.on{background:#143d35;color:#6ed4b4}html[data-theme="dark"] #${CARD_ID} .mm-push-status.warn{background:#47371b;color:#f4c46c}html[data-theme="dark"] #${CARD_ID} .mm-push-action.secondary{border-color:#31506b;background:#132a40;color:#dce8f4}
      @media(max-width:600px){#${CARD_ID}{grid-template-columns:42px minmax(0,1fr);margin:12px 12px 0;padding:12px 13px}#${CARD_ID} .mm-push-action{grid-column:1/-1;width:100%;min-height:41px}}
    `;
    document.head.appendChild(style);
  };

  const setCardState = (card, { label, kind = '', copy, button, action = 'enable', disabled = false, secondary = false }) => {
    if (!card?.isConnected) return;
    const status = card.querySelector('[data-mm-push-status]');
    const text = card.querySelector('[data-mm-push-copy]');
    const control = card.querySelector('[data-mm-push-action]');
    status.textContent = label;
    status.className = `mm-push-status ${kind}`.trim();
    text.textContent = copy;
    control.textContent = button;
    control.dataset.action = action;
    control.disabled = disabled;
    control.classList.toggle('secondary', secondary);
  };

  const serviceWorkerReady = async () => {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Notification service is not ready yet.')), 8000));
    return Promise.race([navigator.serviceWorker.ready, timeout]);
  };

  const base64UrlToBytes = (value) => {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return bytes;
  };

  const bytesToBase64Url = (value) => {
    const bytes = new Uint8Array(value || 0);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  };

  const sameKey = (subscription, expected) => {
    const current = subscription?.options?.applicationServerKey;
    if (!current) return true;
    const a = new Uint8Array(current);
    const b = expected instanceof Uint8Array ? expected : new Uint8Array(expected);
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
    return true;
  };

  const subscriptionKeys = (subscription) => {
    const json = subscription.toJSON?.() || {};
    if (json.keys?.p256dh && json.keys?.auth) return json.keys;
    const p256dh = subscription.getKey?.('p256dh');
    const auth = subscription.getKey?.('auth');
    return {
      p256dh: p256dh ? bytesToBase64Url(p256dh) : '',
      auth: auth ? bytesToBase64Url(auth) : '',
    };
  };

  const saveSubscription = async (subscription) => {
    if (typeof client === 'undefined' || !client) throw new Error('App connection is not ready.');
    if (typeof profile === 'undefined' || !profile) throw new Error('Please sign in first.');
    const keys = subscriptionKeys(subscription);
    if (!subscription.endpoint || !keys.p256dh || !keys.auth) throw new Error('Browser push subscription is incomplete.');
    const result = await client.rpc('save_push_subscription', {
      p_endpoint: subscription.endpoint,
      p_p256dh: keys.p256dh,
      p_auth: keys.auth,
      p_user_agent: navigator.userAgent || '',
    });
    if (result.error) throw result.error;
    lastSyncedEndpoint = subscription.endpoint;
  };

  const syncExistingSubscription = async (subscription) => {
    if (!subscription || subscription.endpoint === lastSyncedEndpoint) return;
    try { await saveSubscription(subscription); }
    catch (error) { console.warn('Chat push subscription sync failed', error); }
  };

  const getPublicKey = async () => {
    if (typeof client === 'undefined' || !client) throw new Error('App connection is not ready.');
    const result = await client.functions.invoke('chat-push', { body: { action: 'public-key' } });
    if (result.error) throw result.error;
    if (result.data?.error) throw new Error(result.data.error);
    const key = String(result.data?.public_key || '').trim();
    if (!key) throw new Error('Push service key is unavailable.');
    return key;
  };

  const enableNotifications = async () => {
    if (!isPushSupported()) throw new Error('This browser does not support Web Push.');
    if (isIOS() && !isStandalone()) throw new Error('On iPhone/iPad, add Mess Manager to the Home Screen first.');

    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Notification permission was not allowed.');

    const registration = await serviceWorkerReady();
    const publicKey = await getPublicKey();
    const applicationServerKey = base64UrlToBytes(publicKey);
    let subscription = await registration.pushManager.getSubscription();

    if (subscription && !sameKey(subscription, applicationServerKey)) {
      await subscription.unsubscribe();
      subscription = null;
      lastSyncedEndpoint = '';
    }

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

    await saveSubscription(subscription);
  };

  const disableNotifications = async () => {
    if (!isPushSupported()) return;
    const registration = await serviceWorkerReady();
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    if (typeof client !== 'undefined' && client && typeof profile !== 'undefined' && profile) {
      const result = await client.rpc('remove_push_subscription', { p_endpoint: subscription.endpoint });
      if (result.error) throw result.error;
    }

    await subscription.unsubscribe();
    lastSyncedEndpoint = '';
  };

  const refreshCard = async (card) => {
    if (!card?.isConnected) return;
    if (!isPushSupported()) {
      setCardState(card, { label: 'Unavailable', copy: 'এই browser Web Push support করছে না।', button: 'Unavailable', disabled: true });
      return;
    }
    if (isIOS() && !isStandalone()) {
      setCardState(card, { label: 'Home Screen needed', kind: 'warn', copy: 'iPhone/iPad-এ Share → Add to Home Screen করার পর notification চালু করুন।', button: 'Install first', disabled: true });
      return;
    }
    if (Notification.permission === 'denied') {
      setCardState(card, { label: 'Blocked', kind: 'warn', copy: 'Browser/System notification settings থেকে Mess Manager-কে Allow করুন।', button: 'Blocked', disabled: true });
      return;
    }

    try {
      const registration = await serviceWorkerReady();
      const subscription = await registration.pushManager.getSubscription();
      if (Notification.permission === 'granted' && subscription) {
        syncExistingSubscription(subscription);
        setCardState(card, { label: 'ON', kind: 'on', copy: 'এই device-এ নতুন Mess Chat message background-এও notification দেবে।', button: 'Turn off', action: 'disable', secondary: true });
      } else {
        setCardState(card, { label: 'OFF', copy: 'Website বা installed PWA বন্ধ থাকলেও নতুন message notification পেতে চালু করুন।', button: 'Enable', action: 'enable' });
      }
    } catch (error) {
      console.warn('Chat notification status failed', error);
      setCardState(card, { label: 'Retry', kind: 'warn', copy: 'Notification service এখন ready নয়। একটু পরে আবার চেষ্টা করুন।', button: 'Retry', action: 'enable' });
    }
  };

  const bindCard = (card) => {
    const button = card.querySelector('[data-mm-push-action]');
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      const action = button.dataset.action || 'enable';
      button.disabled = true;
      button.textContent = action === 'disable' ? 'Turning off…' : 'Enabling…';
      try {
        if (action === 'disable') {
          await disableNotifications();
          safeNotify('Chat notifications turned off.', 'success');
        } else {
          await enableNotifications();
          safeNotify('Chat notifications enabled.', 'success');
        }
      } catch (error) {
        console.error('Chat notification action failed', error);
        safeNotify(error?.message || 'Unable to update chat notifications.');
      } finally {
        await refreshCard(card);
      }
    });
  };

  const ensureCard = () => {
    observerQueued = false;
    injectStyle();
    const shell = document.querySelector('#content .chat-shell');
    if (!shell || shell.querySelector(`#${CARD_ID}`)) return;

    const card = document.createElement('section');
    card.id = CARD_ID;
    card.setAttribute('aria-label', 'Chat notification settings');
    card.innerHTML = `
      <div class="mm-push-icon" aria-hidden="true"></div>
      <div class="mm-push-copy">
        <div class="mm-push-title"><b>Message notifications</b><span class="mm-push-status" data-mm-push-status>Checking</span></div>
        <p data-mm-push-copy>Checking notification support on this device…</p>
      </div>
      <button class="mm-push-action" type="button" data-mm-push-action disabled>Checking…</button>
    `;

    const head = shell.querySelector('.chat-head');
    if (head) head.insertAdjacentElement('afterend', card);
    else shell.prepend(card);
    bindCard(card);
    refreshCard(card);
  };

  const queueEnsureCard = () => {
    if (observerQueued) return;
    observerQueued = true;
    requestAnimationFrame(ensureCard);
  };

  const openChat = () => {
    try {
      if (typeof profile === 'undefined' || !profile || typeof go !== 'function') return false;
      go('chat');
      return true;
    } catch (error) {
      console.warn('Unable to open chat from notification', error);
      return false;
    }
  };

  const consumeOpenIntent = () => {
    const url = new URL(location.href);
    if (url.searchParams.get(OPEN_PARAM) !== 'chat') return false;
    if (!openChat()) return false;
    url.searchParams.delete(OPEN_PARAM);
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    return true;
  };

  const observer = new MutationObserver(queueEnsureCard);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'open-chat') openChat();
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      queueEnsureCard();
      const card = document.getElementById(CARD_ID);
      if (card) refreshCard(card);
      consumeOpenIntent();
    }
  });

  if (typeof client !== 'undefined' && client?.auth) {
    client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        lastSyncedEndpoint = '';
        if (isPushSupported()) {
          serviceWorkerReady()
            .then(registration => registration.pushManager.getSubscription())
            .then(subscription => subscription?.unsubscribe())
            .catch(() => {});
        }
      } else {
        setTimeout(() => { queueEnsureCard(); consumeOpenIntent(); }, 0);
      }
    });
  }

  window.addEventListener('load', () => {
    queueEnsureCard();
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (consumeOpenIntent() || attempts >= 80) clearInterval(timer);
    }, 250);
  });

  queueEnsureCard();
})();
