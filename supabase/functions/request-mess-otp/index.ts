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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

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
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

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

    // Keep the response generic so this endpoint cannot be used to enumerate
    // member emails. Multiple matches are valid because one verified email may
    // belong to several Mess workspaces.
    if (matches.length === 0) return genericResponse();

    const linkedIds = [
      ...new Set(
        matches
          .map((member) => member.user_id as string | null)
          .filter((value): value is string => Boolean(value)),
      ),
    ];

    // Two different auth identities already attached to the same email are an
    // unsafe data conflict; do not guess which identity owns the address.
    if (linkedIds.length > 1) return genericResponse();

    let authUserId: string | null = linkedIds[0] ?? null;

    if (authUserId) {
      const { data, error } = await admin.auth.admin.getUserById(authUserId);
      if (
        error ||
        !data?.user ||
        normalizeEmail(data.user.email) !== email
      ) {
        authUserId = null;
      }
    }

    if (!authUserId) {
      let foundUser: any = null;
      for (let page = 1; page <= 10 && !foundUser; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({
          page,
          perPage: 100,
        });
        if (error) throw error;
        foundUser =
          data.users.find((user) => normalizeEmail(user.email) === email) ??
          null;
        if (data.users.length < 100) break;
      }

      if (!foundUser) {
        const { data, error } = await admin.auth.admin.createUser({
          email,
          email_confirm: true,
        });
        if (error) throw error;
        foundUser = data.user;
      }

      authUserId = foundUser.id;
    }

    for (const member of matches) {
      if (member.user_id === authUserId) continue;

      // Never overwrite a membership that is already owned by another auth
      // identity. Treat that as an ambiguous/conflicting account instead.
      if (member.user_id && member.user_id !== authUserId) {
        return genericResponse();
      }

      // The same identity may only have one membership inside a given mess.
      // If that identity is already linked in this workspace, leave any
      // duplicate roster row unclaimed rather than violating the uniqueness
      // rule or merging data implicitly.
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

    const publicClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: otpError } = await publicClient.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });

    if (otpError) throw otpError;
    return genericResponse();
  } catch (error) {
    console.error('request-mess-otp failed', error);
    return new Response(JSON.stringify({ error: 'Unable to send OTP right now.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
