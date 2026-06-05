// services/guildRedisService.js
// Redis layer for the guild system — fail-open: if Redis is unavailable
// all callers fall through to PostgreSQL/MongoDB without crashing.
import { getRedis } from '../db/redis.js';
import logger from '../utils/logger.js';

const TTL = {
  GUILD:         300,   // 5 min — guild detail
  TOP_GUILDS:    600,   // 10 min — top guilds list
  USER_GUILDS:   120,   // 2 min — user guild list
  SEARCH:         30,   // 30 s  — search results (change frequently)
  MEMBERS:        60,   // 1 min — member list
  CHAT_SETTINGS:  60,   // 1 min — chat settings
  MESSAGES:        5,   // 5 s   — short-lived: recent messages for poll
};

const k = (...parts) => parts.join(':');

// ─── Generic helpers (fail-open) ──────────────────────────────────────────────

async function get(key) {
  const r = getRedis();
  if (!r) return null;
  try {
    const v = await r.get(key);
    return v ? JSON.parse(v) : null;
  } catch (err) {
    logger.warn(`[guildRedis] GET ${key}: ${err.message}`);
    return null;
  }
}

async function set(key, value, ttl) {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(key, JSON.stringify(value), 'EX', ttl);
  } catch (err) {
    logger.warn(`[guildRedis] SET ${key}: ${err.message}`);
  }
}

async function del(...keys) {
  const r = getRedis();
  if (!r) return;
  try {
    if (keys.length) await r.del(...keys);
  } catch (err) {
    logger.warn(`[guildRedis] DEL: ${err.message}`);
  }
}

async function scanDel(pattern) {
  const r = getRedis();
  if (!r) return;
  try {
    let cursor = '0';
    do {
      const [next, found] = await r.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      if (found.length) await r.del(...found);
    } while (cursor !== '0');
  } catch (err) {
    logger.warn(`[guildRedis] scanDel ${pattern}: ${err.message}`);
  }
}

// ─── Guild detail ─────────────────────────────────────────────────────────────

export const getGuild    = (id)           => get(k('guild', id));
export const setGuild    = (id, data)     => set(k('guild', id), data, TTL.GUILD);
export const invalidateGuild = (id)       => del(k('guild', id));

// ─── Top guilds ───────────────────────────────────────────────────────────────

export const getTopGuilds    = (limit)       => get(k('guild:top', limit));
export const setTopGuilds    = (limit, data) => set(k('guild:top', limit), data, TTL.TOP_GUILDS);
export const invalidateTopGuilds = ()        => scanDel('guild:top:*');

// ─── User guild list ──────────────────────────────────────────────────────────

export const getUserGuilds    = (uid)         => get(k('guild:user', uid));
export const setUserGuilds    = (uid, data)   => set(k('guild:user', uid), data, TTL.USER_GUILDS);
export const invalidateUserGuilds = (uid)     => del(k('guild:user', uid));

// ─── Search results ───────────────────────────────────────────────────────────

export const getSearch  = (q, genre) => get(k('guild:search', q.toLowerCase(), genre || ''));
export const setSearch  = (q, genre, data) =>
  set(k('guild:search', q.toLowerCase(), genre || ''), data, TTL.SEARCH);

// ─── Member list ──────────────────────────────────────────────────────────────

export const getMembers    = (guildId)       => get(k('guild:members', guildId));
export const setMembers    = (guildId, data) => set(k('guild:members', guildId), data, TTL.MEMBERS);
export const invalidateMembers = (guildId)   => del(k('guild:members', guildId));

// ─── Chat settings ────────────────────────────────────────────────────────────

export const getChatSettings    = (guildId)       => get(k('guild:chat-settings', guildId));
export const setChatSettings    = (guildId, data) => set(k('guild:chat-settings', guildId), data, TTL.CHAT_SETTINGS);
export const invalidateChatSettings = (guildId)   => del(k('guild:chat-settings', guildId));

// ─── Unread message counts ────────────────────────────────────────────────────
// Stored as Redis hashes: guild:unread:{guildId} → { userId: count }

export async function getUnreadCount(guildId, userId) {
  const r = getRedis();
  if (!r) return 0;
  try {
    const val = await r.hget(k('guild:unread', guildId), userId);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

export async function incrementUnread(guildId, userId) {
  const r = getRedis();
  if (!r) return;
  try {
    await r.hincrby(k('guild:unread', guildId), userId, 1);
  } catch {
    // non-fatal
  }
}

export async function resetUnread(guildId, userId) {
  const r = getRedis();
  if (!r) return;
  try {
    await r.hdel(k('guild:unread', guildId), userId);
  } catch {
    // non-fatal
  }
}

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Returns time remaining in seconds, or 0 if under the limit.

export async function checkMessageRateLimit(guildId, userId, delaySeconds) {
  if (!delaySeconds || delaySeconds <= 0) return 0;
  const r = getRedis();
  if (!r) return 0;

  const key = k('guild:ratelimit', guildId, userId);
  try {
    const exists = await r.exists(key);
    if (exists) {
      const ttl = await r.ttl(key);
      return ttl > 0 ? ttl : 0;
    }
    await r.set(key, '1', 'EX', delaySeconds);
    return 0;
  } catch {
    return 0;
  }
}

export default {
  getGuild, setGuild, invalidateGuild,
  getTopGuilds, setTopGuilds, invalidateTopGuilds,
  getUserGuilds, setUserGuilds, invalidateUserGuilds,
  getSearch, setSearch,
  getMembers, setMembers, invalidateMembers,
  getChatSettings, setChatSettings, invalidateChatSettings,
  getUnreadCount, incrementUnread, resetUnread,
  checkMessageRateLimit,
};
