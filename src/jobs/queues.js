import { Queue } from 'bullmq';
import logger from '../utils/logger.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const connection = {
  url: REDIS_URL,
  maxRetriesPerRequest: null,
};

let syncQueue      = null;
let feedQueue      = null;
let syncQueueEvents = null;

export function getSyncQueue() {
  if (!syncQueue) {
    syncQueue = new Queue('blockchain-sync', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 50 },
        removeOnFail:     { count: 100 },
      },
    });
    logger.info('BullMQ: blockchain-sync queue ready');
  }
  return syncQueue;
}

export function getFeedQueue() {
  if (!feedQueue) {
    feedQueue = new Queue('feed-scoring', {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 3_000 },
        removeOnComplete: { count: 20 },
        removeOnFail:     { count: 50 },
      },
    });
    logger.info('BullMQ: feed-scoring queue ready');
  }
  return feedQueue;
}

export async function scheduleSyncJob(chainId = null, delaySecs = 0) {
  const queue = getSyncQueue();
  return queue.add(
    chainId ? `sync-chain-${chainId}` : 'sync-all',
    { chainId },
    { delay: delaySecs * 1000 },
  );
}

export async function closeQueues() {
  await Promise.allSettled([
    syncQueue?.close(),
    feedQueue?.close(),
    syncQueueEvents?.close(),
  ]);
  syncQueue       = null;
  feedQueue       = null;
  syncQueueEvents = null;
}
