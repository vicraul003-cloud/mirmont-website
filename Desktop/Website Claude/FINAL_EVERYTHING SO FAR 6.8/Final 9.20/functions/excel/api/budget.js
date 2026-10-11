// Budget storage for the password-protected /excel/ page.
// Protected by functions/excel/_middleware.js (same login as the page).
// Requires a KV namespace bound to this Pages project as BUDGET_KV.

const KEY = 'budget';
const MAX_BYTES = 1_000_000;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export async function onRequestGet({ env }) {
  if (!env.BUDGET_KV) return json({ error: 'not_configured' }, 501);
  const stored = await env.BUDGET_KV.get(KEY, 'json');
  if (!stored) return json({ rev: 0, data: null, updatedAt: null });
  return json(stored);
}

export async function onRequestPut({ request, env }) {
  if (!env.BUDGET_KV) return json({ error: 'not_configured' }, 501);

  const text = await request.text();
  if (text.length > MAX_BYTES) return json({ error: 'too_large' }, 413);

  let body;
  try { body = JSON.parse(text); } catch { return json({ error: 'bad_json' }, 400); }
  const { rev, data } = body || {};
  if (typeof rev !== 'number' || !data || data.version !== 1 || !Array.isArray(data.sections)) {
    return json({ error: 'bad_data' }, 400);
  }

  const current = (await env.BUDGET_KV.get(KEY, 'json')) || { rev: 0 };
  if (current.rev !== rev) {
    // Someone saved from another device since this page loaded.
    return json({ error: 'conflict', rev: current.rev, data: current.data, updatedAt: current.updatedAt }, 409);
  }

  const next = { rev: rev + 1, data, updatedAt: new Date().toISOString() };
  await env.BUDGET_KV.put(KEY, JSON.stringify(next));

  // Keep one snapshot per day for 90 days as a safety net.
  const day = next.updatedAt.slice(0, 10);
  await env.BUDGET_KV.put(`backup:${day}`, JSON.stringify(next), { expirationTtl: 60 * 60 * 24 * 90 });

  return json({ rev: next.rev, updatedAt: next.updatedAt });
}
