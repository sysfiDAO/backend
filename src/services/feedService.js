// services/feedService.js
// Visibility score algorithm + feed aggregation.
//
// SCORE FORMULA (designed for social content discovery):
//
//   raw  = Σ(reaction_count × reaction_weight)
//        + comments × 2.5           ← discussion signals intent
//        + reposts  × 4.0           ← reposts amplify reach most
//
//   diversity_mult = 1 + min(unique_actors / unique_cap, 1) × 0.5
//        ↑ caps at 1.5× when ≥ 20 unique users engaged
//
//   gravity = 1.6 (content decays fast but not brutally — similar to HN)
//   age_h   = max(hours since creation, 0.1)
//   time    = 1 / (age_h + 2)^gravity
//
//   score = raw × diversity_mult × time × SCALE
//
// This means:
//   • Fresh posts with broad engagement rise sharply
//   • Old posts decay gradually — a 48-h post needs 2× more engagement to rank
//   • Reposts are the strongest signal (content people want to share is valuable)
//   • Many different people engaging > one person spamming reactions
//   • Guild-member bonus applied client-side for privacy
import { getMongoDB } from '../db/mongodb.js';
import guildDb      from './guildDbService.js';
import logger       from '../utils/logger.js';

// ─── Reaction weights ─────────────────────────────────────────────────────────

const REACTION_WEIGHT = {
  fire:     1.5,   // excitement / hype
  heart:    1.0,   // appreciation
  thumbsup: 1.0,   // agreement
  laugh:    1.2,   // fun / shareable
  wow:      1.3,   // surprise / novelty
  sad:      0.8,   // empathy (still engagement, slightly lower weight)
};

const COMMENT_W  = 2.5;
const REPOST_W   = 4.0;
const GRAVITY    = 1.6;
const SCALE      = 10_000;
const UNIQUE_CAP = 20;   // diversity bonus maxes at this many unique actors

// ─── Core score computation ───────────────────────────────────────────────────

export function computeVisibilityScore(post) {
  const reactions     = post.reactionCounts  || {};
  const comments      = post.commentsCount   || 0;
  const reposts       = post.repostCount     || 0;
  const uniqueActors  = post.uniqueReactors  || 0;
  const totalActors   = Object.values(reactions).reduce((s, n) => s + n, 0) + comments + reposts;

  // Raw engagement score
  const reactionScore = Object.entries(reactions).reduce((sum, [type, count]) => {
    return sum + count * (REACTION_WEIGHT[type] || 1.0);
  }, 0);
  const raw = reactionScore + comments * COMMENT_W + reposts * REPOST_W;

  // Diversity multiplier (breadth > depth)
  const uniqueRatio    = totalActors > 0 ? Math.min(uniqueActors / UNIQUE_CAP, 1) : 0;
  const diversityMult  = 1 + uniqueRatio * 0.5;

  // Time decay
  const ageHours = Math.max((Date.now() - (post.timestamp || Date.now())) / 3_600_000, 0.1);
  const timeFactor = 1 / Math.pow(ageHours + 2, GRAVITY);

  return raw * diversityMult * timeFactor * SCALE;
}

// ─── Persist score update ─────────────────────────────────────────────────────

export async function refreshPostScore(postId) {
  try {
    const { ObjectId } = await import('mongodb');
    const posts = getMongoDB().collection('guild_posts');
    const post  = await posts.findOne({ _id: new ObjectId(postId) });
    if (!post) return;

    const score = computeVisibilityScore(post);
    await posts.updateOne({ _id: new ObjectId(postId) }, { $set: { visibilityScore: score } });
    return score;
  } catch (err) {
    logger.warn(`feedService.refreshPostScore(${postId}): ${err.message}`);
  }
}

// ─── Feed aggregation ─────────────────────────────────────────────────────────

/**
 * Returns ranked activity feed (guild posts) from ALL public guilds.
 * Posts are ranked by visibility score — engagement × diversity ÷ age.
 */
