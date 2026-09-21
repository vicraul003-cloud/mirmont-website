// Shared helpers for the QuickBooks Online integration.
// Lives under functions/_lib/ (underscore prefix) so Cloudflare Pages does NOT
// treat this file itself as a route — only functions/api/qbo/*.js are routes.

const TOKEN_ENDPOINT = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const TOKENS_KV_KEY = 'qbo_tokens';

export class QboNotConnectedError extends Error {}
export class QboReauthRequiredError extends Error {}

function requireKv(env) {
  if (!env.QBO_KV) {
    throw new Error('QBO_KV namespace binding is missing. Bind a KV namespace named QBO_KV to this Pages project.');
  }
  return env.QBO_KV;
}

export async function saveTokens(env, tokens) {
  await requireKv(env).put(TOKENS_KV_KEY, JSON.stringify(tokens));
}

export async function loadTokens(env) {
  const raw = await requireKv(env).get(TOKENS_KV_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export async function clearTokens(env) {
  await requireKv(env).delete(TOKENS_KV_KEY);
}

function basicAuthHeader(env) {
  const clientId = env.QBO_CLIENT_ID;
  const clientSecret = env.QBO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('QBO_CLIENT_ID / QBO_CLIENT_SECRET environment variables are missing.');
  }
  return 'Basic ' + btoa(clientId + ':' + clientSecret);
}

export async function exchangeCodeForTokens(env, code, redirectUri) {
  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(env),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri
    }).toString()
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error('Token exchange failed (' + resp.status + '): ' + text);
  }
  return resp.json();
}

async function refreshTokens(env, refreshToken) {
  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(env),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }).toString()
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error('Token refresh failed (' + resp.status + '): ' + text);
  }
  return resp.json();
}

// Returns a valid, non-expired token record, refreshing it (and persisting the
// refreshed tokens back to KV) if the access token has expired.
export async function getValidTokens(env) {
  const tokens = await loadTokens(env);
  if (!tokens) throw new QboNotConnectedError('QuickBooks is not connected.');

  if (tokens.expires_at && Date.now() < tokens.expires_at) {
    return tokens;
  }

  let refreshed;
  try {
    refreshed = await refreshTokens(env, tokens.refresh_token);
  } catch (e) {
    // The refresh token itself is dead/expired/revoked - the user must reconnect.
    await clearTokens(env);
    throw new QboReauthRequiredError('QuickBooks connection expired; please reconnect.');
  }

  const now = Date.now();
  const updated = {
    ...tokens,
    access_token: refreshed.access_token,
    // Intuit may or may not rotate the refresh token on each call; keep the old
    // one if a new one wasn't returned.
    refresh_token: refreshed.refresh_token || tokens.refresh_token,
    expires_at: now + (Number(refreshed.expires_in || 3600) - 60) * 1000
  };
  await saveTokens(env, updated);
  return updated;
}

export function apiBase(tokens) {
  return tokens.environment === 'sandbox'
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com';
}

export async function qboQuery(tokens, query) {
  const url = apiBase(tokens) + '/v3/company/' + encodeURIComponent(tokens.realmId) +
    '/query?query=' + encodeURIComponent(query) + '&minorversion=65';
  const resp = await fetch(url, {
    headers: {
      Authorization: 'Bearer ' + tokens.access_token,
      Accept: 'application/json'
    }
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error('QuickBooks query failed (' + resp.status + '): ' + text);
  }
  return resp.json();
}

// Escapes a value for safe interpolation into a QBO query-language string literal.
export function escapeQboString(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
