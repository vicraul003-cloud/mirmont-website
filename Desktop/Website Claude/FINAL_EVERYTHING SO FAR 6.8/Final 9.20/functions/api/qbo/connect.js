// GET /api/qbo/connect — starts the QuickBooks OAuth 2.0 flow by redirecting
// the admin's browser to Intuit's consent screen.

const AUTH_ENDPOINT = 'https://appcenter.intuit.com/connect/oauth2';

export async function onRequestGet(context) {
  const { env } = context;

  if (!env.QBO_CLIENT_ID || !env.QBO_REDIRECT_URI) {
    return new Response(
      'QuickBooks is not configured yet. Set QBO_CLIENT_ID, QBO_CLIENT_SECRET, and QBO_REDIRECT_URI ' +
        'in this Cloudflare Pages project\'s environment variables, and bind a KV namespace named QBO_KV.',
      { status: 500, headers: { 'Content-Type': 'text/plain' } }
    );
  }

  if (!env.QBO_KV) {
    return new Response(
      'QuickBooks is not configured yet: no QBO_KV namespace is bound to this Pages project.',
      { status: 500, headers: { 'Content-Type': 'text/plain' } }
    );
  }

  const state = crypto.randomUUID();
  // Short-lived CSRF guard; verified and deleted in callback.js.
  await env.QBO_KV.put('oauth_state:' + state, '1', { expirationTtl: 600 });

  const authUrl = new URL(AUTH_ENDPOINT);
  authUrl.searchParams.set('client_id', env.QBO_CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'com.intuit.quickbooks.accounting');
  authUrl.searchParams.set('redirect_uri', env.QBO_REDIRECT_URI);
  authUrl.searchParams.set('state', state);

  return Response.redirect(authUrl.toString(), 302);
}
