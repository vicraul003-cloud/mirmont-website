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

export async function onRequestGet({ env, request }) {
  if (!env.BUDGET_KV) return json({ error: 'not_configured' }, 501);
  const url = new URL(request.url);

  // ?backups=1 → list the saved snapshots (newest first)
  if (url.searchParams.get('backups')) {
    const out = []; let cursor;
    do {
      const page = await env.BUDGET_KV.list({ prefix: 'backup:', cursor });
      page.keys.forEach(k => out.push(k.name.slice(7)));
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor);
    out.sort().reverse();
    return json({ backups: out });
  }
  // ?backup=<name> → one snapshot
  const one = url.searchParams.get('backup');
  if (one) {
    if (!/^[0-9T:.\-a-z]{10,40}$/i.test(one)) return json({ error: 'bad_name' }, 400);
    const snap = await env.BUDGET_KV.get('backup:' + one, 'json');
    if (!snap) return json({ error: 'not_found' }, 404);
    return json(snap);
  }

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

  // restoring an old copy: keep what is there right now as its own snapshot first
  if (body.restoring && current.data) {
    const stamp = new Date().toISOString().slice(0, 16).replace(':', '-');
    await env.BUDGET_KV.put(`backup:${stamp}-before-restore`, JSON.stringify(current), { expirationTtl: 60 * 60 * 24 * 90 });
  }

  const next = { rev: rev + 1, data, updatedAt: new Date().toISOString() };
  await env.BUDGET_KV.put(KEY, JSON.stringify(next));

  // Keep one snapshot per day for 90 days as a safety net.
  const day = next.updatedAt.slice(0, 10);
  await env.BUDGET_KV.put(`backup:${day}`, JSON.stringify(next), { expirationTtl: 60 * 60 * 24 * 90 });

  return json({ rev: next.rev, updatedAt: next.updatedAt });
}
