/* Automatic Web Push controller for Mess Chat.
 * No in-app enable/disable controls are rendered. When notification permission
 * is already granted, the current device is subscribed automatically. For a
 * fresh install, the OS permission prompt is requested from the first eligible
 * user gesture because browsers do not allow notification permission bypasses.
 */
'use strict';
(() => {
  if (window.__mmChatNotificationsLoaded) return;
  window.__mmChatNotificationsLoaded = true;

  const OPEN_PARAM = 'open';
  let syncPromise = null;
  let syncTimer = null;
  let permissionArmed = false;
  let permissionPointerHandler = null;
  let permissionKeyHandler = null;
  let foregroundChannel = null;
  let foregroundProfileId = '';
  let lastProfileId = '';

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

  const appReady = () => (
    typeof client !== 'undefined' && client &&
    typeof session !== 'undefined' && session?.user &&
    typeof profile !== 'undefined' && profile?.id && profile?.mess_id
  );

  const safeNotify = (message, type = 'success') => {
    if (typeof notify === 'function') notify(message, type);
  };

  const serviceWorkerReady = async () => {
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Notification service is not ready yet.')), 8000);
    });
    return Promise.race([navigator.serviceWorker.ready, timeout]);
  };

  const base64UrlToBytes = value => {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return bytes;
  };

  const bytesToBase64Url = value => {
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
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
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

    const result = await client.rpc('save_push_subscription', {
      p_endpoint: subscription.endpoint,
      p_p256dh: keys.p256dh,
      p_auth: keys.auth,
      p_user_agent: navigator.userAgent || '',
    });
    if (result.error) throw result.error;
  }

  async function ensureSubscription({ allowPermissionPrompt = false } = {}) {
    if (syncPromise) return syncPromise;

    syncPromise = (async () => {
      if (!supported() || !appReady()) return false;
      if (isIOS() && !isStandalone()) return false;

      let permission = Notification.permission;
      if (permission === 'default' && allowPermissionPrompt) {
        permission = await Notification.requestPermission();
      }
      if (permission !== 'granted') return false;

      const registration = await serviceWorkerReady();
      const publicKey = await getPublicKey();
      const applicationServerKey = base64UrlToBytes(publicKey);
      let subscription = await registration.pushManager.getSubscription();

      if (subscription && !sameKey(subscription, applicationServerKey)) {
        await subscription.unsubscribe();
        subscription = null;
      }

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      // The RPC binds this device endpoint to every active workspace belonging
      // to the signed-in user, so newly-added workspaces are covered as soon as
      // this sync runs.
      await saveSubscription(subscription);
      return true;
    })().catch(error => {
      console.warn('Automatic chat notification sync failed', error);
      return false;
    }).finally(() => {
      syncPromise = null;
    });

    return syncPromise;
  }

  function scheduleSync(delay = 0) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      if (!appReady()) return;
      if (Notification.permission === 'granted') {
        ensureSubscription();
      } else if (Notification.permission === 'default') {
        armPermissionPrompt();
      }
      ensureForegroundChannel();
    }, delay);
  }

  function disarmPermissionPrompt() {
    if (!permissionArmed) return;
    permissionArmed = false;
    if (permissionPointerHandler) {
      document.removeEventListener('pointerdown', permissionPointerHandler, true);
    }
    if (permissionKeyHandler) {
      document.removeEventListener('keydown', permissionKeyHandler, true);
    }
    permissionPointerHandler = null;
    permissionKeyHandler = null;
  }

  function armPermissionPrompt() {
    if (
      permissionArmed ||
      !supported() ||
      !appReady() ||
      Notification.permission !== 'default' ||
      (isIOS() && !isStandalone())
    ) return;

    permissionArmed = true;
    const requestFromGesture = () => {
      disarmPermissionPrompt();

      // requestPermission must be called directly from this user gesture.
      let request;
      try {
        request = Notification.requestPermission();
      } catch (error) {
        console.warn('Notification permission request failed', error);
        return;
      }

      Promise.resolve(request).then(permission => {
        if (permission === 'granted') scheduleSync(0);
      }).catch(error => {
        console.warn('Notification permission request failed', error);
      });
    };

    permissionPointerHandler = requestFromGesture;
    permissionKeyHandler = event => {
      if (event.key === 'Tab' || event.key === 'Shift' || event.key === 'Control' || event.key === 'Alt' || event.key === 'Meta') return;
      requestFromGesture();
    };

    document.addEventListener('pointerdown', permissionPointerHandler, true);
    document.addEventListener('keydown', permissionKeyHandler, true);
  }

  async function unsubscribeBrowserOnly() {
    disarmPermissionPrompt();
    if (!supported()) return;
    try {
      const registration = await serviceWorkerReady();
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();
    } catch (_) {}
  }

  function ensureForegroundChannel() {
    if (!appReady()) return;
    if (foregroundChannel && foregroundProfileId === profile.id) return;

    if (foregroundChannel) {
      try { client.removeChannel(foregroundChannel); } catch (_) {}
      foregroundChannel = null;
    }

    foregroundProfileId = profile.id;
    foregroundChannel = client
      .channel(`chat-foreground:${profile.mess_id}:${profile.id}:${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'mess_messages',
        filter: `mess_id=eq.${profile.mess_id}`,
      }, payload => {
        const row = payload?.new;
        if (!row?.id || row.sender_member_id === profile.id) return;
        if (document.visibilityState !== 'visible') return;
        if (typeof state !== 'undefined' && state.page === 'chat') return;

        const sender = typeof memberName === 'function'
          ? memberName(row.sender_member_id)
          : 'Mess Chat';
        const preview = String(row.body || '').trim().slice(0, 120);
        if (preview) safeNotify(`${sender}: ${preview}`, 'success');
      })
      .subscribe(status => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Foreground chat channel status:', status);
        }
      });
  }

  function stopForegroundChannel() {
    if (foregroundChannel && typeof client !== 'undefined' && client) {
      try { client.removeChannel(foregroundChannel); } catch (_) {}
    }
    foregroundChannel = null;
    foregroundProfileId = '';
  }

  function openChat() {
    try {
      if (!appReady() || typeof go !== 'function') return false;
      go('chat');
      return true;
    } catch (error) {
      console.warn('Unable to open chat from notification', error);
      return false;
    }
  }

  function consumeOpenIntent() {
    const url = new URL(location.href);
    if (url.searchParams.get(OPEN_PARAM) !== 'chat') return false;
    if (!openChat()) return false;
    url.searchParams.delete(OPEN_PARAM);
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    return true;
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'open-chat') openChat();
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      scheduleSync(50);
      consumeOpenIntent();
    }
  });

  window.addEventListener('online', () => scheduleSync(50));
  window.addEventListener('focus', () => scheduleSync(50));
  window.addEventListener('pageshow', () => scheduleSync(50));

  // Detect workspace/profile changes without modifying the workspace module.
  const profileObserver = new MutationObserver(() => {
    if (!appReady()) return;
    const currentProfileId = String(profile.id || '');
    if (currentProfileId && currentProfileId !== lastProfileId) {
      lastProfileId = currentProfileId;
      scheduleSync(0);
    }
  });
  profileObserver.observe(document.documentElement, { childList: true, subtree: true });

  if (typeof client !== 'undefined' && client?.auth) {
    client.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') {
        stopForegroundChannel();
        lastProfileId = '';
        unsubscribeBrowserOnly();
        return;
      }
      scheduleSync(100);
    });
  }

  window.addEventListener('load', () => {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (appReady()) {
        clearInterval(timer);
        lastProfileId = String(profile.id || '');
        scheduleSync(0);
        consumeOpenIntent();
      } else if (attempts >= 120) {
        clearInterval(timer);
      }
    }, 250);
  });

  // Periodically refresh the server mapping while the app is being used. This
  // is lightweight and makes a newly-added workspace inherit push quickly even
  // when the same device subscription already existed.
  setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine !== false) {
      scheduleSync(0);
    }
  }, 30_000);
})();
