// POST /api/qbo/disconnect — forgets the stored QuickBooks tokens. Does not
// revoke them at Intuit (optional future improvement), just stops using them.

import { clearTokens, jsonResponse } from '../../_lib/qbo.js';

export async function onRequestPost(context) {
  const { env } = context;
  if (env.QBO_KV) {
    await clearTokens(env);
  }
  return jsonResponse({ ok: true });
}
