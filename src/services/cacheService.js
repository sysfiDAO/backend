// services/cacheService.js
import db from '../db/postgres.js';
import logger from '../utils/logger.js';

class CacheService {
  constructor() {
    this.defaultTTL = parseInt(process.env.CACHE_TTL) || 300; // 5 minutes
  }

  /**
   * Save or update DAO in database
   */
  async saveDAO(daoData) {
    try {
      const query = `
        INSERT INTO daos (
          dao_address, token_address, chain_id, chain_name, genre, genre_id,
          dao_name, image_url, threshold, quorum, voting_period_hours,
          timelock_period_hours, created_at, created_at_date, explorer, explorer_url,
          cached_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
        ON CONFLICT (dao_address, chain_id) 
        DO UPDATE SET
          token_address = EXCLUDED.token_address,
          genre = EXCLUDED.genre,
          genre_id = EXCLUDED.genre_id,
          dao_name = EXCLUDED.dao_name,
          image_url = EXCLUDED.image_url,
          threshold = EXCLUDED.threshold,
          quorum = EXCLUDED.quorum,
          voting_period_hours = EXCLUDED.voting_period_hours,
          timelock_period_hours = EXCLUDED.timelock_period_hours,
          explorer = EXCLUDED.explorer,
          explorer_url = EXCLUDED.explorer_url,
          updated_at = NOW()
        RETURNING *
      `;

      const values = [
        daoData.daoAddress,
        daoData.tokenAddress,
        daoData.chainId,
        daoData.chainName,
        daoData.genre,
        daoData.genreId,
        daoData.daoName,
        daoData.imageUrl,
        daoData.threshold,
        daoData.quorum,
        daoData.votingPeriodHours,
        daoData.timelockPeriodHours,
        daoData.createdAt,
        daoData.createdAtDate,
        daoData.explorer,
        daoData.explorerUrl,
      ];

      const result = await db.query(query, values);
      logger.debug(`DAO saved: ${daoData.daoName}`);
      return result.rows[0];
    } catch (error) {
      logger.error("Error saving DAO:", error);
      throw error;
    }
  }

  /**
   * Get all DAOs for a chain with pagination
   */
  async getDAOsByChain(chainId, offset = 0, limit = 100) {
    try {
      const query = `
        SELECT * FROM daos 
        WHERE chain_id = $1 
        ORDER BY created_at DESC 
        LIMIT $2 OFFSET $3
      `;

      const result = await db.query(query, [chainId, limit, offset]);
      logger.debug(`Retrieved ${result.rows.length} DAOs for chain ${chainId}`);
      return result.rows;
    } catch (error) {
      logger.error(`Error getting DAOs for chain ${chainId}:`, error);
      return [];
    }
  }

  /**
   * Get total DAOs count for a chain
   */
  async getTotalDAOsCount(chainId) {
    try {
      const query = "SELECT COUNT(*) as count FROM daos WHERE chain_id = $1";
      const result = await db.query(query, [chainId]);
      return parseInt(result.rows[0].count);
    } catch (error) {
      logger.error(`Error getting total DAOs for chain ${chainId}:`, error);
      return 0;
    }
  }

