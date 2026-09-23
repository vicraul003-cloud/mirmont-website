// GET /api/gcal/status — tells admin.html whether a Google account is
// currently connected for calendar sync, without exposing any tokens.

import { loadTokens, jsonResponse } from '../../_lib/gcal.js';

export async function onRequestGet(context) {
  const { env } = context;

  if (!env.GCAL_KV) {
    return jsonResponse({ connected: false, configured: false });
  }

  const tokens = await loadTokens(env);
  if (!tokens) {
    return jsonResponse({ connected: false, configured: true });
  }

  return jsonResponse({
    connected: true,
    configured: true,
    connectedAt: tokens.connected_at
  });
}
