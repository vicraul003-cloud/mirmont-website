// /excel/api/gcal-callback — Google sends you back here after you sign in from the Budget page.
import { json, configured, exchangeCode, emailFromIdToken, saveState } from '../../_lib/gcal-budget.js';

export async function onRequestGet({ request, env }) {
  if (!configured(env)) return json({ error: 'not_configured' }, 501);
  const url = new URL(request.url);
  const back = (q) => Response.redirect(url.origin + '/excel/?gcal=' + q, 302);
  if (url.searchParams.get('error')) return back('cancelled');
  const code = url.searchParams.get('code'), st = url.searchParams.get('state');
  if (!code || !st || !(await env.BUDGET_KV.get('gcal_budget_oauth:' + st))) return back('failed');
  await env.BUDGET_KV.delete('gcal_budget_oauth:' + st);
  try {
    const t = await exchangeCode(env, code, request);
    if (!t.refresh_token) return back('failed');
    await saveState(env, {
      access_token: t.access_token, refresh_token: t.refresh_token,
      expires_at: Date.now() + (Number(t.expires_in || 3600) - 60) * 1000,
      email: emailFromIdToken(t.id_token || ''), calendarId: null, connectedAt: new Date().toISOString()
    });
    await env.BUDGET_KV.delete('gcal_budget_map');
    return back('connected');
  } catch (e) {
    return back('failed');
  }
}
