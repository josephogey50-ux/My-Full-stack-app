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

function step1Payload(overrides = {}) {
  return {
    step: 1,
    surname: 'Doe',
    firstName: 'Jane',
    emailAddress: 'jane@example.com',
    whatsAppNumber: '+2348012345678',
    accountPin: '1234',
    elapsedMs: 5000, // above MIN_FORM_FILL_MS so the bot-timing heuristic doesn't trip
    ...overrides
  };
}

async function registerStep1(overrides = {}) {
  return request(app).post('/api/register/step').send(step1Payload(overrides));
}

describe('POST /api/register/step — step 1 (profile creation)', () => {
  it('creates a new participant and advances to step 2', async () => {
    const res = await registerStep1();
    expect(res.status).toBe(201);
    expect(res.body.nextStep).toBe(2);
  });

  it('rejects a duplicate email with 409', async () => {
    await registerStep1();
    const res = await registerStep1({ whatsAppNumber: '+2348099999999' });
    expect(res.status).toBe(409);
  });

  it('rejects submissions that fail the bot-timing heuristic', async () => {
    const res = await registerStep1({ elapsedMs: 100, emailAddress: 'bot@example.com' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/register/step — steps 2 & 3 require the account PIN', () => {
  // Regression coverage for the auth gap: previously, steps 2 & 3 were
  // identified by emailAddress alone, so anyone who knew (or guessed) a
  // registrant's email could tamper with their in-progress registration.
  // routes/register.js now re-checks accountPin against the hash set at
  // step 1 before applying any step 2/3 update.
  const email = 'jane@example.com';

  beforeEach(async () => {
    await registerStep1({ emailAddress: email });
  });

  it('rejects step 2 with no PIN at all', async () => {
    const res = await request(app).post('/api/register/step').send({
      step: 2,
      emailAddress: email,
      emergencyContact: 'John Doe +2348000000000'
    });
    expect(res.status).toBe(400);
  });

  it('rejects step 2 with the wrong PIN — this is the tampering scenario', async () => {
    const res = await request(app).post('/api/register/step').send({
      step: 2,
      emailAddress: email,
      accountPin: '9999',
      emergencyContact: 'John Doe +2348000000000'
    });
    expect(res.status).toBe(401);
  });

  it('accepts step 2 with the correct PIN and advances to step 3', async () => {
    const res = await request(app).post('/api/register/step').send({
      step: 2,
      emailAddress: email,
      accountPin: '1234',
      emergencyContact: 'John Doe +2348000000000'
    });
    expect(res.status).toBe(200);
    expect(res.body.nextStep).toBe(3);
  });

  it('rejects step 3 with the wrong PIN even after step 2 succeeded', async () => {
    await request(app).post('/api/register/step').send({
      step: 2,
      emailAddress: email,
      accountPin: '1234',
      emergencyContact: 'John Doe +2348000000000'
    });
    const res = await request(app).post('/api/register/step').send({
      step: 3,
      emailAddress: email,
      accountPin: '0000',
      plan: 'Full Payment'
    });
    expect(res.status).toBe(401);
  });

  it('accepts step 3 with the correct PIN', async () => {
    await request(app).post('/api/register/step').send({
      step: 2,
      emailAddress: email,
      accountPin: '1234',
      emergencyContact: 'John Doe +2348000000000'
    });
    const res = await request(app).post('/api/register/step').send({
      step: 3,
      emailAddress: email,
      accountPin: '1234',
      plan: 'Full Payment'
    });
    expect(res.status).toBe(200);
    expect(res.body.nextStep).toBe(4);
  });
});

describe('POST /api/login', () => {
  const phone = '+2348012345678';

  beforeEach(async () => {
    await registerStep1({ whatsAppNumber: phone });
  });

  it('rejects an unknown phone number generically', async () => {
    const res = await request(app).post('/api/login').send({ loginPhone: '+2348011111111', loginPin: '1234' });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong PIN generically', async () => {
    const res = await request(app).post('/api/login').send({ loginPhone: phone, loginPin: '0000' });
    expect(res.status).toBe(401);
  });

  it('logs in with the correct phone/PIN and sets auth cookies', async () => {
    const res = await request(app).post('/api/login').send({ loginPhone: phone, loginPin: '1234' });
    expect(res.status).toBe(200);
    expect(res.body.csrfToken).toBeTruthy();
    const setCookie = res.headers['set-cookie'] || [];
    expect(setCookie.some((c) => c.startsWith('akwaba_token='))).toBe(true);
    expect(setCookie.some((c) => c.startsWith('akwaba_csrf='))).toBe(true);
  });
});

describe('GET /api/participant/me', () => {
  const phone = '+2348012345678';

  beforeEach(async () => {
    await registerStep1({ whatsAppNumber: phone });
  });

  it('rejects a request with no session cookie', async () => {
    const res = await request(app).get('/api/participant/me');
    expect(res.status).toBe(401);
  });

  it('returns the participant profile for a logged-in session', async () => {
    const loginRes = await request(app).post('/api/login').send({ loginPhone: phone, loginPin: '1234' });
    const cookie = extractCookies(loginRes);

    const res = await request(app).get('/api/participant/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.participant.emailAddress).toBe('jane@example.com');
  });
});

describe('POST /api/logout', () => {
  it('clears the auth cookies', async () => {
    const res = await request(app).post('/api/logout');
    expect(res.status).toBe(200);
    const setCookie = res.headers['set-cookie'] || [];
    // Cleared cookies are sent back with an empty value / past expiry.
    expect(setCookie.some((c) => c.startsWith('akwaba_token=;') || /akwaba_token=;/.test(c))).toBe(true);
  });
});
