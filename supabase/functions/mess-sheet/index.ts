// Every mess's own, auto-created, auto-updating Google Sheet.
//
// "Download Sheets" (and every data change afterwards) never asks anyone to
// create a Sheet or paste a script: the first time a mess needs one, this
// function creates it itself, using whichever real Google account an admin
// connected once in Settings.
//
// Every Sheet is created and owned by a real Google account (whoever
// clicked "Connect Google Drive" in Settings once — see
// mess-oauth-callback), not a service account: a service account's own
// Drive storage is always 0 bytes off a Workspace domain, and placing a
// file inside someone else's folder does not change who Drive bills the
// storage to — the file's *creator* stays its owner either way.
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
const MAX_COLS = 40;
const MAX_CELL_CHARS = 500;

type Cell = string | number;

// Numbers stay numbers (not String()d) so the Sheet holds real numeric
// cells: right-aligned, thousands-separated by the number format below,
// and summable by whoever opens it — a column of text that looks like
// money is useless in a spreadsheet.
function sanitizeRows(value: unknown, label: string): Cell[][] | null {
  if (!Array.isArray(value) || value.length > MAX_ROWS) return null;
  const rows: Cell[][] = [];
  for (const row of value) {
    if (!Array.isArray(row) || row.length > MAX_COLS) return null;
    const cells: Cell[] = [];
    for (const cell of row) {
      if (cell === null || cell === undefined) { cells.push(''); continue; }
      if (typeof cell === 'number' && Number.isFinite(cell)) { cells.push(cell); continue; }
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

const BAZAR_TAB = 'Bazar Cost';
const JOMA_TAB = 'Taka Joma';
// Tabs created before these were renamed; existing spreadsheets are migrated
// in prepareTabs() rather than being left with the old names.
const LEGACY_TAB_NAMES: Record<string, string> = { 'Bazar': BAZAR_TAB, 'Khawa & Taka': JOMA_TAB };

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
    throw new Error("Google Drive isn't connected yet — connect it once from Settings.");
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
        { properties: { title: BAZAR_TAB, gridProperties: { rowCount: 400, columnCount: 14 } } },
        { properties: { title: JOMA_TAB, gridProperties: { rowCount: 400, columnCount: 40 } } },
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

async function writeSheetTab(spreadsheetId: string, tabTitle: string, rows: Cell[][]) {
  const range = encodeURIComponent(tabTitle);
  // Clear first: a month that shrinks (fewer bazar days than last push)
  // must not leave stale rows behind from the previous write.
  await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:clear`, {
    method: 'POST',
    body: '{}',
  });
  if (!rows.length) return;
  const written = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}!A1?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values: rows }) },
  );
  console.log('mess-sheet: wrote tab', tabTitle, JSON.stringify(written));
}

/* ------------------------------------------------------- Sheet appearance
   The rows above are only values; without this pass the Sheet opens as
   naked text on a plain grid. One batchUpdate per sync styles both tabs:
   banded headers, bordered cells, bold totals, sensible column widths and
   a thousands separator on every numeric cell. */
const INK = { red: 0.13, green: 0.20, blue: 0.33 };
const PAPER_WHITE = { red: 1, green: 1, blue: 1 };
const HEADER_FILL = { red: 0.13, green: 0.20, blue: 0.33 };
const TOTAL_FILL = { red: 0.92, green: 0.94, blue: 0.98 };
const GRID_LINE = { style: 'SOLID', width: 1, color: { red: 0.82, green: 0.85, blue: 0.90 } };

function gridRange(sheetId: number, startRow: number, endRow: number, columns: number) {
  return { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: 0, endColumnIndex: columns };
}

function tabStyleRequests(sheetId: number, rows: Cell[][], headerRows: number[], totalRows: number[], firstColumnWidth: number, columnWidth: number) {
  const rowCount = rows.length;
  const columns = Math.max(1, ...rows.map((row) => row.length));
  const requests: unknown[] = [
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: headerRows.includes(0) ? 1 : 0 } },
        fields: 'gridProperties.frozenRowCount',
      },
    },
    {
      repeatCell: {
        range: gridRange(sheetId, 0, rowCount, columns),
        cell: {
          userEnteredFormat: {
            backgroundColor: PAPER_WHITE,
            verticalAlignment: 'MIDDLE',
            wrapStrategy: 'WRAP',
            // Text cells ignore a number format, so this is safe to apply
            // across the whole sheet rather than guessing which columns
            // hold money in each of the two very different layouts. The
            // second clause prints anything owed (a negative Due / Advance)
            // in red.
            numberFormat: { type: 'NUMBER', pattern: '#,##0.##;[Red]-#,##0.##' },
            textFormat: { bold: false, fontSize: 10, foregroundColor: INK },
            padding: { top: 4, right: 8, bottom: 4, left: 8 },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,verticalAlignment,wrapStrategy,numberFormat,textFormat,padding)',
      },
    },
    {
      updateBorders: {
        range: gridRange(sheetId, 0, rowCount, columns),
        top: GRID_LINE, bottom: GRID_LINE, left: GRID_LINE, right: GRID_LINE,
        innerHorizontal: GRID_LINE, innerVertical: GRID_LINE,
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: firstColumnWidth },
        fields: 'pixelSize',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: columns },
        properties: { pixelSize: columnWidth },
        fields: 'pixelSize',
      },
    },
  ];

  for (const index of headerRows) {
    requests.push({
      repeatCell: {
        range: gridRange(sheetId, index, index + 1, columns),
        cell: {
          userEnteredFormat: {
            backgroundColor: HEADER_FILL,
            horizontalAlignment: 'CENTER',
            textFormat: { bold: true, fontSize: 10, foregroundColor: PAPER_WHITE },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)',
      },
    });
  }

  for (const index of totalRows) {
    requests.push({
      repeatCell: {
        range: gridRange(sheetId, index, index + 1, columns),
        cell: { userEnteredFormat: { backgroundColor: TOTAL_FILL, textFormat: { bold: true, fontSize: 10, foregroundColor: INK } } },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    });
  }

  return requests;
}

const firstCell = (row: Cell[] | undefined) => String(row?.[0] ?? '').trim();

// Taka Joma is three stacked blocks rather than one table, so its header
// and total rows are found by their labels instead of fixed positions.
const JOMA_HEADINGS = new Set(['Taka Joma', 'Wifi & Current Bill & Gas', 'Bill', 'Name']);

function jomaRowRoles(rows: Cell[][]) {
  const headerRows: number[] = [];
  const totalRows: number[] = [];
  rows.forEach((row, index) => {
    const label = firstCell(row);
    if (JOMA_HEADINGS.has(label)) headerRows.push(index);
    else if (label === 'Total') totalRows.push(index);
  });
  // The member-name row sits directly under the "Taka Joma" heading.
  if (firstCell(rows[0]) === 'Taka Joma' && rows.length > 1) headerRows.push(1);
  return { headerRows, totalRows };
}

// Each member's name sits over their amount + purpose pair, so those two
// header cells are merged into one rather than leaving a blank beside it.
function jomaMergeRequests(sheetId: number, rows: Cell[][]) {
  if (firstCell(rows[0]) !== 'Taka Joma' || rows.length < 2) return [];
  const columns = Math.max(1, ...rows.map((row) => row.length));
  // Old merges first: the member count changes when someone joins or leaves.
  const requests: unknown[] = [{ unmergeCells: { range: gridRange(sheetId, 0, rows.length, columns) } }];
  for (let column = 1; column + 1 < columns; column += 2) {
    requests.push({
      mergeCells: {
        mergeType: 'MERGE_ALL',
        range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: column, endColumnIndex: column + 2 },
      },
    });
  }
  return requests;
}

type SheetMeta = { properties: { sheetId: number; title: string; gridProperties?: { rowCount?: number; columnCount?: number } } };

// Renames tabs left over from before they were called Bazar Cost / Taka
// Joma, grows any grid too small for the rows about to be written (a value
// write past the last column is rejected outright, and Taka Joma widens by
// two columns for every member), and hands back each tab's sheet id so
// styling needs no second metadata round trip.
async function prepareTabs(spreadsheetId: string, needs: { title: string; rows: number; columns: number }[]) {
  const meta = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))`,
  );
  const sheets = (meta.sheets || []) as SheetMeta[];
  const present = new Set(sheets.map((sheet) => sheet.properties.title));
  const requests: unknown[] = [];

  for (const sheet of sheets) {
    const renamed = LEGACY_TAB_NAMES[sheet.properties.title];
    if (!renamed || present.has(renamed)) continue;
    requests.push({
      updateSheetProperties: { properties: { sheetId: sheet.properties.sheetId, title: renamed }, fields: 'title' },
    });
    sheet.properties.title = renamed;
  }

  for (const need of needs) {
    const sheet = sheets.find((candidate) => candidate.properties.title === need.title);
    if (!sheet) continue;
    const grid = sheet.properties.gridProperties || {};
    const rowCount = Math.max(grid.rowCount || 0, need.rows + 20);
    const columnCount = Math.max(grid.columnCount || 0, need.columns + 2);
    if (rowCount === grid.rowCount && columnCount === grid.columnCount) continue;
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: sheet.properties.sheetId, gridProperties: { rowCount, columnCount } },
        fields: 'gridProperties.rowCount,gridProperties.columnCount',
      },
    });
  }

  if (requests.length) {
    await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests }),
    });
  }

  const idByTitle = new Map<string, number>();
  for (const sheet of sheets) idByTitle.set(sheet.properties.title, sheet.properties.sheetId);
  return idByTitle;
}

