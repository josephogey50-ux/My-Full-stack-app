import pino from 'pino';

// Pretty output locally, plain JSON (log-shipper friendly) in production.
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Request/response cookies carry the JWT session and CSRF tokens — never
  // let them land in log output (local files, shipped log aggregators, etc.)
  // even though they're already httpOnly/short-lived. Applies to any log
  // line built from pino-http's req/res serializers, wherever it's emitted.
  redact: {
    paths: ['req.headers.cookie', 'res.headers["set-cookie"]', 'req.headers.authorization'],
    censor: '[redacted]'
  },
  transport: process.env.NODE_ENV === 'production'
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
});

export default logger;
