import dns from 'dns';
import crypto from 'crypto';
// Force Node.js to bypass unstable local ISP routing for cloud database clusters
dns.setServers(['8.8.8.8', '8.8.4.4']);
dns.setDefaultResultOrder('ipv4first');

import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import registerRoutes from './routes/register.js';
import adminRoute from './routes/admin.js';
import paymentsRoutes, { paystackWebhook } from './routes/payments.js';
import publicRoutes from './routes/public.js';
import { initPaymentConfig } from './utils/utils_payments.js';
import logger from './utils/logger.js';

dotenv.config();

// utils/utils_payments.js computed TRIP_TOTAL_NAIRA / MIN_INITIAL_DEPOSIT_NGN
// from process.env the moment it was first imported above — but ES module
// imports are hoisted, so that happened before this file's own dotenv.config()
// call ran, meaning those two would be NaN in local dev (where env values only
// live in .env, not the OS environment) if left alone. initPaymentConfig()
// recomputes them now that dotenv.config() has actually run; every place that
// reads TRIP_TOTAL_NAIRA/MIN_INITIAL_DEPOSIT_NGN does so via a live module
// binding, so this refresh is visible everywhere without re-importing anything.
initPaymentConfig();

// ── Fail loudly on missing secrets/config rather than silently running incorrectly ──
['MONGO_URI', 'JWT_SECRET', 'ADMIN_API_KEY', 'ALLOWED_ORIGINS', 'PAYSTACK_SECRET_KEY', 'PAYMENT_CALLBACK_URL', 'TRIP_TOTAL_AMOUNT_NGN'].forEach((key) => {
  if (!process.env[key]) {
    logger.fatal(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
});
if (!Number.isFinite(Number(process.env.TRIP_TOTAL_AMOUNT_NGN)) || Number(process.env.TRIP_TOTAL_AMOUNT_NGN) <= 0) {
  logger.fatal('TRIP_TOTAL_AMOUNT_NGN must be a positive number.');
  process.exit(1);
}

const app = express();

// Render sits behind a reverse proxy — needed for express-rate-limit and
// req.ip to see the real client IP instead of Render's proxy IP.
app.set('trust proxy', 1);

app.use(helmet());

// Per-request logging with a request ID (X-Request-Id if the caller/proxy
// sent one, otherwise generated) so a single request's log lines can be
// correlated across the stack.
app.use(pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existing = req.headers['x-request-id'];
    if (existing) return existing;
    const id = crypto.randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  }
}));

// ── CORS: only the configured frontend origin(s), not the whole internet ──
// Fail-safe default: an empty/misconfigured allow-list means "reject every
// browser cross-origin request," never "allow every origin." ALLOWED_ORIGINS
// is enforced as a required env var above, so this is defense-in-depth for
// the case where it's set but empty/whitespace after parsing.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  logger.fatal('ALLOWED_ORIGINS resolved to zero valid origins after parsing. Refusing to start with an open CORS policy.');
  process.exit(1);
}

app.use(cors({
  origin: (origin, callback) => {
    // Requests with no Origin header (server-to-server calls, curl, native
    // apps) aren't subject to browser CORS enforcement in the first place —
    // this check only ever gates browser cross-origin requests.
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  // Auth lives in httpOnly cookies now, not a bearer header — the browser
  // only attaches/accepts those on cross-origin fetches when both sides opt
  // in: this flag on the server, and `credentials: 'include'` on the client.
  // Requires an explicit origin above; can't be combined with origin: '*'.
  credentials: true
}));

// ── Paystack webhook: needs the raw body to verify the HMAC signature, so
// it's mounted BEFORE express.json() ever touches the request. ──
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), paystackWebhook);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Light global ceiling against blunt abuse; /api/login has its own tighter limiter.
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
}));

// Routes
app.use('/api', registerRoutes);
app.use('/api/admin', adminRoute);
app.use('/api/payments', paymentsRoutes);
app.use('/api/public', publicRoutes);

// Health check
app.get('/', (req, res) => {
  res.send('Akwaba 001 API is running ✅');
});

// 404 for anything that didn't match a route above
app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// Fallback error handler (e.g. CORS rejection above, or any uncaught error)
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed.' });
  }
  (req.log || logger).error({ err }, 'Unhandled error');
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(500).json({ error: 'Internal Server Error', ...(isDev && { details: err.message }) });
});

// MongoDB Connection + Server Start
let server;
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    logger.info('MongoDB connected');
    const port = process.env.PORT || 5000;
    server = app.listen(port, () => {
      logger.info(`Server running on port ${port}`);
    });
  })
  .catch((err) => {
    logger.fatal({ err }, 'MongoDB connection error');
    process.exit(1);
  });

// ── Graceful shutdown ──
// Render (and most orchestrators) send SIGTERM before killing the process
// on redeploy/scale-down. Without this, in-flight requests get dropped and
// the Mongo connection is torn down uncleanly instead of closed.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down gracefully`);

  const forceExitTimer = setTimeout(() => {
    logger.warn('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  const closeServer = server
    ? new Promise((resolve) => server.close(resolve))
    : Promise.resolve();

  closeServer
    .then(() => mongoose.connection.close(false))
    .then(() => {
      logger.info('Shutdown complete');
      clearTimeout(forceExitTimer);
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
