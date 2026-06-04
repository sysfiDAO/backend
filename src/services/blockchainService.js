// services/blockchainService.js
import { createPublicClient, http } from 'viem';
import { SUPPORTED_CHAINS } from '../config/chains.js';
import { DAO_FACTORY_ABI, GENRE_MAP } from '../config/contracts.js';
import cacheService from './cacheService.js';
import logger from '../utils/logger.js';

class BlockchainService {
  constructor() {
    this.clients = {};
    this.eventListeners = {};
    this.isListening  = false;
    // Per-chain sync lock: prevents concurrent blockchain fetches for the same chain
    this._syncLocks = {};
    this.initializeClients();
  }

  /**
   * Initialize viem clients for all supported chains
   */
  initializeClients() {
    logger.info('Initializing blockchain clients...');
    
    Object.entries(SUPPORTED_CHAINS).forEach(([key, chainConfig]) => {
      if (!chainConfig.factoryAddress || chainConfig.factoryAddress === '0x0000000000000000000000000000000000000000') {
        logger.warn(`Skipping ${chainConfig.name} - No factory address configured`);
        return;
      }

      try {
        this.clients[chainConfig.id] = createPublicClient({
          chain: chainConfig.chain,
          transport: http(chainConfig.rpcUrl, {
            timeout:      10_000,  // abort RPC calls that take > 10 s
            retryCount:   2,       // retry transient failures twice
            retryDelay:   500,
          }),
        });
        logger.success(`Client initialized for ${chainConfig.name}`);
      } catch (error) {
        logger.error(`Failed to initialize client for ${chainConfig.name}:`, error);
      }
    });
  }

  /**
   * Get chain configuration by chain ID
   */
  getChainConfig(chainId) {
    return Object.values(SUPPORTED_CHAINS).find(chain => chain.id === chainId);
  }

  /**
   * Format DAO data from contract response
   */
  formatDAOData(daoData, chainId) {
    const chainConfig = this.getChainConfig(chainId);
    
    return {
      daoAddress: daoData.daoAddress,
      tokenAddress: daoData.tokenAddress,
      genre: GENRE_MAP[Number(daoData.genre)] || 'OTHER',
      genreId: Number(daoData.genre),
      daoName: daoData.daoName,
      imageUrl: daoData.imageUrl,
      threshold: daoData.threshold.toString(),
      quorum: Number(daoData.quorum),
      votingPeriodHours: Number(daoData.votingPeriodHours),
      timelockPeriodHours: Number(daoData.timelockPeriodHours),
      createdAt: Number(daoData.createdAt),
      createdAtDate: new Date(Number(daoData.createdAt) * 1000).toISOString(),
      chainId: chainId,
      chainName: chainConfig?.name || 'Unknown',
      explorer: chainConfig?.explorer || '',
      explorerUrl: `${chainConfig?.explorer}/address/${daoData.daoAddress}`,
    };
  }

  /**
   * Get total DAOs count for a specific chain
   */
  async getTotalDAOs(chainId) {
    try {
      const client = this.clients[chainId];
      const chainConfig = this.getChainConfig(chainId);

      if (!client || !chainConfig?.factoryAddress) {
        throw new Error(`Chain ${chainId} not configured`);
      }

      const total = await client.readContract({
        address: chainConfig.factoryAddress,
        abi: DAO_FACTORY_ABI,
        functionName: 'getTotalDAOs',
      });

      return Number(total);
    } catch (error) {
      logger.error(`Error getting total DAOs for chain ${chainId}:`, error);
      throw error;
    }
  }

