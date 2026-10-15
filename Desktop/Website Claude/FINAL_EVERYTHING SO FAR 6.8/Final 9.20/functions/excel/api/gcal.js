// /excel/api/gcal — Google Calendar sync for the Budget page (behind the same login as /excel/).
//   GET  ?action=status      → { configured, connected, email, calendarId, lastSync }
//   GET  ?action=connect     → redirects to Google to sign in (pick your personal Gmail)
//   POST ?action=sync        → body { events:[{key,date,summary,description,reminder}] }; adds/updates/removes
//                              events in the "Budget" calendar. Works in chunks (Cloudflare limits how many
//                              Google calls one request can make) → returns { done, remaining }; the page repeats.
//   POST ?action=disconnect  → forget the connection (the Budget calendar stays in Google)
import { json, configured, loadState, saveState, clearState, accessToken, gapi, addOneDay, ReauthError, AUTH_ENDPOINT, SCOPE, MAP_KEY, redirectUri } from '../../_lib/gcal-budget.js';

const MAX_CALLS = 40; // stay under Cloudflare's per-request subrequest limit

export async function onRequestGet({ request, env }) {
  const action = new URL(request.url).searchParams.get('action') || 'status';
  if (!configured(env)) return action === 'status' ? json({ configured: false, connected: false }) : json({ error: 'not_configured' }, 501);

  if (action === 'connect') {
    const st = crypto.randomUUID();
    await env.BUDGET_KV.put('gcal_budget_oauth:' + st, '1', { expirationTtl: 600 });
    const u = new URL(AUTH_ENDPOINT);
    u.searchParams.set('client_id', env.GCAL_CLIENT_ID);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', SCOPE);
    u.searchParams.set('redirect_uri', redirectUri(request));
    u.searchParams.set('state', st);
    u.searchParams.set('access_type', 'offline');
    u.searchParams.set('prompt', 'consent select_account'); // always let you choose which Google account
    return Response.redirect(u.toString(), 302);
  }

  const s = await loadState(env);
  return json({ configured: true, connected: !!s, email: s && s.email, calendarId: s && s.calendarId, lastSync: s && s.lastSync });
}

export async function onRequestPost({ request, env }) {
  const action = new URL(request.url).searchParams.get('action');
  if (!configured(env)) return json({ error: 'not_configured' }, 501);

  if (action === 'disconnect') { await clearState(env); return json({ ok: true }); }
  if (action !== 'sync') return json({ error: 'bad_action' }, 400);

  const state = await loadState(env);
  if (!state) return json({ error: 'not_connected' }, 409);
  let body; try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const events = Array.isArray(body.events) ? body.events : null;
  if (!events) return json({ error: 'bad_events' }, 400);

  let token;
  try { token = await accessToken(env, state); }
  catch (e) { if (e instanceof ReauthError) { await clearState(env); return json({ error: 'reauth_required' }, 409); } return json({ error: 'token_error', detail: e.message }, 500); }

  let calls = 1;
  // make sure the Budget calendar exists (recreate it if it was deleted in Google)
  if (state.calendarId && body.verify) {
    calls++;
    try { await gapi(token, 'GET', '/calendars/' + encodeURIComponent(state.calendarId)); }
    catch (e) { if (e.status === 404 || e.status === 410) { state.calendarId = null; } else throw e; }
  }
  if (!state.calendarId) {
    const cal = await gapi(token, 'POST', '/calendars', { summary: 'Budget', description: 'Paydays, Nanny Fridays and bills from the Mirmont Budget page', timeZone: 'America/New_York' });
    state.calendarId = cal.id; await saveState(env, state); await env.BUDGET_KV.delete(MAP_KEY); calls++;
  }
  const calPath = '/calendars/' + encodeURIComponent(state.calendarId) + '/events';
  const map = JSON.parse((await env.BUDGET_KV.get(MAP_KEY)) || '{}'); // key → { id, h }

  const want = new Map();
  for (const ev of events) {
    if (!ev || !ev.key || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date || '')) continue;
    want.set(String(ev.key), ev);
  }
  const hashOf = (ev) => [ev.date, ev.summary, ev.description || '', ev.reminder ? 1 : 0].join('|');
  const bodyOf = (ev) => ({
    summary: String(ev.summary || '').slice(0, 200),
    description: String(ev.description || '').slice(0, 1000),
    start: { date: ev.date }, end: { date: addOneDay(ev.date) },
    transparency: 'transparent',
    reminders: ev.reminder ? { useDefault: false, overrides: [{ method: 'popup', minutes: 15 * 60 }] } : { useDefault: false, overrides: [] }
  });

  const todo = [];
  for (const [k, ev] of want) { const cur = map[k]; if (!cur) todo.push(['add', k, ev]); else if (cur.h !== hashOf(ev)) todo.push(['upd', k, ev]); }
  for (const k of Object.keys(map)) if (!want.has(k)) todo.push(['del', k]);

  let done = 0, calendarGone = false;
  for (const [op, k, ev] of todo) {
    if (calls >= MAX_CALLS) break;
    calls++;
    try {
      if (op === 'add') { const r = await gapi(token, 'POST', calPath, bodyOf(ev)); map[k] = { id: r.id, h: hashOf(ev) }; }
      else if (op === 'upd') { await gapi(token, 'PATCH', calPath + '/' + encodeURIComponent(map[k].id), bodyOf(ev)); map[k].h = hashOf(ev); }
      else { await gapi(token, 'DELETE', calPath + '/' + encodeURIComponent(map[k].id)); delete map[k]; }
      done++;
    } catch (e) {
      if (e.status === 404 && op === 'upd') { delete map[k]; done++; continue; } // event deleted in Google: re-add next round
      if (e.status === 404 || e.status === 410) { calendarGone = true; break; }
      await env.BUDGET_KV.put(MAP_KEY, JSON.stringify(map));
      return json({ error: 'google_error', detail: e.message, done, remaining: todo.length - done }, 502);
    }
  }
  if (calendarGone) { state.calendarId = null; await saveState(env, state); await env.BUDGET_KV.delete(MAP_KEY); return json({ done, remaining: want.size, recreate: true }); }

  await env.BUDGET_KV.put(MAP_KEY, JSON.stringify(map));
  const remaining = todo.length - done;
  if (!remaining) { state.lastSync = new Date().toISOString(); await saveState(env, state); }
  return json({ done, remaining, total: want.size, lastSync: state.lastSync || null });
}
