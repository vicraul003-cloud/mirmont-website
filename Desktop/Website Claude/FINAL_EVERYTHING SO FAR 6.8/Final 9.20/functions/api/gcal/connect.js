// GET /api/gcal/connect — starts the Google OAuth 2.0 flow by redirecting the
// admin's browser to Google's consent screen, asking only for permission to
// manage calendar events (not read/write the whole calendar or account).

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';

export async function onRequestGet(context) {
  const { env } = context;

  if (!env.GCAL_CLIENT_ID || !env.GCAL_REDIRECT_URI) {
    return new Response(
      'Google Calendar is not configured yet. Set GCAL_CLIENT_ID, GCAL_CLIENT_SECRET, and GCAL_REDIRECT_URI ' +
        'in this Cloudflare Pages project\'s environment variables, and bind a KV namespace named GCAL_KV.',
      { status: 500, headers: { 'Content-Type': 'text/plain' } }
    );
  }

  if (!env.GCAL_KV) {
    return new Response(
      'Google Calendar is not configured yet: no GCAL_KV namespace is bound to this Pages project.',
      { status: 500, headers: { 'Content-Type': 'text/plain' } }
    );
  }

  const state = crypto.randomUUID();
  // Short-lived CSRF guard; verified and deleted in callback.js.
  await env.GCAL_KV.put('oauth_state:' + state, '1', { expirationTtl: 600 });

  const authUrl = new URL(AUTH_ENDPOINT);
  authUrl.searchParams.set('client_id', env.GCAL_CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPE);
  authUrl.searchParams.set('redirect_uri', env.GCAL_REDIRECT_URI);
  authUrl.searchParams.set('state', state);
  // access_type=offline + prompt=consent guarantee a refresh_token comes back
  // even if this Google account connected once before (Google only issues one
  // on the very first consent otherwise, which would silently break reconnects).
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  return Response.redirect(authUrl.toString(), 302);
}
