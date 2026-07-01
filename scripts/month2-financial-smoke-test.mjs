const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000/api/v1';

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
  });
  const body = await response.json();
  if (!response.ok || body.success === false) {
    throw new Error(`${options.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`);
  }
  return body.data;
}

const health = await request('/health');
const login = await request('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ identifier: 'rider@evzone.local', password: 'Password123!' }),
});
const token = login.accessToken;

const topUp = await request('/wallet/top-up', {
  method: 'POST',
  headers: { authorization: `Bearer ${token}` },
  body: JSON.stringify({ amount: 5000, providerToken: 'EVZONE-DEMO-SUCCESS' }),
});

const wallet = await request('/wallet', { headers: { authorization: `Bearer ${token}` } });
const transactions = await request('/wallet/transactions', {
  headers: { authorization: `Bearer ${token}` },
});
const payments = await request('/payments', { headers: { authorization: `Bearer ${token}` } });

console.log(
  JSON.stringify(
    {
      health: health.status,
      user: login.user.email,
      topUpReference: topUp.reference,
      walletBalance: wallet.availableBalance,
      transactionCount: transactions.meta.total,
      paymentCount: payments.meta.total,
    },
    null,
    2,
  ),
);
