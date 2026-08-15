import { createClient } from 'npm:@supabase/supabase-js@2.55.0';
import webpush from 'npm:web-push@3.6.7';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json' },
});

const cleanText = (value: unknown, max = 2000) => String(value ?? '').trim().slice(0, max);

type Member = {
  id: string;
  mess_id: string;
  name: string;
};

type PushRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

async function ensureVapid(admin: ReturnType<typeof createClient>) {
  const existing = await admin
    .from('push_vapid_config')
    .select('public_key,private_key,subject')
    .eq('id', true)
    .maybeSingle();

  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  const keys = webpush.generateVAPIDKeys();
  const config = {
    id: true,
    public_key: keys.publicKey,
    private_key: keys.privateKey,
    subject: 'mailto:mess-manager@localhost',
    updated_at: new Date().toISOString(),
  };

  const created = await admin
    .from('push_vapid_config')
    .upsert(config, { onConflict: 'id' })
    .select('public_key,private_key,subject')
    .single();

  if (created.error) throw created.error;
  return created.data;
}

async function authenticate(req: Request) {
  const auth = req.headers.get('Authorization') || '';
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const caller = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: userError } = await caller.auth.getUser();
  if (userError || !user) return { error: json({ error: 'Unauthorized' }, 401) } as const;

  const memberResult = await admin
    .from('members')
    .select('id,mess_id,name')
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle();

  if (memberResult.error || !memberResult.data) {
    return { error: json({ error: 'Active mess membership required' }, 403) } as const;
  }

  return { caller, admin, member: memberResult.data as Member } as const;
}

async function sendPushes(
  admin: ReturnType<typeof createClient>,
  sender: Member,
  message: { id: string; body: string; created_at: string },
) {
  const subscriptions = await admin
    .from('push_subscriptions')
    .select('id,endpoint,p256dh,auth')
    .eq('mess_id', sender.mess_id)
    .neq('member_id', sender.id);

  if (subscriptions.error) throw subscriptions.error;
  if (!subscriptions.data?.length) return { delivered: 0, failed: 0, removed: 0 };

  const vapid = await ensureVapid(admin);
  webpush.setVapidDetails(vapid.subject, vapid.public_key, vapid.private_key);

  const bodyPreview = message.body.length > 180 ? `${message.body.slice(0, 177)}...` : message.body;
  const payload = JSON.stringify({
    type: 'chat-message',
    message_id: message.id,
    mess_id: sender.mess_id,
    sender_name: sender.name,
    body: bodyPreview,
    created_at: message.created_at,
    url: './?open=chat',
  });

  let delivered = 0;
  let failed = 0;
  let removed = 0;
  const staleIds: string[] = [];

  await Promise.all((subscriptions.data as PushRow[]).map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, payload, { TTL: 86400 });
      delivered += 1;
    } catch (error) {
      failed += 1;
      const status = Number((error as { statusCode?: number })?.statusCode || 0);
      if (status === 404 || status === 410) staleIds.push(subscription.id);
      console.warn('chat push delivery failed', status || 'unknown');
    }
  }));

  if (staleIds.length) {
    const cleanup = await admin.from('push_subscriptions').delete().in('id', staleIds);
    if (!cleanup.error) removed = staleIds.length;
  }

  return { delivered, failed, removed };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authenticated = await authenticate(req);
    if ('error' in authenticated) return authenticated.error;
    const { admin, member } = authenticated;

    const body = await req.json().catch(() => ({}));
    const action = cleanText(body?.action, 40) || 'send-message';

    if (action === 'public-key') {
      const vapid = await ensureVapid(admin);
      return json({ ok: true, public_key: vapid.public_key });
    }

    if (action !== 'send-message') return json({ error: 'Unknown action' }, 400);

    const messageBody = cleanText(body?.message, 2000);
    if (!messageBody) return json({ error: 'Message required' }, 400);

    const inserted = await admin
      .from('mess_messages')
      .insert({
        mess_id: member.mess_id,
        sender_member_id: member.id,
        body: messageBody,
      })
      .select('id,body,created_at')
      .single();

    if (inserted.error) throw inserted.error;

    let push = { delivered: 0, failed: 0, removed: 0 };
    try {
      push = await sendPushes(admin, member, inserted.data);
    } catch (pushError) {
      console.error('chat push fanout failed', pushError);
      push = { delivered: 0, failed: 1, removed: 0 };
    }

    return json({ ok: true, message: inserted.data, push });
  } catch (error) {
    console.error('chat-push failed', error);
    return json({ error: 'Unable to process chat message right now.' }, 500);
  }
});
