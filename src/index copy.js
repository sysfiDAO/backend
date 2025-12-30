// ⚠️ CRITICAL: Load dotenv FIRST, before ANY imports
import dotenv from 'dotenv';
dotenv.config();

// NOW import everything else
import express from 'express';
import cors from 'cors';
import daoRoutes from './routes/daoRoutes.js';
import blockchainService from './services/blockchainService.js';
import logger from './utils/logger.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Mount routes
app.use('/api', daoRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Multi-Chain DAO Indexer API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      allDAOs: '/api/daos',
      chainDAOs: '/api/daos/chain/:chainId',
      specificDAO: '/api/daos/:chainId/:daoAddress',
      genreDAOs: '/api/daos/genre/:chainId/:genreId',
      chains: '/api/chains',
      stats: '/api/stats',
      clearCache: 'POST /api/cache/clear',
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.path,
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Initialize server
const server = app.listen(PORT, async () => {
  logger.success(`Server is running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  
  try {
    // Initial fetch of all DAOs
    logger.info('Performing initial DAO fetch...');
    await blockchainService.fetchAllDAOs();
    logger.success('Initial DAO fetch completed');

    // Start event listeners
    logger.info('Starting blockchain event listeners...');
    await blockchainService.startEventListening();
    logger.success('Event listeners started successfully');
  } catch (error) {
    logger.error('Error during initialization:', error);
  }
});

// Graceful shutdown
const gracefulShutdown = () => {
  logger.info('Received shutdown signal, closing server gracefully...');
  
  // Stop event listeners
  blockchainService.stopEventListening();
  
  server.close(() => {
    logger.success('Server closed successfully');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});