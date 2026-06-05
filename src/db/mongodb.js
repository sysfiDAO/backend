import { MongoClient } from 'mongodb';
import logger from '../utils/logger.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME     = process.env.MONGODB_DB_NAME || 'nexus_dao';
const IS_PROD     = process.env.NODE_ENV === 'production';

let client = null;
let db     = null;

export async function connectMongoDB() {
  if (db) return db;

  client = new MongoClient(MONGODB_URI, {
    connectTimeoutMS:         10_000,
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS:          30_000,
    maxPoolSize:              20,
    minPoolSize:              2,
    retryReads:  true,
    retryWrites: true,
    ...(IS_PROD && !MONGODB_URI.includes('localhost') && {
      tls: true,
      tlsAllowInvalidCertificates: true,
    }),
  });

  await client.connect();
  db = client.db(DB_NAME);

  await ensureIndexes(db);
  logger.success(`MongoDB connected → ${DB_NAME}`);
  return db;
}

async function ensureIndexes(database) {
  const proposals = database.collection('proposals');
  await proposals.createIndexes([
    { key: { daoAddress: 1, chainId: 1 } },
    { key: { daoAddress: 1, chainId: 1, proposalId: 1 }, unique: true },
    { key: { status: 1 } },
    { key: { endTime: 1 } },
    { key: { createdAt: -1 } },
  ]);

  const votes = database.collection('user_votes');
  await votes.createIndexes([
    { key: { userAddress: 1, daoAddress: 1, chainId: 1 } },
    { key: { userAddress: 1, daoAddress: 1, proposalId: 1, chainId: 1 }, unique: true },
    { key: { daoAddress: 1, proposalId: 1 } },
  ]);

  const activity = database.collection('dao_activity');
  await activity.createIndexes([
    { key: { daoAddress: 1, chainId: 1, timestamp: -1 } },
    { key: { userAddress: 1, timestamp: -1 } },
    { key: { timestamp: -1 } },
  ]);

  const daoMeta = database.collection('dao_metadata');
  await daoMeta.createIndexes([
    { key: { daoAddress: 1, chainId: 1 }, unique: true },
    { key: { creator: 1 } },
    { key: { createdAt: -1 } },
  ]);

  const chats = database.collection('proposal_chats');
  await chats.createIndexes([
    { key: { daoAddress: 1, chainId: 1, proposalId: 1, timestamp: 1 } },
    { key: { timestamp: 1 } },
  ]);

  const guildMessages = database.collection('guild_messages');
  await guildMessages.createIndexes([
    { key: { guildId: 1, timestamp: -1 } },
    { key: { guildId: 1, isPinned: 1 } },
    { key: { guildId: 1, userId: 1 } },
  ]);

  const guildPosts = database.collection('guild_posts');
  await guildPosts.createIndexes([
    { key: { guildId: 1, isDeleted: 1, timestamp: -1 } },
    { key: { guildId: 1, visibilityScore: -1 } },
    { key: { visibilityScore: -1, timestamp: -1 } },
  ]);

  const guildLikes = database.collection('guild_post_likes');
  await guildLikes.createIndexes([
    { key: { postId: 1, userId: 1 }, unique: true },
    { key: { postId: 1 } },
  ]);

  const guildComments = database.collection('guild_post_comments');
  await guildComments.createIndexes([
    { key: { postId: 1, isDeleted: 1, timestamp: 1 } },
  ]);

  const postReactions = database.collection('post_reactions');
  await postReactions.createIndexes([
    { key: { postId: 1, userId: 1 }, unique: true },
    { key: { postId: 1 } },
    { key: { userId: 1, createdAt: -1 } },
  ]);

  const postReposts = database.collection('post_reposts');
  await postReposts.createIndexes([
    { key: { originalPostId: 1, userId: 1 }, unique: true },
    { key: { originalPostId: 1 } },
    { key: { userId: 1, createdAt: -1 } },
  ]);

  logger.info('MongoDB indexes ensured');
}

export function getMongoDB() {
  if (!db) throw new Error('MongoDB not connected — call connectMongoDB() first');
  return db;
}

export async function closeMongoDB() {
  if (client) {
    await client.close();
    db     = null;
    client = null;
    logger.info('MongoDB connection closed');
  }
}

export default { connectMongoDB, getMongoDB, closeMongoDB };
