// controllers/swapControllers.js
import axios from "axios";

import mainnetTokens from "../tokenLists/mainnet.js";
import polygonTokens from "../tokenLists/polygon.js";
import bnbTokens from "../tokenLists/bnb.js";
import arbitrumTokens from "../tokenLists/arbitrum.js";
import baseTokens from "../tokenLists/base.js";
import mantleTokens from "../tokenLists/mantle.js";
import avalancheTokens from "../tokenLists/avalanche.js";

// ─── Fee Configuration ────────────────────────────────────────────────────────
const FEE_RECIPIENT = "0xed60b71CEEEF9D25Ebda1C7465ad19Fc41D3A90c";
const SWAP_FEE_BPS = 30;

const ZERO_EX_BASE_URL = "https://api.0x.org";
const ZERO_EX_PRICE_PATH = "/swap/allowance-holder/price";
const ZERO_EX_QUOTE_PATH = "/swap/allowance-holder/quote";

const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

// ─── Native token definitions ─────────────────────────────────────────────────
const NATIVE_TOKENS = {
  1: {
    name: "Ether",
    symbol: "ETH",
    address: NATIVE_TOKEN_ADDRESS,
    decimals: 18,
    chainId: 1,
    isNative: true,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  },
  137: {
    name: "POL",
    symbol: "POL",
    address: NATIVE_TOKEN_ADDRESS,
    decimals: 18,
    chainId: 137,
    isNative: true,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png",
  },
  56: {
    name: "BNB",
    symbol: "BNB",
    address: NATIVE_TOKEN_ADDRESS,
    decimals: 18,
    chainId: 56,
    isNative: true,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png",
  },
  42161: {
    name: "Ether",
    symbol: "ETH",
    address: NATIVE_TOKEN_ADDRESS,
    decimals: 18,
    chainId: 42161,
    isNative: true,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  },
  8453: {
    name: "Ether",
    symbol: "ETH",
    address: NATIVE_TOKEN_ADDRESS,
    decimals: 18,
    chainId: 8453,
    isNative: true,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  },
  43114: {
    name: "Avalanche",
    symbol: "AVAX",
    address: NATIVE_TOKEN_ADDRESS,
    decimals: 18,
    chainId: 43114,
    isNative: true,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchec/info/logo.png",
  },
  5000: {
    name: "Mantle",
    symbol: "MNT",
    address: NATIVE_TOKEN_ADDRESS,
    decimals: 18,
    chainId: 5000,
    isNative: true,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/mantle/info/logo.png",
  },
};

// ─── Wrapped native token definitions ────────────────────────────────────────
const WRAPPED_NATIVE_TOKENS = {
  1: {
    name: "Wrapped Ether",
    symbol: "WETH",
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    decimals: 18,
    chainId: 1,
    isWrappedNative: true,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png",
  },
  137: {
    name: "Wrapped POL",
    symbol: "WPOL",
    address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    decimals: 18,
    chainId: 137,
    isWrappedNative: true,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/assets/0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270/logo.png",
  },
  56: {
    name: "Wrapped BNB",
    symbol: "WBNB",
    address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    decimals: 18,
    chainId: 56,
    isWrappedNative: true,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/assets/0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c/logo.png",
  },
  42161: {
    name: "Wrapped Ether",
    symbol: "WETH",
    address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    decimals: 18,
    chainId: 42161,
    isWrappedNative: true,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png",
  },
  8453: {
    name: "Wrapped Ether",
    symbol: "WETH",
    address: "0x4200000000000000000000000000000000000006",
    decimals: 18,
    chainId: 8453,
    isWrappedNative: true,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png",
  },
  43114: {
    name: "Wrapped AVAX",
    symbol: "WAVAX",
    address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
    decimals: 18,
    chainId: 43114,
    isWrappedNative: true,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchec/assets/0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7/logo.png",
  },
  5000: {
    name: "Wrapped MNT",
    symbol: "WMNT",
    address: "0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8",
    decimals: 18,
    chainId: 5000,
    isWrappedNative: true,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/mantle/assets/0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8/logo.png",
  },
};

