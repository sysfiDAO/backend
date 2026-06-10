import { getAdminAuth } from '../../lib/firebase.js';
import { getCachedToken, cacheToken } from '../../lib/authTokenCache.js';
import logger from '../../utils/logger.js';

async function verifyToken(token) {
  const cached = getCachedToken(token);
  if (cached) return cached.decoded;
  const decoded = await getAdminAuth().verifyIdToken(token);
  cacheToken(token, decoded);
  return decoded;
}

/**
 * Strict auth — rejects unauthenticated requests.
 * Sets req.uid and req.firebaseUser on success.
 */
export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing authorization token' });
  }

  try {
    const decoded    = await verifyToken(authHeader.slice(7));
    req.uid          = decoded.uid;
    req.firebaseUser = decoded;
    next();
  } catch (err) {
    logger.warn(`[guildAuth] Token verification failed: ${err.message}`);
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

/**
 * Optional auth — populates req.uid if token present, continues either way.
 */
export async function optionalAuth(req, _res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();

  try {
    const decoded    = await verifyToken(authHeader.slice(7));
    req.uid          = decoded.uid;
    req.firebaseUser = decoded;
  } catch {
    // ignore invalid tokens in optional mode
  }
  next();
}
