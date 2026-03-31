// routes/swapTrackingRoutes.js
import express from "express";
const router = express.Router();

import {
  recordSwap,
  getWalletHistory,
  getWalletStats,
  getLeaderboard,
  getWalletRank,
  getTopPairs,
} from "../services/SwapTrackingService.js";

// ─── Helpers ───────────────────────────────────────────────────────────────
const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function isValidTxHash(v) {
  return TX_HASH_RE.test(v);
}
function isValidAddress(v) {
  return ADDRESS_RE.test(v);
}
function parseIntSafe(v, def) {
  const n = parseInt(v, 10);
  return isNaN(n) ? def : n;
}

// ─── POST /api/swap/record ─────────────────────────────────────────────────
router.post("/record", async (req, res, next) => {
  try {
    const {
      wallet_address,
      chain_id,
      sell_token_symbol,
      sell_token_address,
      buy_token_symbol,
      buy_token_address,
      sell_amount_raw,
      buy_amount_raw,
      tx_hash,
    } = req.body;

    const missing = [
      "wallet_address",
      "chain_id",
      "sell_token_symbol",
      "sell_token_address",
      "buy_token_symbol",
      "buy_token_address",
      "sell_amount_raw",
      "buy_amount_raw",
      "tx_hash",
    ].filter((k) => !req.body[k]);

    if (missing.length) {
      return res.status(400).json({
        success: false,
        code: "MISSING_FIELDS",
        message: `Missing required fields: ${missing.join(", ")}`,
      });
    }

    if (!isValidAddress(wallet_address)) {
      return res.status(422).json({
        success: false,
        code: "INVALID_ADDRESS",
        message: "Invalid wallet_address.",
      });
    }

    if (!isValidTxHash(tx_hash)) {
      return res.status(422).json({
        success: false,
        code: "INVALID_TX_HASH",
        message: "Invalid tx_hash.",
      });
    }

    const result = await recordSwap(req.body);

    return res.status(result.duplicate ? 200 : 201).json({
      success: true,
      duplicate: result.duplicate,
      data: result.swap,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/swap/history
router.get("/history", async (req, res, next) => {
  try {
    const { wallet_address, chainId, limit, offset, from, to } = req.query;

    if (!wallet_address || !isValidAddress(wallet_address)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_ADDRESS",
        message: "Valid wallet_address required.",
      });
    }

    const result = await getWalletHistory(wallet_address, {
      chainId: chainId ? parseInt(chainId, 10) : null,
      limit: parseIntSafe(limit, 20),
      offset: parseIntSafe(offset, 0),
      from,
      to,
    });

    return res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/swap/stats
router.get("/stats", async (req, res, next) => {
  try {
    const { wallet_address, from, to } = req.query;

    if (!wallet_address || !isValidAddress(wallet_address)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_ADDRESS",
        message: "Valid wallet_address required.",
      });
    }

    const stats = await getWalletStats(wallet_address, { from, to });
    return res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/swap/leaderboard
router.get("/leaderboard", async (req, res, next) => {
  try {
    const { from, to, chainId, limit, rankBy } = req.query;

    const rows = await getLeaderboard({
      from,
      to,
      chainId: chainId ? parseInt(chainId, 10) : null,
      limit: parseIntSafe(limit, 50),
      rankBy: ["volume", "count"].includes(rankBy) ? rankBy : "volume",
    });

    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/swap/rank
router.get("/rank", async (req, res, next) => {
  try {
    const { wallet_address, from, to, rankBy } = req.query;

    if (!wallet_address || !isValidAddress(wallet_address)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_ADDRESS",
        message: "Valid wallet_address required.",
      });
    }

    const result = await getWalletRank(wallet_address, {
      from,
      to,
      rankBy: ["volume", "count"].includes(rankBy) ? rankBy : "volume",
    });

    return res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/swap/top-pairs
router.get("/top-pairs", async (req, res, next) => {
  try {
    const { from, to, chainId, limit } = req.query;

    const rows = await getTopPairs({
      from,
      to,
      chainId: chainId ? parseInt(chainId, 10) : null,
      limit: parseIntSafe(limit, 10),
    });

    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

export default router;
