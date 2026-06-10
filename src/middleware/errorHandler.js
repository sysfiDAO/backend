import logger from '../utils/logger.js';

const IS_PROD = process.env.NODE_ENV === 'production';

// ─── Blockchain / ethers error classifier ────────────────────────────────────
const parseBridgeError = (err) => {
  const msg = err.message || '';

  if (err.code === 'ACTION_REJECTED' || err.code === 4001)
    return { statusCode: 400, message: 'User cancelled the transaction.', type: 'cancelled' };

  if (err.code === 'INSUFFICIENT_FUNDS' || msg.includes('insufficient funds'))
    return { statusCode: 400, message: 'Not enough balance for this transaction.', type: 'insufficient_funds' };

  if (err.code === 'UNPREDICTABLE_GAS_LIMIT' || msg.includes('cannot estimate gas'))
    return { statusCode: 400, message: 'Transaction would likely fail. Check your balance and inputs.', type: 'gas_error' };

  if (msg.includes('execution reverted')) {
    const reason = msg.match(/reason="([^"]+)"/)?.[1] || 'Contract rejected the transaction.';
    return { statusCode: 400, message: reason, type: 'revert' };
  }

  if (err.code === 'NETWORK_ERROR' || msg.includes('network'))
    return { statusCode: 503, message: 'Could not connect to the blockchain. Please try again.', type: 'network' };

  if (err.code === 'TIMEOUT' || msg.includes('timeout'))
    return { statusCode: 504, message: 'The RPC node timed out. Please try again.', type: 'timeout' };

  if (msg.includes('nonce too low'))
    return { statusCode: 400, message: 'Transaction nonce conflict. Please retry.', type: 'nonce' };

  return null;
};

// ─── Main error handler ───────────────────────────────────────────────────────
const errorHandler = (err, req, res, _next) => {
  // Validation / auth errors with explicit statusCode are operational — safe to expose.
  const statusCode   = err.statusCode || 500;
  const isOperational = err.isOperational === true || statusCode < 500;

  if (statusCode >= 500) {
    logger.error(`[${req.id}] ${req.method} ${req.url} → ${statusCode}`, err);
  } else {
    logger.warn(`[${req.id}] ${req.method} ${req.url} → ${statusCode}: ${err.message}`);
  }

  const bridgeError = parseBridgeError(err);
  if (bridgeError) {
    return res.status(bridgeError.statusCode).json({
      success: false,
      error: {
        message: bridgeError.message,
        type:    bridgeError.type,
        ...(!IS_PROD && { stack: err.stack }),
      },
    });
  }

  // In production, never leak internal 5xx details — return a safe generic message.
  const safeMessage = IS_PROD && !isOperational
    ? 'An internal error occurred. Please try again later.'
    : err.message || 'Internal Server Error';

  const body = {
    success: false,
    error: {
      message: safeMessage,
      ...(err.code && { code: err.code }),
      ...(err.errors && { errors: err.errors }),
      ...(!IS_PROD && { stack: err.stack }),
    },
  };

  res.status(statusCode).json(body);
};

export default errorHandler;
