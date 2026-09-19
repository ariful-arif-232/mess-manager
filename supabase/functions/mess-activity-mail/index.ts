// Automatic activity alerts: a mess admin's browser calls this right after
// successfully saving a new bazar entry, deposit or utility bill — never on
// an edit — and this function re-reads the authoritative row(s) from the
// database (never trusting client-supplied amounts) and tells whoever
// needs to know, by email and by push notification:
//   bazar-added    -> every active member, the itemised list
//   deposit-added  -> only the member the deposit was recorded for
//   utility-added  -> every member the bill actually covers, each shown
//                     their own share
import { createClient } from 'npm:@supabase/supabase-js@2.55.0';
import { sendNotification } from 'npm:web-push-neo@0.1.2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json' },
});
const esc = (value: unknown) => String(value ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string));
const money = (value: unknown) => `৳${Math.round(Number(value) || 0).toLocaleString('en-US')}`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function shell(eyebrow: string, messName: string, bodyHtml: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><style>:root{color-scheme:light;supported-color-schemes:light;}</style></head><body style="margin:0;padding:0;background:#eef1f7;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
<table role="presentation" width="100%" style="background:#eef1f7;padding:28px 12px;"><tr><td align="center">
<table role="presentation" width="600" style="max-width:100%;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 34px rgba(20,30,55,.10);">
  <tr><td style="background:linear-gradient(135deg,#1c3a86,#2a63d6);padding:26px 30px;">
    <table role="presentation" width="100%"><tr>
      <td style="width:56px;vertical-align:top;"><table role="presentation" width="52" height="52" bgcolor="#ffffff" style="background:#ffffff;border-radius:15px;box-shadow:0 6px 16px rgba(10,20,50,.22);"><tr><td align="center" valign="middle" bgcolor="#ffffff" style="width:52px;height:52px;background:#ffffff;border-radius:15px;"><img src="https://mess-manager.app/icons/icon-512.png" width="34" height="34" alt="Mess Manager" style="display:block;border-radius:9px;margin:0 auto;"></td></tr></table></td>
      <td style="padding-left:16px;color:#fff;">
        <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;opacity:.78;font-weight:700;">${esc(eyebrow)}</div>
        <div style="font-size:19px;font-weight:800;margin-top:2px;">${esc(messName)}</div>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:28px 30px;color:#172033;font-size:14px;line-height:1.65;">${bodyHtml}</td></tr>
  <tr><td style="padding:16px 30px;background:#f7f9fc;border-top:1px solid #eef1f6;color:#98a2b3;font-size:11px;">Sent automatically by Mess Manager &middot; mess-manager.app</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function statRow(label: string, value: string, opts: { strong?: boolean; accent?: string } = {}) {
  const weight = opts.strong ? 800 : 600;
  const size = opts.strong ? 16 : 14;
  const color = opts.accent || '#172033';
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #eef1f6;color:#68778f;font-size:13px;">${esc(label)}</td>
    <td style="padding:10px 0;border-bottom:1px solid #eef1f6;text-align:right;font-weight:${weight};font-size:${size}px;color:${color};">${value}</td>
  </tr>`;
}

async function sendWithResend(apiKey: string, payload: Record<string, unknown>) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Resend failed (${response.status}): ${JSON.stringify(data).slice(0, 500)}`);
  return data;
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
  const messId = String(selectedMess.data || '').trim();
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
  // Every trigger point for these emails (add bazar/deposit/utility bill) is
  // already admin-only in the app, so this mirrors that rather than opening
  // a new way to mass-email the mess.
  if (!memberResult.data || memberResult.data.role !== 'admin') {
    return { error: json({ error: 'Admin access required' }, 403) } as const;
  }

  return { admin, messId } as const;
}

async function activeMembersWithEmail(admin: ReturnType<typeof createAdminClient>, messId: string) {
  const result = await admin
    .from('members')
    .select('id,name,email')
    .eq('mess_id', messId)
    .eq('active', true)
    .is('deleted_at', null);
  if (result.error) throw result.error;
  return (result.data || []).filter((member) => member.email) as { id: string; name: string; email: string }[];
}

