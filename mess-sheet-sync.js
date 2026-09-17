/* Live Google Sheet sync for the monthly Bazar / Khawa & Taka workbook.
 *
 * The math never leaves the browser: this reuses window.mmBuildSheetSnapshotRows
 * (bazar-excel-export.js), the exact same calcMonth()/utilityLedger()-backed
 * rows the .xlsx download and the Dashboard/Settlement pages already show,
 * and just pushes them to the mess-sheet edge function whenever the app has
 * fresh data for the real current month. A tiny Google Apps Script the admin
 * pastes into their own Sheet (Extensions > Apps Script) pulls that snapshot
 * every time the Sheet is opened — no Google account or Drive access on our
 * side, no service account, nothing to authorize beyond the one paste.
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
    const session_ = (await client.auth.getSession()).data.session;
    const headers = {'Content-Type': 'application/json', apikey: cfg.supabaseAnonKey};
    if (session_?.access_token) headers.Authorization = `Bearer ${session_.access_token}`;
    const response = await fetch(FUNCTION_URL, {method: 'POST', headers, body: JSON.stringify(body)});
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || 'Sheet sync request failed.');
    return data;
  }

  /* ------------------------------------------------------------ auto-push */
  function scheduleSnapshotPush() {
    if (!ready()) return;
    // Only the real current month is ever pushed — a member reading a past
    // month's Bazar page must never overwrite the live snapshot with stale
    // data. The sheet simply keeps showing the last real push until then.
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

  /* -------------------------------------------------------- settings card */
  const scriptTemplate = token => `const MESS_SHEET_URL = '${FUNCTION_URL}';
const MESS_SHEET_TOKEN = '${token}';

function onOpen() { refreshMessSheet(); }

function refreshMessSheet() {
  const res = UrlFetchApp.fetch(MESS_SHEET_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({action: 'pull', token: MESS_SHEET_TOKEN}),
    muteHttpExceptions: true,
  });
  const data = JSON.parse(res.getContentText());
  if (!data.ok) {
    SpreadsheetApp.getActive().toast(data.error || 'Sync failed', 'Mess Manager', 5);
    return;
  }
  writeSheet('Bazar', data.bazar);
  writeSheet('Khawa & Taka', data.khawa);
}

function writeSheet(name, rows) {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  sheet.clearContents();
  if (rows && rows.length) sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}`;

  function detailsHtml(token) {
    const script = scriptTemplate(token);
    return `
      <ol class="mm-sheet-steps">
        <li>Google Sheets-এ <b>sheets.new</b> খুলে একটা নতুন blank sheet তৈরি করুন।</li>
        <li>উপরে <b>Extensions → Apps Script</b>-এ যান।</li>
        <li>ওখানে যা লেখা আছে সব মুছে নিচের স্ক্রিপ্টটা paste করুন।</li>
        <li>উপরে ফাংশনের তালিকায় <b>refreshMessSheet</b> বেছে ▶ চাপুন। প্রথমবার permission চাইবে — Allow করুন।</li>
        <li>ব্যস — এরপর এই Sheet যতবার খুলবেন, প্রতিবার automatic আপডেট হয়ে যাবে।</li>
      </ol>
      <textarea class="mm-sheet-script" id="liveSheetScript" readonly spellcheck="false">${esc(script)}</textarea>
      <div class="actions gap-top"><button class="btn primary" type="button" id="liveSheetCopy">Copy script</button></div>
      <p class="mm-sheet-note">এই স্ক্রিপ্টে আপনার মেসের একটা গোপন টোকেন আছে — শুধু বিশ্বস্ত জায়গায় পেস্ট করুন।</p>`;
  }

  async function openSetup(button) {
    const old = button.textContent;
    button.disabled = true;
    button.textContent = 'Preparing…';
    try {
      const data = await call({action: 'get-token'});
      const panel = document.getElementById('liveSheetDetails');
      if (panel) {
        panel.innerHTML = detailsHtml(data.token);
        panel.classList.remove('hidden');
        document.getElementById('liveSheetCopy').onclick = async e => {
          // Capture the button before the first await: event.currentTarget
          // is only live for the synchronous part of dispatch and the
          // browser resets it to null the moment this handler yields.
          const b = e.currentTarget, was = b.textContent;
          const area = document.getElementById('liveSheetScript');
          try {
            await navigator.clipboard.writeText(area.value);
          } catch (_) {
            area.select();
            document.execCommand('copy');
          }
          b.textContent = 'Copied ✓';
          setTimeout(() => { b.textContent = was; }, 1800);
        };
      }
      button.textContent = 'Set up again';
      void pushSnapshotNow(); // seed a fresh snapshot right away, not on the next data change
    } catch (error) {
      if (typeof notify === 'function') notify(error?.message || 'Live sheet setup ব্যর্থ হয়েছে।');
      button.textContent = old;
    } finally {
      button.disabled = false;
    }
  }

  const baseSettings = window.settings;
  window.settings = function settingsWithLiveSheet(container) {
    const result = typeof baseSettings === 'function' ? baseSettings(container) : undefined;
    const button = document.getElementById('liveSheetSetup');
    if (button) button.onclick = () => openSetup(button);
    return result;
  };
})();
