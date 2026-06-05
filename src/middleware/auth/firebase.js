import { getAdminAuth } from '../../lib/firebase.js';
import logger from '../../utils/logger.js';

/**
 * Verifies a Firebase ID token from the Authorization header.
 * Attaches req.uid and req.userEmail for downstream handlers.
 */
export const requireFirebaseAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing authorization token' });
  }

  const idToken = authHeader.slice(7);

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    req.uid       = decoded.uid;
    req.userEmail = decoded.email ?? null;
    next();
  } catch (err) {
    logger.error('[firebaseAuth] Token verification failed:', err.message);
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
};