async function sendToMembers(
  resendKey: string,
  members: { email: string }[],
  subject: string,
  html: string,
  text: string,
) {
  await Promise.all(members.map((member) => sendWithResend(resendKey, {
    from: 'Mess Manager <notice@mess-manager.app>',
    to: [member.email],
    reply_to: 'support@mess-manager.app',
    subject,
    html,
    text,
  }).catch((error) => console.warn('mess-activity-mail: send failed', error))));
}

/* ------------------------------------------------------------ phone alert
   An email alone does not reliably raise a banner on a phone — whether a
   mail app pops one is the mail app's own call, and Gmail on Android stays
   silent for anything it files outside Primary. So the same news also goes
   out as a web push, over the subscriptions and VAPID keys the chat
   notifications already use, which is the one alert this app fully
   controls. Keys are only ever read here: chat-push creates them, and
   making a second pair would invalidate every existing subscription. */
type PushRow = { id: string; endpoint: string; p256dh: string; auth: string };

async function activeMemberIds(admin: ReturnType<typeof createAdminClient>, messId: string) {
  const result = await admin
    .from('members')
    .select('id')
    .eq('mess_id', messId)
    .eq('active', true)
    .is('deleted_at', null);
  if (result.error) throw result.error;
  return (result.data || []).map((row) => String(row.id));
}

