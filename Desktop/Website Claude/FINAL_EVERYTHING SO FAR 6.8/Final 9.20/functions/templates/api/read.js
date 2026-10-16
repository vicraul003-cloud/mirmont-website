// AI reader for countertop drawings: POST the raw file (body = file bytes, Content-Type = image/jpeg | image/png | image/webp | application/pdf)
// The file is passed straight through to the AI (no base64/JSON work here) so it stays inside Cloudflare's free CPU/memory limits.
// → { pieces: [...], backsplashHeight, notes, confidence }
// Uses Google Gemini when the Cloudflare secret GEMINI_API_KEY is set (free tier from aistudio.google.com),
// otherwise Claude when ANTHROPIC_API_KEY is set. Optional GEMINI_MODEL / TEMPLATES_MODEL pick other models.
// Protected by functions/templates/_middleware.js (same login as the page).

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status: status >= 500 ? 200 : status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

const PROMPT = `You are reading a kitchen/bath countertop drawing (shop drawing, sketch, or field template) for a quartz fabricator.
Find every countertop PIECE and give its outline in INCHES. Return ONLY one JSON object, no prose, in exactly this shape:

{
  "pieces": [
    {
      "name": "short label, e.g. 'Sink run', 'Island', 'Range left'",
      "vertices": [[x, y], [x, y], ...],
      "walls": [edgeIndex, ...],
      "backsplash": [edgeIndex, ...],
      "cutouts": ["sink", "cooktop", ...],
      "notes": "anything unclear about this piece"
    }
  ],
  "backsplashHeight": null,
  "notes": "overall notes, assumptions and anything you could not read",
  "confidence": "high" | "medium" | "low"
}

Rules:
- Coordinates are inches. x grows to the right, y grows DOWN, (0,0) is the piece's own top-left corner. List vertices clockwise.
- Edge i runs from vertex i to vertex i+1 (the last edge closes back to vertex 0).
- Outlines must be rectilinear (only horizontal and vertical edges). Approximate angles/curves/clipped corners with the bounding rectangle and mention it in notes.
- Convert feet-inches (e.g. 8'-3 1/2") and fractions to decimal inches.
- Rectangles have 4 vertices, L-shapes 6, U-shapes 8.
- "walls": edges that sit against a wall. "backsplash": edges that should get a backsplash (normally the wall edges; include side splashes if the drawing shows them). Islands/peninsula open edges are not walls.
- If the drawing states a backsplash height, put it in "backsplashHeight" (inches), otherwise null.
- Do not include cabinets, appliances or the backsplash strips themselves as pieces.
- If a dimension is missing, make your best estimate from the other dimensions and say so in that piece's notes.`;

