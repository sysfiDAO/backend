import { createApp } from '../../src/app.js';
import { connectMongoDB } from '../../src/db/mongodb.js';
import { connectRedis } from '../../src/db/redis.js';

let expressApp;
let appError;

try {
  expressApp = createApp();
} catch (e) {
  appError = e;
  console.error('[bootstrap] createApp() failed:', e.message);
}

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
  // If the Express app itself failed to initialize, return a JSON error
  // instead of letting Next.js render an HTML 500 page.
  if (appError || !expressApp) {
    res.status(500).json({
      success: false,
      error: 'Server failed to initialize',
      detail: appError?.message,
    });
    return;
  }

  try {
    await ensureInit();
  } catch (e) {
    // ensureInit swallows all errors internally, but guard anyway
    console.error('[handler] ensureInit threw:', e.message);
  }

  return new Promise((resolve) => {
    expressApp(req, res, (err) => {
      // This callback fires when Express exhausts its middleware chain without
      // sending a response, or when an error leaks past all error handlers.
      // Never reject — always resolve after sending a JSON fallback so that
      // Next.js never gets to render its own HTML error page.
      if (err) {
        console.error('[handler] unhandled Express error:', err.message);
        if (!res.headersSent) {
          res.status(err.status || err.statusCode || 500).json({
            success: false,
            error: err.message || 'Internal Server Error',
          });
        }
      } else if (!res.headersSent) {
        res.status(404).json({ success: false, error: 'Route not found' });
      }
      resolve();
    });
  });
}

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};
