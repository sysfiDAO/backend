import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),

  // PostgreSQL
  DB_HOST:     z.string().min(1),
  DB_PORT:     z.coerce.number().default(5432),
  DB_NAME:     z.string().min(1),
  DB_USER:     z.string().min(1),
  DB_PASSWORD: z.string().min(1),

  // MongoDB
  MONGODB_URI:     z.string().min(1),
  MONGODB_DB_NAME: z.string().default('nexus_dao'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Firebase
  FIREBASE_PROJECT_ID:   z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().email(),
  FIREBASE_PRIVATE_KEY:  z.string().min(1),

  // CORS
  ALLOWED_ORIGINS: z.string().optional(),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY:    z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // 0x Protocol
  ZERO_EX_API_KEY: z.string().optional(),

  // Blockchain
  VOUCHER_SIGNER_KEY: z.string().optional(),
  CHAIN_ID:           z.coerce.number().default(84532),

  FACTORY_ADDRESS_BASE:         z.string().default('0x0000000000000000000000000000000000000000'),
  FACTORY_ADDRESS_BASE_SEPOLIA: z.string().default('0x0000000000000000000000000000000000000000'),
  START_BLOCK_BASE:             z.coerce.number().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.errors
    .map((e) => `  ${e.path.join('.')}: ${e.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${missing}`);
}

export const env = parsed.data;
