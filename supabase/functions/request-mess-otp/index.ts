import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const genericBody = JSON.stringify({ ok: true });
const normalizeEmail = (value: unknown) => String(value ?? '').trim().toLowerCase();

function genericResponse() {
  return new Response(genericBody, {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function sendWithResend(apiKey: string, email: string, code: string) {
  const subject = `${code} is your Mess Manager login code`;
  const text = `Use this one-time code to sign in to Mess Manager: ${code}. Do not share this code. If you did not request it, you can ignore this email.`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px;color:#172033"><h2 style="color:#102653">Mess Manager</h2><p>Use this one-time code to sign in:</p><div style="font-size:34px;font-weight:700;letter-spacing:8px;margin:24px 0;color:#1268e8">${code}</div><p>Do not share this code with anyone.</p><p style="color:#71809a;font-size:13px">If you did not request this code, you can ignore this email.</p></div>`;

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
      text,
      html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Resend failed (${response.status}): ${detail.slice(0, 500)}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { email: rawEmail } = await req.json();
    const email = normalizeEmail(rawEmail);
    if (!email || email.length > 320) return genericResponse();

    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
    if (!resendKey) throw new Error('RESEND_API_KEY is not configured');

    const admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: activeMembers, error: memberError } = await admin
      .from('members')
      .select('id,mess_id,user_id,email')
      .eq('active', true)
      .is('deleted_at', null);
    if (memberError) throw memberError;

    const matches = (activeMembers ?? []).filter(
      (member) => normalizeEmail(member.email) === email,
    );
    if (matches.length === 0) return genericResponse();

    const linkedIds = [
      ...new Set(
        matches
          .map((member) => member.user_id as string | null)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    if (linkedIds.length > 1) return genericResponse();

    let authUserId: string | null = linkedIds[0] ?? null;
    if (authUserId) {
      const { data, error } = await admin.auth.admin.getUserById(authUserId);
      if (error || !data?.user || normalizeEmail(data.user.email) !== email) authUserId = null;
    }

    if (!authUserId) {
      let foundUser: any = null;
      for (let page = 1; page <= 10 && !foundUser; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
        if (error) throw error;
        foundUser = data.users.find((user) => normalizeEmail(user.email) === email) ?? null;
        if (data.users.length < 100) break;
      }

      if (!foundUser) {
        const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
        if (error) throw error;
        foundUser = data.user;
      }
      authUserId = foundUser.id;
    }

    for (const member of matches) {
      if (member.user_id === authUserId) continue;
      if (member.user_id && member.user_id !== authUserId) return genericResponse();

      const { data: existingIdentity, error: identityError } = await admin
        .from('members')
        .select('id')
        .eq('mess_id', member.mess_id)
        .eq('user_id', authUserId)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();
      if (identityError) throw identityError;
      if (existingIdentity && existingIdentity.id !== member.id) continue;

      const { error: linkError } = await admin
        .from('members')
        .update({ user_id: authUserId })
        .eq('id', member.id)
        .is('user_id', null);
      if (linkError) throw linkError;
    }

    const { data: generated, error: generateError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (generateError) throw generateError;

    const code = String(generated?.properties?.email_otp ?? '').trim();
    if (!code) throw new Error('Supabase did not generate an email OTP');
    await sendWithResend(resendKey, email, code);

    return genericResponse();
  } catch (error) {
    console.error('request-mess-otp failed', error);
    return new Response(JSON.stringify({ error: 'Unable to send OTP right now.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
