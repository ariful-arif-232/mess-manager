// Every mess's own, auto-created, auto-updating Google Sheet.
//
// "Download Sheets" (and every data change afterwards) never asks anyone to
// create a Sheet or paste a script: the first time a mess needs one, this
// function creates it itself, using whichever real Google account an admin
// connected once in Settings. From then on:
//
//   open  (session)  -> returns the mess's Sheet URL, creating the Sheet
//                       (two tabs, Bazar + Khawa & Taka, shared "anyone with
//                       the link can view") the first time it's called.
//                       docs.google.com links are handled by the OS on both
//                       Android and iOS, so opening this URL hands off
//                       straight to the installed Sheets app when there is
//                       one — nothing web-share-based to fail silently.
//   push  (session)  -> stores the caller's already-computed Bazar and
//                       Khawa & Taka rows (calcMonth()/utilityLedger() — the
//                       same maths the Dashboard/Settlement pages use, never
//                       reimplemented here) as the mess's latest snapshot,
//                       and — once the Sheet already exists — writes those
//                       same rows straight into it via the Sheets API, so
//                       the Sheet is live within seconds of anyone using the
//                       app, not just when it happens to be opened.
//
// Every Sheet is created and owned by a real Google account (whoever
// clicked "Connect Google Drive" in Settings once — see
// mess-oauth-callback), not a service account: a service account's own
// Drive storage is always 0 bytes off a Workspace domain, and placing a
// file inside someone else's folder does not change who Drive bills the
// storage to — the file's *creator* stays its owner either way. A real
// account's own OAuth connection sidesteps that entirely.
//
// Requires two Edge Function secrets this code cannot supply itself:
//   GOOGLE_OAUTH_CLIENT_ID     — from a Google Cloud OAuth 2.0 Web
//                                application client
//   GOOGLE_OAUTH_CLIENT_SECRET — that same client's secret
// The actual per-account connection (a refresh token) lives in the
// app_google_connection table, written by mess-oauth-callback once an
// admin completes the one-time "Connect Google Drive" flow in Settings.
import { createClient } from 'npm:@supabase/supabase-js@2.55.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const cleanText = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const MAX_ROWS = 400;
const MAX_COLS = 24;
const MAX_CELL_CHARS = 500;

function sanitizeRows(value: unknown, label: string): string[][] | null {
  if (!Array.isArray(value) || value.length > MAX_ROWS) return null;
  const rows: string[][] = [];
  for (const row of value) {
    if (!Array.isArray(row) || row.length > MAX_COLS) return null;
    const cells: string[] = [];
    for (const cell of row) {
      if (cell === null || cell === undefined) { cells.push(''); continue; }
      if (typeof cell === 'number' && Number.isFinite(cell)) { cells.push(String(cell)); continue; }
      if (typeof cell === 'string') { cells.push(cell.slice(0, MAX_CELL_CHARS)); continue; }
      console.warn(`mess-sheet: rejected non-primitive cell in ${label}`);
      return null;
    }
    rows.push(cells);
  }
  return rows;
}

function createAdminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) throw new Error('Supabase server credentials are unavailable.');
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function authenticate(req: Request) {
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return { error: json({ error: 'Unauthorized' }, 401) } as const;

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anon) throw new Error('Supabase client credentials are unavailable.');

  const caller = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createAdminClient();

  const { data: { user }, error: userError } = await caller.auth.getUser();
  if (userError || !user) return { error: json({ error: 'Unauthorized' }, 401) } as const;

  const selectedMess = await caller.rpc('current_mess_id');
  if (selectedMess.error) throw selectedMess.error;
  const messId = cleanText(selectedMess.data, 80);
  if (!UUID_RE.test(messId)) return { error: json({ error: 'Select an active mess workspace first' }, 409) } as const;

  const memberResult = await admin
    .from('members')
    .select('id,role')
    .eq('user_id', user.id)
    .eq('mess_id', messId)
    .eq('active', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (memberResult.error) throw memberResult.error;
  if (!memberResult.data) return { error: json({ error: 'Active mess membership required' }, 403) } as const;

  return { admin, messId, role: memberResult.data.role as string } as const;
}

