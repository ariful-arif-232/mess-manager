import { createClient } from 'npm:@supabase/supabase-js@2.55.0';
import { generateVAPIDKeys, sendNotification } from 'npm:web-push-neo@0.1.2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...cors,
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  },
});

const cleanText = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

type VapidConfig = {
  public_key: string;
  private_key: string;
  subject: string;
};

function createAdminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) throw new Error('Supabase server credentials are unavailable.');

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function authenticate(req: Request) {
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { error: json({ error: 'Unauthorized' }, 401) } as const;
  }

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anon) throw new Error('Supabase client credentials are unavailable.');

  const caller = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createAdminClient();

  const { data: { user }, error: userError } = await caller.auth.getUser();
  if (userError || !user) {
    return { error: json({ error: 'Unauthorized' }, 401) } as const;
  }

  const selectedMess = await caller.rpc('current_mess_id');
  if (selectedMess.error) throw selectedMess.error;
  const messId = cleanText(selectedMess.data, 80);
  if (!UUID_RE.test(messId)) {
    return { error: json({ error: 'Select an active mess workspace first' }, 409) } as const;
  }

  const memberResult = await admin
    .from('members')
    .select('id,mess_id,name')
    .eq('user_id', user.id)
    .eq('mess_id', messId)
    .eq('active', true)
    .is('deleted_at', null)
    .maybeSingle();

  if (memberResult.error) throw memberResult.error;
  if (!memberResult.data) {
    return { error: json({ error: 'Active mess membership required' }, 403) } as const;
  }

  return { admin, member: memberResult.data as Member } as const;
}

async function ensureVapid(admin: ReturnType<typeof createAdminClient>): Promise<VapidConfig> {
  const readConfig = () => admin
    .from('push_vapid_config')
    .select('public_key,private_key,subject')
    .eq('id', true)
    .maybeSingle();

  const existing = await readConfig();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as VapidConfig;

  const keys = await generateVAPIDKeys();
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

  if (!created.error && created.data) return created.data as VapidConfig;

  if (created.error?.code === '23505') {
    const winner = await readConfig();
    if (winner.error) throw winner.error;
    if (winner.data) return winner.data as VapidConfig;
  }

  throw created.error || new Error('Unable to initialize VAPID configuration.');
}

async function loadOwnedFreshMessage(
  admin: ReturnType<typeof createAdminClient>,
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

  const createdAt = Date.parse(message.created_at);
  const ageMs = Date.now() - createdAt;
  if (!Number.isFinite(createdAt) || ageMs < -60_000 || ageMs > 10 * 60_000) {
    return { error: json({ error: 'Message is too old to dispatch' }, 409) } as const;
  }

  return { message } as const;
}

async function loadServerMessage(
  admin: ReturnType<typeof createAdminClient>,
  messageId: string,
) {
  const messageResult = await admin
    .from('mess_messages')
    .select('id,mess_id,sender_member_id,body,created_at')
    .eq('id', messageId)
    .maybeSingle();

  if (messageResult.error) throw messageResult.error;
  if (!messageResult.data) return { error: json({ error: 'Message not found' }, 404) } as const;

  const message = messageResult.data as ChatMessage;
  const createdAt = Date.parse(message.created_at);
  const ageMs = Date.now() - createdAt;
  if (!Number.isFinite(createdAt) || ageMs < -60_000 || ageMs > 24 * 60 * 60_000) {
    return { error: json({ error: 'Message is too old to dispatch' }, 409) } as const;
  }

  const senderResult = await admin
    .from('members')
    .select('id,mess_id,name')
    .eq('id', message.sender_member_id)
    .eq('mess_id', message.mess_id)
    .eq('active', true)
    .is('deleted_at', null)
    .maybeSingle();

  if (senderResult.error) throw senderResult.error;
  if (!senderResult.data) return { error: json({ error: 'Active sender not found' }, 404) } as const;

  return { message, sender: senderResult.data as Member } as const;
}

async function validateWebhookToken(
  admin: ReturnType<typeof createAdminClient>,
  supplied: string,
) {
  if (!supplied || supplied.length < 32 || supplied.length > 256) return false;
  const config = await admin
    .from('chat_push_server_config')
    .select('webhook_token')
    .eq('id', true)
    .maybeSingle();
  if (config.error) throw config.error;
  const expected = cleanText(config.data?.webhook_token, 256);
  if (!expected || expected.length !== supplied.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  }
  return diff === 0;
}

async function claimDispatch(admin: ReturnType<typeof createAdminClient>, messageId: string) {
  const claim = await admin.from('chat_push_dispatches').insert({ message_id: messageId });
  if (!claim.error) return true;
  if (claim.error.code === '23505') return false;
  throw claim.error;
}

async function releaseDispatch(admin: ReturnType<typeof createAdminClient>, messageId: string) {
  const released = await admin.from('chat_push_dispatches').delete().eq('message_id', messageId);
  if (released.error) console.warn('Unable to release chat push dispatch claim', released.error.code || 'unknown');
}

