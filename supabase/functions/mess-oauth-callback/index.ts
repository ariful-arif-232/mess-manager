// One-time Google OAuth callback.
//
// Google redirects the browser here (a plain GET, no Supabase session)
// after an admin grants Sheets/Drive access from Settings → "Connect Google
// Drive" (see the 'oauth-start' action in mess-sheet/index.ts, which builds
// the consent URL this flow starts from). This exchanges the authorization
// code for a refresh token and stores it, so mess-sheet can create and
// update every mess's Sheet as this real Google account from then on.
import { createClient } from 'npm:@supabase/supabase-js@2.55.0';

function createAdminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) throw new Error('Supabase server credentials are unavailable.');
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function page(title: string, body: string) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<style>body{font-family:system-ui,-apple-system,sans-serif;background:#fff3df;color:#3a2a1a;` +
    `display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center}` +
    `.card{background:#fff;border-radius:16px;padding:32px 24px;max-width:360px;box-shadow:0 12px 30px rgba(0,0,0,.08)}` +
    `h1{font-size:20px;margin:0 0 8px}p{color:#7a6656;margin:0;line-height:1.5}</style></head>` +
    `<body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

function decodeEmailFromIdToken(idToken: string): string | null {
  try {
    const payload = JSON.parse(atob(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const oauthError = url.searchParams.get('error');
  if (oauthError) return page('Not connected', `Google reported: ${oauthError}. Close this tab and try again from Settings.`);
  if (!code) return page('Not connected', 'Missing authorization code. Close this tab and try again from Settings.');

  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return page('Not configured', 'GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET secrets are missing.');
  }

  const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mess-oauth-callback`;

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.refresh_token) {
      console.error('Google OAuth token exchange failed', response.status, data);
      return page(
        'Not connected',
        "Google didn't return a long-lived connection. Close this tab and try again — if it keeps happening, " +
        'remove Mess Manager at myaccount.google.com/permissions first, then reconnect.',
      );
    }

    const email = typeof data.id_token === 'string' ? decodeEmailFromIdToken(data.id_token) : null;
    const admin = createAdminClient();
    const upserted = await admin.from('app_google_connection').upsert({
      id: true,
      refresh_token: data.refresh_token,
      connected_email: email,
      connected_at: new Date().toISOString(),
    });
    if (upserted.error) throw upserted.error;

    return page('Google Drive connected', `Connected as ${email || 'your Google account'}. You can close this tab and go back to Mess Manager.`);
  } catch (err) {
    console.error('mess-oauth-callback failed', err);
    return page('Something went wrong', 'Close this tab and try again from Settings.');
  }
});
