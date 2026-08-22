/* Background push subscription self-healing for Mess Manager.
 * Keeps an already-enabled device subscribed after login/session changes
 * without prompting for notification permission automatically.
 */
'use strict';
(() => {
  if (window.__mmChatNotificationHealLoaded) return;
  window.__mmChatNotificationHealLoaded = true;

  const PREF_KEY = 'mm-chat-push-opted-in-v2';
  let healPromise = null;
  let lastSavedKey = '';
  let bootTimer = null;

  const supported = () => (
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

  const getPref = () => {
    try { return localStorage.getItem(PREF_KEY); }
    catch (_) { return null; }
  };

  const setPref = value => {
    try { localStorage.setItem(PREF_KEY, value); }
    catch (_) {}
  };

  const bytesToBase64Url = value => {
    const bytes = new Uint8Array(value || 0);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  };

  const base64UrlToBytes = value => {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return bytes;
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

  const subscriptionKeys = subscription => {
    const data = subscription.toJSON?.() || {};
    if (data.keys?.p256dh && data.keys?.auth) return data.keys;
    const p256dh = subscription.getKey?.('p256dh');
    const auth = subscription.getKey?.('auth');
    return {
      p256dh: p256dh ? bytesToBase64Url(p256dh) : '',
      auth: auth ? bytesToBase64Url(auth) : '',
    };
  };

  const appReady = () => (
    typeof client !== 'undefined' && client &&
    typeof profile !== 'undefined' && profile?.id
  );

  async function getPublicKey() {
    const result = await client.functions.invoke('chat-push', {
      body: { action: 'public-key' },
    });
    if (result.error) throw result.error;
    if (result.data?.error) throw new Error(result.data.error);
    const key = String(result.data?.public_key || '').trim();
    if (!key) throw new Error('Push service key is unavailable.');
    return key;
  }

  async function saveSubscription(subscription) {
    const keys = subscriptionKeys(subscription);
    if (!subscription?.endpoint || !keys.p256dh || !keys.auth) {
      throw new Error('Browser push subscription is incomplete.');
    }

    const memberId = String(profile?.id || '');
    const saveKey = `${memberId}:${subscription.endpoint}`;
    if (saveKey === lastSavedKey) return;

    const result = await client.rpc('save_push_subscription', {
      p_endpoint: subscription.endpoint,
      p_p256dh: keys.p256dh,
      p_auth: keys.auth,
      p_user_agent: navigator.userAgent || '',
    });
    if (result.error) throw result.error;
    lastSavedKey = saveKey;
  }

  async function healSubscription() {
    if (healPromise) return healPromise;
    healPromise = (async () => {
      if (!supported() || Notification.permission !== 'granted') return;
      if (isIOS() && !isStandalone()) return;
      if (!appReady()) return;

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      const pref = getPref();

      // Preserve existing opt-in state for users who enabled notifications
      // before this self-healing controller was introduced.
      if (subscription && pref === null) setPref('1');

      // Respect an explicit Turn off action and do not auto-create a new
      // subscription merely because browser permission remains granted.
      if (!subscription && getPref() !== '1') return;

      const publicKey = await getPublicKey();
      const applicationServerKey = base64UrlToBytes(publicKey);

      if (subscription && !sameKey(subscription, applicationServerKey)) {
        await subscription.unsubscribe();
        subscription = null;
        lastSavedKey = '';
      }

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      await saveSubscription(subscription);
    })().catch(error => {
      console.warn('Background chat notification self-heal failed', error);
    }).finally(() => {
      healPromise = null;
    });
    return healPromise;
  }

  function scheduleHeal(delay = 0) {
    clearTimeout(bootTimer);
    bootTimer = setTimeout(() => {
      healSubscription();
    }, delay);
  }

  // Remember the user's explicit notification choice from the existing chat
  // notification controller without changing its UI or behavior.
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-mm-push-action]');
    if (!button) return;
    const action = button.dataset.action || 'enable';
    if (action === 'disable') {
      setPref('0');
      lastSavedKey = '';
    } else if (action === 'enable') {
      setPref('1');
      lastSavedKey = '';
      scheduleHeal(1200);
    }
  }, true);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleHeal(250);
  });

  window.addEventListener('online', () => scheduleHeal(250));
  setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine !== false) scheduleHeal(0);
  }, 60_000);
  window.addEventListener('load', () => {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (appReady()) {
        clearInterval(timer);
        scheduleHeal(50);
      } else if (attempts >= 80) {
        clearInterval(timer);
      }
    }, 250);
  });

  if (typeof client !== 'undefined' && client?.auth) {
    client.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') {
        lastSavedKey = '';
        return;
      }
      scheduleHeal(600);
    });
  }
})();
