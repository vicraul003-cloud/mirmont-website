// POST /api/gcal/delete-event — removes a previously-synced calendar event.
// Called when its task is completed, reopened-and-resynced-elsewhere, or
// deleted outright. Body: { eventId: string }

import {
  getValidTokens,
  deleteCalendarEvent,
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
  if (!eventId) return jsonResponse({ error: 'missing_event_id' }, 400);

  let tokens;
  try {
    tokens = await getValidTokens(env);
  } catch (e) {
    // Not connected / needs reauth: there's nothing we can do, but the caller
    // (a task being completed/deleted) shouldn't block on this either way.
    if (e instanceof GcalNotConnectedError) return jsonResponse({ error: 'not_connected' }, 409);
    if (e instanceof GcalReauthRequiredError) return jsonResponse({ error: 'reauth_required' }, 409);
    return jsonResponse({ error: 'token_error', detail: e.message }, 500);
  }

  try {
    await deleteCalendarEvent(tokens, eventId);
    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse({ error: 'delete_failed', detail: e.message }, 502);
  }
}
