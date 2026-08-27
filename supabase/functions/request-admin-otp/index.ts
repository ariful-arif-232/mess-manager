import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2, '0')).join('');
async function hash(value: string) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(value))); }
function otp8() { const a = new Uint32Array(1); crypto.getRandomValues(a); return String(a[0] % 100000000).padStart(8, '0'); }

async function sendWithResend(apiKey: string, email: string, code: string, reset: boolean) {
  const subject = reset
    ? `${code} is your Mess Manager reset verification code`
    : `${code} is your Mess Manager verification code`;
  const intro = reset
    ? 'Use this 8-digit code to confirm the workspace reset. Do not share this code.'
    : 'Use this 8-digit code to create your admin account:';
  const footer = reset
    ? 'If you did not request a workspace reset, ignore this email. Your data has not been changed.'
    : 'If you did not request this code, you can ignore this email.';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Mess Manager <no-reply@mess-manager.app>',
      to: [email],
      subject,
      text: `${intro} ${code}. It expires in 10 minutes. ${footer}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px;color:#172033"><h2 style="color:#102653">Mess Manager</h2><p>${intro}</p><div style="font-size:34px;font-weight:700;letter-spacing:8px;margin:24px 0;color:#1268e8">${code}</div><p>This code expires in 10 minutes.</p><p style="color:#71809a;font-size:13px">${footer}</p></div>`,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Resend failed (${response.status}): ${detail.slice(0, 500)}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? '').trim().toLowerCase();
    const purpose = String(body?.purpose ?? 'signup').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
      return json({ error: 'Valid email required' }, 400);
    }

    const url = Deno.env.get('SUPABASE_URL')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
    const gmailUser = Deno.env.get('GMAIL_USER')?.trim();
    const gmailPassword = Deno.env.get('GMAIL_APP_PASSWORD')?.replace(/\s+/g, '');
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

    if (purpose === 'reset') {
      const authHeader = req.headers.get('Authorization') || '';
      if (!authHeader.startsWith('Bearer ')) return json({ error: 'Admin sign-in required' }, 401);
      const caller = createClient(url, anon, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: { user }, error: userError } = await caller.auth.getUser();
      if (userError || !user || String(user.email || '').toLowerCase() !== email) {
        return json({ error: 'Verified admin account required' }, 403);
      }
      const membership = await admin.from('members')
        .select('id')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .eq('active', true)
        .is('deleted_at', null)
        .maybeSingle();
      if (membership.error) throw membership.error;
      if (!membership.data) return json({ error: 'Verified admin account required' }, 403);
    }

    const { data: old } = await admin.from('admin_signup_otps').select('requested_at').eq('email', email).maybeSingle();
    if (old?.requested_at && Date.now() - new Date(old.requested_at).getTime() < 60000) {
      return json({ error: 'Please wait before requesting another OTP.' }, 429);
    }

    const code = otp8();
    const { error: storeError } = await admin.from('admin_signup_otps').upsert({
      email,
      otp_hash: await hash(code),
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      attempts: 0,
      requested_at: new Date().toISOString(),
    });
    if (storeError) throw storeError;

    const reset = purpose === 'reset';

    if (resendKey) {
      await sendWithResend(resendKey, email, code, reset);
    } else if (gmailUser && gmailPassword) {
      const nodemailer = (await import('npm:nodemailer@6.9.15')).default;
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com', port: 465, secure: true,
        auth: { user: gmailUser, pass: gmailPassword },
        connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
      });
      const subject = reset
        ? `${code} is your Mess Manager reset verification code`
        : `${code} is your Mess Manager verification code`;
      const intro = reset
        ? 'Use this 8-digit code to confirm the workspace reset. Do not share this code.'
        : 'Use this 8-digit code to create your admin account:';
      const footer = reset
        ? 'If you did not request a workspace reset, ignore this email. Your data has not been changed.'
        : 'If you did not request this code, you can ignore this email.';
      await transporter.sendMail({
        from: `Mess Manager <${gmailUser}>`,
        to: email,
        subject,
        text: `${intro} ${code}. It expires in 10 minutes. ${footer}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px;color:#172033"><h2 style="color:#102653">Mess Manager</h2><p>${intro}</p><div style="font-size:34px;font-weight:700;letter-spacing:8px;margin:24px 0;color:#1268e8">${code}</div><p>This code expires in 10 minutes.</p><p style="color:#71809a;font-size:13px">${footer}</p></div>`,
      });
    } else {
      throw new Error('RESEND_API_KEY is not configured');
    }

    return json({ ok: true });
  } catch (error) {
    console.error('request-admin-otp failed', error);
    return json({ error: 'Unable to send admin OTP right now.' }, 500);
  }
});
