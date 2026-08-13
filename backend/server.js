import dns from 'dns';
// Force Node.js to bypass unstable local ISP routing for cloud database clusters
dns.setServers(['8.8.8.8', '8.8.4.4']);
dns.setDefaultResultOrder('ipv4first');

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { createApp } from './app.js';
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

// Non-fatal: only the forgot-PIN email feature depends on these, so a
// missing Gmail app password shouldn't take the whole API down.
if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
  logger.warn('GMAIL_USER/GMAIL_APP_PASSWORD not set — forgot-PIN emails will fail until configured.');
}

// App assembly itself lives in app.js, kept import-safe (no process.exit,
// no Mongo connect) so tests can build one against an in-memory database
// without going through any of this file's process-level setup.
const app = createApp();

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