async function pushToMembers(
  admin: ReturnType<typeof createAdminClient>,
  messId: string,
  memberIds: string[],
  payload: { title: string; body: string; tag: string },
) {
  if (!memberIds.length) return;

  const config = await admin
    .from('push_vapid_config')
    .select('public_key,private_key,subject')
    .eq('id', true)
    .maybeSingle();
  if (config.error) throw config.error;
  if (!config.data) return;
  const vapid = config.data as { public_key: string; private_key: string; subject: string };

  const subscriptions = await admin
    .from('push_subscriptions')
    .select('id,endpoint,p256dh,auth')
    .eq('mess_id', messId)
    .in('member_id', memberIds);
  if (subscriptions.error) throw subscriptions.error;
  const rows = (subscriptions.data || []) as PushRow[];
  if (!rows.length) return;

  const body = JSON.stringify({
    type: 'mess-activity',
    title: payload.title,
    body: payload.body,
    tag: payload.tag,
    mess_id: messId,
    created_at: new Date().toISOString(),
    url: './',
  });

  const stale: string[] = [];
  await Promise.all(rows.map(async (row) => {
    try {
      await sendNotification({
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      }, body, {
        vapidDetails: {
          subject: vapid.subject,
          publicKey: vapid.public_key,
          privateKey: vapid.private_key,
        },
        TTL: 86_400,
        urgency: 'high',
        topic: payload.tag.replace(/[^a-zA-Z0-9]/g, '').slice(0, 27),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      const status = Number((error as { statusCode?: number })?.statusCode || 0);
      if (status === 404 || status === 410) stale.push(row.id);
      console.warn('mess-activity-mail: push delivery failed', status || 'unknown');
    }
  }));

  if (stale.length) {
    const cleanup = await admin.from('push_subscriptions').delete().in('id', stale);
    if (cleanup.error) console.warn('mess-activity-mail: stale subscription cleanup failed', cleanup.error.code || 'unknown');
  }
}

// Never at the cost of the email that already went out.
async function notify(
  admin: ReturnType<typeof createAdminClient>,
  messId: string,
  memberIds: string[],
  payload: { title: string; body: string; tag: string },
) {
  try {
    await pushToMembers(admin, messId, memberIds, payload);
  } catch (error) {
    console.warn('mess-activity-mail: push notification failed', error);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
    if (!resendKey) return json({ error: 'RESEND_API_KEY is not configured.' }, 503);

    const authenticated = await authenticate(req);
    if ('error' in authenticated) return authenticated.error;
    const { admin, messId } = authenticated;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '');

    const mess = await admin.from('messes').select('name').eq('id', messId).single();
    if (mess.error) throw mess.error;
    const messName = mess.data.name as string;

    if (action === 'bazar-added') {
      const entryId = String(body?.entry_id || '');
      if (!UUID_RE.test(entryId)) return json({ error: 'Invalid entry id' }, 400);

      const entry = await admin
        .from('bazar_entries')
        .select('id,entry_date,buyer_member_id')
        .eq('id', entryId)
        .eq('mess_id', messId)
        .single();
      if (entry.error) throw entry.error;

      const buyer = await admin.from('members').select('name').eq('id', entry.data.buyer_member_id).single();
      const items = await admin
        .from('bazar_items')
        .select('item_name,quantity,unit,entered_total,group_items')
        .eq('bazar_entry_id', entryId);
      if (items.error) throw items.error;

      const rows = items.data || [];
      const total = rows.reduce((sum, row) => sum + Number(row.entered_total || 0), 0);
      const itemRowsHtml = rows.map((row) => {
        const groupItems = Array.isArray(row.group_items) ? row.group_items as string[] : null;
        const label = groupItems?.length ? groupItems.join(', ') : row.item_name;
        const qty = row.unit === 'group' ? '' : `${row.quantity} ${row.unit}`;
        return `<tr>
          <td style="padding:9px 0;border-bottom:1px solid #eef1f6;font-size:13px;">${esc(label)}${qty ? `<div style="color:#94a1b6;font-size:11px;margin-top:2px;">${esc(qty)}</div>` : ''}</td>
          <td style="padding:9px 0;border-bottom:1px solid #eef1f6;text-align:right;font-weight:700;font-size:13px;white-space:nowrap;">${money(row.entered_total)}</td>
        </tr>`;
      }).join('');

      const bodyHtml = `<p style="margin:0 0 4px;color:#68778f;font-size:13px;">${esc(entry.data.entry_date)}</p>
        <p style="margin:0 0 18px;font-size:15px;">Bought by <b style="color:#172033;">${esc(buyer.data?.name || '—')}</b> — here's what was picked up:</p>
        <table role="presentation" width="100%" style="border-collapse:collapse;">
          ${itemRowsHtml}
          <tr><td style="padding:12px 0 0;font-weight:800;font-size:15px;">Total</td><td style="padding:12px 0 0;text-align:right;font-weight:800;font-size:17px;color:#1c3a86;">${money(total)}</td></tr>
        </table>`;

      const members = await activeMembersWithEmail(admin, messId);
      const subject = `New Bazar Entry — ${money(total)}`;
      const html = shell('New Bazar Entry', messName, bodyHtml);
      const text = `New bazar entry (${entry.data.entry_date}) by ${buyer.data?.name || ''} — total ${money(total)}`;
      await sendToMembers(resendKey, members, subject, html, text);

      const itemNames = rows.map((row) => {
        const groupItems = Array.isArray(row.group_items) ? row.group_items as string[] : null;
        return groupItems?.length ? groupItems.join(', ') : String(row.item_name || '');
      }).filter(Boolean).join(', ');
      await notify(admin, messId, await activeMemberIds(admin, messId), {
        title: `New bazar · ${money(total)}`,
        body: `${buyer.data?.name || 'Someone'} — ${itemNames.slice(0, 160) || 'bazar added'}`,
        tag: `bazar-${entryId}`,
      });
      return json({ ok: true, sent: members.length });
    }

    if (action === 'deposit-added') {
      const depositId = String(body?.deposit_id || '');
      if (!UUID_RE.test(depositId)) return json({ error: 'Invalid deposit id' }, 400);

      const deposit = await admin
        .from('deposits')
        .select('id,member_id,amount,purpose,deposit_date')
        .eq('id', depositId)
        .eq('mess_id', messId)
        .single();
      if (deposit.error) throw deposit.error;

      const member = await admin.from('members').select('name,email').eq('id', deposit.data.member_id).single();
      if (member.error) throw member.error;

      const depositPush = notify(admin, messId, [String(deposit.data.member_id)], {
        title: `Deposit received · ${money(deposit.data.amount)}`,
        body: `Recorded for you · ${deposit.data.purpose || 'Bazar'}`,
        tag: `deposit-${depositId}`,
      });

      if (!member.data?.email) {
        await depositPush;
        return json({ ok: true, sent: 0 });
      }

      const bodyHtml = `<p style="margin:0 0 4px;color:#68778f;font-size:13px;">${esc(deposit.data.deposit_date)}</p>
        <p style="margin:0 0 18px;font-size:15px;">Hi ${esc(member.data.name)}, a deposit has been recorded for you.</p>
        <table role="presentation" width="100%" style="border-collapse:collapse;">
          ${statRow('Purpose', esc(deposit.data.purpose || 'Bazar'))}
          ${statRow('Amount', money(deposit.data.amount), { strong: true, accent: '#0f8f5f' })}
        </table>`;

      const subject = `Deposit Received — ${money(deposit.data.amount)}`;
      const html = shell('Deposit Received', messName, bodyHtml);
      const text = `Deposit of ${money(deposit.data.amount)} recorded for ${member.data.name} (${deposit.data.purpose || 'Bazar'})`;
      await sendToMembers(resendKey, [{ email: member.data.email }], subject, html, text);
      await depositPush;
      return json({ ok: true, sent: 1 });
    }

    if (action === 'utility-added') {
      const billId = String(body?.utility_bill_id || '');
      if (!UUID_RE.test(billId)) return json({ error: 'Invalid bill id' }, 400);

      const bill = await admin
        .from('utility_bills')
        .select('id,bill_type,bill_date,amount,bill_mode')
        .eq('id', billId)
        .eq('mess_id', messId)
        .single();
      if (bill.error) throw bill.error;

      const links = await admin.from('utility_bill_members').select('member_id').eq('utility_bill_id', billId);
      if (links.error) throw links.error;
      const memberIds = (links.data || []).map((row) => row.member_id as string);
      if (!memberIds.length) return json({ ok: true, sent: 0 });

      const membersResult = await admin
        .from('members')
        .select('id,name,email')
        .in('id', memberIds)
        .eq('active', true)
        .is('deleted_at', null);
      if (membersResult.error) throw membersResult.error;

      // Matches the Sheet export's own rule: a "fixed" bill charges each
      // listed member the full amount, a "shared" one splits the total
      // across them.
      const fixed = bill.data.bill_mode === 'fixed';
      const perHead = fixed ? Number(bill.data.amount || 0) : Number(bill.data.amount || 0) / memberIds.length;
      const total = fixed ? perHead * memberIds.length : Number(bill.data.amount || 0);
      const recipients = (membersResult.data || []).filter((member) => member.email);
      const subject = `New ${bill.data.bill_type} Bill — ${money(total)}`;

      await Promise.all(recipients.map((member) => {
        const bodyHtml = `<p style="margin:0 0 4px;color:#68778f;font-size:13px;">${esc(bill.data.bill_date)}</p>
          <p style="margin:0 0 18px;font-size:15px;">A new <b style="color:#172033;">${esc(bill.data.bill_type)}</b> bill has been added.</p>
          <table role="presentation" width="100%" style="border-collapse:collapse;">
            ${statRow('Total bill', money(total))}
            ${statRow('Shared by', `${memberIds.length} member${memberIds.length === 1 ? '' : 's'}`)}
            ${statRow('Your share', money(perHead), { strong: true, accent: '#1c3a86' })}
          </table>`;
        const html = shell('Utility Bill', messName, bodyHtml);
        const text = `New ${bill.data.bill_type} bill, total ${money(total)}, your share ${money(perHead)}`;
        return sendWithResend(resendKey, {
          from: 'Mess Manager <notice@mess-manager.app>',
          to: [member.email],
          reply_to: 'support@mess-manager.app',
          subject,
          html,
          text,
        }).catch((error) => console.warn('mess-activity-mail: utility send failed', error));
      }));

      await notify(admin, messId, memberIds, {
        title: `New ${bill.data.bill_type} bill · ${money(total)}`,
        body: `Your share ${money(perHead)} · shared by ${memberIds.length} member${memberIds.length === 1 ? '' : 's'}`,
        tag: `utility-${billId}`,
      });

      return json({ ok: true, sent: recipients.length });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('mess-activity-mail failed', error);
    return json({ error: 'Unable to send notification email right now.' }, 500);
  }
});
