// Saved countertop jobs for /templates/ — stored in the same KV namespace as the budget (BUDGET_KV), under "tpl:" keys.
// GET            → { jobs: [{ id, name, updatedAt }] }   (newest first)
// GET ?id=<id>   → the job
// PUT  { job }   → saves it, returns { id, updatedAt }
// DELETE ?id=<id>
// Protected by functions/templates/_middleware.js (same login as the page).

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const INDEX = 'tpl:index';
const okId = (id) => /^[a-z0-9]{6,24}$/i.test(String(id || ''));

async function readIndex(env) { return (await env.BUDGET_KV.get(INDEX, 'json')) || []; }

export async function onRequestGet({ env, request }) {
  if (!env.BUDGET_KV) return json({ error: 'not_configured' }, 501);
  const id = new URL(request.url).searchParams.get('id');
  if (id) {
    if (!okId(id)) return json({ error: 'bad_id' }, 400);
    const job = await env.BUDGET_KV.get('tpl:job:' + id, 'json');
    return job ? json(job) : json({ error: 'not_found' }, 404);
  }
  const idx = await readIndex(env);
  idx.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return json({ jobs: idx });
}

export async function onRequestPut({ env, request }) {
  if (!env.BUDGET_KV) return json({ error: 'not_configured' }, 501);
  const text = await request.text();
  if (text.length > 20_000_000) return json({ error: 'too_big' }, 413);
  let body; try { body = JSON.parse(text); } catch { return json({ error: 'bad_request' }, 400); }
  const job = body && body.job;
  if (!job || !okId(job.id)) return json({ error: 'bad_job' }, 400);
  job.updatedAt = new Date().toISOString();
  await env.BUDGET_KV.put('tpl:job:' + job.id, JSON.stringify(job));
  const idx = (await readIndex(env)).filter(x => x.id !== job.id);
  idx.push({ id: job.id, name: String(job.name || 'Untitled job').slice(0, 80), updatedAt: job.updatedAt });
  await env.BUDGET_KV.put(INDEX, JSON.stringify(idx));
  return json({ id: job.id, updatedAt: job.updatedAt });
}

export async function onRequestDelete({ env, request }) {
  if (!env.BUDGET_KV) return json({ error: 'not_configured' }, 501);
  const id = new URL(request.url).searchParams.get('id');
  if (!okId(id)) return json({ error: 'bad_id' }, 400);
  await env.BUDGET_KV.delete('tpl:job:' + id);
  await env.BUDGET_KV.put(INDEX, JSON.stringify((await readIndex(env)).filter(x => x.id !== id)));
  return json({ ok: true });
}