// Requested once, at "Connect Google Drive" time — see mess-oauth-callback.
const GOOGLE_OAUTH_SCOPES = 'openid email https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getGoogleAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;

  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error(
      'Live Google Sheet is not configured yet: GOOGLE_OAUTH_CLIENT_ID and ' +
      'GOOGLE_OAUTH_CLIENT_SECRET secrets are missing.',
    );
  }

  const admin = createAdminClient();
  const connection = await admin.from('app_google_connection').select('refresh_token').eq('id', true).maybeSingle();
  if (connection.error) throw connection.error;
  if (!connection.data) {
    throw new Error("Google Drive isn't connected yet — an admin needs to connect it once from Settings.");
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: connection.data.refresh_token as string,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    console.error('Google token refresh failed', response.status, data);
    throw new Error('Unable to authenticate with Google Drive right now — try reconnecting it from Settings.');
  }
  cachedToken = { token: data.access_token as string, expiresAt: Date.now() + (Number(data.expires_in || 3600) * 1000) };
  return cachedToken.token;
}

async function googleFetch(url: string, init: RequestInit = {}) {
  const token = await getGoogleAccessToken();
  const response = await fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Google API call failed', url, response.status, data);
    throw new Error((data as { error?: { message?: string } })?.error?.message || 'Google Sheets API request failed.');
  }
  return data;
}

async function createMessSheet(messName: string) {
  const created = await googleFetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    body: JSON.stringify({
      properties: { title: `${messName} — Mess Manager` },
      sheets: [
        { properties: { title: 'Bazar', gridProperties: { rowCount: 400, columnCount: 12 } } },
        { properties: { title: 'Khawa & Taka', gridProperties: { rowCount: 400, columnCount: 12 } } },
      ],
    }),
  });
  const spreadsheetId = created.spreadsheetId as string;

  // "anyone with the link can view" — every mess member other than whoever
  // connected Google Drive still needs this to open it at all.
  await googleFetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions`, {
    method: 'POST',
    body: JSON.stringify({ type: 'anyone', role: 'reader' }),
  });

  return spreadsheetId;
}

async function writeSheetTab(spreadsheetId: string, tabTitle: string, rows: string[][]) {
  const range = encodeURIComponent(tabTitle);
  // Clear first: a month that shrinks (fewer bazar days than last push)
  // must not leave stale rows behind from the previous write.
  await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:clear`, {
    method: 'POST',
    body: '{}',
  });
  if (!rows.length) return;
  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}!A1?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values: rows }) },
  );
}

async function getOrCreateSheet(admin: ReturnType<typeof createAdminClient>, messId: string) {
  const mess = await admin.from('messes').select('id,name,gsheet_id').eq('id', messId).single();
  if (mess.error) throw mess.error;
  if (mess.data.gsheet_id) return mess.data.gsheet_id as string;

  const spreadsheetId = await createMessSheet(mess.data.name);

  // Someone else may have created one concurrently; keep whichever the
  // database already recorded rather than leaking a second orphaned Sheet.
  const saved = await admin
    .from('messes')
    .update({ gsheet_id: spreadsheetId })
    .eq('id', messId)
    .is('gsheet_id', null)
    .select('gsheet_id')
    .maybeSingle();
  if (saved.error) throw saved.error;
  if (saved.data) return spreadsheetId;

  const recheck = await admin.from('messes').select('gsheet_id').eq('id', messId).single();
  if (recheck.error) throw recheck.error;
  return (recheck.data.gsheet_id as string) || spreadsheetId;
}

