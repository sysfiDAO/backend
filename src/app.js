import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import slowDown from 'express-slow-down';
import pinoHttp from 'pino-http';

import { requestId } from './middleware/requestId.js';
import { hppMiddleware, sanitizeMiddleware } from './middleware/sanitize.js';
import errorHandler from './middleware/errorHandler.js';

import v1Router from './api/v1/index.js';
import logger from './utils/logger.js';
import db from './db/postgres.js';
import { getRedis } from './db/redis.js';
import { getMongoDB } from './db/mongodb.js';

export function createApp() {
  const app    = express();
  const IS_PROD = process.env.NODE_ENV === 'production';

  // Trust one proxy hop in production (nginx/load-balancer → correct req.ip for rate limits).
  app.set('trust proxy', IS_PROD ? 1 : false);
  app.set('etag', 'weak');

  // ─── Request ID ─────────────────────────────────────────────────────────────
  app.use(requestId);

  // ─── Security headers ────────────────────────────────────────────────────────
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: IS_PROD
        ? {
            directives: {
              defaultSrc:      ["'none'"],
              connectSrc:      ["'self'"],
              frameSrc:        ["'none'"],
              objectSrc:       ["'none'"],
              scriptSrc:       ["'none'"],
              styleSrc:        ["'none'"],
              imgSrc:          ["'none'"],
              formAction:      ["'none'"],
              frameAncestors:  ["'none'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
      hsts: IS_PROD
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
    }),
  );

  // Permissions-Policy — disable every powerful browser feature (pure API server).
  app.use((_req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    );
    next();
  });

  // ─── CORS ────────────────────────────────────────────────────────────────────
  // Open to all origins. origin: true reflects the request Origin back so that
  // credentials: true still works (browsers block credentials with origin: '*').
  app.use(
    cors({
      origin: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Chain-Id'],
      exposedHeaders: ['X-Request-ID', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
      credentials: true,
      maxAge: 86_400,
    }),
  );

  // ─── Compression ─────────────────────────────────────────────────────────────
  app.use(
    compression({
      level: 6,
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
      },
    }),
  );

  // ─── Body parsing ─────────────────────────────────────────────────────────────
  // Default: 50 kb. Upload/guild routes that accept larger payloads override this
  // at the router level with express.json({ limit: '100kb' }).
  app.use(express.json({ limit: '50kb' }));
  app.use(express.urlencoded({ extended: true, limit: '50kb' }));

  // ─── Input sanitisation ───────────────────────────────────────────────────────
  app.use(hppMiddleware);
  app.use(sanitizeMiddleware);

  // ─── HTTP request logging ─────────────────────────────────────────────────────
  app.use(
    pinoHttp({
      logger: logger.raw,
      customProps: (req) => ({ requestId: req.id }),
      customLogLevel: (_req, res) => {
        if (res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      serializers: {
        req: (req) => ({ method: req.method, url: req.url, id: req.id }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  // ─── Response-time header ─────────────────────────────────────────────────────
  app.use((req, res, next) => {
    const start   = process.hrtime.bigint();
    const origEnd = res.end.bind(res);
    res.end = (...args) => {
      if (!res.headersSent) {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        res.setHeader('X-Response-Time', `${ms.toFixed(2)}ms`);
      }
      return origEnd(...args);
    };
    next();
  });

  // ─── Rate limiting + slow-down ────────────────────────────────────────────────
  // keyByUidOrIp: prefer authenticated UID (set by auth middleware on guarded routes)
  // so authenticated users have their own bucket rather than sharing an IP bucket.
  const keyByUidOrIp = (req) => req.uid || ipKeyGenerator(req);

  // Slow-down: gradually adds delay before the hard rate-limit kicks in.
  const generalSlowDown = slowDown({
    windowMs: 60_000,
    delayAfter: 80,           // start delaying after 80 req/min
    delayMs: (hits) => (hits - 80) * 100, // +100 ms per excess request
    keyGenerator: keyByUidOrIp,
  });

  const generalLimiter = rateLimit({
    windowMs: 60_000, max: 120, keyGenerator: keyByUidOrIp,
    standardHeaders: true, legacyHeaders: false,
    message: { success: false, error: 'Too many requests, slow down.' },
  });

  const writeLimiter = rateLimit({
    windowMs: 60_000, max: 20, keyGenerator: keyByUidOrIp,
    standardHeaders: true, legacyHeaders: false,
    message: { success: false, error: 'Too many write requests, slow down.' },
  });

  const syncLimiter = rateLimit({
    windowMs: 60_000, max: 10, keyGenerator: keyByUidOrIp,
    standardHeaders: true, legacyHeaders: false,
    message: { success: false, error: 'Sync rate limit reached.' },
  });

  const mintLimiter = rateLimit({
    windowMs: 60_000, max: 5, keyGenerator: keyByUidOrIp,
    standardHeaders: true, legacyHeaders: false,
    message: { success: false, error: 'Mint rate limit reached.' },
  });

  app.use('/api', generalSlowDown, generalLimiter);
  app.use('/api/v1/daos/sync',     syncLimiter);
  app.use('/api/v1/daos/register', writeLimiter);
  app.use('/api/v1/chat',          writeLimiter);
  app.use('/api/v1/mint',          mintLimiter);

  // ─── Request timeout (30 s) ───────────────────────────────────────────────────
  app.use((req, res, next) => {
    res.setTimeout(30_000, () => {
      if (!res.headersSent) {
        res.status(503).json({ success: false, error: 'Request timeout' });
      }
    });
    next();
  });

  // ─── Versioned API routes ─────────────────────────────────────────────────────
  app.use('/api/v1', v1Router);

  // ─── Health & root ────────────────────────────────────────────────────────────
  app.get('/health', async (_req, res) => {
    const [pg, mongo, redis] = await Promise.all([
      db.ping().then(() => true).catch(() => false),
      getMongoDB()?.command({ ping: 1 }).then(() => true).catch(() => false) ?? false,
      Promise.resolve(getRedis()?.status === 'ready'),
    ]);
    const healthy = pg && mongo;
    res
      .status(healthy ? 200 : 503)
      .set('Cache-Control', 'no-store')
      .json({
        success:  healthy,
        services: { pg, mongo, redis },
        uptime:   Math.floor(process.uptime()),
        pid:      process.pid,
      });
  });

  app.get('/', (_req, res) => {
    res.json({
      success: true,
      message: 'Nexus DAO Indexer API',
      version: '1.0.0',
      env: process.env.NODE_ENV || 'development',
    });
  });

  // ─── 404 ─────────────────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Route not found' });
  });

  // ─── CORS error ───────────────────────────────────────────────────────────────
  app.use((err, _req, res, next) => {
    if (err.message === 'Not allowed by CORS') {
      return res.status(403).json({ success: false, error: 'CORS policy violation' });
    }
    next(err);
  });

  // ─── Global error handler ─────────────────────────────────────────────────────
  app.use(errorHandler);

  return app;
}