// ─── Token Lists ──────────────────────────────────────────────────────────────
// ✅ TOKEN_LISTS map restored — was missing in the broken ESM version
const TOKEN_LISTS = {
  1: mainnetTokens,
  137: polygonTokens,
  56: bnbTokens,
  42161: arbitrumTokens,
  8453: baseTokens,
  5000: mantleTokens,
  43114: avalancheTokens,
};

const MANAGED_WRAPPED_ADDRESSES = new Set(
  Object.values(WRAPPED_NATIVE_TOKENS).map((t) => t.address.toLowerCase()),
);

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getTokenList = (chainId) => {
  const erc20s = (TOKEN_LISTS[chainId] ?? TOKEN_LISTS[1]).filter(
    (t) => !MANAGED_WRAPPED_ADDRESSES.has(t.address.toLowerCase()),
  );
  const native = NATIVE_TOKENS[chainId];
  const wrapped = WRAPPED_NATIVE_TOKENS[chainId];
  return [
    ...(native ? [native] : []),
    ...(wrapped ? [wrapped] : []),
    ...erc20s,
  ];
};

const getApiHeaders = () => ({
  "0x-api-key": process.env.ZERO_EX_API_KEY || "",
  "0x-version": "v2",
});

const normalizeTokenAddress = (addr) => {
  if (!addr || addr.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()) {
    return NATIVE_TOKEN_ADDRESS;
  }
  return addr;
};

const toBps = (percentage) => Math.round(parseFloat(percentage) * 10000);

const extract0xError = (data) => {
  if (!data) return "Unknown error from 0x API";
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data);
      return extract0xError(parsed);
    } catch {
      return data;
    }
  }
  if (data.reason) return data.reason;
  if (data.message) return data.message;
  if (Array.isArray(data.validationErrors) && data.validationErrors.length) {
    return data.validationErrors
      .map((e) => e.reason ?? e.description)
      .join("; ");
  }
  return "Failed to process swap request";
};

// ─── Controllers ──────────────────────────────────────────────────────────────

export const getTokens = async (req, res, next) => {
  try {
    const chainId = parseInt(req.query.chainId ?? 1);
    const { search } = req.query;

    if (process.env.NODE_ENV !== "production")
      console.log(
        `[getTokens] chainId=${chainId} search=${search ?? "(none)"}`,
      );

    let tokens = getTokenList(chainId);

    if (process.env.NODE_ENV !== "production")
      console.log(`[getTokens] total tokens before search: ${tokens.length}`);

    if (search) {
      const q = search.toLowerCase().trim();
      tokens = tokens.filter(
        (t) =>
          t.symbol.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.address.toLowerCase() === q,
      );
    }

    if (process.env.NODE_ENV !== "production")
      console.log(`[getTokens] returning ${tokens.length} tokens`);

    res.json({ success: true, data: { tokens, chainId } });
  } catch (err) {
    if (process.env.NODE_ENV !== "production")
      console.error("[getTokens] ERROR:", err.message);
    next(err);
  }
};