export async function getActivityFeed(_userId, { page = 1, limit = 20 } = {}) {
  try {
    const posts    = getMongoDB().collection('guild_posts');
    const rawLimit = limit * 5;
    const offset   = (page - 1) * limit;

    const docs = await posts
      .find({ isDeleted: false })
      .sort({ visibilityScore: -1, timestamp: -1 })
      .skip(offset)
      .limit(rawLimit)
      .toArray();

    // Batch-fetch guild metadata for all unique guildIds in this result set
    const uniqueGuildIds = [...new Set(docs.map(d => d.guildId).filter(Boolean))];
    const guilds = await guildDb.getGuildsByIds(uniqueGuildIds);
    const guildMap = Object.fromEntries(guilds.map(g => [g.id, g]));

    const enriched = docs.map(doc => {
      const guild     = guildMap[doc.guildId] || {};
      const liveScore = computeVisibilityScore(doc);
      return {
        id:             doc._id.toString(),
        guildId:        doc.guildId,
        guildName:      guild.name      || 'Unknown Guild',
        guildLogoUrl:   guild.logo_url  || guild.logoUrl || null,
        userId:         doc.userId,
        username:       doc.username,
        userAvatar:     doc.userAvatar  || null,
        description:    doc.description,
        imageUrl:       doc.imageUrl    || null,
        reactionCounts: doc.reactionCounts || {},
        commentsCount:  doc.commentsCount  || 0,
        repostCount:    doc.repostCount    || 0,
        uniqueReactors: doc.uniqueReactors || 0,
        isRepost:       doc.isRepost       || false,
        originalPostId: doc.originalPostId || null,
        originalAuthor: doc.originalAuthor || null,
        repostComment:  doc.repostComment  || null,
        visibilityScore: liveScore,
        timestamp:      doc.timestamp,
        createdAt:      doc.createdAt,
      };
    });

    enriched.sort((a, b) => b.visibilityScore - a.visibilityScore);
    return enriched.slice(0, limit);
  } catch (err) {
    logger.error('feedService.getActivityFeed:', err);
    return [];
  }
}

/**
 * Poll for new posts from ALL guilds since a timestamp (for real-time updates).
 */
export async function pollActivityFeed(_userId, since) {
  try {
    const posts = getMongoDB().collection('guild_posts');

    const docs = await posts
      .find({ isDeleted: false, timestamp: { $gt: Number(since) } })
      .sort({ timestamp: 1 })
      .limit(50)
      .toArray();

    if (!docs.length) return [];

    const uniqueGuildIds = [...new Set(docs.map(d => d.guildId).filter(Boolean))];
    const guilds  = await guildDb.getGuildsByIds(uniqueGuildIds);
    const guildMap = Object.fromEntries(guilds.map(g => [g.id, g]));

    return docs.map(doc => {
      const guild = guildMap[doc.guildId] || {};
      return {
        id:             doc._id.toString(),
        guildId:        doc.guildId,
        guildName:      guild.name     || 'Unknown Guild',
        guildLogoUrl:   guild.logo_url || guild.logoUrl || null,
        userId:         doc.userId,
        username:       doc.username,
        userAvatar:     doc.userAvatar || null,
        description:    doc.description,
        imageUrl:       doc.imageUrl   || null,
        reactionCounts: doc.reactionCounts || {},
        commentsCount:  doc.commentsCount  || 0,
        repostCount:    doc.repostCount    || 0,
        uniqueReactors: doc.uniqueReactors || 0,
        isRepost:       doc.isRepost       || false,
        originalPostId: doc.originalPostId || null,
        originalAuthor: doc.originalAuthor || null,
        visibilityScore: computeVisibilityScore(doc),
        timestamp:      doc.timestamp,
        createdAt:      doc.createdAt,
      };
    });
  } catch (err) {
    logger.error('feedService.pollActivityFeed:', err);
    return [];
  }
}

/**
 * Returns governance proposals for user's guild-linked DAOs,
 * ranked by vote activity + recency.
 */
export async function getGovernanceFeed(userId, { page = 1, limit = 20 } = {}) {
  try {
    const guilds = await guildDb.getUserGuilds(userId);
    const linked = guilds.filter(g => g.linkedDaoAddress);
    if (!linked.length) return { proposals: [], linkedDAOs: [] };

    // Return the linked DAO references — the frontend already knows
    // how to call /api/proposals/:chainId/:daoAddress via useDAOContract.
    // We just surface which DAOs to aggregate.
    const linkedDAOs = linked.map(g => ({
      guildId:    g.id,
      guildName:  g.name,
      guildLogo:  g.logo_url || g.logoUrl || null,
      daoAddress: g.linkedDaoAddress,
      chainId:    g.linkedDaoChainId,
    }));

    return { linkedDAOs };
  } catch (err) {
    logger.error('feedService.getGovernanceFeed:', err);
    return { linkedDAOs: [] };
  }
}

export default {
  computeVisibilityScore,
  refreshPostScore,
  getActivityFeed,
  pollActivityFeed,
  getGovernanceFeed,
};
