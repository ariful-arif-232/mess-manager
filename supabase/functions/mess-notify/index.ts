import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json' },
});
const clean = (v: unknown) => String(v ?? '').replace(/[<>&]/g, '');

// Same chrome as mess-activity-mail's automatic emails, so a manual notice
// and an automatic one look like they came from the same product. The
// eyebrow (not the raw subject) identifies what kind of email this is —
// repeating the literal subject line as a heading inside the body is what
// made every notice look like it said the same thing twice.
function shell(eyebrow: string, messName: string, bodyHtml: string) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#eef1f7;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
<table role="presentation" width="100%" style="background:#eef1f7;padding:28px 12px;"><tr><td align="center">
<table role="presentation" width="600" style="max-width:100%;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 34px rgba(20,30,55,.10);">
  <tr><td style="background:linear-gradient(135deg,#1c3a86,#2a63d6);padding:26px 30px;">
    <table role="presentation" width="100%"><tr>
      <td style="width:56px;vertical-align:top;"><table role="presentation" width="52" height="52" style="background:#fff8ec;border-radius:15px;box-shadow:0 6px 16px rgba(10,20,50,.22);"><tr><td align="center" valign="middle" style="width:52px;height:52px;"><img src="https://mess-manager.app/icons/icon-512.png" width="34" height="34" alt="Mess Manager" style="display:block;border-radius:9px;"></td></tr></table></td>
      <td style="padding-left:16px;color:#fff;">
        <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;opacity:.78;font-weight:700;">${clean(eyebrow)}</div>
        <div style="font-size:19px;font-weight:800;margin-top:2px;">${clean(messName)}</div>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:28px 30px;color:#172033;font-size:14px;line-height:1.65;">${bodyHtml}</td></tr>
  <tr><td style="padding:16px 30px;background:#f7f9fc;border-top:1px solid #eef1f6;color:#98a2b3;font-size:11px;">Sent automatically by Mess Manager &middot; mess-manager.app</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function eyebrowFor(type: string) {
  if (type === 'statement') return 'Monthly Statement';
  if (type === 'notice') return 'Payment Reminder';
  if (type === 'schedule') return 'Bazar Schedule';
  return 'Notice';
}

async function sendWithResend(apiKey: string, payload: Record<string, unknown>) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Resend failed (${response.status}): ${JSON.stringify(data).slice(0, 700)}`);
  }
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const auth = req.headers.get('Authorization') || '';
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
    if (!resendKey) return json({ error: 'RESEND_API_KEY is not configured.' }, 503);

    const caller = createClient(url, anon, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user }, error: userErr } = await caller.auth.getUser();
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: me, error: meErr } = await admin.from('members')
      .select('id,mess_id,role,name')
      .eq('user_id', user.id)
      .eq('active', true)
      .single();
    if (meErr || !me || me.role !== 'admin') return json({ error: 'Admin access required' }, 403);

    const body = await req.json();
    const memberId = String(body.member_id || '');
    const type = String(body.type || 'notice');
    const subject = String(body.subject || 'Mess Manager notice').trim().slice(0, 160);
    const message = String(body.message || '').trim().slice(0, 5000);
    if (!memberId || !message) return json({ error: 'Member and message required' }, 400);

    const { data: member, error: memberErr } = await admin.from('members')
      .select('id,name,email')
      .eq('id', memberId)
      .eq('mess_id', me.mess_id)
      .eq('active', true)
      .single();
    if (memberErr || !member?.email) return json({ error: 'Member email not available' }, 400);

    const { data: messRow } = await admin.from('messes').select('name').eq('id', me.mess_id).maybeSingle();
    const messName = messRow?.name || 'Mess Manager';

    const html = body.html
      ? String(body.html).slice(0, 200000)
      : shell(eyebrowFor(type), messName, `<p style="margin:0 0 16px;">Hi ${clean(member.name)},</p><div style="white-space:pre-wrap;line-height:1.75;background:#f6f8fc;padding:18px 20px;border-radius:14px;font-size:14px;">${clean(message)}</div>`);

    const attachments: Array<Record<string, string>> = [];
    if (body.pdf_base64) {
      const raw = String(body.pdf_base64);
      if (raw.length > 9500000) return json({ error: 'PDF attachment is too large.' }, 413);
      attachments.push({
        filename: String(body.pdf_filename || 'monthly-statement.pdf').replace(/[^a-zA-Z0-9._-]/g, '_'),
        content: raw,
      });
    }

    const data = await sendWithResend(resendKey, {
      from: 'Mess Manager <notice@mess-manager.app>',
      to: [member.email],
      reply_to: 'support@mess-manager.app',
      subject,
      text: message,
      html,
      ...(attachments.length ? { attachments } : {}),
    });
    return json({ ok: true, message_id: data?.id ?? null });
  } catch (error) {
    console.error('mess-notify failed', error);
    return json({ error: 'Unable to send email right now.' }, 500);
  }
});
