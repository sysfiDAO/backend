import { createPublicClient, http } from 'viem';
import { SUPPORTED_CHAINS } from '../config/chains.js';
import { DAO_FACTORY_ABI, GENRE_MAP, PAYMENT_METHOD_MAP } from '../config/contracts.js';
import cacheService from './cacheService.js';
import logger from '../utils/logger.js';

class BlockchainService {
  constructor() {
    this.clients = {};
    this.eventListeners = {};
    this.isListening = false;
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
          transport: http(chainConfig.rpcUrl),
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
    const cacheKey = `total_daos_${chainId}`;
    const cached = cacheService.get(cacheKey);
    if (cached !== null) return cached;

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

      const totalNumber = Number(total);
      cacheService.set(cacheKey, totalNumber, 60); // Cache for 1 minute
      return totalNumber;
    } catch (error) {
      logger.error(`Error getting total DAOs for chain ${chainId}:`, error);
      throw error;
    }
  }

  /**
   * Fetch DAOs from a specific chain with pagination
   */
  async fetchDAOsFromChain(chainId, offset = 0, limit = 100) {
    const cacheKey = `daos_${chainId}_${offset}_${limit}`;
    const cached = cacheService.get(cacheKey);
    if (cached !== null) return cached;

    try {
      const client = this.clients[chainId];
      const chainConfig = this.getChainConfig(chainId);

      if (!client || !chainConfig?.factoryAddress) {
        logger.warn(`Chain ${chainId} not configured, skipping...`);
        return [];
      }

      logger.chain(chainConfig.name, `Fetching DAOs (offset: ${offset}, limit: ${limit})`);

      const daos = await client.readContract({
        address: chainConfig.factoryAddress,
        abi: DAO_FACTORY_ABI,
        functionName: 'getDeployedDAOs',
        args: [BigInt(offset), BigInt(limit)],
      });

      const formattedDAOs = daos.map(dao => this.formatDAOData(dao, chainId));
      
      cacheService.set(cacheKey, formattedDAOs);
      logger.success(`Fetched ${formattedDAOs.length} DAOs from ${chainConfig.name}`);
      
      return formattedDAOs;
    } catch (error) {
      logger.error(`Error fetching DAOs from chain ${chainId}:`, error);
      return [];
    }
  }

  /**
   * Fetch all DAOs from all chains
   */
 /**
 * Fetch all DAOs from all chains
 */
async fetchAllDAOs() {
  const cacheKey = 'all_daos';
  const cached = cacheService.get(cacheKey);
  if (cached !== null) {
    logger.info('Returning cached all DAOs');
    return cached;
  }

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

      while (offset < total) {  // ✅ Check against total
        const daos = await this.fetchDAOsFromChain(chainConfig.id, offset, limit);
        
        // ✅ Only add if we got results
        if (daos.length > 0) {
          allDAOs.push(...daos);
        }
        
        offset += limit;
        
        // ✅ Break if we got less than limit (reached the end)
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
  cacheService.set(cacheKey, allDAOs);
  return allDAOs;
}

  /**
   * Get DAO by address and chain
   */
  async getDAOByAddress(chainId, daoAddress) {
    const cacheKey = `dao_${chainId}_${daoAddress}`;
    const cached = cacheService.get(cacheKey);
    if (cached !== null) return cached;

    try {
      const client = this.clients[chainId];
      const chainConfig = this.getChainConfig(chainId);

      if (!client || !chainConfig?.factoryAddress) {
        throw new Error(`Chain ${chainId} not configured`);
      }

      const dao = await client.readContract({
        address: chainConfig.factoryAddress,
        abi: DAO_FACTORY_ABI,
        functionName: 'getDAO',
        args: [daoAddress],
      });

      const formattedDAO = this.formatDAOData(dao, chainId);
      cacheService.set(cacheKey, formattedDAO);
      
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
    const cacheKey = `daos_genre_${chainId}_${genreId}_${offset}_${limit}`;
    const cached = cacheService.get(cacheKey);
    if (cached !== null) return cached;

    try {
      const client = this.clients[chainId];
      const chainConfig = this.getChainConfig(chainId);

      if (!client || !chainConfig?.factoryAddress) {
        throw new Error(`Chain ${chainId} not configured`);
      }

      const daos = await client.readContract({
        address: chainConfig.factoryAddress,
        abi: DAO_FACTORY_ABI,
        functionName: 'getDAOsByGenre',
        args: [BigInt(genreId), BigInt(offset), BigInt(limit)],
      });

      const formattedDAOs = daos.map(dao => this.formatDAOData(dao, chainId));
      cacheService.set(cacheKey, formattedDAOs);
      
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

      // Invalidate caches
      cacheService.delete('all_daos');
      cacheService.delete(`total_daos_${chainId}`);
      
      // Fetch and cache the new DAO details
      await this.getDAOByAddress(chainId, args.daoAddress);

      logger.success(`DAO ${args.daoName} cached successfully`);
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