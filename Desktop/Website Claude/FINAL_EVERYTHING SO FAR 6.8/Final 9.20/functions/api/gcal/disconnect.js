// POST /api/gcal/disconnect — forgets the stored Google tokens. Does not
// revoke them at Google (optional future improvement), just stops using them.

import { clearTokens, jsonResponse } from '../../_lib/gcal.js';

export async function onRequestPost(context) {
  const { env } = context;
  if (env.GCAL_KV) {
    await clearTokens(env);
  }
  return jsonResponse({ ok: true });
}
