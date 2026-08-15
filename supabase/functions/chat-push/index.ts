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

const cleanText = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);

type Member = {
  id: string;
  mess_id: string;
  name: string;
};

type ChatMessage = {
  id: string;
  mess_id: string;
  sender_member_id: string;
  body: string;
  created_at: string;
};

type PushRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function createAdminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function authenticate(req: Request) {
  const authHeader = req.headers.get('Authorization') || '';
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const caller = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createAdminClient();

  const { data: { user }, error: userError } = await caller.auth.getUser();
  if (userError || !user) return { error: json({ error: 'Unauthorized' }, 401) } as const;

  const memberResult = await admin
    .from('members')
    .select('id,mess_id,name')
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle();

  if (memberResult.error) throw memberResult.error;
  if (!memberResult.data) return { error: json({ error: 'Active mess membership required' }, 403) } as const;

  return { admin, member: memberResult.data as Member } as const;
}

async function ensureVapid(admin: ReturnType<typeof createClient>) {
  const readConfig = () => admin
    .from('push_vapid_config')
    .select('public_key,private_key,subject')
    .eq('id', true)
    .maybeSingle();

  const existing = await readConfig();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  const keys = webpush.generateVAPIDKeys();
  const created = await admin
    .from('push_vapid_config')
    .insert({
      id: true,
      public_key: keys.publicKey,
      private_key: keys.privateKey,
      subject: 'https://ariful-arif-232.github.io/mess-manager/',
      updated_at: new Date().toISOString(),
    })
    .select('public_key,private_key,subject')
    .single();

  if (!created.error) return created.data;

  // Two devices can request the public key at the same time on first use.
  // The primary key allows one winner; every loser reuses the winner's pair.
  if (created.error.code === '23505') {
    const winner = await readConfig();
    if (winner.error) throw winner.error;
    if (winner.data) return winner.data;
  }

  throw created.error;
}

async function loadOwnedFreshMessage(
  admin: ReturnType<typeof createClient>,
  member: Member,
  messageId: string,
) {
  const result = await admin
    .from('mess_messages')
    .select('id,mess_id,sender_member_id,body,created_at')
    .eq('id', messageId)
    .eq('mess_id', member.mess_id)
    .maybeSingle();

  if (result.error) throw result.error;
  if (!result.data) return { error: json({ error: 'Message not found' }, 404) } as const;

  const message = result.data as ChatMessage;
  if (message.sender_member_id !== member.id) {
    return { error: json({ error: 'Only the sender can dispatch this message' }, 403) } as const;
  }

  const ageMs = Date.now() - Date.parse(message.created_at);
  if (!Number.isFinite(ageMs) || ageMs < -60_000 || ageMs > 10 * 60_000) {
    return { error: json({ error: 'Message is too old to dispatch' }, 409) } as const;
  }

  return { message } as const;
}

async function claimDispatch(admin: ReturnType<typeof createClient>, messageId: string) {
  const claim = await admin.from('chat_push_dispatches').insert({ message_id: messageId });
  if (!claim.error) return true;
  if (claim.error.code === '23505') return false;
  throw claim.error;
}

async function releaseDispatch(admin: ReturnType<typeof createClient>, messageId: string) {
  await admin.from('chat_push_dispatches').delete().eq('message_id', messageId);
}

async function sendPushes(
  admin: ReturnType<typeof createClient>,
  sender: Member,
  message: ChatMessage,
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

  const body = cleanText(message.body, 180) || 'New chat message';
  const payload = JSON.stringify({
    type: 'chat-message',
    message_id: message.id,
    mess_id: sender.mess_id,
    sender_name: cleanText(sender.name, 120) || 'Mess Chat',
    body,
    created_at: message.created_at,
    url: './?open=chat',
  });

  let delivered = 0;
  let failed = 0;
  const staleIds: string[] = [];

  await Promise.all((subscriptions.data as PushRow[]).map(async subscription => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, payload, { TTL: 86400, urgency: 'normal' });
      delivered += 1;
    } catch (error) {
      failed += 1;
      const status = Number((error as { statusCode?: number })?.statusCode || 0);
      if (status === 404 || status === 410) staleIds.push(subscription.id);
      console.warn('chat push delivery failed', status || 'unknown');
    }
  }));

  let removed = 0;
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
    const action = cleanText(body?.action, 40);

    if (action === 'public-key') {
      const vapid = await ensureVapid(admin);
      return json({ ok: true, public_key: vapid.public_key });
    }

    if (action !== 'dispatch-message') return json({ error: 'Unknown action' }, 400);

    const messageId = cleanText(body?.message_id, 80);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(messageId)) {
      return json({ error: 'Invalid message id' }, 400);
    }

    const loaded = await loadOwnedFreshMessage(admin, member, messageId);
    if ('error' in loaded) return loaded.error;

    const claimed = await claimDispatch(admin, messageId);
    if (!claimed) return json({ ok: true, already_dispatched: true, push: { delivered: 0, failed: 0, removed: 0 } });

    try {
      const push = await sendPushes(admin, member, loaded.message);
      return json({ ok: true, already_dispatched: false, push });
    } catch (pushError) {
      await releaseDispatch(admin, messageId);
      throw pushError;
    }
  } catch (error) {
    console.error('chat-push failed', error);
    return json({ error: 'Unable to process chat notification right now.' }, 500);
  }
});