  /**
   * Fetch DAOs from a specific chain with pagination.
   * Per-chain lock prevents duplicate concurrent syncs.
   */
  async fetchDAOsFromChain(chainId, offset = 0, limit = 100) {
    const chainConfig = this.getChainConfig(chainId);

    if (!chainConfig) {
      logger.warn(`Chain ${chainId} not configured, skipping`);
      return [];
    }

    // Serve from PostgreSQL if data is fresh (60 s — catches new DAOs faster).
    // But if PostgreSQL has 0 rows (e.g. after a bug cleared the table, or first
    // boot before indexing), always re-fetch from blockchain regardless of the
    // staleness timer — empty DB is never a valid cache hit.
    const isStale = await cacheService.isSyncStale(chainId, 60);
    if (!isStale) {
      const existing = await cacheService.getDAOsByChain(chainId, offset, limit);
      if (existing.length > 0) {
        logger.info(`Using cached data for ${chainConfig.name} (${existing.length} rows)`);
        return existing;
      }
      logger.warn(`${chainConfig.name}: sync is fresh but PostgreSQL is empty — forcing blockchain re-fetch`);
    }

    // If another caller is already syncing this chain, wait for it then read DB
    if (this._syncLocks[chainId]) {
      logger.info(`${chainConfig.name} sync already in progress — waiting`);
      await this._syncLocks[chainId];
      return cacheService.getDAOsByChain(chainId, offset, limit);
    }

    const client = this.clients[chainId];
    if (!client || !chainConfig.factoryAddress) {
      logger.warn(`Chain ${chainId} not properly configured`);
      return cacheService.getDAOsByChain(chainId, offset, limit);
    }

    // Acquire lock
    let resolveLock;
    this._syncLocks[chainId] = new Promise((r) => { resolveLock = r; });

    try {
      // Cap the blockchain call at 100 — contracts commonly reject larger limits
      // or return empty arrays for them. PostgreSQL serves any limit once indexed.
      const BLOCKCHAIN_PAGE = 100;
      logger.chain(chainConfig.name, `Fetching DAOs from blockchain (offset:${offset}, limit:${BLOCKCHAIN_PAGE})`);

      const daos = await client.readContract({
        address:      chainConfig.factoryAddress,
        abi:          DAO_FACTORY_ABI,
        functionName: 'getDeployedDAOs',
        args:         [BigInt(offset), BigInt(BLOCKCHAIN_PAGE)],
      });

      const formattedDAOs = daos.map((dao) => this.formatDAOData(dao, chainId));

      if (formattedDAOs.length > 0) {
        await cacheService.batchSaveDAOs(formattedDAOs);
        const total = await this.getTotalDAOs(chainId);
        await cacheService.updateSyncMetadata(chainId, chainConfig.name, total, 'synced');
        logger.success(`Fetched ${formattedDAOs.length} DAOs from ${chainConfig.name}`);
      } else {
        // Blockchain returned empty — either no DAOs or contract rejected the args.
        // Serve from PostgreSQL so we don't replace valid cached data with nothing.
        const dbRows = await cacheService.getDAOsByChain(chainId, offset, limit);
        if (dbRows.length > 0) {
          logger.warn(`${chainConfig.name}: blockchain returned 0, serving ${dbRows.length} from PostgreSQL`);
          return dbRows;
        }
        await cacheService.updateSyncMetadata(chainId, chainConfig.name, 0, 'synced');
        logger.info(`${chainConfig.name}: genuinely 0 DAOs`);
      }

      return formattedDAOs;
    } catch (error) {
      logger.error(`Error fetching DAOs from chain ${chainId}:`, error);
      return cacheService.getDAOsByChain(chainId, offset, limit);
    } finally {
      // Release lock
      delete this._syncLocks[chainId];
      resolveLock();
    }
  }

  /**
   * Fetch all DAOs from all chains
   */
  async fetchAllDAOs() {
    logger.info('Fetching DAOs from all chains...');
    const allDAOs = [];

    for (const [key, chainConfig] of Object.entries(SUPPORTED_CHAINS)) {
      if (!this.clients[chainConfig.id]) continue;

      try {
        const total = await this.getTotalDAOs(chainConfig.id);
        logger.info(`Total DAOs on ${chainConfig.name}: ${total}`);

        if (total === 0) continue;

        // Fetch in batches of 100
        let offset = 0;
        const limit = 100;

        while (offset < total) {
          const daos = await this.fetchDAOsFromChain(chainConfig.id, offset, limit);
          
          if (daos.length > 0) {
            allDAOs.push(...daos);
          }
          
          offset += limit;
          
          // Break if we got less than limit (reached the end)
          if (daos.length < limit) {
            logger.info(`Reached end of DAOs for ${chainConfig.name}`);
            break;
          }
        }
      } catch (error) {
        logger.error(`Error fetching from ${chainConfig.name}:`, error);
      }
    }

    logger.success(`Total DAOs fetched: ${allDAOs.length}`);
    return allDAOs;
  }

  /**
   * Get DAO by address and chain
   */
  async getDAOByAddress(chainId, daoAddress) {
    try {
      // ✅ Check database first
      const cachedDAO = await cacheService.getDAOByAddress(chainId, daoAddress);
      
      if (cachedDAO) {
        logger.debug(`DAO ${daoAddress} found in database`);
        return cachedDAO;
      }

      // ✅ Fetch from blockchain if not in database
      const client = this.clients[chainId];
      const chainConfig = this.getChainConfig(chainId);

      if (!client || !chainConfig?.factoryAddress) {
        throw new Error(`Chain ${chainId} not configured`);
      }

      logger.info(`Fetching DAO ${daoAddress} from blockchain...`);

      const dao = await client.readContract({
        address: chainConfig.factoryAddress,
        abi: DAO_FACTORY_ABI,
        functionName: 'getDAO',
        args: [daoAddress],
      });

      const formattedDAO = this.formatDAOData(dao, chainId);
      
      // ✅ Save to database
      await cacheService.saveDAO(formattedDAO);
      
      return formattedDAO;
    } catch (error) {
      logger.error(`Error getting DAO ${daoAddress} from chain ${chainId}:`, error);
      throw error;
    }
  }

