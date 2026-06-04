import { getAdminAuth } from '../../lib/firebase.js';
import logger from '../../utils/logger.js';

/**
 * Strict auth — rejects unauthenticated requests.
 * Sets req.uid (Firebase UID) and req.firebaseUser on success.
 */
export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing authorization token' });
  }

  const token = authHeader.slice(7);
  try {
    const decoded    = await getAdminAuth().verifyIdToken(token);
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

  const token = authHeader.slice(7);
  try {
    const decoded    = await getAdminAuth().verifyIdToken(token);
    req.uid          = decoded.uid;
    req.firebaseUser = decoded;
  } catch {
    // ignore invalid tokens in optional mode
  }
  next();
}
