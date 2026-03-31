// middleware/errorHandler.js
import logger from "../utils/logger.js";

// ─── Bridge / ethers.js error classifier ─────────────────────────────────────
const parseBridgeError = (err) => {
  const msg = err.message || "";

  if (err.code === "ACTION_REJECTED" || err.code === 4001)
    return {
      statusCode: 400,
      message: "User cancelled the transaction.",
      type: "cancelled",
    };

  if (err.code === "INSUFFICIENT_FUNDS" || msg.includes("insufficient funds"))
    return {
      statusCode: 400,
      message: "Not enough balance for this transaction.",
      type: "insufficient_funds",
    };

  if (
    err.code === "UNPREDICTABLE_GAS_LIMIT" ||
    msg.includes("cannot estimate gas")
  )
    return {
      statusCode: 400,
      message: "Transaction would likely fail. Check your balance and inputs.",
      type: "gas_error",
    };

  if (msg.includes("execution reverted")) {
    const reason =
      msg.match(/reason="([^"]+)"/)?.[1] ||
      "Contract rejected the transaction.";
    return { statusCode: 400, message: reason, type: "revert" };
  }

  if (err.code === "NETWORK_ERROR" || msg.includes("network"))
    return {
      statusCode: 503,
      message: "Could not connect to the blockchain. Please try again.",
      type: "network",
    };

  if (err.code === "TIMEOUT" || msg.includes("timeout"))
    return {
      statusCode: 504,
      message: "The RPC node timed out. Please try again.",
      type: "timeout",
    };

  if (msg.includes("nonce too low"))
    return {
      statusCode: 400,
      message: "Transaction nonce conflict. Please retry.",
      type: "nonce",
    };

  return null;
};

// ─── Main error handler ───────────────────────────────────────────────────────
const errorHandler = (err, req, res, next) => {
  logger.error("Error:", err);

  const bridgeError = parseBridgeError(err);
  if (bridgeError) {
    return res.status(bridgeError.statusCode).json({
      success: false,
      error: {
        message: bridgeError.message,
        type: bridgeError.type,
        ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
      },
    });
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    },
  });
};

export default errorHandler;
