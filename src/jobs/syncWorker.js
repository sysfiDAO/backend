import { Worker } from 'bullmq';
import logger from '../utils/logger.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let worker = null;

export async function startSyncWorker() {
  const { default: blockchainService } = await import('../services/blockchainService.js');

  worker = new Worker(
    'blockchain-sync',
    async (job) => {
      const { chainId } = job.data;
      logger.info(`Sync job [${job.id}]: chain=${chainId || 'all'} attempt=${job.attemptsMade + 1}`);

      if (chainId) {
        await blockchainService.fetchDAOsForChain(chainId);
      } else {
        await blockchainService.fetchAllDAOs();
      }

      logger.success(`Sync job [${job.id}] completed`);
    },
    {
      connection: { url: REDIS_URL, maxRetriesPerRequest: null },
      concurrency: 1,
      lockDuration: 120_000,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error(`Sync job [${job?.id}] failed (attempt ${job?.attemptsMade}):`, err);
  });

  worker.on('error', (err) => {
    logger.error('Sync worker error:', err);
  });

  logger.success('BullMQ sync worker started');
  return worker;
}

export async function stopSyncWorker() {
  if (worker) {
    await worker.close();
    worker = null;
    logger.info('BullMQ sync worker stopped');
  }
}
