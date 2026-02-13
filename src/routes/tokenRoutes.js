// routes/tokenRoutes.js
import express from "express";
import tokenController from "../controllers/tokenControllers.js";

const router = express.Router();

// Get all tokens
router.get("/", tokenController.getAllTokens);

// Get available chains
router.get("/chains", tokenController.getChains);

// Search tokens
router.get("/search", tokenController.searchTokens);

// Get tokens by chain ID
router.get("/chain/:chainId", tokenController.getTokensByChain);

// Get tokens by chain name
router.get("/chain/name/:chainName", tokenController.getTokensByChainName);

// Find token by address on specific chain
router.get(
  "/chain/:chainId/address/:address",
  tokenController.getTokenByAddress,
);

// Find token by symbol on specific chain
router.get("/chain/:chainId/symbol/:symbol", tokenController.getTokenBySymbol);

// Reload token lists (for updates)
router.post("/reload", tokenController.reloadTokens);

export default router;
