import { createApp } from '../../src/app.js';
import { connectMongoDB } from '../../src/db/mongodb.js';
import { connectRedis } from '../../src/db/redis.js';

const expressApp = createApp();

let initPromise = null;

function ensureInit() {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        await connectMongoDB();
      } catch (e) {
        console.error('[init] MongoDB failed:', e.message);
      }
      try {
        connectRedis();
      } catch (e) {
        console.warn('[init] Redis unavailable (non-fatal):', e.message);
      }
    })();
  }
  return initPromise;
}

export default async function handler(req, res) {
  await ensureInit();
  return new Promise((resolve, reject) => {
    expressApp(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};
