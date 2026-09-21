// GET /api/qbo/status — tells admin.html whether a QuickBooks company is
// currently connected, without exposing any tokens.

import { loadTokens, jsonResponse } from '../../_lib/qbo.js';

export async function onRequestGet(context) {
  const { env } = context;

  if (!env.QBO_KV) {
    return jsonResponse({ connected: false, configured: false });
  }

  const tokens = await loadTokens(env);
  if (!tokens) {
    return jsonResponse({ connected: false, configured: true });
  }

  return jsonResponse({
    connected: true,
    configured: true,
    realmId: tokens.realmId,
    environment: tokens.environment,
    connectedAt: tokens.connected_at
  });
}