export const getPrice = async (req, res, next) => {
  try {
    const {
      sellToken,
      buyToken,
      sellAmount,
      takerAddress,
      taker,
      slippagePercentage = 0.01,
    } = req.query;

    const chainId = parseInt(req.query.chainId ?? 1);

    if (process.env.NODE_ENV !== "production") {
      console.log("\n[getPrice] ━━━ INCOMING REQUEST ━━━");
      console.log("[getPrice] chainId          :", chainId);
      console.log("[getPrice] sellToken (raw)  :", sellToken);
      console.log("[getPrice] buyToken  (raw)  :", buyToken);
      console.log("[getPrice] sellAmount       :", sellAmount);
      console.log("[getPrice] slippagePercent  :", slippagePercentage);
      console.log(
        "[getPrice] taker            :",
        taker || takerAddress || "(none)",
      );
    }

    if (!sellToken || !buyToken || !sellAmount) {
      if (process.env.NODE_ENV !== "production")
        console.warn("[getPrice] REJECTED — missing required params");
      return res
        .status(400)
        .json({
          success: false,
          error: "sellToken, buyToken, and sellAmount are required",
        });
    }

    if (!/^\d+$/.test(sellAmount) || BigInt(sellAmount) <= 0n) {
      if (process.env.NODE_ENV !== "production")
        console.warn(
          "[getPrice] REJECTED — sellAmount not valid wei:",
          sellAmount,
        );
      return res
        .status(400)
        .json({
          success: false,
          error: "sellAmount must be a positive integer (wei)",
        });
    }

    const normalizedSell = normalizeTokenAddress(sellToken);
    const normalizedBuy = normalizeTokenAddress(buyToken);
    const slippageBps = toBps(slippagePercentage);

    const params = {
      chainId,
      sellToken: normalizedSell,
      buyToken: normalizedBuy,
      sellAmount,
      slippageBps,
      swapFeeRecipient: FEE_RECIPIENT,
      swapFeeBps: SWAP_FEE_BPS,
      swapFeeToken: normalizedBuy,
    };

    const takerAddr = taker || takerAddress;
    if (takerAddr) params.taker = takerAddr;

    const fullUrl = `${ZERO_EX_BASE_URL}${ZERO_EX_PRICE_PATH}`;

    if (process.env.NODE_ENV !== "production") {
      console.log("\n[getPrice] ━━━ CALLING 0x API ━━━");
      console.log("[getPrice] URL             :", fullUrl);
      console.log("[getPrice] normalizedSell  :", normalizedSell);
      console.log("[getPrice] normalizedBuy   :", normalizedBuy);
      console.log("[getPrice] slippageBps     :", slippageBps);
      console.log(
        "[getPrice] full params     :",
        JSON.stringify(params, null, 2),
      );
      console.log(
        "[getPrice] headers         :",
        JSON.stringify(getApiHeaders()),
      );
    }

    const response = await axios.get(fullUrl, {
      params,
      headers: getApiHeaders(),
      timeout: 10000,
      transformResponse: [(raw) => raw],
    });

    if (process.env.NODE_ENV !== "production") {
      console.log("\n[getPrice] ━━━ 0x RESPONSE ━━━");
      console.log("[getPrice] HTTP status     :", response.status);
      console.log("[getPrice] raw body        :", response.data);
    }

    let responseData;
    try {
      responseData = JSON.parse(response.data);
    } catch (parseErr) {
      if (process.env.NODE_ENV !== "production")
        console.error("[getPrice] JSON.parse failed:", parseErr.message);
      throw parseErr;
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("\n[getPrice] ━━━ PARSED FIELDS ━━━");
      console.log(
        "[getPrice] buyAmount       :",
        responseData.buyAmount,
        "type:",
        typeof responseData.buyAmount,
      );
      console.log(
        "[getPrice] sellAmount      :",
        responseData.sellAmount,
        "type:",
        typeof responseData.sellAmount,
      );
      console.log("[getPrice] price           :", responseData.price);
      console.log(
        "[getPrice] estimatedImpact :",
        responseData.estimatedPriceImpact,
      );
      console.log(
        "[getPrice] issues          :",
        JSON.stringify(responseData.issues ?? null),
      );
    }

    res.json({ success: true, data: responseData });
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.error("\n[getPrice] ━━━ ERROR ━━━");
      console.error("[getPrice] err.message     :", err.message);
    }
    if (err.response) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[getPrice] HTTP status     :", err.response.status);
        console.error("[getPrice] 0x error body   :", err.response.data);
        console.error(
          "[getPrice] 0x error parsed :",
          extract0xError(err.response.data),
        );
      }
      return res.status(err.response.status).json({
        success: false,
        error: extract0xError(err.response.data),
        details: err.response.data,
      });
    }
    if (process.env.NODE_ENV !== "production")
      console.error("[getPrice] no response object — network/timeout error");
    next(err);
  }
};

