// dotenv is preloaded via --import dotenv/config in package.json scripts
import cluster from 'cluster';
import { availableParallelism } from 'os';
import { createApp } from './app.js';
import blockchainService from './services/blockchainService.js';
import { connectMongoDB, getMongoDB, closeMongoDB } from './db/mongodb.js';
import { connectRedis, getRedis, closeRedis } from './db/redis.js';
import { startSyncWorker, stopSyncWorker } from './jobs/syncWorker.js';
import { closeQueues } from './jobs/queues.js';
import db from './db/postgres.js';
import logger from './utils/logger.js';

const PORT    = parseInt(process.env.PORT || '5000');
const IS_DEV = process.env.NODE_ENV !== 'production';
const _rawWorkers = parseInt(process.env.CLUSTER_WORKERS ?? '');
// Cluster is disabled in development — nodemon + 8 workers is noisy and wasteful.
// Set CLUSTER_WORKERS=N in .env (or the environment) to override in any mode.
const WORKERS = Number.isFinite(_rawWorkers) && _rawWorkers > 0
  ? _rawWorkers
  : IS_DEV ? 1 : availableParallelism();

// Only the first cluster worker (or the sole process) runs the blockchain sync + BullMQ worker.
// All other workers serve HTTP only. BullMQ uses Redis locks so a single worker is enough.
const IS_FIRST_WORKER = !cluster.isWorker || cluster.worker.id === 1;

// ─── Console helpers ──────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bright: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', blue: '\x1b[34m', magenta: '\x1b[35m',
};

function printBanner(port) {
  const env     = (process.env.NODE_ENV || 'development').toUpperCase();
  const workers = WORKERS > 1 ? ` × ${WORKERS} workers` : '';
  const lines = [
    '',
    `${C.cyan}${C.bright}  ╔══════════════════════════════════════╗${C.reset}`,
    `${C.cyan}${C.bright}  ║     NEXUS DAO INDEXER  — API v1.0    ║${C.reset}`,
    `${C.cyan}${C.bright}  ╚══════════════════════════════════════╝${C.reset}`,
    `${C.dim}  ┌─────────────────────────────────────┐${C.reset}`,
    `${C.dim}  │${C.reset}  Port    ${C.bright}${C.green}:${C.reset} ${C.bright}${port}${workers}${C.reset}`,
    `${C.dim}  │${C.reset}  Env     ${C.bright}${C.green}:${C.reset} ${C.bright}${env}${C.reset}`,
    `${C.dim}  │${C.reset}  URL     ${C.bright}${C.green}:${C.reset} ${C.cyan}http://localhost:${port}${C.reset}`,
    `${C.dim}  │${C.reset}  Health  ${C.bright}${C.green}:${C.reset} ${C.cyan}http://localhost:${port}/health${C.reset}`,
    `${C.dim}  └─────────────────────────────────────┘${C.reset}`,
    '',
  ];
  process.stdout.write(lines.join('\n') + '\n');
}

// ─── Worker process ───────────────────────────────────────────────────────────
async function startServer() {
  const app    = createApp();
  const server = app.listen(PORT, async () => {
    if (IS_FIRST_WORKER) printBanner(PORT);

    try {
      await connectMongoDB();

      try {
        const redisClient = connectRedis();
        if (redisClient && IS_FIRST_WORKER) {
          try {
            let cursor = '0';
            let flushed = 0;
            do {
              const [next, keys] = await redisClient.scan(cursor, 'MATCH', 'dao:list:*', 'COUNT', 200);
              cursor = next;
              if (keys.length) { await redisClient.del(...keys); flushed += keys.length; }
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

      if (IS_FIRST_WORKER) {
        logger.info('Performing initial DAO fetch...');
        await blockchainService.fetchAllDAOs();
        logger.success('Initial DAO fetch completed');
      }
    } catch (error) {
      logger.error('Initialization error:', error);
    }
  });

  // ─── Keep-alive tuning ──────────────────────────────────────────────────────
  server.keepAliveTimeout = 65_000;
  server.headersTimeout   = 66_000;

  // ─── Graceful shutdown ───────────────────────────────────────────────────────
  const gracefulShutdown = async (signal) => {
    logger.info(`${signal} received — shutting down gracefully`);

    server.close(async () => {
      const tasks = [closeMongoDB(), closeRedis()];
      if (IS_FIRST_WORKER) tasks.push(stopSyncWorker(), closeQueues());
      await Promise.allSettled(tasks);
      await db.close();
      logger.success('Server closed cleanly');
      process.exit(0);
    });

    setTimeout(() => { logger.error('Forced shutdown after 10 s'); process.exit(1); }, 10_000);
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
}

// ─── Primary process (cluster coordinator) ───────────────────────────────────
if (cluster.isPrimary && WORKERS > 1) {
  logger.info(`Primary ${process.pid} spawning ${WORKERS} workers`);

  for (let i = 0; i < WORKERS; i++) cluster.fork();

  let shuttingDown = false;

  cluster.on('exit', (worker, code, signal) => {
    if (shuttingDown) return;
    logger.warn(`Worker ${worker.process.pid} exited (${signal || code}) — restarting`);
    cluster.fork();
  });

  const stopCluster = (signal) => {
    shuttingDown = true;
    logger.info(`Primary received ${signal} — stopping all workers`);
    for (const w of Object.values(cluster.workers ?? {})) w.kill(signal);
  };

  process.on('SIGTERM', () => stopCluster('SIGTERM'));
  process.on('SIGINT',  () => stopCluster('SIGINT'));
} else {
  await startServer();
}
