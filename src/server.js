// dotenv is preloaded via --import dotenv/config in package.json scripts
import { createApp } from './app.js';
import blockchainService from './services/blockchainService.js';
import { connectMongoDB, getMongoDB, closeMongoDB } from './db/mongodb.js';
import { connectRedis, getRedis, closeRedis } from './db/redis.js';
import { startSyncWorker, stopSyncWorker } from './jobs/syncWorker.js';
import { closeQueues } from './jobs/queues.js';
import db from './db/postgres.js';
import logger from './utils/logger.js';

const PORT = parseInt(process.env.PORT || '5000');

// ─── Console helpers ──────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bright: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', blue: '\x1b[34m', magenta: '\x1b[35m',
};

function printBanner(port) {
  const env = (process.env.NODE_ENV || 'development').toUpperCase();
  const lines = [
    '',
    `${C.cyan}${C.bright}  ╔══════════════════════════════════════╗${C.reset}`,
    `${C.cyan}${C.bright}  ║     NEXUS DAO INDEXER  — API v1.0    ║${C.reset}`,
    `${C.cyan}${C.bright}  ╚══════════════════════════════════════╝${C.reset}`,
    `${C.dim}  ┌─────────────────────────────────────┐${C.reset}`,
    `${C.dim}  │${C.reset}  Port    ${C.bright}${C.green}:${C.reset} ${C.bright}${port}${C.reset}`,
    `${C.dim}  │${C.reset}  Env     ${C.bright}${C.green}:${C.reset} ${C.bright}${env}${C.reset}`,
    `${C.dim}  │${C.reset}  URL     ${C.bright}${C.green}:${C.reset} ${C.cyan}http://localhost:${port}${C.reset}`,
    `${C.dim}  │${C.reset}  Health  ${C.bright}${C.green}:${C.reset} ${C.cyan}http://localhost:${port}/health${C.reset}`,
    `${C.dim}  └─────────────────────────────────────┘${C.reset}`,
    '',
  ];
  process.stdout.write(lines.join('\n') + '\n');
}

async function getServiceStatuses() {
  const [pg, redis, mongo] = await Promise.all([
    db.ping().then(() => true).catch(() => false),
    Promise.resolve(getRedis()?.status === 'ready'),
    Promise.resolve((() => { try { getMongoDB().command({ ping: 1 }); return true; } catch { return false; } })()),
  ]);
  return { pg, redis, mongo };
}

function statusIcon(ok) {
  return ok ? `${C.green}● UP${C.reset}` : `${C.red}● DOWN${C.reset}`;
}

async function printStatus() {
  const s        = await getServiceStatuses();
  const mem      = process.memoryUsage();
  const heapMB   = (mem.heapUsed / 1024 / 1024).toFixed(1);
  const rssMB    = (mem.rss       / 1024 / 1024).toFixed(1);
  const uptimeSec = Math.floor(process.uptime());
  const h  = String(Math.floor(uptimeSec / 3600)).padStart(2, '0');
  const m  = String(Math.floor((uptimeSec % 3600) / 60)).padStart(2, '0');
  const sc = String(uptimeSec % 60).padStart(2, '0');
  const overall = s.pg && s.redis && s.mongo;

  const lines = [
    `${C.dim}────────────────────────────────────────────────────────${C.reset}`,
    `  ${C.bright}STATUS${C.reset}  ${overall ? `${C.green}${C.bright}ALL HEALTHY${C.reset}` : `${C.red}${C.bright}DEGRADED${C.reset}`}   ` +
      `port ${C.bright}${C.cyan}${PORT}${C.reset}   uptime ${C.bright}${h}:${m}:${sc}${C.reset}   heap ${C.bright}${heapMB} MB${C.reset} / rss ${C.bright}${rssMB} MB${C.reset}`,
    `  ${C.dim}PostgreSQL${C.reset} ${statusIcon(s.pg)}   ` +
      `${C.dim}Redis${C.reset} ${statusIcon(s.redis)}   ` +
      `${C.dim}MongoDB${C.reset} ${statusIcon(s.mongo)}   ` +
      `${C.dim}${new Date().toLocaleTimeString()}${C.reset}`,
    `${C.dim}────────────────────────────────────────────────────────${C.reset}`,
  ];
  process.stdout.write(lines.join('\n') + '\n');
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
const app = createApp();
let statusInterval = null;

const server = app.listen(PORT, async () => {
  printBanner(PORT);

  try {
    await connectMongoDB();

    try {
      const redisClient = connectRedis();
      if (redisClient) {
        try {
          let cursor = '0';
          let flushed = 0;
          do {
            const [next, keys] = await redisClient.scan(cursor, 'MATCH', 'dao:list:*', 'COUNT', 200);
            cursor = next;
            if (keys.length) {
              await redisClient.del(...keys);
              flushed += keys.length;
            }
          } while (cursor !== '0');
          if (flushed) logger.info(`Flushed ${flushed} stale dao:list:* Redis key(s) on startup`);
        } catch (flushErr) {
          logger.warn('Redis flush on startup failed (non-fatal):', flushErr.message);
        }

        try {
          await startSyncWorker();
        } catch (workerErr) {
          logger.warn('BullMQ sync worker failed to start (non-fatal):', workerErr.message);
        }
      }
    } catch (redisErr) {
      logger.warn('Redis unavailable — continuing without cache or queue:', redisErr.message);
    }

    logger.info('Performing initial DAO fetch...');
    await blockchainService.fetchAllDAOs();
    logger.success('Initial DAO fetch completed');
  } catch (error) {
    logger.error('Initialization error:', error);
  }

  await printStatus();
  statusInterval = setInterval(printStatus, 30_000);
});

// ─── Keep-alive tuning ────────────────────────────────────────────────────────
server.keepAliveTimeout = 65_000;
server.headersTimeout   = 66_000;

// ─── Graceful shutdown ────────────────────────────────────────────────────────
const gracefulShutdown = async (signal) => {
  if (statusInterval) clearInterval(statusInterval);
  logger.info(`${signal} received — shutting down gracefully`);

  server.close(async () => {
    await Promise.allSettled([
      stopSyncWorker(),
      closeQueues(),
      closeMongoDB(),
      closeRedis(),
    ]);
    logger.success('Server closed cleanly');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown after 10 s');
    process.exit(1);
  }, 10_000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
});
