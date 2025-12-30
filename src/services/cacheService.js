import NodeCache from 'node-cache';
import logger from '../utils/logger.js';

class CacheService {
  constructor() {
    // Initialize cache with TTL from env or default to 5 minutes
    this.cache = new NodeCache({
      stdTTL: parseInt(process.env.CACHE_TTL) || 300,
      checkperiod: parseInt(process.env.CACHE_CHECK_PERIOD) || 60,
      useClones: false,
    });

    this.cache.on('set', (key, value) => {
      logger.debug(`Cache SET: ${key}`);
    });

    this.cache.on('del', (key) => {
      logger.debug(`Cache DEL: ${key}`);
    });

    this.cache.on('expired', (key, value) => {
      logger.debug(`Cache EXPIRED: ${key}`);
    });
  }

  /**
   * Get value from cache
   */
  get(key) {
    try {
      const value = this.cache.get(key);
      if (value !== undefined) {
        logger.debug(`Cache HIT: ${key}`);
        return value;
      }
      logger.debug(`Cache MISS: ${key}`);
      return null;
    } catch (error) {
      logger.error(`Cache GET error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value in cache
   */
  set(key, value, ttl = null) {
    try {
      if (ttl) {
        this.cache.set(key, value, ttl);
      } else {
        this.cache.set(key, value);
      }
      logger.debug(`Cache SET: ${key}`);
      return true;
    } catch (error) {
      logger.error(`Cache SET error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  delete(key) {
    try {
      this.cache.del(key);
      logger.debug(`Cache DELETE: ${key}`);
      return true;
    } catch (error) {
      logger.error(`Cache DELETE error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Clear all cache
   */
  flush() {
    try {
      this.cache.flushAll();
      logger.info('Cache flushed');
      return true;
    } catch (error) {
      logger.error('Cache FLUSH error:', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return this.cache.getStats();
  }

  /**
   * Get all keys
   */
  getKeys() {
    return this.cache.keys();
  }

  /**
   * Check if key exists
   */
  has(key) {
    return this.cache.has(key);
  }
}

export default new CacheService();