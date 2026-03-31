// routes/daoRoutes.js
import express from "express";
import blockchainService from "../services/blockchainService.js";
import cacheService from "../services/cacheService.js";
import logger from "../utils/logger.js";
import { SUPPORTED_CHAINS } from "../config/chains.js";

const router = express.Router();

// ============================================================
// ✅ ROUTE ORDER MATTERS IN EXPRESS — most specific routes first,
//    wildcard/dynamic routes last.
// ============================================================

/**
 * GET /api/health
 * Health check endpoint
 */
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * GET /api/daos
 * Get all DAOs from all chains
 */
router.get("/daos", async (req, res) => {
  try {
    logger.info("GET /api/daos - Fetching all DAOs");
    const daos = await blockchainService.fetchAllDAOs();

    res.json({
      success: true,
      count: daos.length,
      data: daos,
    });
  } catch (error) {
    logger.error("Error in GET /api/daos:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch DAOs",
      message: error.message,
    });
  }
});

/**
 * GET /api/daos/sync
 * Incremental sync - only returns DAOs created/updated after lastSyncTimestamp
 * ✅ Must be before /daos/:chainId/:daoAddress to avoid being caught by wildcard
 */
router.get("/daos/sync", async (req, res) => {
  try {
    const { chainId, lastSyncTimestamp, limit = 100 } = req.query;

    if (!chainId) {
      return res
        .status(400)
        .json({ success: false, error: "chainId is required" });
    }

    const parsedChainId = parseInt(chainId);
    const parsedLimit = parseInt(limit);

    // ✅ Input is already Unix seconds from the client — use directly.
    //    Guard: if someone passes ms by mistake (13 digits), normalize it.
    const rawTs = parseInt(lastSyncTimestamp) || 0;
    const sinceSeconds =
      rawTs > 9_999_999_999 ? Math.floor(rawTs / 1000) : rawTs;

    logger.info(
      `GET /api/daos/sync - chainId: ${parsedChainId}, since: ${sinceSeconds}`,
    );

    // ✅ Trigger a fresh blockchain fetch before querying the DB.
    //    This is what actually picks up newly deployed DAOs.
    //    fetchDAOsFromChain has its own staleness guard so it won't
    //    hammer the RPC on every sync poll.
    await blockchainService.fetchDAOsFromChain(parsedChainId, 0, 100);

    const newDAOs = await cacheService.getDAOsSinceTimestamp(
      parsedChainId,
      sinceSeconds,
      parsedLimit,
    );
    const totalDAOs = await cacheService.getTotalDAOsCount(parsedChainId);
    const syncMetadata = await cacheService.getSyncMetadata(parsedChainId);

    logger.info(
      `Sync result: ${newDAOs.length} new DAOs found since ${sinceSeconds}`,
    );

    res.json({
      success: true,
      data: {
        daos: newDAOs,
        hasMore: newDAOs.length === parsedLimit,
        totalDAOs,
        syncTimestamp: Math.floor(Date.now() / 1000), // ✅ seconds, not ms
        lastBackendSync: syncMetadata?.last_sync_at || null,
      },
    });
  } catch (error) {
    logger.error("Error in GET /api/daos/sync:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/daos/chain/:chainId
 * Get DAOs from a specific chain
 * ✅ Must be before /daos/:chainId/:daoAddress
 */
router.get("/daos/chain/:chainId", async (req, res) => {
  try {
    const chainId = parseInt(req.params.chainId);
    const offset = parseInt(req.query.offset) || 0;
    const limit = parseInt(req.query.limit) || 100;

    logger.info(
      `GET /api/daos/chain/${chainId} - offset: ${offset}, limit: ${limit}`,
    );

    const daos = await blockchainService.fetchDAOsFromChain(
      chainId,
      offset,
      limit,
    );

    res.json({
      success: true,
      chainId,
      count: daos.length,
      offset,
      limit,
      data: daos,
    });
  } catch (error) {
    logger.error(`Error in GET /api/daos/chain/${req.params.chainId}:`, error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch DAOs for chain",
      message: error.message,
    });
  }
});

/**
 * GET /api/daos/genre/:chainId/:genreId
 * Get DAOs by genre from a specific chain
 * ✅ Must be before /daos/:chainId/:daoAddress
 */
router.get("/daos/genre/:chainId/:genreId", async (req, res) => {
  try {
    const chainId = parseInt(req.params.chainId);
    const genreId = parseInt(req.params.genreId);
    const offset = parseInt(req.query.offset) || 0;
    const limit = parseInt(req.query.limit) || 100;

    logger.info(`GET /api/daos/genre/${chainId}/${genreId}`);

    const daos = await blockchainService.getDAOsByGenre(
      chainId,
      genreId,
      offset,
      limit,
    );

    res.json({
      success: true,
      chainId,
      genreId,
      count: daos.length,
      data: daos,
    });
  } catch (error) {
    logger.error(
      `Error in GET /api/daos/genre/${req.params.chainId}/${req.params.genreId}:`,
      error,
    );
    res.status(500).json({
      success: false,
      error: "Failed to fetch DAOs by genre",
      message: error.message,
    });
  }
});

/**
 * GET /api/daos/:chainId/:daoAddress
 * Get specific DAO by address and chain
 * ✅ Wildcard route — must be LAST among /daos/* routes
 */
router.get("/daos/:chainId/:daoAddress", async (req, res) => {
  try {
    const chainId = parseInt(req.params.chainId);
    const { daoAddress } = req.params;

    logger.info(`GET /api/daos/${chainId}/${daoAddress}`);

    const dao = await blockchainService.getDAOByAddress(chainId, daoAddress);

    res.json({
      success: true,
      data: dao,
    });
  } catch (error) {
    logger.error(
      `Error in GET /api/daos/${req.params.chainId}/${req.params.daoAddress}:`,
      error,
    );
    res.status(404).json({
      success: false,
      error: "DAO not found",
      message: error.message,
    });
  }
});

/**
 * GET /api/chains
 * Get all supported chains
 */
router.get("/chains", (req, res) => {
  try {
    const chains = Object.values(SUPPORTED_CHAINS).map((chain) => ({
      id: chain.id,
      name: chain.name,
      symbol: chain.symbol,
      explorer: chain.explorer,
      icon: chain.icon,
      testnet: chain.testnet,
      factoryAddress: chain.factoryAddress,
    }));

    res.json({
      success: true,
      count: chains.length,
      data: chains,
    });
  } catch (error) {
    logger.error("Error in GET /api/chains:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch chains",
      message: error.message,
    });
  }
});

/**
 * GET /api/stats
 * Get statistics about DAOs
 */
router.get("/stats", async (req, res) => {
  try {
    logger.info("GET /api/stats - Fetching statistics");

    const stats = await cacheService.getStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error("Error in GET /api/stats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch statistics",
      message: error.message,
    });
  }
});

/**
 * POST /api/cache/clear
 * Clear cache (useful for debugging)
 */
router.post("/cache/clear", async (req, res) => {
  try {
    const { chainId } = req.body;

    logger.info(`POST /api/cache/clear - chainId: ${chainId || "all"}`);

    if (chainId) {
      await cacheService.deleteDAOsByChain(parseInt(chainId));
    } else {
      // Clear all chains
      for (const chain of Object.values(SUPPORTED_CHAINS)) {
        await cacheService.deleteDAOsByChain(chain.id);
      }
    }

    res.json({
      success: true,
      message: "Cache cleared successfully",
    });
  } catch (error) {
    logger.error("Error in POST /api/cache/clear:", error);
    res.status(500).json({
      success: false,
      error: "Failed to clear cache",
      message: error.message,
    });
  }
});

export default router;
