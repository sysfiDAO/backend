import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import config from "../config/config.js";

// ES modules don't have __dirname, so we need to create it
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class TokenParser {
  constructor() {
    this.tokensCache = {};
    this.loadAllTokens();
  }

  // Load all token files into memory
  loadAllTokens() {
    config.tokenLists.forEach((listName) => {
      try {
        const filePath = path.join(__dirname, `../tokens/${listName}.json`);
        if (fs.existsSync(filePath)) {
          const tokens = JSON.parse(fs.readFileSync(filePath, "utf8"));
          this.tokensCache[listName] = tokens;
          console.log(
            `✅ Loaded ${tokens.length} tokens from ${listName}.json`,
          );
        } else {
          console.warn(`⚠️  Token file not found: ${listName}.json`);
          this.tokensCache[listName] = [];
        }
      } catch (error) {
        console.error(`❌ Error loading ${listName}.json:`, error.message);
        this.tokensCache[listName] = [];
      }
    });
  }

  // Get all tokens
  getAllTokens() {
    const allTokens = [];
    Object.values(this.tokensCache).forEach((tokens) => {
      allTokens.push(...tokens);
    });
    return allTokens;
  }

  // Get tokens by chain ID
  getTokensByChain(chainId) {
    const chainName = config.chains[chainId];
    if (!chainName) {
      return [];
    }
    return this.tokensCache[chainName] || [];
  }

  // Get tokens by chain name
  getTokensByChainName(chainName) {
    return this.tokensCache[chainName] || [];
  }

  // Search tokens across all chains
  searchTokens(query, chainId = null) {
    const lowerQuery = query.toLowerCase();
    let tokens = chainId ? this.getTokensByChain(chainId) : this.getAllTokens();

    return tokens.filter(
      (token) =>
        token.symbol.toLowerCase().includes(lowerQuery) ||
        token.name.toLowerCase().includes(lowerQuery) ||
        token.address.toLowerCase().includes(lowerQuery),
    );
  }

  // Find token by address
  findTokenByAddress(address, chainId) {
    const tokens = this.getTokensByChain(chainId);
    return tokens.find(
      (token) => token.address.toLowerCase() === address.toLowerCase(),
    );
  }

  // Find token by symbol
  findTokenBySymbol(symbol, chainId) {
    const tokens = this.getTokensByChain(chainId);
    return tokens.find(
      (token) => token.symbol.toLowerCase() === symbol.toLowerCase(),
    );
  }

  // Reload token lists (useful for updates)
  reload() {
    this.tokensCache = {};
    this.loadAllTokens();
  }
}

export default new TokenParser();
