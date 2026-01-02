import { mainnet, sepolia, polygon, bsc, arbitrum, optimism, avalanche, base, baseSepolia } from 'viem/chains';
import { getFactoryAddress } from './FactoryAddress.js';

export const SUPPORTED_CHAINS = {
  ETHEREUM: {
    id: 1,
    name: 'Ethereum',
    symbol: 'ETH',
    chain: mainnet,
    rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/SvIcMuv58RZnjEr4p5bXrN2_fnMa0rWc',
    explorer: 'https://etherscan.io',
    icon: 'https://cryptologos.cc/logos/ethereum-eth-logo.png?v=024',
    testnet: false,
    factoryAddress: getFactoryAddress(1),
  },
  POLYGON: {
    id: 137,
    name: 'Polygon',
    symbol: 'MATIC',
    rpcUrl: "https://polygon-rpc.com/",
    chain: polygon,
    alchemyUrl: 'https://polygon-mainnet.g.alchemy.com/v2/SvIcMuv58RZnjEr4p5bXrN2_fnMa0rWc',
    explorer: 'https://polygonscan.com',
    icon: 'https://cryptologos.cc/logos/polygon-matic-logo.png?v=024',
    testnet: false,
    factoryAddress: getFactoryAddress(137),
  },
  BSC: {
    id: 56,
    name: 'BNB Chain',
    symbol: 'BNB',
    chain: bsc,
    rpcUrl: "https://bsc.api.pocket.network/",
    alchemyUrl: 'https://bnb-mainnet.g.alchemy.com/v2/SvIcMuv58RZnjEr4p5bXrN2_fnMa0rWc',
    explorer: 'https://bscscan.com',
    icon: 'https://cryptologos.cc/logos/bnb-bnb-logo.png?v=024',
    testnet: false,
    factoryAddress: getFactoryAddress(56),
  },
  ARBITRUM: {
    id: 42161,
    name: 'Arbitrum',
    symbol: 'ETH',
    chain: arbitrum,
    rpcUrl: 'https://arb-mainnet.g.alchemy.com/v2/SvIcMuv58RZnjEr4p5bXrN2_fnMa0rWc',
    explorer: 'https://arbiscan.io',
    icon: 'https://cryptologos.cc/logos/arbitrum-arb-logo.png?v=024',
    testnet: false,
    factoryAddress: getFactoryAddress(42161),
  },
  OPTIMISM: {
    id: 10,
    name: 'Optimism',
    symbol: 'ETH',
    chain: optimism,
    rpcUrl: 'https://opt-mainnet.g.alchemy.com/v2/SvIcMuv58RZnjEr4p5bXrN2_fnMa0rWc',
    explorer: 'https://optimistic.etherscan.io',
    icon: 'https://cryptologos.cc/logos/ethereum-eth-logo.png?v=024',
    testnet: false,
    factoryAddress: getFactoryAddress(10),
  },
  AVALANCHE: {
    id: 43114,
    name: 'Avalanche',
    symbol: 'AVAX',
    chain: avalanche,
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    alchemyUrl: "https://avax-mainnet.g.alchemy.com/v2/SvIcMuv58RZnjEr4p5bXrN2_fnMa0rWc",
    explorer: 'https://snowtrace.io',
    icon: 'https://cryptologos.cc/logos/avalanche-avax-logo.png?v=024',
    testnet: false,
    factoryAddress: getFactoryAddress(43114),
  },
  BASE: {
    id: 8453,
    name: 'Base',
    symbol: 'ETH',
    chain: base,
    rpcUrl: 'https://mainnet.base.org',
    explorer: 'https://basescan.org',
    icon: 'https://avatars.githubusercontent.com/u/108554348?s=200&v=4',
    testnet: false,
    factoryAddress: getFactoryAddress(8453),
  },
  BASE_SEPOLIA: {
    id: 84532,
    name: 'Base Sepolia',
    symbol: 'ETH',
    chain: baseSepolia,
    rpcUrl: 'https://sepolia.base.org',
    explorer: 'https://sepolia.basescan.org',
    icon: 'https://avatars.githubusercontent.com/u/108554348?s=200&v=4',
    testnet: true,
    factoryAddress: getFactoryAddress(84532),
  },
  //  ABSTRACT: {
  //     id: 2741,
  //     name: 'Abstract',
  //     symbol: 'ETH',
  //     rpcUrl: 'https://abstract.drpc.org', // replace if needed
  //     explorer: 'https://explorer.abstract.xyz',
  //     icon: abstract,
  //     testnet: false,
  //       factoryAddress: getFactoryAddress(84532),
  //   },
};

export const DEFAULT_CHAIN = SUPPORTED_CHAINS.BASE_SEPOLIA;

export const getChainById = (chainId) =>
  Object.values(SUPPORTED_CHAINS).find(chain => chain.id === chainId);

export const getMainnetChains = () =>
  Object.values(SUPPORTED_CHAINS).filter(chain => !chain.testnet);

export const getTestnetChains = () =>
  Object.values(SUPPORTED_CHAINS).filter(chain => chain.testnet);

export const getChainByName = (name) =>
  Object.values(SUPPORTED_CHAINS).find(
    chain => chain.name.toLowerCase() === name.toLowerCase()
  );