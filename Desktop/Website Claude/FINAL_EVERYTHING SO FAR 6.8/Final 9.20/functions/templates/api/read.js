// AI reader for countertop drawings: POST { data: <base64>, mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' }
// → { pieces: [...], backsplashHeight, notes, confidence }
// Uses Google Gemini when the Cloudflare secret GEMINI_API_KEY is set (free tier from aistudio.google.com),
// otherwise Claude when ANTHROPIC_API_KEY is set. Optional GEMINI_MODEL / TEMPLATES_MODEL pick other models.
// Protected by functions/templates/_middleware.js (same login as the page).

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

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

async function askGemini(env, data, mediaType) {
  const models = [...new Set([env.GEMINI_MODEL, 'gemini-2.5-flash', 'gemini-flash-latest'].filter(Boolean))];
  let last = null;
  for (const model of models) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', signal: AbortSignal.timeout(85000), // answer before Cloudflare's 100-second cut-off
      headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mediaType, data } }, { text: PROMPT }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens: 8192 },
      }),
    });
    const out = await res.json().catch(() => ({}));
    if (res.ok) {
      const parts = (((out.candidates || [])[0] || {}).content || {}).parts || [];
      return { text: parts.map(p => p.text || '').join('\n') };
    }
    const msg = (out.error && out.error.message) || `Gemini error (${res.status}).`;
    if (res.status === 429) return { error: 'Gemini\'s free daily limit is used up for now — try again later (it resets daily), or add the pieces by hand.', status: 429 };
    if (res.status === 400 && /api key/i.test(msg)) return { error: 'The Gemini API key was not accepted — check GEMINI_API_KEY in Cloudflare.', status: 502 };
    last = { error: msg, status: 502 };
    if (res.status !== 404) break; // only try the next model name when this one doesn't exist
  }
  return last || { error: 'Gemini did not answer.', status: 502 };
}

async function askClaude(env, data, mediaType) {
  const source = { type: 'base64', media_type: mediaType, data };
  const fileBlock = mediaType === 'application/pdf' ? { type: 'document', source } : { type: 'image', source };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(85000),
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.TEMPLATES_MODEL || 'claude-sonnet-5-5', max_tokens: 4096, messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: PROMPT }] }] }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return { error: (out.error && out.error.message) || `AI service error (${res.status}).`, status: 502 };
  return { text: (out.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n') };
}

// Open /templates/api/read in the browser to check the reader is deployed and which AI it will use (never shows the key).
export async function onRequestGet({ env }) {
  return json({ deployed: true, provider: env.GEMINI_API_KEY ? 'gemini' : env.ANTHROPIC_API_KEY ? 'claude' : 'none — add GEMINI_API_KEY in Cloudflare',
    model: env.GEMINI_API_KEY ? (env.GEMINI_MODEL || 'gemini-2.5-flash') : env.ANTHROPIC_API_KEY ? (env.TEMPLATES_MODEL || 'claude-sonnet-5-5') : null });
}

export async function onRequestPost(ctx) {
  try { return await handle(ctx); }
  catch (e) { return json({ error: 'crash', message: 'The reader hit an error: ' + String(e && e.message || e).slice(0, 200) }, 500); }
}

async function handle({ request, env }) {
  if (!env.GEMINI_API_KEY && !env.ANTHROPIC_API_KEY) return json({ error: 'not_configured', message: 'The AI reader is not set up yet — add the GEMINI_API_KEY secret in Cloudflare Pages → Settings → Variables and Secrets.' }, 501);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const data = String(body.data || ''), mediaType = String(body.mediaType || '');
  if (!data || !/^(image\/(jpeg|png|webp|gif)|application\/pdf)$/.test(mediaType)) return json({ error: 'bad_file', message: 'Upload a JPG, PNG, WEBP or PDF.' }, 400);
  if (data.length > 14_000_000) return json({ error: 'too_big', message: 'That file is too large — try a smaller photo or a 1–2 page PDF.' }, 413);

  let got;
  try { got = env.GEMINI_API_KEY ? await askGemini(env, data, mediaType) : await askClaude(env, data, mediaType); }
  catch (e) { return json({ error: 'network', message: e && e.name === 'TimeoutError' ? 'The AI took too long on this drawing. Try again, or try a smaller/cropped photo.' : 'Could not reach the AI service: ' + String(e && e.message || e).slice(0, 160) }, 502); }
  if (got.error) return json({ error: 'ai_error', message: got.error }, got.status || 502);
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
