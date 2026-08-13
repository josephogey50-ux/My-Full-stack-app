import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import request from 'supertest';
import { startTestEnv, stopTestEnv, clearDb, extractCookies } from '../helpers/testEnv.js';

let app;
let fetchSpy;

beforeAll(async () => {
  app = await startTestEnv();
}, 60_000);

afterAll(async () => {
  if (fetchSpy) fetchSpy.mockRestore();
  await stopTestEnv();
});

beforeEach(async () => {
  await clearDb();
  // utils/utils_payments.js talks to the real Paystack REST API via the
  // global `fetch`. Stubbing it here keeps these tests hermetic (no network
  // calls, no real Paystack test-mode credentials needed) while still
  // exercising this app's own request/response handling end-to-end.
  // Left in place for the whole file (reconfigured, not restored, between
  // tests) rather than restored in afterEach — the Paystack webhook handler
  // does some of its work after the HTTP response is already sent, and
  // restoring the real `fetch` mid-suite could let that trailing work race
  // a real network call.
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (String(url).includes('/transaction/initialize')) {
      return jsonResponse({
        status: true,
        data: { authorization_url: 'https://checkout.paystack.com/fake', access_code: 'fake', reference: 'fake' }
      });
    }
    if (String(url).includes('/transaction/verify/')) {
      return jsonResponse({
        status: true,
        data: { status: 'success', amount: 10000000, channel: 'card' } // 100,000 naira in kobo
      });
    }
    throw new Error(`Unexpected fetch call in test: ${url}`);
  });
});

function jsonResponse(body) {
  return {
    ok: true,
    json: async () => body
  };
}

async function registerAndLogin() {
  const email = 'jane@example.com';
  const phone = '+2348012345678';
  await request(app).post('/api/register/step').send({
    step: 1,
    surname: 'Doe',
    firstName: 'Jane',
    emailAddress: email,
    whatsAppNumber: phone,
    accountPin: '1234',
    elapsedMs: 5000
  });
  await request(app).post('/api/register/step').send({
    step: 2,
    emailAddress: email,
    accountPin: '1234',
    emergencyContact: 'John Doe +2348000000000'
  });
  await request(app).post('/api/register/step').send({
    step: 3,
    emailAddress: email,
    accountPin: '1234',
    plan: 'Installment Plan'
  });
  const loginRes = await request(app).post('/api/login').send({ loginPhone: phone, loginPin: '1234' });
  return { cookie: extractCookies(loginRes), csrfToken: loginRes.body.csrfToken, email };
}

describe('POST /api/payments/initiate', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).post('/api/payments/initiate').send({ amount: 100000 });
    expect(res.status).toBe(401);
  });

  it('rejects an authenticated request with no CSRF token', async () => {
    const { cookie } = await registerAndLogin();
    const res = await request(app).post('/api/payments/initiate').set('Cookie', cookie).send({ amount: 100000 });
    expect(res.status).toBe(403);
  });

  it('rejects an amount below the minimum initial deposit', async () => {
    const { cookie, csrfToken } = await registerAndLogin();
    const res = await request(app)
      .post('/api/payments/initiate')
      .set('Cookie', cookie)
      .set('x-csrf-token', csrfToken)
      .send({ amount: 1000 });
    expect(res.status).toBe(400);
  });

  it('starts a payment and reserves a pending reference', async () => {
    const { cookie, csrfToken } = await registerAndLogin();
    const res = await request(app)
      .post('/api/payments/initiate')
      .set('Cookie', cookie)
      .set('x-csrf-token', csrfToken)
      .send({ amount: 100000 });
    expect(res.status).toBe(200);
    expect(res.body.authorizationUrl).toBeTruthy();
    expect(res.body.reference).toMatch(/^AKW-/);
  });
});

describe('POST /api/payments/verify/:reference', () => {
  // Regression coverage: this route used to be a plain GET, so a cross-site
  // <img>/<script> tag could trigger it (and its side effect,
  // applyConfirmedPayment) using a logged-in victim's cookies with no way to
  // prove the request came from our own frontend. It's now POST + CSRF.
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).post('/api/payments/verify/AKW-doesnotexist');
    expect(res.status).toBe(401);
  });

  it('rejects an authenticated request with no CSRF token', async () => {
    const { cookie } = await registerAndLogin();
    const res = await request(app).post('/api/payments/verify/AKW-doesnotexist').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('rejects a reference that does not belong to this participant', async () => {
    const { cookie, csrfToken } = await registerAndLogin();
    const res = await request(app)
      .post('/api/payments/verify/AKW-doesnotexist')
      .set('Cookie', cookie)
      .set('x-csrf-token', csrfToken);
    expect(res.status).toBe(404);
  });

  it('verifies a pending reference and credits the payment', async () => {
    const { cookie, csrfToken } = await registerAndLogin();
    const initiateRes = await request(app)
      .post('/api/payments/initiate')
      .set('Cookie', cookie)
      .set('x-csrf-token', csrfToken)
      .send({ amount: 100000 });
    const { reference } = initiateRes.body;

    const verifyRes = await request(app)
      .post(`/api/payments/verify/${reference}`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrfToken);
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.participant.amountPaid).toBe(100000);
  });

  it('is idempotent on a second call for the same reference', async () => {
    const { cookie, csrfToken } = await registerAndLogin();
    const initiateRes = await request(app)
      .post('/api/payments/initiate')
      .set('Cookie', cookie)
      .set('x-csrf-token', csrfToken)
      .send({ amount: 100000 });
    const { reference } = initiateRes.body;

    await request(app).post(`/api/payments/verify/${reference}`).set('Cookie', cookie).set('x-csrf-token', csrfToken);
    const secondRes = await request(app)
      .post(`/api/payments/verify/${reference}`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrfToken);
    expect(secondRes.status).toBe(200);
    expect(secondRes.body.alreadyConfirmed).toBe(true);
  });
});

describe('POST /api/payments/webhook', () => {
  it('rejects a request with a bad signature', async () => {
    const payload = JSON.stringify({ event: 'charge.success', data: { reference: 'AKW-bogus' } });
    const res = await request(app)
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', 'not-the-real-signature')
      .send(payload);
    expect(res.status).toBe(401);
  });

  it('accepts a request with a valid HMAC signature', async () => {
    const { cookie, csrfToken } = await registerAndLogin();
    const initiateRes = await request(app)
      .post('/api/payments/initiate')
      .set('Cookie', cookie)
      .set('x-csrf-token', csrfToken)
      .send({ amount: 100000 });
    const { reference } = initiateRes.body;

    const payload = JSON.stringify({ event: 'charge.success', data: { reference } });
    const signature = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(payload).digest('hex');

    const res = await request(app)
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', signature)
      .send(payload);
    expect(res.status).toBe(200);
  });
});
