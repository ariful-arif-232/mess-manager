/* Live Google Sheet: no per-mess setup screen, one one-time app-wide step.
 *
 * Every data change pushes fresh rows to the mess-sheet edge function, which
 * writes them straight into the mess's own Google Sheet — creating that Sheet
 * on the first push that needs one, as whichever real Google account an admin
 * connected once via the "Connect Google Drive" button in Settings (see
 * connectGoogleDrive() below and mess-oauth-callback). Nothing has to be
 * tapped for any of that: "Download Sheets" only opens the Sheet, which is
 * already current by the time anyone gets there.
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
      const result = await call({action: 'push', month: `${state.month}-01`, bazar, khawa});
      // The rows are always stored server-side, but they only reached the
      // Sheet itself when synced is true — anything else stays un-marked so
      // the next data change tries again rather than assuming it is in there.
      if (result?.synced === false) return;
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
     get-or-create, then a real anchor click, same tab — see file header for
     why an anchor at all. target="_blank" specifically is what iOS Safari
     silently blocks after an await (it treats a new browsing context the
     same as window.open for user-gesture purposes), so this navigates the
     current tab instead; docs.google.com is a Universal Link either way. */
  async function openLiveSheet(button) {
    const old = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="mm-sheet-spin" aria-hidden="true"></span><span>Opening…</span>';
    try {
      // Sent along so a Sheet created for the very first time already has
      // real rows in it — waiting on a separate push afterwards raced with
      // the tab switch and could leave the Sheet looking empty on open.
      const rows = typeof window.mmBuildSheetSnapshotRows === 'function' ? window.mmBuildSheetSnapshotRows() : null;
      const data = await call({action: 'open', bazar: rows?.bazar, khawa: rows?.khawa});
      const link = document.createElement('a');
      link.href = data.url;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      if (typeof notify === 'function') notify(error?.message || 'Sheet খোলা যায়নি। আবার চেষ্টা করুন।');
    } finally {
      button.disabled = false;
      button.innerHTML = old;
    }
  }

  /* ------------------------------------------------- connect Google Drive
     One admin, one time: navigates to Google's consent screen (same tab,
     via a real anchor click — window.open() after an await loses the user-
     gesture context in most mobile browsers/WebViews and gets silently
     blocked, exactly like the Web Share bug this whole file replaced). The
     status row below is refreshed on every Settings visit so it reflects
     whatever mess-oauth-callback last recorded. */
  async function connectGoogleDrive(button) {
    const old = button.textContent;
    button.disabled = true;
    button.textContent = 'Opening…';
    try {
      const data = await call({action: 'oauth-start'});
      const link = document.createElement('a');
      link.href = data.url;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      if (typeof notify === 'function') notify(error?.message || 'Could not start the Google connection.');
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  }

  async function refreshGoogleDriveStatus() {
    const statusEl = document.getElementById('googleDriveStatus');
    const button = document.getElementById('connectGoogleDrive');
    if (!statusEl || !button) return;
    try {
      const data = await call({action: 'oauth-status'});
      if (data.connected) {
        // Compact, like every other status pill on this page — the full
        // address goes in the title tooltip instead of forcing the row wide.
        statusEl.textContent = '✓ Connected';
        statusEl.title = data.email ? `Connected as ${data.email}` : '';
        statusEl.style.display = '';
        button.textContent = 'Reconnect';
      } else {
        statusEl.style.display = 'none';
        button.textContent = 'Connect Google Drive';
      }
    } catch (error) {
      statusEl.style.display = 'none';
    } finally {
      button.style.display = '';
    }
  }

  const baseSettings = window.settings;
  window.settings = function settingsWithLiveSheet(container) {
    const result = typeof baseSettings === 'function' ? baseSettings(container) : undefined;
    const exportButton = document.getElementById('exportMessData');
    if (exportButton) exportButton.onclick = () => openLiveSheet(exportButton);
    const connectButton = document.getElementById('connectGoogleDrive');
    if (connectButton) {
      connectButton.onclick = () => connectGoogleDrive(connectButton);
      refreshGoogleDriveStatus();
    }
    return result;
  };
})();
