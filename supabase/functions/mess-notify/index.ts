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
    const gmailUser = Deno.env.get('GMAIL_USER')?.trim();
    const gmailPassword = Deno.env.get('GMAIL_APP_PASSWORD')?.replace(/\s+/g, '');

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

    const html = body.html
      ? String(body.html).slice(0, 200000)
      : `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:28px;color:#172033"><h2>${clean(subject)}</h2><p>Hi ${clean(member.name)},</p><div style="white-space:pre-wrap;line-height:1.7;background:#f5f7fb;padding:18px;border-radius:14px">${clean(message)}</div><p style="color:#64748b">- Mess Manager</p></div>`;

    const attachments: Array<Record<string, string>> = [];
    if (body.pdf_base64) {
      const raw = String(body.pdf_base64);
      if (raw.length > 9500000) return json({ error: 'PDF attachment is too large.' }, 413);
      attachments.push({
        filename: String(body.pdf_filename || 'monthly-statement.pdf').replace(/[^a-zA-Z0-9._-]/g, '_'),
        content: raw,
      });
    }

    if (resendKey) {
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
    }

    if (gmailUser && gmailPassword) {
      const nodemailer = (await import('npm:nodemailer@6.9.15')).default;
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com', port: 465, secure: true,
        auth: { user: gmailUser, pass: gmailPassword },
        connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
      });
      const info = await transporter.sendMail({
        from: `Mess Manager <${gmailUser}>`,
        to: member.email,
        subject,
        text: message,
        html,
        attachments: attachments.map((a) => ({
          filename: a.filename,
          content: a.content,
          encoding: 'base64',
          contentType: 'application/pdf',
        })),
      });
      return json({ ok: true, message_id: info.messageId });
    }

    return json({ error: 'RESEND_API_KEY is not configured.' }, 503);
  } catch (error) {
    console.error('mess-notify failed', error);
    return json({ error: 'Unable to send email right now.' }, 500);
  }
});
