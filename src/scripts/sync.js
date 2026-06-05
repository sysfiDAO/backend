// src/scripts/sync.js
import dotenv from 'dotenv';
import blockchainService from '../services/blockchainService.js';
import logger from '../utils/logger.js';

dotenv.config();

async function syncDAOs() {
  try {
    console.log('🔄 Starting DAO sync from blockchain...');
    
    // Fetch all DAOs from all chains
    const daos = await blockchainService.fetchAllDAOs();
    
    console.log(`✅ Synced ${daos.length} DAOs to database`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Sync failed:', error);
    console.error('Full error:', error);
    process.exit(1);
  }
}

syncDAOs();