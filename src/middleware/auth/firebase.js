import { getAdminAuth } from '../../lib/firebase.js';
import { getCachedToken, cacheToken } from '../../lib/authTokenCache.js';
import logger from '../../utils/logger.js';

/**
 * Verifies a Firebase ID token from the Authorization header.
 * Caches verified payloads for the lifetime of the token to avoid
 * repeated Firebase Admin SDK network calls.
 * Attaches req.uid and req.userEmail for downstream handlers.
 */
export const requireFirebaseAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing authorization token' });
  }

  const idToken = authHeader.slice(7);

  const cached = getCachedToken(idToken);
  if (cached) {
    req.uid       = cached.uid;
    req.userEmail = cached.email;
    return next();
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    cacheToken(idToken, decoded);
    req.uid       = decoded.uid;
    req.userEmail = decoded.email ?? null;
    next();
  } catch (err) {
    logger.warn('[firebaseAuth] Token verification failed:', err.message);
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
};
