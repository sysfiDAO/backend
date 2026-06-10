// In-process cache for verified Firebase token payloads.
// Avoids a Firebase Admin SDK network call on every authenticated request.
// Tokens expire after 1 hour; we evict 60 s early to account for clock skew.

const CACHE_SKEW_SECONDS = 60;
const MAX_ENTRIES        = 500;

/** @type {Map<string, { uid: string, email: string|null, exp: number, decoded: object }>} */
const cache = new Map();

function isExpired(entry) {
  return entry.exp - CACHE_SKEW_SECONDS <= Math.floor(Date.now() / 1000);
}

function evict() {
  for (const [token, entry] of cache) {
    if (isExpired(entry)) cache.delete(token);
  }
  // If still over limit, drop oldest (Map insertion order is stable).
  while (cache.size >= MAX_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
}

/**
 * Returns the cached decoded payload for `token`, or null if absent / expired.
 * @param {string} token
 */
export function getCachedToken(token) {
  const entry = cache.get(token);
  if (!entry) return null;
  if (isExpired(entry)) { cache.delete(token); return null; }
  return entry;
}

/**
 * Stores a verified Firebase token payload.
 * @param {string} token  - raw JWT string (used as cache key)
 * @param {object} decoded - Firebase DecodedIdToken
 */
export function cacheToken(token, decoded) {
  if (cache.size >= MAX_ENTRIES) evict();
  cache.set(token, {
    uid:     decoded.uid,
    email:   decoded.email ?? null,
    exp:     decoded.exp,
    decoded,
  });
}
