import express from 'express';
import blockchainService from '../services/blockchainService.js';
import cacheService from '../services/cacheService.js';
import logger from '../utils/logger.js';
import { SUPPORTED_CHAINS } from '../config/chains.js';

const router = express.Router();

/**
 * GET /api/daos
 * Get all DAOs from all chains
 */
router.get('/daos', async (req, res) => {
  try {
    logger.info('GET /api/daos - Fetching all DAOs');
    const daos = await blockchainService.fetchAllDAOs();
    
    res.json({
      success: true,
      count: daos.length,
      data: daos,
    });
  } catch (error) {
    logger.error('Error in GET /api/daos:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch DAOs',
      message: error.message,
    });
  }
});

/**
 * GET /api/daos/chain/:chainId
 * Get DAOs from a specific chain
 */
router.get('/daos/chain/:chainId', async (req, res) => {
  try {
    const chainId = parseInt(req.params.chainId);
    const offset = parseInt(req.query.offset) || 0;
    const limit = parseInt(req.query.limit) || 100;

    logger.info(`GET /api/daos/chain/${chainId} - offset: ${offset}, limit: ${limit}`);

    const daos = await blockchainService.fetchDAOsFromChain(chainId, offset, limit);
    
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
      error: 'Failed to fetch DAOs for chain',
      message: error.message,
    });
  }
});

/**
 * GET /api/daos/:chainId/:daoAddress
 * Get specific DAO by address and chain
 */
router.get('/daos/:chainId/:daoAddress', async (req, res) => {
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
    logger.error(`Error in GET /api/daos/${req.params.chainId}/${req.params.daoAddress}:`, error);
    res.status(404).json({
      success: false,
      error: 'DAO not found',
      message: error.message,
    });
  }
});

/**
 * GET /api/daos/genre/:chainId/:genreId
 * Get DAOs by genre from a specific chain
 */
router.get('/daos/genre/:chainId/:genreId', async (req, res) => {
  try {
    const chainId = parseInt(req.params.chainId);
    const genreId = parseInt(req.params.genreId);
    const offset = parseInt(req.query.offset) || 0;
    const limit = parseInt(req.query.limit) || 100;

    logger.info(`GET /api/daos/genre/${chainId}/${genreId}`);

    const daos = await blockchainService.getDAOsByGenre(chainId, genreId, offset, limit);
    
    res.json({
      success: true,
      chainId,
      genreId,
      count: daos.length,
      data: daos,
    });
  } catch (error) {
    logger.error(`Error in GET /api/daos/genre/${req.params.chainId}/${req.params.genreId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch DAOs by genre',
      message: error.message,
    });
  }
});

/**
 * GET /api/chains
 * Get all supported chains
 */
router.get('/chains', (req, res) => {
  try {
    const chains = Object.values(SUPPORTED_CHAINS).map(chain => ({
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
    logger.error('Error in GET /api/chains:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch chains',
      message: error.message,
    });
  }
});

/**
 * GET /api/stats
 * Get statistics about DAOs
 */
router.get('/stats', async (req, res) => {
  try {
    logger.info('GET /api/stats - Fetching statistics');
    
    const stats = {
      totalDAOs: 0,
      chainStats: [],
      cacheStats: cacheService.getStats(),
    };

    for (const [key, chainConfig] of Object.entries(SUPPORTED_CHAINS)) {
      if (!blockchainService.clients[chainConfig.id]) continue;

      try {
        const total = await blockchainService.getTotalDAOs(chainConfig.id);
        stats.totalDAOs += total;
        stats.chainStats.push({
          chainId: chainConfig.id,
          chainName: chainConfig.name,
          totalDAOs: total,
        });
      } catch (error) {
        logger.error(`Error getting stats for ${chainConfig.name}:`, error);
      }
    }

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Error in GET /api/stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
      message: error.message,
    });
  }
});

/**
 * POST /api/cache/clear
 * Clear cache (useful for debugging)
 */
router.post('/cache/clear', (req, res) => {
  try {
    logger.info('POST /api/cache/clear - Clearing cache');
    cacheService.flush();
    
    res.json({
      success: true,
      message: 'Cache cleared successfully',
    });
  } catch (error) {
    logger.error('Error in POST /api/cache/clear:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache',
      message: error.message,
    });
  }
});

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

export default router;