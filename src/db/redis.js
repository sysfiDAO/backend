import Redis from 'ioredis';
import logger from '../utils/logger.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let redis = null;

export function connectRedis() {
  if (redis) return redis;

  redis = new Redis(REDIS_URL, {
    retryStrategy(times) {
      if (times > 20) return null; // stop retrying after ~100 s of failures
      const delay = Math.min(times * 300, 10_000);
      logger.warn(`Redis retry #${times} in ${delay}ms`);
      return delay;
    },
    maxRetriesPerRequest: 3,
    reconnectOnError(err) {
      return err.message.includes('READONLY') || err.message.includes('LOADING');
    },
    connectTimeout:                10_000,
    commandTimeout:                5_000,  // fail stuck commands instead of hanging forever
    socketTimeout:                 10_000,
    keepAlive:                     10_000,
    enableOfflineQueue:            true,
    lazyConnect:                   true,
    autoResubscribe:               true,
    autoResendUnfulfilledCommands: true,
  });

  redis.on('connect',      ()    => logger.success('Redis connected'));
  redis.on('ready',        ()    => logger.debug('Redis ready'));
  redis.on('error',        (err) => logger.warn(`Redis error: ${err.message}`));
  redis.on('close',        ()    => logger.info('Redis connection closed — will retry'));
  redis.on('reconnecting', (ms)  => logger.debug(`Redis reconnecting in ${ms}ms`));
  redis.on('end',          ()    => logger.warn('Redis connection ended permanently'));

  return redis;
}

export function getRedis() {
  return redis;
}

export function getRedisPipeline() {
  return redis ? redis.pipeline() : null;
}

export async function closeRedis() {
  if (redis) {
    await redis.quit();
    redis = null;
    logger.info('Redis connection closed');
  }
}

export default { connectRedis, getRedis, closeRedis, getRedisPipeline };