// Shared by 'open' and 'push': saves the caller's rows as the mess's latest
// snapshot and, when they actually changed, writes them into the live
// Sheet. 'open' calls this unconditionally (not just for a Sheet it just
// created) so a Sheet that already existed — from before this app tracked
// initial data, or just because nobody had changed anything since it was
// made — never opens looking stale or blank; relying on some separate,
// unrelated future data change to eventually populate it was the bug.
async function syncSheetData(
  admin: ReturnType<typeof createAdminClient>,
  messId: string,
  spreadsheetId: string,
  month: string,
  bazar: string[][],
  khawa: string[][],
) {
  const previous = await admin
    .from('mess_sheet_snapshots')
    .select('bazar,khawa')
    .eq('mess_id', messId)
    .maybeSingle();
  if (previous.error) throw previous.error;
  const unchanged = previous.data
    && JSON.stringify(previous.data.bazar) === JSON.stringify(bazar)
    && JSON.stringify(previous.data.khawa) === JSON.stringify(khawa);

  const upserted = await admin
    .from('mess_sheet_snapshots')
    .upsert({ mess_id: messId, month, bazar, khawa, updated_at: new Date().toISOString() }, { onConflict: 'mess_id' });
  if (upserted.error) throw upserted.error;

  if (unchanged) return;
  try {
    await writeSheetTab(spreadsheetId, 'Bazar', bazar);
    await writeSheetTab(spreadsheetId, 'Khawa & Taka', khawa);
  } catch (sheetError) {
    // The snapshot is already saved either way, so a transient Google
    // hiccup here just means the next push (or open) catches up — never
    // fail the whole request over it.
    console.warn('mess-sheet: live Sheet write failed, snapshot still saved', sheetError);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = cleanText(body?.action, 40);

    const authenticated = await authenticate(req);
    if ('error' in authenticated) return authenticated.error;
    const { admin, messId, role } = authenticated;

    if (action === 'oauth-start') {
      if (role !== 'admin') return json({ error: 'Admin access required' }, 403);
      const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
      if (!clientId) return json({ error: 'GOOGLE_OAUTH_CLIENT_ID secret is missing.' }, 500);
      const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mess-oauth-callback`;
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', GOOGLE_OAUTH_SCOPES);
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      return json({ ok: true, url: authUrl.toString() });
    }

    if (action === 'oauth-status') {
      const connection = await admin.from('app_google_connection').select('connected_email').eq('id', true).maybeSingle();
      if (connection.error) throw connection.error;
      return json({ ok: true, connected: !!connection.data, email: connection.data?.connected_email || null });
    }

    if (action === 'open') {
      const spreadsheetId = await getOrCreateSheet(admin, messId);
      const bazar = sanitizeRows(body?.bazar, 'bazar');
      const khawa = sanitizeRows(body?.khawa, 'khawa');
      if (bazar && khawa) {
        const month = `${new Date().toISOString().slice(0, 7)}-01`;
        await syncSheetData(admin, messId, spreadsheetId, month, bazar, khawa);
      }
      return json({ ok: true, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` });
    }

    if (action === 'push') {
      const month = cleanText(body?.month, 10);
      if (!DATE_RE.test(month)) return json({ error: 'Invalid month' }, 400);
      const bazar = sanitizeRows(body?.bazar, 'bazar');
      const khawa = sanitizeRows(body?.khawa, 'khawa');
      if (!bazar || !khawa) return json({ error: 'Invalid sheet data' }, 400);

      // Only write to Google once a Sheet actually exists for this mess —
      // every mess member's browser can call this after every data change,
      // long before anyone has ever pressed "Download Sheets".
      const mess = await admin.from('messes').select('gsheet_id').eq('id', messId).single();
      if (mess.error) throw mess.error;
      if (mess.data.gsheet_id) {
        await syncSheetData(admin, messId, mess.data.gsheet_id, month, bazar, khawa);
      } else {
        const upserted = await admin
          .from('mess_sheet_snapshots')
          .upsert({ mess_id: messId, month, bazar, khawa, updated_at: new Date().toISOString() }, { onConflict: 'mess_id' });
        if (upserted.error) throw upserted.error;
      }

      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('mess-sheet failed', error);
    return json({ error: (error as Error)?.message || 'Unable to process the sheet sync request right now.' }, 500);
  }
});
