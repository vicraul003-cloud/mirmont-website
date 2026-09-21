// Sends a project summary email via Resend (https://resend.com).
// POST /api/send-summary  { subject: string, text: string, html?: string }
//
// Required Cloudflare Pages environment variable:
//   RESEND_API_KEY   — your Resend API key
// Optional:
//   SUMMARY_TO_EMAIL    — defaults to victor@mirmont.info
//   SUMMARY_FROM_EMAIL  — defaults to "Mirmont Admin <onboarding@resend.dev>"
//                         (Resend's shared test domain only delivers to the
//                         email address the Resend account was signed up
//                         with — verify your own domain in Resend and set
//                         this to something like
//                         "Mirmont Admin <noreply@mirmont.info>" to send to
//                         any address.)

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  const subject = (body && body.subject || '').toString().trim();
  const text = (body && body.text || '').toString();
  const html = body && body.html ? body.html.toString() : undefined;

  if (!subject || !text) {
    return jsonResponse({ error: 'missing_fields', detail: 'subject and text are required' }, 400);
  }

  if (!env.RESEND_API_KEY) {
    return jsonResponse({ error: 'not_configured', detail: 'RESEND_API_KEY is not set on this Pages project' }, 500);
  }

  const toAddress = env.SUMMARY_TO_EMAIL || 'victor@mirmont.info';
  const fromAddress = env.SUMMARY_FROM_EMAIL || 'Mirmont Admin <onboarding@resend.dev>';

  let resp, data;
  try {
    resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [toAddress],
        subject,
        text,
        html: html || undefined
      })
    });
    data = await resp.json().catch(() => ({}));
  } catch (e) {
    return jsonResponse({ error: 'network_error', detail: e.message }, 502);
  }

  if (!resp.ok) {
    return jsonResponse({ error: 'send_failed', detail: data }, 502);
  }

  return jsonResponse({ ok: true, id: data.id, to: toAddress });
}
