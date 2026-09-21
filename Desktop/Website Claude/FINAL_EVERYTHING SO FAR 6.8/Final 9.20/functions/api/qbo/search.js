// GET /api/qbo/search?q=... — looks up QuickBooks Estimates ("quotes") that
// match a customer name or an estimate/quote number, for the admin console's
// "Create a New Project" autofill.

import {
  getValidTokens,
  qboQuery,
  escapeQboString,
  jsonResponse,
  QboNotConnectedError,
  QboReauthRequiredError
} from '../../_lib/qbo.js';

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();

  if (!q) {
    return jsonResponse({ error: 'missing_query' }, 400);
  }
  if (q.length > 100) {
    return jsonResponse({ error: 'query_too_long' }, 400);
  }

  let tokens;
  try {
    tokens = await getValidTokens(env);
  } catch (e) {
    if (e instanceof QboNotConnectedError) return jsonResponse({ error: 'not_connected' }, 409);
    if (e instanceof QboReauthRequiredError) return jsonResponse({ error: 'reauth_required' }, 409);
    return jsonResponse({ error: 'token_error', detail: e.message }, 500);
  }

  const safe = escapeQboString(q);
  const results = [];
  const seenIds = new Set();

  const addEstimates = (queryResponse) => {
    const list = (queryResponse && queryResponse.QueryResponse && queryResponse.QueryResponse.Estimate) || [];
    for (const est of list) {
      if (seenIds.has(est.Id)) continue;
      seenIds.add(est.Id);
      results.push({
        id: est.Id,
        docNumber: est.DocNumber || '',
        customerName: (est.CustomerRef && est.CustomerRef.name) || '',
        totalAmt: typeof est.TotalAmt === 'number' ? est.TotalAmt : Number(est.TotalAmt) || 0,
        txnDate: est.TxnDate || '',
        status: est.TxnStatus || ''
      });
    }
  };

  try {
    // 1) Exact match on estimate/quote number.
    const byDoc = await qboQuery(tokens, `SELECT * FROM Estimate WHERE DocNumber = '${safe}' MAXRESULTS 5`);
    addEstimates(byDoc);

    // 2) Match by customer display name, then pull that customer's estimates.
    const byCustomer = await qboQuery(tokens, `SELECT * FROM Customer WHERE DisplayName LIKE '%${safe}%' MAXRESULTS 5`);
    const customers = (byCustomer.QueryResponse && byCustomer.QueryResponse.Customer) || [];
    for (const cust of customers) {
      const estResp = await qboQuery(
        tokens,
        `SELECT * FROM Estimate WHERE CustomerRef = '${cust.Id}' ORDERBY TxnDate DESC MAXRESULTS 5`
      );
      addEstimates(estResp);
    }
  } catch (e) {
    return jsonResponse({ error: 'query_failed', detail: e.message }, 502);
  }

  results.sort((a, b) => (b.txnDate || '').localeCompare(a.txnDate || ''));

  return jsonResponse({ results: results.slice(0, 10) });
}