export const getQuote = async (req, res, next) => {
  try {
    const {
      sellToken,
      buyToken,
      sellAmount,
      takerAddress,
      taker,
      slippagePercentage = 0.01,
      skipValidation = false,
    } = req.query;

    const chainId = parseInt(req.query.chainId ?? 1);

    if (process.env.NODE_ENV !== "production") {
      console.log("\n[getQuote] ━━━ INCOMING REQUEST ━━━");
      console.log("[getQuote] chainId          :", chainId);
      console.log("[getQuote] sellToken (raw)  :", sellToken);
      console.log("[getQuote] buyToken  (raw)  :", buyToken);
      console.log("[getQuote] sellAmount       :", sellAmount);
      console.log("[getQuote] slippagePercent  :", slippagePercentage);
      console.log(
        "[getQuote] taker            :",
        taker || takerAddress || "(none)",
      );
    }

    if (!sellToken || !buyToken || !sellAmount) {
      if (process.env.NODE_ENV !== "production")
        console.warn("[getQuote] REJECTED — missing required params");
      return res
        .status(400)
        .json({
          success: false,
          error: "sellToken, buyToken, and sellAmount are required",
        });
    }

    if (!/^\d+$/.test(sellAmount) || BigInt(sellAmount) <= 0n) {
      if (process.env.NODE_ENV !== "production")
        console.warn(
          "[getQuote] REJECTED — sellAmount not valid wei:",
          sellAmount,
        );
      return res
        .status(400)
        .json({
          success: false,
          error: "sellAmount must be a positive integer (wei)",
        });
    }

    const normalizedSell = normalizeTokenAddress(sellToken);
    const normalizedBuy = normalizeTokenAddress(buyToken);
    const slippageBps = toBps(slippagePercentage);

    const params = {
      chainId,
      sellToken: normalizedSell,
      buyToken: normalizedBuy,
      sellAmount,
      slippageBps,
      swapFeeRecipient: FEE_RECIPIENT,
      swapFeeBps: SWAP_FEE_BPS,
      swapFeeToken: normalizedBuy,
    };

    const takerAddr = taker || takerAddress;
    if (takerAddr) params.taker = takerAddr;
    if (skipValidation === "true") params.skipValidation = true;

    const fullUrl = `${ZERO_EX_BASE_URL}${ZERO_EX_QUOTE_PATH}`;

    if (process.env.NODE_ENV !== "production") {
      console.log("\n[getQuote] ━━━ CALLING 0x API ━━━");
      console.log("[getQuote] URL             :", fullUrl);
      console.log("[getQuote] normalizedSell  :", normalizedSell);
      console.log("[getQuote] normalizedBuy   :", normalizedBuy);
      console.log("[getQuote] slippageBps     :", slippageBps);
      console.log(
        "[getQuote] full params     :",
        JSON.stringify(params, null, 2),
      );
    }

    const response = await axios.get(fullUrl, {
      params,
      headers: getApiHeaders(),
      timeout: 15000,
      transformResponse: [(raw) => raw],
    });

    if (process.env.NODE_ENV !== "production") {
      console.log("\n[getQuote] ━━━ 0x RESPONSE ━━━");
      console.log("[getQuote] HTTP status     :", response.status);
      console.log("[getQuote] raw body        :", response.data);
    }

    let quote;
    try {
      quote = JSON.parse(response.data);
    } catch (parseErr) {
      if (process.env.NODE_ENV !== "production")
        console.error("[getQuote] JSON.parse failed:", parseErr.message);
      throw parseErr;
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("\n[getQuote] ━━━ PARSED FIELDS ━━━");
      console.log(
        "[getQuote] buyAmount       :",
        quote.buyAmount,
        "type:",
        typeof quote.buyAmount,
      );
      console.log(
        "[getQuote] sellAmount      :",
        quote.sellAmount,
        "type:",
        typeof quote.sellAmount,
      );
      console.log(
        "[getQuote] issues          :",
        JSON.stringify(quote.issues ?? null),
      );
      console.log("[getQuote] needsApproval   :", !!quote.issues?.allowance);
    }

    const needsApproval = !!quote.issues?.allowance;
    const allowanceTarget = quote.issues?.allowance?.spender ?? null;

    res.json({
      success: true,
      data: {
        ...quote,
        chainId,
        needsApproval,
        allowanceTarget,
        priceImpactPercentage: quote.estimatedPriceImpact ?? null,
      },
    });
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.error("\n[getQuote] ━━━ ERROR ━━━");
      console.error("[getQuote] err.message     :", err.message);
    }
    if (err.response) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[getQuote] HTTP status     :", err.response.status);
        console.error("[getQuote] 0x error body   :", err.response.data);
        console.error(
          "[getQuote] 0x error parsed :",
          extract0xError(err.response.data),
        );
      }
      return res.status(err.response.status).json({
        success: false,
        error: extract0xError(err.response.data),
        details: err.response.data,
      });
    }
    if (process.env.NODE_ENV !== "production")
      console.error("[getQuote] no response object — network/timeout error");
    next(err);
  }
};
