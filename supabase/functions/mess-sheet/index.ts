// Live Google Sheet sync for the monthly Bazar / Khawa & Taka workbook.
//
// Three actions, following the same shape as chat-push: two require a normal
// Supabase session (the browser calling on the mess's own behalf), the third
// is token-gated instead because it is called by a Google Apps Script pasted
// into the admin's own Sheet, which has no Supabase login at all.
//
//   get-token  (session)  -> creates the mess's sheet_sync_token if missing,
//                            returns it plus the mess name, for the Settings
//                            page to show the Apps Script setup snippet.
//   push       (session)  -> stores the caller's already-computed Bazar and
//                            Khawa & Taka rows as this mess's latest snapshot.
//                            The math stays client-side (calcMonth() /
//                            utilityLedger(), the same logic the Dashboard
//                            and Settlement pages use) — this just stores
//                            the resulting 2D value arrays, so the sheet can
//                            never show numbers that disagree with the app.
//   pull       (token)    -> returns the latest stored snapshot for the mess
//                            that owns the token. No session, no membership
//                            check beyond the token matching.
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

// A sheet cell is a display-ready primitive only — never an object/array/
// function — and rows are capped well above anything a real month produces,
// so a compromised client can't use this as an arbitrary-JSON store.
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

// Same session -> current_mess_id() -> active-membership check chat-push
// uses, so "which mess" is always derived server-side from who is logged
// in, never trusted from client input.
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

async function getOrCreateToken(admin: ReturnType<typeof createAdminClient>, messId: string) {
  const existing = await admin.from('messes').select('id,name,sheet_sync_token').eq('id', messId).single();
  if (existing.error) throw existing.error;
  if (existing.data.sheet_sync_token) return existing.data as { name: string; sheet_sync_token: string };

  // Collisions are astronomically unlikely at 32 random bytes, but retry
  // once against the unique index rather than assume.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, '0')).join('');
    const updated = await admin
      .from('messes')
      .update({ sheet_sync_token: token })
      .eq('id', messId)
      .is('sheet_sync_token', null)
      .select('name,sheet_sync_token')
      .maybeSingle();
    if (updated.error) throw updated.error;
    if (updated.data) return updated.data as { name: string; sheet_sync_token: string };
    const recheck = await admin.from('messes').select('name,sheet_sync_token').eq('id', messId).single();
    if (recheck.error) throw recheck.error;
    if (recheck.data.sheet_sync_token) return recheck.data as { name: string; sheet_sync_token: string };
  }
  throw new Error('Unable to allocate a sheet sync token.');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = cleanText(body?.action, 40);

    if (action === 'pull') {
      const token = cleanText(body?.token, 256);
      if (token.length < 32) return json({ error: 'Invalid token' }, 400);

      const admin = createAdminClient();
      const mess = await admin.from('messes').select('id,name').eq('sheet_sync_token', token).maybeSingle();
      if (mess.error) throw mess.error;
      if (!mess.data) return json({ error: 'Unknown or revoked sheet link' }, 401);

      const snapshot = await admin
        .from('mess_sheet_snapshots')
        .select('month,bazar,khawa,updated_at')
        .eq('mess_id', mess.data.id)
        .maybeSingle();
      if (snapshot.error) throw snapshot.error;

      return json({
        ok: true,
        mess_name: mess.data.name,
        month: snapshot.data?.month || null,
        bazar: snapshot.data?.bazar || [],
        khawa: snapshot.data?.khawa || [],
        updated_at: snapshot.data?.updated_at || null,
      });
    }

    const authenticated = await authenticate(req);
    if ('error' in authenticated) return authenticated.error;
    const { admin, messId } = authenticated;

    if (action === 'get-token') {
      const mess = await getOrCreateToken(admin, messId);
      return json({ ok: true, token: mess.sheet_sync_token, mess_name: mess.name });
    }

    if (action === 'push') {
      const month = cleanText(body?.month, 10);
      if (!DATE_RE.test(month)) return json({ error: 'Invalid month' }, 400);
      const bazar = sanitizeRows(body?.bazar, 'bazar');
      const khawa = sanitizeRows(body?.khawa, 'khawa');
      if (!bazar || !khawa) return json({ error: 'Invalid sheet data' }, 400);

      const upserted = await admin
        .from('mess_sheet_snapshots')
        .upsert({ mess_id: messId, month, bazar, khawa, updated_at: new Date().toISOString() }, { onConflict: 'mess_id' });
      if (upserted.error) throw upserted.error;
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('mess-sheet failed', error);
    return json({ error: 'Unable to process the sheet sync request right now.' }, 500);
  }
});
