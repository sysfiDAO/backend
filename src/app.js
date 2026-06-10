import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
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
  const app = express();
  const IS_PROD = process.env.NODE_ENV === 'production';

  app.set('trust proxy', IS_PROD ? 1 : false);
  app.set('etag', 'weak');

  // ─── Request ID ─────────────────────────────────────────────────────────────
  app.use(requestId);

  // ─── Security headers ────────────────────────────────────────────────────────
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: IS_PROD,
      hsts: IS_PROD
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
    }),
  );

  // ─── CORS ────────────────────────────────────────────────────────────────────
  const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:3000', 'http://localhost:8081', 'http://localhost:19000'];

  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        cb(new Error('Not allowed by CORS'));
      },
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
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

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
  // Must intercept res.end() — res.on('finish') fires after headers are flushed
  // and calling setHeader() there throws ERR_HTTP_HEADERS_SENT.
  app.use((req, res, next) => {
    const start    = process.hrtime.bigint();
    const origEnd  = res.end.bind(res);
    res.end = (...args) => {
      if (!res.headersSent) {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        res.setHeader('X-Response-Time', `${ms.toFixed(2)}ms`);
      }
      return origEnd(...args);
    };
    next();
  });

  // ─── Rate limiting ────────────────────────────────────────────────────────────
  const keyByUidOrIp = (req) => req.uid || ipKeyGenerator(req);

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

  app.use('/api', generalLimiter);
  app.use('/api/v1/daos/sync', syncLimiter);
  app.use('/api/v1/daos/register', writeLimiter);
  app.use('/api/v1/chat', writeLimiter);
  app.use('/api/v1/mint', mintLimiter);

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
      .json({ success: healthy, services: { pg, mongo, redis }, uptime: Math.floor(process.uptime()) });
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
