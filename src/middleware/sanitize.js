import hpp from 'hpp';
import logger from '../utils/logger.js';

// HPP collapses duplicate query params to prevent parameter-pollution attacks
// (e.g. ?limit=10&limit=999999). Whitelist params that legitimately accept arrays.
export const hppMiddleware = hpp({
  whitelist: ['chainId', 'genre', 'status'],
});

// express-mongo-sanitize is incompatible with Express 5 because it tries to
// reassign req.query, which is a read-only getter in Express 5. Instead we
// walk and mutate the existing objects in-place.
function stripOperators(val) {
  if (Array.isArray(val)) {
    val.forEach(stripOperators);
  } else if (val !== null && typeof val === 'object') {
    for (const key of Object.keys(val)) {
      if (key.startsWith('$') || key.includes('\0')) {
        delete val[key];
        logger.warn(`Stripped MongoDB operator key "${key}" from request`);
      } else {
        stripOperators(val[key]);
      }
    }
  }
}

export const sanitizeMiddleware = (req, _res, next) => {
  if (req.body)   stripOperators(req.body);
  if (req.params) stripOperators(req.params);
  // Mutate keys on the existing req.query object — never reassign it.
  if (req.query) {
    for (const key of Object.keys(req.query)) {
      if (key.startsWith('$') || key.includes('\0')) {
        delete req.query[key];
        logger.warn(`Stripped MongoDB operator key "${key}" from query string`);
      } else if (req.query[key] !== null && typeof req.query[key] === 'object') {
        stripOperators(req.query[key]);
      }
    }
  }
  next();
};
