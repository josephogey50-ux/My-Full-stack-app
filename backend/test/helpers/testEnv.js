import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../../app.js';
import { initPaymentConfig } from '../../utils/utils_payments.js';

// ─── Shared integration-test bootstrap ───
// Route logic (routes/*.js) reads secrets/config straight from process.env,
// exactly as it does in production — so rather than mocking that away, tests
// set real (dummy) values for the same env vars server.js requires, point
// MONGO_URI at an in-memory MongoDB instance via mongodb-memory-server, and
// build the app the same way createApp() does for the real server. This
// exercises the actual middleware stack (CORS, cookies, CSRF, rate limits)
// end-to-end instead of just unit-testing handler functions in isolation.
let mongoServer;

export async function startTestEnv() {
  process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-prod';
  process.env.ADMIN_API_KEY = 'test-admin-secret';
  process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
  process.env.PAYSTACK_SECRET_KEY = 'sk_test_dummy';
  process.env.PAYMENT_CALLBACK_URL = 'http://localhost:5173/dashboard';
  process.env.TRIP_TOTAL_AMOUNT_NGN = '385000';
  process.env.MIN_INITIAL_DEPOSIT_NGN = '100000';
  process.env.NODE_ENV = 'test';

  initPaymentConfig();

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  return createApp();
}

export async function stopTestEnv() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
}

export async function clearDb() {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}

// ─── Cookie-jar helper for supertest ───
// supertest doesn't persist cookies between requests the way a browser
// would, and this app's auth is entirely cookie-based (httpOnly JWT +
// double-submit CSRF cookie). Parses Set-Cookie headers from a response and
// returns a Cookie header value to attach to the next request.
export function extractCookies(res) {
  const setCookie = res.headers['set-cookie'] || [];
  return setCookie.map((c) => c.split(';')[0]).join('; ');
}

export function mergeCookies(...cookieStrings) {
  const jar = new Map();
  for (const str of cookieStrings) {
    if (!str) continue;
    for (const pair of str.split(';')) {
      const trimmed = pair.trim();
      if (!trimmed) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      jar.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
    }
  }
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}