async function loadRecipientSubscriptions(
  admin: ReturnType<typeof createAdminClient>,
  sender: Member,
): Promise<PushRow[]> {
  const recipients = await admin
    .from('members')
    .select('id')
    .eq('mess_id', sender.mess_id)
    .eq('active', true)
    .is('deleted_at', null)
    .neq('id', sender.id);

  if (recipients.error) throw recipients.error;
  const recipientIds = (recipients.data || []).map(row => String(row.id));
  if (!recipientIds.length) return [];

  const subscriptions = await admin
    .from('push_subscriptions')
    .select('id,endpoint,p256dh,auth')
    .eq('mess_id', sender.mess_id)
    .in('member_id', recipientIds);

  if (subscriptions.error) throw subscriptions.error;
  return (subscriptions.data || []) as PushRow[];
}

async function sendPushes(
  admin: ReturnType<typeof createAdminClient>,
  sender: Member,
  message: ChatMessage,
) {
  const subscriptions = await loadRecipientSubscriptions(admin, sender);
  if (!subscriptions.length) return { delivered: 0, failed: 0, removed: 0 };

  const vapid = await ensureVapid(admin);
  const payload = JSON.stringify({
    type: 'chat-message',
    message_id: message.id,
    mess_id: sender.mess_id,
    sender_name: cleanText(sender.name, 120) || 'Mess Chat',
    body: cleanText(message.body, 240) || 'New chat message',
    created_at: message.created_at,
    url: './?open=chat',
  });

  let delivered = 0;
  let failed = 0;
  const staleIds: string[] = [];
  const topic = `chat-${message.id.replace(/-/g, '').slice(0, 27)}`;

  await Promise.all(subscriptions.map(async subscription => {
    try {
      await sendNotification({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      }, payload, {
        vapidDetails: {
          subject: vapid.subject,
          publicKey: vapid.public_key,
          privateKey: vapid.private_key,
        },
        TTL: 86_400,
        urgency: 'high',
        topic,
        signal: AbortSignal.timeout(15_000),
      });
      delivered += 1;
    } catch (error) {
      failed += 1;
      const status = Number((error as { statusCode?: number })?.statusCode || 0);
      if (status === 404 || status === 410) staleIds.push(subscription.id);
      console.warn('Chat push delivery failed', status || 'unknown');
    }
  }));

  let removed = 0;
  if (staleIds.length) {
    const cleanup = await admin.from('push_subscriptions').delete().in('id', staleIds);
    if (cleanup.error) console.warn('Stale push subscription cleanup failed', cleanup.error.code || 'unknown');
    else removed = staleIds.length;
  }

  return { delivered, failed, removed };
}

async function dispatchClaimed(
  admin: ReturnType<typeof createAdminClient>,
  sender: Member,
  message: ChatMessage,
) {
  const claimed = await claimDispatch(admin, message.id);
  if (!claimed) {
    return { ok: true, already_dispatched: true, push: { delivered: 0, failed: 0, removed: 0 } };
  }

  try {
    const push = await sendPushes(admin, sender, message);
    if (push.delivered === 0 && push.failed > 0) {
      await releaseDispatch(admin, message.id);
    }
    return { ok: true, already_dispatched: false, push };
  } catch (pushError) {
    await releaseDispatch(admin, message.id);
    throw pushError;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const requestBody = await req.json().catch(() => ({}));
    const action = cleanText(requestBody?.action, 40);

    if (action === 'dispatch-webhook') {
      const admin = createAdminClient();
      const suppliedToken = cleanText(requestBody?.webhook_token, 256);
      if (!await validateWebhookToken(admin, suppliedToken)) {
        return json({ error: 'Unauthorized' }, 401);
      }

      const messageId = cleanText(requestBody?.message_id, 80);
      if (!UUID_RE.test(messageId)) return json({ error: 'Invalid message id' }, 400);

      const loaded = await loadServerMessage(admin, messageId);
      if ('error' in loaded) return loaded.error;
      return json(await dispatchClaimed(admin, loaded.sender, loaded.message));
    }

    const authenticated = await authenticate(req);
    if ('error' in authenticated) return authenticated.error;
    const { admin, member } = authenticated;

    if (action === 'public-key') {
      const vapid = await ensureVapid(admin);
      return json({ ok: true, public_key: vapid.public_key });
    }

    if (action !== 'dispatch-message') {
      return json({ error: 'Unknown action' }, 400);
    }

    const messageId = cleanText(requestBody?.message_id, 80);
    if (!UUID_RE.test(messageId)) return json({ error: 'Invalid message id' }, 400);

    const loaded = await loadOwnedFreshMessage(admin, member, messageId);
    if ('error' in loaded) return loaded.error;
    return json(await dispatchClaimed(admin, member, loaded.message));
  } catch (error) {
    console.error('chat-push failed', error);
    return json({ error: 'Unable to process chat notification right now.' }, 500);
  }
});
