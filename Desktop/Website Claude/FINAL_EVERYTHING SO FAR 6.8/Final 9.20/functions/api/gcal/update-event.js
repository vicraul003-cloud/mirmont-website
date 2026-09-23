// POST /api/gcal/update-event — updates an existing calendar event's title
// only (date/time/location left untouched). Used to mark a completed task's
// event done-looking (strikethrough title) without moving or removing it,
// and to restore the plain title if the task is reopened.
// Body: { eventId: string, title: string }

import {
  getValidTokens,
  updateCalendarEvent,
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

  const eventId = (body.eventId || '').trim();
  const title = (body.title || '').trim();
  if (!eventId) return jsonResponse({ error: 'missing_event_id' }, 400);
  if (!title) return jsonResponse({ error: 'missing_title' }, 400);

  let tokens;
  try {
    tokens = await getValidTokens(env);
  } catch (e) {
    // Not connected / needs reauth: there's nothing we can do, but the caller
    // (a task being completed/reopened) shouldn't block on this either way.
    if (e instanceof GcalNotConnectedError) return jsonResponse({ error: 'not_connected' }, 409);
    if (e instanceof GcalReauthRequiredError) return jsonResponse({ error: 'reauth_required' }, 409);
    return jsonResponse({ error: 'token_error', detail: e.message }, 500);
  }

  try {
    await updateCalendarEvent(tokens, eventId, { title });
    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse({ error: 'update_failed', detail: e.message }, 502);
  }
}
