const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000/api/v1';

async function request(path, options = {}, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok || body?.success === false) {
    throw new Error(`${options.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`);
  }
  return body && typeof body === 'object' && 'data' in body ? body.data : body;
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const login = await request('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ identifier: 'admin@evzone.local', password: 'Password123!' }),
});
expect(login.accessToken, 'Admin login did not return an access token');
const token = login.accessToken;

const [cashouts, payouts, payments, revenue, revenueSummary, settlements] = await Promise.all([
  request('/admin-finance/cashouts', {}, token),
  request('/admin-finance/payouts', {}, token),
  request('/admin-finance/payments', {}, token),
  request('/admin-finance/revenue', {}, token),
  request('/admin-finance/revenue/summary', {}, token),
  request('/admin-finance/settlements', {}, token),
]);

expect(Array.isArray(cashouts.items), 'Cashouts response is invalid');
expect(Array.isArray(payouts.items), 'Payouts response is invalid');
expect(Array.isArray(payments.items), 'Payments response is invalid');
expect(typeof revenue.totalRevenue === 'number', 'Revenue response is invalid');
expect(typeof revenueSummary.totalRevenue === 'number', 'Revenue summary response is invalid');
expect(Array.isArray(settlements.items), 'Settlements response is invalid');

const suffix = Date.now().toString(36).toUpperCase();
const startOfMonth = new Date();
startOfMonth.setDate(1);
const endOfMonth = new Date(startOfMonth);
endOfMonth.setMonth(endOfMonth.getMonth() + 1);
endOfMonth.setDate(0);

const createdSettlement = await request(
  '/admin-finance/settlements',
  {
    method: 'POST',
    body: JSON.stringify({
      periodStart: startOfMonth.toISOString().slice(0, 10),
      periodEnd: endOfMonth.toISOString().slice(0, 10),
      currency: 'UGX',
      totalAmount: 0,
      totalCount: 0,
      provider: 'mock',
    }),
  },
  token,
);
expect(createdSettlement.id, 'Settlement batch creation failed');
expect(createdSettlement.status === 'PENDING', 'Settlement batch did not start as PENDING');

const postedSettlement = await request(
  `/admin-finance/settlements/${createdSettlement.id}/post`,
  { method: 'PATCH' },
  token,
);
expect(postedSettlement.status === 'POSTED', 'Settlement batch posting failed');

const reconciliations = await request('/admin-finance/wallet-reconciliation', {}, token);
expect(Array.isArray(reconciliations.items), 'Wallet reconciliation list response is invalid');

const createdReconciliation = await request(
  '/admin-finance/wallet-reconciliation',
  {
    method: 'POST',
    body: JSON.stringify({
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      type: 'WALLET',
      currency: 'UGX',
    }),
  },
  token,
);
expect(createdReconciliation.id, 'Wallet reconciliation creation failed');

const reconciliationDetail = await request(
  `/admin-finance/wallet-reconciliation/${createdReconciliation.id}`,
  {},
  token,
);
expect(reconciliationDetail.id === createdReconciliation.id, 'Wallet reconciliation detail failed');

console.log(
  JSON.stringify(
    {
      version: '10.0.0',
      counts: {
        cashouts: cashouts.items.length,
        payouts: payouts.items.length,
        payments: payments.items.length,
        settlements: settlements.items.length,
        reconciliations: reconciliations.items.length,
      },
      revenue,
      created: {
        settlementId: createdSettlement.id,
        reconciliationId: createdReconciliation.id,
      },
    },
    null,
    2,
  ),
);
