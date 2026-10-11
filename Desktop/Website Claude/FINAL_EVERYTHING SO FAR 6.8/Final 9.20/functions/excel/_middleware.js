// Password-protects everything under /excel/ with HTTP Basic Auth.
// Set these in Cloudflare Pages → Settings → Variables and Secrets (Production):
//   EXCEL_USERNAME   e.g. mirmont
//   EXCEL_PASSWORD   (mark as "Secret"/encrypted)
// Optional: EXCEL_USERS = "name1:pass1,name2:pass2" to allow more than one login.

const REALM = 'Mirmont Excel';

function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(String(a));
  const y = enc.encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i] || 0) ^ (y[i] || 0);
  }
  return diff === 0;
}

function allowedLogins(env) {
  const list = [];
  if (env.EXCEL_USERNAME && env.EXCEL_PASSWORD) {
    list.push([env.EXCEL_USERNAME, env.EXCEL_PASSWORD]);
  }
  if (env.EXCEL_USERS) {
    for (const pair of String(env.EXCEL_USERS).split(',')) {
      const i = pair.indexOf(':');
      if (i > 0) list.push([pair.slice(0, i).trim(), pair.slice(i + 1).trim()]);
    }
  }
  return list;
}

function challenge() {
  return new Response('Login required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const logins = allowedLogins(env);

  // Fail closed: if no login has been configured, nobody gets in.
  if (logins.length === 0) {
    return new Response('This page is not set up yet.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const header = request.headers.get('Authorization') || '';
  const [scheme, encoded] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'basic' || !encoded) return challenge();

  let decoded = '';
  try {
    decoded = new TextDecoder().decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0)));
  } catch {
    return challenge();
  }
  const sep = decoded.indexOf(':');
  if (sep < 0) return challenge();
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);

  let ok = false;
  for (const [u, p] of logins) {
    // Check every entry (no early exit) to keep timing uniform.
    if (timingSafeEqual(user, u) & timingSafeEqual(pass, p)) ok = true;
  }
  if (!ok) return challenge();

  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'private, no-store');
  out.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return out;
}