  /**
   * Get DAOs by genre from a specific chain
   */
  async getDAOsByGenre(chainId, genreId, offset = 0, limit = 100) {
    try {
      // ✅ Try database first
      const cachedDAOs = await cacheService.getDAOsByGenre(chainId, genreId, offset, limit);
      
      if (cachedDAOs.length > 0) {
        logger.debug(`Found ${cachedDAOs.length} DAOs for genre ${genreId} in database`);
        return cachedDAOs;
      }

      // ✅ Fetch from blockchain if not in database
      const client = this.clients[chainId];
      const chainConfig = this.getChainConfig(chainId);

      if (!client || !chainConfig?.factoryAddress) {
        throw new Error(`Chain ${chainId} not configured`);
      }

      logger.info(`Fetching genre ${genreId} DAOs from blockchain...`);

      const daos = await client.readContract({
        address: chainConfig.factoryAddress,
        abi: DAO_FACTORY_ABI,
        functionName: 'getDAOsByGenre',
        args: [BigInt(genreId), BigInt(offset), BigInt(limit)],
      });

      const formattedDAOs = daos.map(dao => this.formatDAOData(dao, chainId));
      
      // ✅ Save to database
      if (formattedDAOs.length > 0) {
        await cacheService.batchSaveDAOs(formattedDAOs);
      }
      
      return formattedDAOs;
    } catch (error) {
      logger.error(`Error getting DAOs by genre from chain ${chainId}:`, error);
      throw error;
    }
  }

  /**
   * Start listening for DAOCreated events on all chains
   */
  async startEventListening() {
    if (this.isListening) {
      logger.warn('Event listening already started');
      return;
    }

    logger.info('Starting event listeners for all chains...');
    this.isListening = true;

    for (const [key, chainConfig] of Object.entries(SUPPORTED_CHAINS)) {
      const client = this.clients[chainConfig.id];
      
      if (!client || !chainConfig.factoryAddress) continue;

      try {
        // Watch for DAOCreated events
        const unwatch = client.watchContractEvent({
          address: chainConfig.factoryAddress,
          abi: DAO_FACTORY_ABI,
          eventName: 'DAOCreated',
          onLogs: async (logs) => {
            for (const log of logs) {
              await this.handleDAOCreatedEvent(log, chainConfig.id);
            }
          },
          onError: (error) => {
            logger.error(`Event listening error on ${chainConfig.name}:`, error);
          },
        });

        this.eventListeners[chainConfig.id] = unwatch;
        logger.success(`Event listener started for ${chainConfig.name}`);
      } catch (error) {
        logger.error(`Failed to start event listener for ${chainConfig.name}:`, error);
      }
    }
  }

  /**
   * Handle DAOCreated event
   */
  async handleDAOCreatedEvent(log, chainId) {
    try {
      const chainConfig = this.getChainConfig(chainId);
      const { args } = log;

      logger.chain(
        chainConfig.name,
        `New DAO created: ${args.daoName} at ${args.daoAddress}`
      );

      // ✅ Fetch and save the new DAO to database
      await this.getDAOByAddress(chainId, args.daoAddress);
      
      // ✅ Update sync metadata
      const total = await this.getTotalDAOs(chainId);
      await cacheService.updateSyncMetadata(chainId, chainConfig.name, total, 'synced');

      logger.success(`DAO ${args.daoName} saved to database`);
    } catch (error) {
      logger.error('Error handling DAOCreated event:', error);
    }
  }

  /**
   * Stop event listening
   */
  stopEventListening() {
    logger.info('Stopping event listeners...');
    
    Object.entries(this.eventListeners).forEach(([chainId, unwatch]) => {
      try {
        unwatch();
        logger.info(`Event listener stopped for chain ${chainId}`);
      } catch (error) {
        logger.error(`Error stopping listener for chain ${chainId}:`, error);
      }
    });

    this.eventListeners = {};
    this.isListening = false;
    logger.success('All event listeners stopped');
  }
}

export default new BlockchainService();