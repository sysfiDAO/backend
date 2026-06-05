// services/redisService.js
// Redis cache layer — fail-open: if Redis is down, callers fall through to PostgreSQL/MongoDB.
import { getRedis } from '../db/redis.js';
import logger from '../utils/logger.js';

const TTL = {
  DAO_LIST:     30,    // 30 s  — polled every 20 s; short TTL keeps list fresh
  DAO_DETAIL:   1800,  // 30 min — single DAO detail
  PROPOSALS:    60,    // 60 s  — proposal list (votes change often)
  SEARCH:       30,    // 30 s  — search results
  STATS:        30,    // 30 s  — global stats
};

function key(...parts) {
  return parts.join(':');
}

// ─── Generic helpers ─────────────────────────────────────────────────────────

async function get(k) {
  const r = getRedis();
  if (!r) return null;
  try {
    const val = await r.get(k);
    return val ? JSON.parse(val) : null;
  } catch (err) {
    logger.warn(`Redis GET ${k} failed: ${err.message}`);
    return null;
  }
}

async function set(k, value, ttl) {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(k, JSON.stringify(value), 'EX', ttl);
  } catch (err) {
    logger.warn(`Redis SET ${k} failed: ${err.message}`);
  }
}

async function del(...keys) {
  const r = getRedis();
  if (!r) return;
  try {
    if (keys.length) await r.del(...keys);
  } catch (err) {
    logger.warn(`Redis DEL failed: ${err.message}`);
  }
}

async function delPattern(pattern) {
  const r = getRedis();
  if (!r) return;
  try {
    // SCAN-based delete to avoid blocking
    let cursor = '0';
    do {
      const [next, found] = await r.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      if (found.length) await r.del(...found);
    } while (cursor !== '0');
  } catch (err) {
    logger.warn(`Redis delPattern ${pattern} failed: ${err.message}`);
  }
}

// ─── DAO list cache ───────────────────────────────────────────────────────────

export async function getDAOList(chainId, offset, limit) {
  return get(key('dao', 'list', chainId, offset, limit));
}

export async function setDAOList(chainId, offset, limit, data) {
  await set(key('dao', 'list', chainId, offset, limit), data, TTL.DAO_LIST);
}

export async function invalidateDAOList(chainId) {
  await delPattern(`dao:list:${chainId}:*`);
}

// ─── Single DAO cache ─────────────────────────────────────────────────────────

export async function getDAODetail(chainId, address) {
  return get(key('dao', 'detail', chainId, address.toLowerCase()));
}

export async function setDAODetail(chainId, address, data) {
  await set(key('dao', 'detail', chainId, address.toLowerCase()), data, TTL.DAO_DETAIL);
}

// ─── Proposal list cache ──────────────────────────────────────────────────────

export async function getProposals(chainId, daoAddress) {
  return get(key('dao', 'proposals', chainId, daoAddress.toLowerCase()));
}

export async function setProposals(chainId, daoAddress, data) {
  await set(key('dao', 'proposals', chainId, daoAddress.toLowerCase()), data, TTL.PROPOSALS);
}

export async function invalidateProposals(chainId, daoAddress) {
  await del(key('dao', 'proposals', chainId, daoAddress.toLowerCase()));
}

// ─── Search cache ─────────────────────────────────────────────────────────────

export async function getSearch(chainId, query) {
  return get(key('dao', 'search', chainId, query.toLowerCase()));
}

export async function setSearch(chainId, query, data) {
  await set(key('dao', 'search', chainId, query.toLowerCase()), data, TTL.SEARCH);
}

// ─── Stats cache ──────────────────────────────────────────────────────────────

export async function getStats() {
  return get('dao:stats');
}

export async function setStats(data) {
  await set('dao:stats', data, TTL.STATS);
}

export default {
  getDAOList, setDAOList, invalidateDAOList,
  getDAODetail, setDAODetail,
  getProposals, setProposals, invalidateProposals,
  getSearch, setSearch,
  getStats, setStats,
};
