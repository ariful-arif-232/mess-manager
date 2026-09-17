/* Live Google Sheet: fully automatic, no setup screen.
 *
 * Tapping "Download Sheets" asks the mess-sheet edge function to open the
 * mess's own Google Sheet, creating it the first time (via a Google service
 * account the function holds credentials for — nobody pastes anything).
 * From then on, every data change in the app pushes fresh rows to that same
 * function, which writes them straight into the live Sheet, so the Sheet is
 * already current by the time anyone opens it.
 *
 * A real <a href="https://docs.google.com/..."> click, not window.open() or
 * the Web Share API, is what actually hands off to an installed Sheets app:
 * docs.google.com is a Universal/App Link on both iOS and Android, and the
 * OS — not this page — decides whether to intercept it into the app or fall
 * back to the browser. Sharing a locally-generated file depends on the OS
 * matching its MIME type to an installed app in the share sheet, which is
 * exactly the step that was failing silently on iPhone.
 */
'use strict';
(() => {
  if (window.__mmSheetSync) return;
  window.__mmSheetSync = true;

  const FUNCTION_URL = `${(window.MESS_MANAGER_CONFIG || {}).supabaseUrl || ''}/functions/v1/mess-sheet`;
  let pushTimer = null;
  let pushing = false;
  let lastPushedKey = '';

  const ready = () => typeof client !== 'undefined' && client
    && typeof session !== 'undefined' && session?.user
    && typeof profile !== 'undefined' && profile?.mess_id;

  async function call(body) {
    const activeSession = (await client.auth.getSession()).data.session;
    const headers = {'Content-Type': 'application/json', apikey: cfg.supabaseAnonKey};
    if (activeSession?.access_token) headers.Authorization = `Bearer ${activeSession.access_token}`;
    const response = await fetch(FUNCTION_URL, {method: 'POST', headers, body: JSON.stringify(body)});
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || 'Sheet sync request failed.');
    return data;
  }

  /* ------------------------------------------------------------ auto-push */
  function scheduleSnapshotPush() {
    if (!ready()) return;
    // Only the real current month is ever pushed — a member reading a past
    // month's Bazar page must never overwrite the live Sheet with stale
    // data. The Sheet simply keeps showing the last real push until then.
    if (state.month !== monthKey()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushSnapshotNow, 900);
  }

  async function pushSnapshotNow() {
    if (pushing || !ready() || state.month !== monthKey()) return;
    if (typeof window.mmBuildSheetSnapshotRows !== 'function') return;
    pushing = true;
    try {
      const {bazar, khawa} = window.mmBuildSheetSnapshotRows();
      const key = JSON.stringify({bazar, khawa});
      if (key === lastPushedKey) return; // nothing actually changed since the last push
      await call({action: 'push', month: `${state.month}-01`, bazar, khawa});
      lastPushedKey = key;
    } catch (error) {
      console.warn('Live sheet snapshot push failed (will retry on the next data change).', error);
    } finally {
      pushing = false;
    }
  }

  const baseLoadData = window.loadData;
  window.loadData = async function loadDataWithSheetSync(...args) {
    const result = await baseLoadData.apply(this, args);
    scheduleSnapshotPush();
    return result;
  };

  /* --------------------------------------------------------- open the sheet
     get-or-create, then a real anchor click — see file header for why. */
  async function openLiveSheet(button) {
    const old = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="mm-sheet-spin" aria-hidden="true"></span><span>Opening…</span>';
    try {
      const data = await call({action: 'open'});
      const link = document.createElement('a');
      link.href = data.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
      void pushSnapshotNow(); // make sure a freshly-created Sheet isn't empty on first open
    } catch (error) {
      if (typeof notify === 'function') notify(error?.message || 'Sheet খোলা যায়নি। আবার চেষ্টা করুন।');
    } finally {
      button.disabled = false;
      button.innerHTML = old;
    }
  }

  const baseSettings = window.settings;
  window.settings = function settingsWithLiveSheet(container) {
    const result = typeof baseSettings === 'function' ? baseSettings(container) : undefined;
    const button = document.getElementById('exportMessData');
    if (button) button.onclick = () => openLiveSheet(button);
    return result;
  };
})();
