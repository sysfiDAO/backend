import express from 'express';
import blockchainService from '../../../services/blockchainService.js';
import cacheService from '../../../services/cacheService.js';
import { saveDAOMetadata, getDAOMetadata } from '../../../services/mongoService.js';
import {
  getDAOList,   setDAOList,   invalidateDAOList,
  getDAODetail, setDAODetail,
  getStats,     setStats,
} from '../../../services/redisService.js';
import logger from '../../../utils/logger.js';
import { SUPPORTED_CHAINS } from '../../../config/chains.js';

const router = express.Router();

function parseChainId(raw) {
  const id = parseInt(raw);
  if (isNaN(id)) throw Object.assign(new Error('Invalid chainId'), { status: 400 });
  return id;
}

function parseAddress(raw) {
  if (!raw || !/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    throw Object.assign(new Error('Invalid Ethereum address'), { status: 400 });
  }
  return raw.toLowerCase();
}

// GET /api/v1/daos
router.get('/daos', async (_req, res) => {
  try {
    const daos = await blockchainService.fetchAllDAOs();
    res.json({ success: true, count: daos.length, data: daos });
  } catch (err) {
    logger.error('GET /daos:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch DAOs' });
  }
});

// GET /api/v1/daos/sync
router.get('/daos/sync', async (req, res) => {
  try {
    const chainId = parseChainId(req.query.chainId);
    const limit   = Math.min(parseInt(req.query.limit) || 100, 500);
    const rawTs   = parseInt(req.query.lastSyncTimestamp) || 0;
    const since   = rawTs > 9_999_999_999 ? Math.floor(rawTs / 1000) : rawTs;

    await blockchainService.fetchDAOsFromChain(chainId, 0, 100);

    const [newDAOs, totalDAOs, meta, latestUpdatedAt] = await Promise.all([
      cacheService.getDAOsSinceTimestamp(chainId, since, limit),
      cacheService.getTotalDAOsCount(chainId),
      cacheService.getSyncMetadata(chainId),
      cacheService.getLatestUpdatedAt(chainId),
    ]);

    const syncTimestamp = latestUpdatedAt > 0
      ? latestUpdatedAt
      : Math.floor(Date.now() / 1000);

    res.json({
      success: true,
      data: {
        daos:            newDAOs,
        hasMore:         newDAOs.length === limit,
        totalDAOs,
        syncTimestamp,
        lastBackendSync: meta?.last_sync_at || null,
      },
    });
  } catch (err) {
    logger.error('GET /daos/sync:', err);
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/daos/register
router.post('/daos/register', async (req, res) => {
  try {
    const { daoAddress, chainId, txHash, creator, offChainData = {} } = req.body;

    if (!daoAddress || !chainId) {
      return res.status(400).json({ success: false, error: 'daoAddress and chainId are required' });
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(daoAddress)) {
      return res.status(400).json({ success: false, error: 'Invalid daoAddress format' });
    }

    const parsedChainId = parseInt(chainId);

    await saveDAOMetadata({
      daoAddress,
      chainId:     parsedChainId,
      txHash:      txHash || null,
      creator:     creator || '',
      description: offChainData.description || '',
      website:     offChainData.website     || null,
      twitter:     offChainData.twitter     || null,
      discord:     offChainData.discord     || null,
      telegram:    offChainData.telegram    || null,
    });

    let dao = null;
    try {
      dao = await blockchainService.getDAOByAddress(parsedChainId, daoAddress);
    } catch (blockchainErr) {
      logger.warn(`registerDAO: could not index ${daoAddress} from chain ${parsedChainId} — ${blockchainErr.message}`);
    }

    await invalidateDAOList(parsedChainId).catch(() => {});

    res.status(201).json({ success: true, data: dao });
  } catch (err) {
    logger.error('POST /daos/register:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/daos/chain/:chainId
router.get('/daos/chain/:chainId', async (req, res) => {
  try {
    const chainId = parseChainId(req.params.chainId);
    const offset  = parseInt(req.query.offset) || 0;
    const limit   = Math.min(parseInt(req.query.limit) || 100, 500);

    const cached = await getDAOList(chainId, offset, limit);
    if (cached) {
      return res.json({ success: true, chainId, count: cached.length, offset, limit, data: cached, source: 'redis' });
    }

    const pgDaos = await cacheService.getDAOsByChain(chainId, offset, limit);
    if (pgDaos.length > 0) {
      setDAOList(chainId, offset, limit, pgDaos).catch(() => {});
      res.json({ success: true, chainId, count: pgDaos.length, offset, limit, data: pgDaos, source: 'postgres' });

      cacheService.isSyncStale(chainId, 60).then(async (stale) => {
        if (!stale) return;
        try {
          const fresh = await blockchainService.fetchDAOsFromChain(chainId, offset, limit);
          if (fresh.length > 0) await setDAOList(chainId, offset, limit, fresh);
        } catch (bgErr) {
          logger.warn(`Background sync failed for chain ${chainId}: ${bgErr.message}`);
        }
      }).catch(() => {});

      return;
    }

    const daos = await blockchainService.fetchDAOsFromChain(chainId, offset, limit);
    if (daos.length > 0) setDAOList(chainId, offset, limit, daos).catch(() => {});

    res.json({ success: true, chainId, count: daos.length, offset, limit, data: daos, source: 'blockchain' });
  } catch (err) {
    logger.error(`GET /daos/chain/${req.params.chainId}:`, err);
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/daos/genre/:chainId/:genreId
router.get('/daos/genre/:chainId/:genreId', async (req, res) => {
  try {
    const chainId = parseChainId(req.params.chainId);
    const genreId = parseInt(req.params.genreId);
    const offset  = parseInt(req.query.offset) || 0;
    const limit   = Math.min(parseInt(req.query.limit) || 100, 500);

    if (isNaN(genreId) || genreId < 0 || genreId > 20) {
      return res.status(400).json({ success: false, error: 'Invalid genreId' });
    }

    const cacheKey = `genre-${genreId}`;
    const cached = await getDAOList(`${chainId}:${cacheKey}`, offset, limit);
    if (cached) {
      return res.json({ success: true, chainId, genreId, count: cached.length, data: cached, cached: true });
    }

    const daos = await blockchainService.getDAOsByGenre(chainId, genreId, offset, limit);
    await setDAOList(`${chainId}:${cacheKey}`, offset, limit, daos);

    res.json({ success: true, chainId, genreId, count: daos.length, data: daos });
  } catch (err) {
    logger.error('GET /daos/genre:', err);
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/daos/:chainId/:daoAddress  — must be last
router.get('/daos/:chainId/:daoAddress', async (req, res) => {
  try {
    const chainId    = parseChainId(req.params.chainId);
    const daoAddress = parseAddress(req.params.daoAddress);

    const cached = await getDAODetail(chainId, daoAddress);
    if (cached) return res.json({ success: true, data: cached, cached: true });

    const [dao, meta] = await Promise.all([
      blockchainService.getDAOByAddress(chainId, daoAddress),
      getDAOMetadata(daoAddress, chainId),
    ]);

    const merged = {
      ...dao,
      offChain: meta ? {
        description: meta.description || '',
        website:     meta.website     || null,
        twitter:     meta.twitter     || null,
        discord:     meta.discord     || null,
        telegram:    meta.telegram    || null,
        creator:     meta.creator     || null,
        txHash:      meta.txHash      || null,
      } : null,
    };

    await setDAODetail(chainId, daoAddress, merged);
    res.json({ success: true, data: merged });
  } catch (err) {
    logger.error('GET /daos detail:', err);
    res.status(err.status || 404).json({ success: false, error: err.message });
  }
});

// GET /api/v1/chains
router.get('/chains', (_req, res) => {
  const IS_PROD = process.env.NODE_ENV === 'production';
  const chains = Object.values(SUPPORTED_CHAINS)
    .filter((c) => !IS_PROD || !c.testnet)
    .map((c) => ({
      id: c.id, name: c.name, symbol: c.symbol,
      explorer: c.explorer, icon: c.icon, testnet: c.testnet,
      factoryAddress: c.factoryAddress,
    }));
  res.json({ success: true, count: chains.length, data: chains });
});

// GET /api/v1/stats
router.get('/stats', async (_req, res) => {
  try {
    const cached = await getStats();
    if (cached) return res.json({ success: true, data: cached, cached: true });

    const stats = await cacheService.getStats();
    await setStats(stats);
    res.json({ success: true, data: stats });
  } catch (err) {
    logger.error('GET /stats:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

// POST /api/v1/cache/clear
router.post('/cache/clear', async (req, res) => {
  try {
    const { chainId } = req.body;
    if (chainId) {
      await invalidateDAOList(parseInt(chainId));
    } else {
      for (const chain of Object.values(SUPPORTED_CHAINS)) {
        await invalidateDAOList(chain.id);
      }
    }
    res.json({ success: true, message: 'Redis cache cleared (PostgreSQL data untouched)' });
  } catch (err) {
    logger.error('POST /cache/clear:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
