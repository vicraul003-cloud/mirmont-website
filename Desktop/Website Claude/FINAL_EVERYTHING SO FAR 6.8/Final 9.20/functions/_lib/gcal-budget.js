// Google Calendar sync for the Budget page (/excel/) — a SEPARATE connection from the
// admin CRM's Google Calendar (that one uses GCAL_KV / the company account).
// Same Google OAuth client (GCAL_CLIENT_ID / GCAL_CLIENT_SECRET), but its own tokens,
// stored in BUDGET_KV, and its own "Budget" calendar in whichever Google account
// (e.g. a personal Gmail) is connected from the Budget page.

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const CAL_API = 'https://www.googleapis.com/calendar/v3';
export const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
// create and manage only calendars this app makes (not the rest of the account) + who signed in
export const SCOPE = 'openid email https://www.googleapis.com/auth/calendar.app.created';
const TOKENS_KEY = 'gcal_budget_tokens';
export const MAP_KEY = 'gcal_budget_map';

export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export function redirectUri(request) {
  return new URL(request.url).origin + '/excel/api/gcal-callback';
}

export function configured(env) {
  return !!(env.BUDGET_KV && env.GCAL_CLIENT_ID && env.GCAL_CLIENT_SECRET);
}

export async function loadState(env) {
  const raw = await env.BUDGET_KV.get(TOKENS_KEY);
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export async function saveState(env, s) { await env.BUDGET_KV.put(TOKENS_KEY, JSON.stringify(s)); }
export async function clearState(env) { await env.BUDGET_KV.delete(TOKENS_KEY); await env.BUDGET_KV.delete(MAP_KEY); }

export async function exchangeCode(env, code, request) {
  const r = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(request), client_id: env.GCAL_CLIENT_ID, client_secret: env.GCAL_CLIENT_SECRET }).toString()
  });
  if (!r.ok) throw new Error('token exchange failed (' + r.status + '): ' + (await r.text().catch(() => '')));
  return r.json();
}

export function emailFromIdToken(idToken) {
  try {
    const p = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(p + '==='.slice((p.length + 3) % 4))).email || null;
  } catch { return null; }
}

export class ReauthError extends Error {}

// valid access token (refreshes + saves when expired)
export async function accessToken(env, state) {
  if (state.expires_at && Date.now() < state.expires_at) return state.access_token;
  const r = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: state.refresh_token, client_id: env.GCAL_CLIENT_ID, client_secret: env.GCAL_CLIENT_SECRET }).toString()
  });
  if (!r.ok) throw new ReauthError('Google connection expired — please reconnect.');
  const t = await r.json();
  state.access_token = t.access_token;
  if (t.refresh_token) state.refresh_token = t.refresh_token;
  state.expires_at = Date.now() + (Number(t.expires_in || 3600) - 60) * 1000;
  await saveState(env, state);
  return state.access_token;
}

export async function gapi(token, method, path, body) {
  const r = await fetch(CAL_API + path, {
    method,
    headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  if (method === 'DELETE' && (r.status === 404 || r.status === 410)) return null;
  if (!r.ok) { const e = new Error(method + ' ' + path + ' failed (' + r.status + '): ' + (await r.text().catch(() => ''))); e.status = r.status; throw e; }
  return r.status === 204 ? null : r.json().catch(() => null);
}

export function addOneDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
