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
    address: null, // Not deployed yet
  },
  BSC: {
    chainId: 56,
    address: null, // Not deployed yet
  },
  ARBITRUM: {
    chainId: 42161,
    address: null, // Not deployed yet
  },
  OPTIMISM: {
    chainId: 10,
    address: null, // Not deployed yet
  },
  AVALANCHE: {
    chainId: 43114,
    address: null, // Not deployed yet
  },
  BASE: {
    chainId: 8453,
    address: '0x616f59CCc6951958C6177574AEDCe4A83caF8360',
  },
  BASE_SEPOLIA: {
    chainId: 84532,
    address: '0x4B3AD106552927494E0DB019170c1E5d4E5D08Eb',
  },
};

/**
 * Get factory address by chain ID
 */
export const getFactoryAddress = (chainId) => {
  const chain = Object.values(FACTORY_ADDRESSES).find(
    (c) => c.chainId === chainId
  );
  return chain?.address || null;
};

export default FACTORY_ADDRESSES;