async function styleSpreadsheet(idByTitle: Map<string, number>, spreadsheetId: string, bazar: Cell[][], khawa: Cell[][]) {
  const requests: unknown[] = [];
  const merges: unknown[] = [];

  const bazarId = idByTitle.get(BAZAR_TAB);
  if (bazarId !== undefined && bazar.length) {
    const totals = bazar.map((row, index) => (firstCell(row) === 'Total' ? index : -1)).filter((index) => index >= 0);
    requests.push(...tabStyleRequests(bazarId, bazar, [0], totals, 78, 150));
  }

  const jomaId = idByTitle.get(JOMA_TAB);
  if (jomaId !== undefined && khawa.length) {
    const { headerRows, totalRows } = jomaRowRoles(khawa);
    requests.push(...tabStyleRequests(jomaId, khawa, headerRows, totalRows, 92, 105));
    merges.push(...jomaMergeRequests(jomaId, khawa));
  }

  if (requests.length) {
    await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests }),
    });
  }
  // Separately, so a rejected merge can never cost the whole styling pass.
  if (merges.length) {
    try {
      await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({ requests: merges }),
      });
    } catch (mergeError) {
      console.warn('mess-sheet: header merge failed', mergeError);
    }
  }
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
// snapshot and writes them into the live Sheet.
//
// The write is skipped only when these exact rows are already known to be
// in *this* spreadsheet — synced_gsheet_id, not just "the snapshot looks
// the same". A snapshot is saved on every data change, including while the
// mess still has no Sheet at all, so matching on the rows alone made every
// later call decide there was nothing to do and leave the Sheet blank
// forever. 'open' forces the write regardless: it is a deliberate tap on
// "Download Sheets", rare enough to always cost one write and be certain.
async function syncSheetData(
  admin: ReturnType<typeof createAdminClient>,
  messId: string,
  spreadsheetId: string,
  month: string,
  bazar: Cell[][],
  khawa: Cell[][],
  force = false,
) {
  const previous = await admin
    .from('mess_sheet_snapshots')
    .select('bazar,khawa,synced_gsheet_id')
    .eq('mess_id', messId)
    .maybeSingle();
  if (previous.error) throw previous.error;
  const alreadyInSheet = !force
    && previous.data
    && previous.data.synced_gsheet_id === spreadsheetId
    && JSON.stringify(previous.data.bazar) === JSON.stringify(bazar)
    && JSON.stringify(previous.data.khawa) === JSON.stringify(khawa);

  const snapshot: Record<string, unknown> = {
    mess_id: messId,
    month,
    bazar,
    khawa,
    updated_at: new Date().toISOString(),
  };

  if (alreadyInSheet) {
    snapshot.synced_gsheet_id = spreadsheetId;
    const upserted = await admin.from('mess_sheet_snapshots').upsert(snapshot, { onConflict: 'mess_id' });
    if (upserted.error) throw upserted.error;
    return;
  }

  try {
    // Renaming and grid growth first: the writes below address tabs by their
    // current title and fail outright past the last column.
    const widest = (rows: Cell[][]) => Math.max(1, ...rows.map((row) => row.length));
    const tabs = await prepareTabs(spreadsheetId, [
      { title: BAZAR_TAB, rows: bazar.length, columns: widest(bazar) },
      { title: JOMA_TAB, rows: khawa.length, columns: widest(khawa) },
    ]);
    await writeSheetTab(spreadsheetId, BAZAR_TAB, bazar);
    await writeSheetTab(spreadsheetId, JOMA_TAB, khawa);
    snapshot.synced_gsheet_id = spreadsheetId;
    try {
      await styleSpreadsheet(tabs, spreadsheetId, bazar, khawa);
    } catch (styleError) {
      // Appearance is not worth losing a good data write over.
      console.warn('mess-sheet: Sheet styling failed, values are still correct', styleError);
    }
  } catch (sheetError) {
    // Leave synced_gsheet_id untouched so the next call retries the write
    // instead of assuming these rows made it into the Sheet.
    console.warn('mess-sheet: live Sheet write failed, snapshot still saved', sheetError);
  }

  const upserted = await admin.from('mess_sheet_snapshots').upsert(snapshot, { onConflict: 'mess_id' });
  if (upserted.error) throw upserted.error;
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

    if (action === 'oauth-start') {
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
        await syncSheetData(admin, messId, spreadsheetId, month, bazar, khawa, true);
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
