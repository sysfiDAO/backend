// config/db.js
import pkg from 'pg';
const { Pool } = pkg;
import logger from '../utils/logger.js';

class Database {
  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || '31.97.58.198',
      port: process.env.DB_PORT || 5433,
   database: process.env.DB_NAME || 'postgres', 
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'eMgZ6eInqTCghwTPxCruE3fs7utETcuSMCsAxVDUEapmLIcdD9hFv57NI45cCBvz',
      max: 20, // Maximum pool size
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('connect', () => {
      logger.success('New database connection established');
    });

    this.pool.on('error', (err) => {
      logger.error('Unexpected database error:', err);
    });
  }

  async query(text, params) {
    const start = Date.now();
    try {
      const res = await this.pool.query(text, params);
      const duration = Date.now() - start;
      logger.debug(`Query executed in ${duration}ms: ${text.substring(0, 50)}...`);
      return res;
    } catch (error) {
      logger.error('Database query error:', error);
      logger.error('Query:', text);
      logger.error('Params:', params);
      throw error;
    }
  }

  async getClient() {
    return await this.pool.connect();
  }

  async close() {
    await this.pool.end();
    logger.info('Database pool closed');
  }
}

export default new Database();