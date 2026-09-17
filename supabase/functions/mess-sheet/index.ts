// Every mess's own, auto-created, auto-updating Google Sheet.
//
// "Download Sheets" (and every data change afterwards) never asks anyone to
// create a Sheet or paste a script: the first time a mess needs one, this
// function creates it itself, using a Google *service account* — a robot
// Google identity we hold the credentials for, completely separate from
// every member's own Google account. From then on:
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
// Requires three Edge Function secrets this code cannot supply itself:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL     — the service account's client_email
//   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY — its private_key (the PEM string,
//                                        newlines included)
//   GOOGLE_DRIVE_FOLDER_ID           — a Drive folder owned by a real Google
//                                       account that has shared it with the
//                                       service account as Editor. Service
//                                       accounts have no Drive storage of
//                                       their own (0 bytes, unless on a
//                                       Workspace domain), so creating a
//                                       Sheet directly as the service account
//                                       fails with "The caller does not have
//                                       permission" — creating it inside a
//                                       folder a real account owns charges
//                                       the storage there instead.
// The first two come from one Google Cloud service account JSON key file;
// see android/README.md-style setup notes in the PR/commit that added this.
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
    .select('id')
    .eq('user_id', user.id)
    .eq('mess_id', messId)
    .eq('active', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (memberResult.error) throw memberResult.error;
  if (!memberResult.data) return { error: json({ error: 'Active mess membership required' }, 403) } as const;

  return { admin, messId } as const;
}

/* -------------------------------------------------- Google service account
   A service account authenticates itself with a self-signed JWT ("JWT
   bearer" flow), no interactive consent and no separate OAuth client — it is
   its own Google identity. Implemented on Web Crypto only (RS256 = RSASSA-
   PKCS1-v1_5 + SHA-256), so this needs no Google client library at all. */
// Full drive scope (not drive.file): the service account has to write into
// a folder it did not itself create — a folder a real Google account shared
// with it — and drive.file only ever covers files/folders the app created.
const SHEETS_SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive';

function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemToKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const raw = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    raw,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getGoogleAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;

  const clientEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const privateKeyPem = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY');
  if (!clientEmail || !privateKeyPem) {
    throw new Error(
      'Live Google Sheet is not configured yet: GOOGLE_SERVICE_ACCOUNT_EMAIL and ' +
      'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY secrets are missing.',
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: clientEmail,
    scope: SHEETS_SCOPES,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64Url(new TextEncoder().encode(JSON.stringify(header)))}.${base64Url(new TextEncoder().encode(JSON.stringify(claims)))}`;
  const key = await pemToKey(privateKeyPem.replace(/\\n/g, '\n'));
  const signature = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${base64Url(signature)}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    console.error('Google token exchange failed', response.status, data);
    throw new Error('Unable to authenticate with Google Sheets right now.');
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
  const folderId = Deno.env.get('GOOGLE_DRIVE_FOLDER_ID');
  if (!folderId) {
    throw new Error(
      'Live Google Sheet is not configured yet: GOOGLE_DRIVE_FOLDER_ID secret is missing.',
    );
  }

  // Create the file itself via the Drive API, inside a folder a real Google
  // account owns (see file header) — spreadsheets.create would try to place
  // it in the service account's own (storage-less) Drive and fail.
  const created = await googleFetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    body: JSON.stringify({
      name: `${messName} — Mess Manager`,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [folderId],
    }),
  });
  const spreadsheetId = created.id as string;

  // A file created this way starts as a single default "Sheet1" tab — set
  // up the same two tabs (Bazar + Khawa & Taka) the rest of this file writes
  // to, via the Sheets API now that the file itself exists.
  await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [
        { updateSheetProperties: { properties: { sheetId: 0, title: 'Bazar' }, fields: 'title' } },
        { addSheet: { properties: { title: 'Khawa & Taka', gridProperties: { rowCount: 400, columnCount: 12 } } } },
      ],
    }),
  });

  // "anyone with the link can view" — every mess member other than the
  // folder's owner still needs this to open it at all.
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = cleanText(body?.action, 40);

    const authenticated = await authenticate(req);
    if ('error' in authenticated) return authenticated.error;
    const { admin, messId } = authenticated;

    if (action === 'open') {
      const spreadsheetId = await getOrCreateSheet(admin, messId);
      return json({ ok: true, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` });
    }

    if (action === 'push') {
      const month = cleanText(body?.month, 10);
      if (!DATE_RE.test(month)) return json({ error: 'Invalid month' }, 400);
      const bazar = sanitizeRows(body?.bazar, 'bazar');
      const khawa = sanitizeRows(body?.khawa, 'khawa');
      if (!bazar || !khawa) return json({ error: 'Invalid sheet data' }, 400);

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

      // Only write to Google once a Sheet actually exists for this mess, and
      // only when the data actually changed — every mess member's browser
      // can call this after every data change, and Sheets API quota is not
      // infinite.
      if (!unchanged) {
        const mess = await admin.from('messes').select('gsheet_id').eq('id', messId).single();
        if (mess.error) throw mess.error;
        if (mess.data.gsheet_id) {
          try {
            await writeSheetTab(mess.data.gsheet_id, 'Bazar', bazar);
            await writeSheetTab(mess.data.gsheet_id, 'Khawa & Taka', khawa);
          } catch (sheetError) {
            // The snapshot is already saved either way, so a transient Google
            // hiccup here just means the next push (or the next open, which
            // always fetches the live Sheet) catches up — never fail the
            // whole request over it.
            console.warn('mess-sheet: live Sheet write failed, snapshot still saved', sheetError);
          }
        }
      }

      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('mess-sheet failed', error);
    return json({ error: (error as Error)?.message || 'Unable to process the sheet sync request right now.' }, 500);
  }
});