  /**
   * Get DAO by address and chain
   */
  async getDAOByAddress(chainId, daoAddress) {
    try {
      const query = `
        SELECT * FROM daos 
        WHERE chain_id = $1 AND dao_address = $2 
        LIMIT 1
      `;

      const result = await db.query(query, [chainId, daoAddress.toLowerCase()]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error(`Error getting DAO ${daoAddress}:`, error);
      return null;
    }
  }

  /**
   * Get DAOs by genre
   */
  async getDAOsByGenre(chainId, genreId, offset = 0, limit = 100) {
    try {
      const query = `
        SELECT * FROM daos 
        WHERE chain_id = $1 AND genre_id = $2 
        ORDER BY created_at DESC 
        LIMIT $3 OFFSET $4
      `;

      const result = await db.query(query, [chainId, genreId, limit, offset]);
      return result.rows;
    } catch (error) {
      logger.error(`Error getting DAOs by genre:`, error);
      return [];
    }
  }

  /**
   * Search DAOs by name
   */
  async searchDAOs(searchQuery, chainId = null, limit = 50) {
    try {
      let query = `
        SELECT * FROM daos 
        WHERE dao_name ILIKE $1
      `;
      const params = [`%${searchQuery}%`];

      if (chainId) {
        query += " AND chain_id = $2";
        params.push(chainId);
      }

      query += " ORDER BY created_at DESC LIMIT $" + (params.length + 1);
      params.push(limit);

      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error("Error searching DAOs:", error);
      return [];
    }
  }

  /**
   * Get all DAOs (with optional pagination)
   */
  async getAllDAOs(offset = 0, limit = 1000) {
    try {
      const query = `
        SELECT * FROM daos 
        ORDER BY created_at DESC 
        LIMIT $1 OFFSET $2
      `;

      const result = await db.query(query, [limit, offset]);
      logger.debug(`Retrieved ${result.rows.length} total DAOs`);
      return result.rows;
    } catch (error) {
      logger.error("Error getting all DAOs:", error);
      return [];
    }
  }

  /**
   * Update sync metadata
   */
  async updateSyncMetadata(
    chainId,
    chainName,
    totalDAOs,
    status = "synced",
    errorMessage = null,
  ) {
    try {
      const query = `
        INSERT INTO sync_metadata (chain_id, chain_name, total_daos, sync_status, error_message, last_sync_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT (chain_id) 
        DO UPDATE SET
          total_daos = EXCLUDED.total_daos,
          sync_status = EXCLUDED.sync_status,
          error_message = EXCLUDED.error_message,
          last_sync_at = NOW(),
          updated_at = NOW()
        RETURNING *
      `;

      const result = await db.query(query, [
        chainId,
        chainName,
        totalDAOs,
        status,
        errorMessage,
      ]);
      logger.debug(`Sync metadata updated for chain ${chainId}`);
      return result.rows[0];
    } catch (error) {
      logger.error("Error updating sync metadata:", error);
      throw error;
    }
  }

  /**
   * Get sync metadata
   */
  async getSyncMetadata(chainId) {
    try {
      const query = "SELECT * FROM sync_metadata WHERE chain_id = $1";
      const result = await db.query(query, [chainId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Error getting sync metadata for chain ${chainId}:`, error);
      return null;
    }
  }

  /**
   * Check if sync is stale (older than TTL)
   */
  async isSyncStale(chainId, ttlSeconds = 300) {
    try {
      const metadata = await this.getSyncMetadata(chainId);

      if (!metadata) return true;

      const lastSync = new Date(metadata.last_sync_at);
      const now = new Date();
      const diffSeconds = (now - lastSync) / 1000;

      return diffSeconds > ttlSeconds;
    } catch (error) {
      logger.error("Error checking sync staleness:", error);
      return true;
    }
  }

  /**
   * Delete DAOs for a chain (for testing/reset)
   */
  async deleteDAOsByChain(chainId) {
    try {
      await db.query("DELETE FROM daos WHERE chain_id = $1", [chainId]);
      logger.info(`Deleted all DAOs for chain ${chainId}`);
      return true;
    } catch (error) {
      logger.error("Error deleting DAOs:", error);
      return false;
    }
  }

  /**
   * Get DAOs created since a specific timestamp
   */
  /**
   * Get DAOs created since a specific timestamp
   * ✅ Expects sinceTimestamp in Unix SECONDS (matches created_at column).
   *    Do NOT divide — the frontend now sends seconds after the client-side fix.
   */
  async getDAOsSinceTimestamp(chainId, sinceTimestamp, limit = 100) {
    try {
      // updated_at is refreshed on every upsert (INSERT or ON CONFLICT UPDATE).
      // cached_at is only set on first INSERT and never changes — so it drifts
      // behind the client's cursor whenever the server re-indexes existing DAOs.
      // Using updated_at means any blockchain re-fetch (which touches updated_at)
      // will surface those rows to the next incremental sync.
      const query = `
        SELECT * FROM daos
        WHERE chain_id = $1
          AND updated_at > TO_TIMESTAMP($2)
        ORDER BY updated_at ASC
        LIMIT $3
      `;

      const result = await db.query(query, [chainId, sinceTimestamp, limit]);
      logger.debug(`Retrieved ${result.rows.length} new/updated DAOs since ${sinceTimestamp}`);
      return result.rows;
    } catch (error) {
      logger.error("Error getting DAOs since timestamp:", error);
      return [];
    }
  }

  /**
   * Batch save DAOs
   * ✅ Fixed: saveDAO must run on the same client as BEGIN/COMMIT,
   *    not on the pool. Pass the client through explicitly.
   */
  async batchSaveDAOs(daos) {
    const client = await db.getClient();

    try {
      await client.query("BEGIN");

      for (const dao of daos) {
        await this._saveDAOWithClient(client, dao); // ← use transaction client
      }

      await client.query("COMMIT");
      logger.success(`Batch saved ${daos.length} DAOs`);
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("Error batch saving DAOs:", error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Internal: save a single DAO using an explicit client (for transactions).
   * The public saveDAO() keeps using the pool for standalone saves.
   */
  async _saveDAOWithClient(client, daoData) {
    const query = `
    INSERT INTO daos (
      dao_address, token_address, chain_id, chain_name, genre, genre_id,
      dao_name, image_url, threshold, quorum, voting_period_hours,
      timelock_period_hours, created_at, created_at_date, explorer, explorer_url,
      cached_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),NOW())
    ON CONFLICT (dao_address, chain_id)
    DO UPDATE SET
      token_address         = EXCLUDED.token_address,
      genre                 = EXCLUDED.genre,
      genre_id              = EXCLUDED.genre_id,
      dao_name              = EXCLUDED.dao_name,
      image_url             = EXCLUDED.image_url,
      threshold             = EXCLUDED.threshold,
      quorum                = EXCLUDED.quorum,
      voting_period_hours   = EXCLUDED.voting_period_hours,
      timelock_period_hours = EXCLUDED.timelock_period_hours,
      explorer              = EXCLUDED.explorer,
      explorer_url          = EXCLUDED.explorer_url,
      updated_at            = NOW()
  `;

    const values = [
      daoData.daoAddress,
      daoData.tokenAddress,
      daoData.chainId,
      daoData.chainName,
      daoData.genre,
      daoData.genreId,
      daoData.daoName,
      daoData.imageUrl,
      daoData.threshold,
      daoData.quorum,
      daoData.votingPeriodHours,
      daoData.timelockPeriodHours,
      daoData.createdAt,
      daoData.createdAtDate,
      daoData.explorer,
      daoData.explorerUrl,
    ];

    await client.query(query, values);
  }
  /**
   * Return the latest updated_at value for a chain as Unix seconds.
   * This is the correct sync cursor: it reflects the last time any row was written,
   * which is always after (or equal to) what the query filter uses.
   */
  async getLatestUpdatedAt(chainId) {
    try {
      const result = await db.query(
        `SELECT EXTRACT(EPOCH FROM MAX(updated_at))::bigint AS ts FROM daos WHERE chain_id = $1`,
        [chainId],
      );
      return result.rows[0]?.ts ? Number(result.rows[0].ts) : 0;
    } catch (error) {
      logger.error("Error getting latest updated_at:", error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    try {
      const totalQuery = "SELECT COUNT(*) as total FROM daos";
      const chainsQuery = `
        SELECT chain_id, chain_name, COUNT(*) as count 
        FROM daos 
        GROUP BY chain_id, chain_name
      `;

      const [totalResult, chainsResult] = await Promise.all([
        db.query(totalQuery),
        db.query(chainsQuery),
      ]);

      return {
        totalDAOs: parseInt(totalResult.rows[0].total),
        byChain: chainsResult.rows,
      };
    } catch (error) {
      logger.error("Error getting stats:", error);
      return { totalDAOs: 0, byChain: [] };
    }
  }
}

export default new CacheService();