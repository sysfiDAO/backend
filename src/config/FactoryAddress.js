/**
 * DAOFactory Contract Addresses
 * These are public blockchain addresses - not sensitive data
 */
export const FACTORY_ADDRESSES = {
  ETHEREUM: {
    chainId: 1,
    address: null, // Not deployed yet
  },

  POLYGON: {
    chainId: 137,
    address: "0x3c181eaaB64052c726194Da6797EA06DD15e8E6B",
  },

  BSC: {
    chainId: 56,
    address: "0x3c181eaaB64052c726194Da6797EA06DD15e8E6B", // Not deployed yet
  },

  ARBITRUM: {
    chainId: 42161,
    address: "0x3c181eaaB64052c726194Da6797EA06DD15e8E6B",
  },

  // OPTIMISM: {
  //   chainId: 10,
  //   address: null, // Not deployed yet
  // },

  AVALANCHE: {
    chainId: 43114,
    address: "0x3c181eaaB64052c726194Da6797EA06DD15e8E6B",
  },

  BASE: {
    chainId: 8453,
    address: "0x69db1Ea748Aa83214c99ab1109fc34eba94734C0",
  },

  BASE_SEPOLIA: {
    chainId: 84532,
    address: "0x4B3AD106552927494E0DB019170c1E5d4E5D08Eb",
  },

  // ABSTRACT: {
  //   chainId: 2741,
  //   address: null, // Deploy factory here
  // },
};

/**
 * Get factory address by chain ID
 */
export const getFactoryAddress = (chainId) => {
  const chain = Object.values(FACTORY_ADDRESSES).find(
    (c) => c.chainId === chainId,
  );
  return chain?.address || null;
};

export default FACTORY_ADDRESSES;
