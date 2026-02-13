export default {
  port: process.env.PORT || 5000,
  mongoUri:
    process.env.MONGODB_URI || "mongodb://localhost:27017/crypto-wallet",
  nodeEnv: process.env.NODE_ENV || "development",
   oxApiKey: process.env.OX_API_KEY,
  feeWallet: process.env.FEE_WALLET,
  feePercentage: 0.003,
  rpcUrl: process.env.RPC_URL,
  port: process.env.PORT || 3000,
  slippagePercentage: 0.005,

  // Chain IDs mapping
  chains: {
    1: "mainnet",
    56: "bnb",
    137: "polygon",
    8453: "base",
    42161: "arbitrum",
    10: "optimism",
    43114: "avalanche",
    42220: "celo",
    11155111: "sepolia", // ← Ethereum Sepolia testnet
    84532: "base-sepolia", // ← Base Sepolia testnet
    81457: "blast",
    324: "zksync",
    480: "worldchain",
    7777777: "zora",
    5000: "mantle",
  },

  // Available token lists
  tokenLists: [
    "mainnet",
    "bnb",
    "polygon",
    "base",
    "arbitrum",
    "optimism",
    "avalanche",
    "celo",
    "sepolia", // ← Add this
    "base-sepolia", // ← Add this
    "blast",
    "zksync",
    "worldchain",
    "zora",
    "mantle",
  ],
};
