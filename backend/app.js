import crypto from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import registerRoutes from './routes/register.js';
import adminRoute from './routes/admin.js';
import paymentsRoutes, { paystackWebhook } from './routes/payments.js';
import publicRoutes from './routes/public.js';
import logger from './utils/logger.js';

// ─── Express app assembly, separated from server.js ───
// server.js owns process-level concerns (env var checks, dotenv, the Mongo
// connection, listen(), graceful shutdown) — none of which a test should
// trigger just to exercise routes. This module only builds the `app` and
// reads process.env at call time (not at import time beyond what the
// individual middlewares below need), so tests can set env vars and import
// this directly with an in-memory Mongo connection of their own.
export function createApp() {
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
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
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

  // ─── Health check ───
  app.get('/', (req, res) => {
    const dbConnected = mongoose.connection.readyState === 1;
    res.status(dbConnected ? 200 : 503).json({
      status: dbConnected ? 'ok' : 'degraded',
      database: dbConnected ? 'connected' : 'disconnected'
    });
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

  return app;
}
