import pkg from 'pg';
const { Pool } = pkg;
import logger from '../utils/logger.js';


const RETRYABLE = new Set([
  'Connection terminated unexpectedly',
  'Connection terminated',
  'read ECONNRESET',
  'write EPIPE',
  'write ECONNRESET',
  'connection not available',
  'Client has encountered a connection error',
]);

function isRetryable(err) {
  if (!err) return false;
  const msg = err.message || '';
  for (const pattern of RETRYABLE) {
    if (msg.includes(pattern)) return true;
  }
  return ['57P01', '08006', '08001', '08004'].includes(err.code);
}

class Database {
  constructor() {
    this._createPool();
  }

  _createPool() {
    this.pool = new Pool({
      host:     process.env.DB_HOST,
      port:     parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      user:     process.env.DB_USER,
      password: process.env.DB_PASSWORD,

      // DB_POOL_MAX lets you reduce the per-process cap when running cluster mode
      // (e.g. DB_POOL_MAX=4 with 4 workers keeps total PG connections ≤ 16).
      max:                         parseInt(process.env.DB_POOL_MAX || '15'),
      min:                         2,   // keep 2 warm connections to avoid cold-start latency
      idleTimeoutMillis:           30_000,
      connectionTimeoutMillis:     8_000,
      statement_timeout:           20_000,
      query_timeout:               20_000,
      keepAlive:                   true,
      keepAliveInitialDelayMillis: 10_000,

      ssl: false,
    });

    this.pool.on('connect', (client) => {
      client.query('SET statement_timeout = 20000').catch(() => {});
      logger.debug('New PG connection established');
    });

    this.pool.on('error', (err) => {
      if (isRetryable(err)) {
        logger.warn(`PG idle client dropped (${err.message}) — pool will create a fresh one`);
      } else {
        logger.error('PG pool error:', err.message);
      }
    });

    this.pool.on('remove', () => logger.debug('PG connection removed from pool'));
  }

  async query(text, params, _isRetry = false) {
    const start = Date.now();
    try {
      const res = await this.pool.query(text, params);
      const ms  = Date.now() - start;
      if (ms > 3_000) logger.warn(`Slow query (${ms}ms): ${text.substring(0, 100)}`);
      else            logger.debug(`Query ${ms}ms: ${text.substring(0, 60)}`);
      return res;
    } catch (err) {
      if (!_isRetry && isRetryable(err)) {
        logger.warn(`PG retryable error "${err.message}" — retrying once`);
        await new Promise((r) => setTimeout(r, 150));
        return this.query(text, params, true);
      }
      logger.error(`Query error — ${text.substring(0, 100)}:`, err.message);
      throw err;
    }
  }

  async getClient() {
    try {
      return await this.pool.connect();
    } catch (err) {
      if (isRetryable(err)) {
        logger.warn(`PG client checkout failed (${err.message}) — retrying`);
        await new Promise((r) => setTimeout(r, 200));
        return this.pool.connect();
      }
      throw err;
    }
  }

  async ping() {
    const res = await this.query('SELECT 1 AS ok');
    return res.rows[0]?.ok === 1;
  }

  async close() {
    await this.pool.end();
    logger.info('PG pool closed');
  }
}

export default new Database();
