// GET /api/gcal/callback — Google redirects here after the admin approves (or
// denies) access. Exchanges the authorization code for tokens, stores them in
// KV, and bounces back to admin.html with a status flag in the query string.

import { exchangeCodeForTokens, saveTokens } from '../../_lib/gcal.js';

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const backToAdmin = (status, message) => {
    const target = new URL('/admin.html', url.origin);
    target.searchParams.set('gcal', status);
    if (message) target.searchParams.set('gcal_msg', message);
    return Response.redirect(target.toString(), 302);
  };

  if (error) return backToAdmin('error', error);
  if (!code || !state) return backToAdmin('error', 'missing_params');

  if (!env.GCAL_KV) return backToAdmin('error', 'not_configured');

  const stateKey = 'oauth_state:' + state;
  const validState = await env.GCAL_KV.get(stateKey);
  if (!validState) return backToAdmin('error', 'invalid_state');
  await env.GCAL_KV.delete(stateKey);

  let tokenData;
  try {
    tokenData = await exchangeCodeForTokens(env, code, env.GCAL_REDIRECT_URI);
  } catch (e) {
    return backToAdmin('error', 'token_exchange_failed');
  }

  if (!tokenData.refresh_token) {
    // Shouldn't happen given access_type=offline&prompt=consent in connect.js,
    // but without it we can't stay connected past the first access token's expiry.
    return backToAdmin('error', 'no_refresh_token');
  }

  const now = Date.now();
  await saveTokens(env, {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: now + (Number(tokenData.expires_in || 3600) - 60) * 1000,
    connected_at: now
  });

  return backToAdmin('connected');
}
