import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestEnv, stopTestEnv, clearDb, extractCookies } from '../helpers/testEnv.js';

let app;

beforeAll(async () => {
  app = await startTestEnv();
}, 60_000);

afterAll(async () => {
  await stopTestEnv();
});

beforeEach(async () => {
  await clearDb();
});

async function registerParticipant(overrides = {}) {
  return request(app).post('/api/register/step').send({
    step: 1,
    surname: 'Doe',
    firstName: 'Jane',
    emailAddress: 'jane@example.com',
    whatsAppNumber: '+2348012345678',
    accountPin: '1234',
    elapsedMs: 5000,
    ...overrides
  });
}

async function adminLogin() {
  const res = await request(app).post('/api/admin/login').send({ adminKey: 'test-admin-secret', adminName: 'Root Admin' });
  return { cookie: extractCookies(res), csrfToken: res.body.csrfToken };
}

describe('POST /api/admin/login', () => {
  it('rejects an invalid admin key', async () => {
    const res = await request(app).post('/api/admin/login').send({ adminKey: 'wrong', adminName: 'X' });
    expect(res.status).toBe(401);
  });

  it('requires an admin name', async () => {
    const res = await request(app).post('/api/admin/login').send({ adminKey: 'test-admin-secret' });
    expect(res.status).toBe(400);
  });

  it('accepts the correct shared secret and issues a session', async () => {
    const res = await request(app).post('/api/admin/login').send({ adminKey: 'test-admin-secret', adminName: 'Root Admin' });
    expect(res.status).toBe(200);
    expect(res.body.csrfToken).toBeTruthy();
    const setCookie = res.headers['set-cookie'] || [];
    expect(setCookie.some((c) => c.startsWith('akwaba_admin='))).toBe(true);
  });
});

describe('GET /api/admin/registrants', () => {
  it('rejects requests with no admin session', async () => {
    const res = await request(app).get('/api/admin/registrants');
    expect(res.status).toBe(401);
  });

  it('lists registrants for a valid admin session', async () => {
    await registerParticipant();
    const { cookie } = await adminLogin();

    const res = await request(app).get('/api/admin/registrants').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.registrants).toHaveLength(1);
    expect(res.body.registrants[0].emailAddress).toBe('jane@example.com');
  });

  // Regression coverage for the status-filter validation gap: `status` used
  // to be passed straight into the Mongo filter with no allow-list check.
  it('rejects an out-of-range status filter with 400', async () => {
    const { cookie } = await adminLogin();
    const res = await request(app).get('/api/admin/registrants?status=NotARealStatus').set('Cookie', cookie);
    expect(res.status).toBe(400);
  });

  it('accepts a valid status filter', async () => {
    await registerParticipant();
    const { cookie } = await adminLogin();
    const res = await request(app).get('/api/admin/registrants?status=Pending').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.registrants).toHaveLength(1);
  });

  it('rejects an out-of-range status filter on the CSV export route too', async () => {
    const { cookie } = await adminLogin();
    const res = await request(app).get('/api/admin/registrants/export?status=NotARealStatus').set('Cookie', cookie);
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/admin/registrants/:email/payment', () => {
  it('rejects the request without a CSRF token', async () => {
    await registerParticipant();
    const { cookie } = await adminLogin();

    const res = await request(app)
      .patch('/api/admin/registrants/jane@example.com/payment')
      .set('Cookie', cookie)
      .send({ paymentStatus: 'Paid', amountPaid: 385000 });
    expect(res.status).toBe(403);
  });

  it('updates the payment and writes an audit log entry', async () => {
    await registerParticipant();
    const { cookie, csrfToken } = await adminLogin();

    const res = await request(app)
      .patch('/api/admin/registrants/jane@example.com/payment')
      .set('Cookie', cookie)
      .set('x-csrf-token', csrfToken)
      .send({ paymentStatus: 'Paid', amountPaid: 385000 });
    expect(res.status).toBe(200);
    expect(res.body.registrant.paymentStatus).toBe('Paid');

    const auditRes = await request(app).get('/api/admin/audit-log').set('Cookie', cookie);
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.entries).toHaveLength(1);
    expect(auditRes.body.entries[0].adminName).toBe('Root Admin');
    expect(auditRes.body.entries[0].targetEmail).toBe('jane@example.com');
  });

  // Regression coverage: the frontend isn't the security boundary — an admin
  // request used to be able to set paymentStatus/amountPaid to any
  // non-negative combination, e.g. "Paid" at ₦50,000 or ₦1,000,000 on a
  // ₦385,000 trip. These lock in the invariants that closed that gap.
  describe('business invariants', () => {
    async function patchPayment(cookie, csrfToken, body) {
      return request(app)
        .patch('/api/admin/registrants/jane@example.com/payment')
        .set('Cookie', cookie)
        .set('x-csrf-token', csrfToken)
        .send(body);
    }

    it('rejects amountPaid greater than the trip total', async () => {
      await registerParticipant();
      const { cookie, csrfToken } = await adminLogin();
      const res = await patchPayment(cookie, csrfToken, { amountPaid: 1000000 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/exceed/i);
    });

    it('rejects "Paid" with less than the full trip total', async () => {
      await registerParticipant();
      const { cookie, csrfToken } = await adminLogin();
      const res = await patchPayment(cookie, csrfToken, { paymentStatus: 'Paid', amountPaid: 50000 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Paid/);
    });

    it('rejects "Partial" with amountPaid at or above the trip total', async () => {
      await registerParticipant();
      const { cookie, csrfToken } = await adminLogin();
      const res = await patchPayment(cookie, csrfToken, { paymentStatus: 'Partial', amountPaid: 385000 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Partial/);
    });

    it('rejects "Pending" with a nonzero amountPaid', async () => {
      await registerParticipant();
      const { cookie, csrfToken } = await adminLogin();
      const res = await patchPayment(cookie, csrfToken, { paymentStatus: 'Pending', amountPaid: 1 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Pending/);
    });

    it('rejects updating just amountPaid above the total when an existing status was already "Paid"', async () => {
      await registerParticipant();
      const { cookie, csrfToken } = await adminLogin();
      await patchPayment(cookie, csrfToken, { paymentStatus: 'Paid', amountPaid: 385000 });
      // Only amountPaid sent this time — the existing "Paid" status must still
      // be validated against the new (invalid) resulting amount.
      const res = await patchPayment(cookie, csrfToken, { amountPaid: 500000 });
      expect(res.status).toBe(400);
    });

    it('allows a partial refund below the current amountPaid', async () => {
      await registerParticipant();
      const { cookie, csrfToken } = await adminLogin();
      await patchPayment(cookie, csrfToken, { paymentStatus: 'Paid', amountPaid: 385000 });
      const res = await patchPayment(cookie, csrfToken, { paymentStatus: 'Refunded', amountPaid: 100000 });
      expect(res.status).toBe(200);
      expect(res.body.registrant.paymentStatus).toBe('Refunded');
    });
  });
});
