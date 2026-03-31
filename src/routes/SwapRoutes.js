import express from "express";
const router = express.Router();

import {
  getPrice,
  getQuote,
  getTokens,
} from "../controllers/swapController.js";

// GET /api/swap/tokens?chainId=1&search=ETH
router.get("/tokens", getTokens);

// GET /api/swap/price?chainId=1&sellToken=ETH&buyToken=USDC&sellAmount=1000000000000000000
router.get("/price", getPrice);

// GET /api/swap/quote?chainId=1&sellToken=ETH&buyToken=USDC&sellAmount=1000000000000000000&takerAddress=0x...
router.get("/quote", getQuote);

export default router;
