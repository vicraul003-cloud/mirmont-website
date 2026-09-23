// POST /api/gcal/create-event — creates an all-day event on the connected
// Google account's primary calendar for a CRM task's due date. Called by
// admin.html right after a task with a due date is saved.
//
// Body: { title: string, date: 'YYYY-MM-DD', notes?: string, location?: string }
// Response: { eventId: string } on success

import {
  getValidTokens,
  createCalendarEvent,
  jsonResponse,
  GcalNotConnectedError,
  GcalReauthRequiredError
} from '../../_lib/gcal.js';

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'invalid_body' }, 400);
  }

  const title = (body.title || '').trim();
  const date = (body.date || '').trim();
  const notes = (body.notes || '').trim();
  const location = (body.location || '').trim();

  if (!title) return jsonResponse({ error: 'missing_title' }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return jsonResponse({ error: 'invalid_date' }, 400);

  let tokens;
  try {
    tokens = await getValidTokens(env);
  } catch (e) {
    if (e instanceof GcalNotConnectedError) return jsonResponse({ error: 'not_connected' }, 409);
    if (e instanceof GcalReauthRequiredError) return jsonResponse({ error: 'reauth_required' }, 409);
    return jsonResponse({ error: 'token_error', detail: e.message }, 500);
  }

  try {
    const event = await createCalendarEvent(tokens, { title, date, notes, location });
    return jsonResponse({ eventId: event.id });
  } catch (e) {
    return jsonResponse({ error: 'create_failed', detail: e.message }, 502);
  }
}
