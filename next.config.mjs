/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      'ethers',
      'viem',
      'bullmq',
      'ioredis',
      'mongodb',
      'pg',
      'firebase-admin',
      'pino',
      'pino-http',
      'pino-pretty',
      'express',
      'express-mongo-sanitize',
      'helmet',
      'hpp',
      'compression',
      'express-rate-limit',
    ],
  },
};

export default nextConfig;