function extractJson(text) {
  const s = String(text || '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('no_json');
  return JSON.parse(s.slice(a, b + 1));
}

function cleanPiece(p, i) {
  const v = Array.isArray(p.vertices) ? p.vertices.map(q => [Number(q[0]), Number(q[1])]).filter(q => Number.isFinite(q[0]) && Number.isFinite(q[1])) : [];
  if (v.length < 3) return null;
  const n = v.length, ix = (a) => (Array.isArray(a) ? a : []).map(Number).filter(k => Number.isInteger(k) && k >= 0 && k < n);
  return {
    name: String(p.name || `Piece ${i + 1}`).slice(0, 60),
    vertices: v.map(q => [Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100]),
    walls: ix(p.walls), backsplash: ix(p.backsplash),
    cutouts: (Array.isArray(p.cutouts) ? p.cutouts : []).map(String).slice(0, 8),
    notes: String(p.notes || '').slice(0, 400),
  };
}

const GBASE = 'https://generativelanguage.googleapis.com';
const OK_TYPES = /^(image\/(jpeg|png|webp|gif)|application\/pdf)$/;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function geminiModels(env) { return [...new Set([env.GEMINI_MODEL, 'gemini-2.5-flash', 'gemini-flash-latest'].filter(Boolean))]; }

// 1) upload the drawing to Gemini's file store (raw bytes, resumable upload), 2) ask about it by reference
async function geminiUpload(env, bytes, mediaType) {
  const start = await fetch(`${GBASE}/upload/v1beta/files`, {
    method: 'POST',
    headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.byteLength), 'X-Goog-Upload-Header-Content-Type': mediaType, 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: { display_name: 'countertop-drawing' } }),
  });
  const url = start.headers.get('x-goog-upload-url');
  if (!start.ok || !url) { const t = await start.text().catch(() => ''); throw httpErr(start.status, 'upload start', t); }
  const up = await fetch(url, { method: 'POST', headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' }, body: bytes });
  const info = await up.json().catch(() => ({}));
  if (!up.ok || !info.file) throw httpErr(up.status, 'upload', JSON.stringify(info));
  let f = info.file;
  for (let i = 0; i < 20 && f.state === 'PROCESSING'; i++) { // PDFs can take a few seconds
    await sleep(1500);
    const r = await fetch(`${GBASE}/v1beta/${f.name}`, { headers: { 'x-goog-api-key': env.GEMINI_API_KEY } });
    f = await r.json().catch(() => f);
  }
  if (f.state === 'FAILED') throw Object.assign(new Error('Gemini could not open this file — try a photo/screenshot instead.'), { status: 502 });
  return f;
}
function httpErr(status, step, text) {
  let msg = '';
  try { msg = JSON.parse(text).error.message; } catch { msg = String(text || '').slice(0, 160); }
  if (status === 429) return Object.assign(new Error('Gemini\'s free daily limit is used up for now — try again later (it resets daily), or add the pieces by hand.'), { status: 429 });
  if ((status === 400 || status === 403) && /api key|permission|API_KEY/i.test(msg)) return Object.assign(new Error('The Gemini API key was not accepted — check GEMINI_API_KEY in Cloudflare.'), { status: 502 });
  return Object.assign(new Error(`Gemini ${step} failed (${status})${msg ? ': ' + msg : ''}`), { status: status === 404 ? 404 : 502 });
}

async function geminiAsk(env, parts, json) {
  let last;
  for (const model of geminiModels(env)) {
    const gen = { temperature: 0.1, maxOutputTokens: 8192 };
    if (json) gen.responseMimeType = 'application/json';
    if (/^gemini-2\.5/.test(model)) gen.thinkingConfig = { thinkingBudget: 1024 }; // keep it quick
    const res = await fetch(`${GBASE}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', signal: AbortSignal.timeout(85000),
      headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: gen }),
    });
    if (res.ok) {
      const out = await res.json();
      const p = (((out.candidates || [])[0] || {}).content || {}).parts || [];
      return { text: p.map(x => x.text || '').join('\n'), model };
    }
    last = httpErr(res.status, 'read', await res.text().catch(() => ''));
    if (res.status !== 404) break; // only try the next model name when this one doesn't exist
  }
  throw last;
}

async function askGemini(env, bytes, mediaType, ctx) {
  const f = await geminiUpload(env, bytes, mediaType);
  try { return await geminiAsk(env, [{ file_data: { mime_type: f.mimeType || mediaType, file_uri: f.uri } }, { text: PROMPT }], true); }
  finally { // don't keep client drawings on Google's side longer than needed
    const del = fetch(`${GBASE}/v1beta/${f.name}`, { method: 'DELETE', headers: { 'x-goog-api-key': env.GEMINI_API_KEY } }).catch(() => {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(del);
  }
}

function toBase64(bytes) {
  const u = new Uint8Array(bytes); let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
async function askClaude(env, bytes, mediaType) {
  const source = { type: 'base64', media_type: mediaType, data: toBase64(bytes) };
  const fileBlock = mediaType === 'application/pdf' ? { type: 'document', source } : { type: 'image', source };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(85000),
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.TEMPLATES_MODEL || 'claude-sonnet-5-5', max_tokens: 4096, messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: PROMPT }] }] }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((out.error && out.error.message) || `AI service error (${res.status}).`), { status: 502 });
  return { text: (out.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n') };
}

// Open /templates/api/read in the browser to check the reader is deployed and which AI it will use.
// Add ?test=1 to send Gemini a one-word question and see its exact answer (checks the key and model).
export async function onRequestGet({ env, request }) {
  const provider = env.GEMINI_API_KEY ? 'gemini' : env.ANTHROPIC_API_KEY ? 'claude' : 'none — add GEMINI_API_KEY in Cloudflare';
  const out = { deployed: true, provider, model: env.GEMINI_API_KEY ? geminiModels(env)[0] : env.ANTHROPIC_API_KEY ? (env.TEMPLATES_MODEL || 'claude-sonnet-5-5') : null };
  if (new URL(request.url).searchParams.get('test') && env.GEMINI_API_KEY) {
    try { const r = await geminiAsk(env, [{ text: 'Reply with just the word OK.' }], false); out.test = 'passed'; out.answer = r.text.trim().slice(0, 40); out.model = r.model; }
    catch (e) { out.test = 'failed'; out.error = e.message; }
  }
  return json(out);
}

export async function onRequestPost(ctx) {
  try { return await handle(ctx); }
  catch (e) {
    const msg = e && e.name === 'TimeoutError' ? 'The AI took too long on this drawing. Try again, or try a smaller/cropped photo.' : String((e && e.message) || e).slice(0, 300);
    return json({ error: 'ai_error', message: msg }, (e && e.status) || 502);
  }
}

async function handle(ctx) {
  const { request, env } = ctx;
  if (!env.GEMINI_API_KEY && !env.ANTHROPIC_API_KEY) return json({ error: 'not_configured', message: 'The AI reader is not set up yet — add the GEMINI_API_KEY secret in Cloudflare Pages → Settings → Variables and Secrets.' }, 501);
  const mediaType = String(request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!OK_TYPES.test(mediaType)) return json({ error: 'bad_file', message: 'Upload a JPG, PNG, WEBP or PDF.' }, 400);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return json({ error: 'bad_file', message: 'The file was empty.' }, 400);
  if (bytes.byteLength > 20_000_000) return json({ error: 'too_big', message: 'That file is too large — try a smaller photo or a 1–2 page PDF.' }, 413);

  const got = env.GEMINI_API_KEY ? await askGemini(env, bytes, mediaType, ctx) : await askClaude(env, bytes, mediaType);
  let parsed;
  try { parsed = extractJson(got.text); } catch { return json({ error: 'unreadable', message: 'The AI answer could not be read. Try again or add the pieces by hand.' }, 502); }
  const pieces = (Array.isArray(parsed.pieces) ? parsed.pieces : []).map(cleanPiece).filter(Boolean).slice(0, 40);
  const bh = Number(parsed.backsplashHeight);
  return json({
    pieces,
    backsplashHeight: Number.isFinite(bh) && bh > 0 ? bh : null,
    notes: String(parsed.notes || '').slice(0, 1500),
    confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
    provider: env.GEMINI_API_KEY ? 'gemini' : 'claude',
  });
}
