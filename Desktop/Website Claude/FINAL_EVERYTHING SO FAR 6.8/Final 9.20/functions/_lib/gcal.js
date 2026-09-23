// Shared helpers for the Google Calendar sync integration.
// Lives under functions/_lib/ (underscore prefix) so Cloudflare Pages does NOT
// treat this file itself as a route — only functions/api/gcal/*.js are routes.
// Mirrors the QuickBooks integration's functions/_lib/qbo.js pattern.

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const TOKENS_KV_KEY = 'gcal_tokens';

export class GcalNotConnectedError extends Error {}
export class GcalReauthRequiredError extends Error {}

function requireKv(env) {
  if (!env.GCAL_KV) {
    throw new Error('GCAL_KV namespace binding is missing. Bind a KV namespace named GCAL_KV to this Pages project.');
  }
  return env.GCAL_KV;
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

function requireClientCreds(env) {
  const clientId = env.GCAL_CLIENT_ID;
  const clientSecret = env.GCAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GCAL_CLIENT_ID / GCAL_CLIENT_SECRET environment variables are missing.');
  }
  return { clientId, clientSecret };
}

export async function exchangeCodeForTokens(env, code, redirectUri) {
  const { clientId, clientSecret } = requireClientCreds(env);
  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret
    }).toString()
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error('Token exchange failed (' + resp.status + '): ' + text);
  }
  return resp.json();
}

async function refreshTokens(env, refreshToken) {
  const { clientId, clientSecret } = requireClientCreds(env);
  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret
    }).toString()
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error('Token refresh failed (' + resp.status + '): ' + text);
  }
  return resp.json();
}

// Returns a valid, non-expired token record, refreshing it (and persisting the
// refreshed tokens back to KV) if the access token has expired. Google does not
// generally rotate the refresh_token on each refresh, so we keep the original.
export async function getValidTokens(env) {
  const tokens = await loadTokens(env);
  if (!tokens) throw new GcalNotConnectedError('Google Calendar is not connected.');

  if (tokens.expires_at && Date.now() < tokens.expires_at) {
    return tokens;
  }

  let refreshed;
  try {
    refreshed = await refreshTokens(env, tokens.refresh_token);
  } catch (e) {
    // The refresh token itself is dead/expired/revoked - the user must reconnect.
    await clearTokens(env);
    throw new GcalReauthRequiredError('Google Calendar connection expired; please reconnect.');
  }

  const now = Date.now();
  const updated = {
    ...tokens,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token || tokens.refresh_token,
    expires_at: now + (Number(refreshed.expires_in || 3600) - 60) * 1000
  };
  await saveTokens(env, updated);
  return updated;
}

// Creates an all-day event on the connected account's primary calendar.
// `date` is a 'YYYY-MM-DD' string; Google's all-day events use an exclusive
// end date, so end = date + 1 day.
export async function createCalendarEvent(tokens, { title, date, notes }) {
  const start = date;
  const end = addOneDay(date);
  const resp = await fetch(CALENDAR_API_BASE + '/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + tokens.access_token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      summary: title,
      description: notes || undefined,
      start: { date: start },
      end: { date: end }
    })
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error('Calendar event creation failed (' + resp.status + '): ' + text);
  }
  return resp.json();
}

// Deletes an event. A 404/410 (already gone) is treated as success, since the
// end result the caller wants — the event no longer existing — is already true.
export async function deleteCalendarEvent(tokens, eventId) {
  const resp = await fetch(
    CALENDAR_API_BASE + '/calendars/primary/events/' + encodeURIComponent(eventId),
    { method: 'DELETE', headers: { Authorization: 'Bearer ' + tokens.access_token } }
  );
  if (!resp.ok && resp.status !== 404 && resp.status !== 410) {
    const text = await resp.text().catch(() => '');
    throw new Error('Calendar event deletion failed (' + resp.status + '): ' + text);
  }
}

function addOneDay(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

export function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
