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

// Redirects to a static confirmation page on the app's own domain instead of
// rendering HTML inline from this function. Inline responses from this
// *.supabase.co origin render fine in a normal browser tab, but iOS opens
// external OAuth links from an installed ("standalone") Mess Manager in an
// embedded in-app browser sheet, and that sheet was showing this page's raw
// markup as unstyled plain text instead of parsing it. A plain 302 to a
// static file served by the app's own known-good static hosting sidesteps
// whatever that sheet was doing with the inline response.
const APP_ORIGIN = 'https://mess-manager.app';

function page(ok: boolean, title: string, message: string) {
  const params = new URLSearchParams({ status: ok ? 'ok' : 'error', title, message });
  return new Response(null, {
    status: 302,
    headers: { Location: `${APP_ORIGIN}/oauth-complete.html?${params.toString()}` },
  });
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
  if (oauthError) return page(false, 'Not connected', `Google reported: ${oauthError}. Close this tab and try again from Settings.`);
  if (!code) return page(false, 'Not connected', 'Missing authorization code. Close this tab and try again from Settings.');

  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return page(false, 'Not configured', 'GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET secrets are missing.');
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
        false,
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

    return page(true, 'Google Drive connected', `Connected as ${email || 'your Google account'}. You can close this tab and go back to Mess Manager.`);
  } catch (err) {
    console.error('mess-oauth-callback failed', err);
    return page(false, 'Something went wrong', 'Close this tab and try again from Settings.');
  }
});
