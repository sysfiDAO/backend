import express from 'express';
import { requireAuth }      from '../../../middleware/auth/guild.js';
import feedService          from '../../../services/feedService.js';
import guildMongo           from '../../../services/guildMongoService.js';
import { refreshPostScore } from '../../../services/feedService.js';
import logger               from '../../../utils/logger.js';

const router = express.Router();
const ok  = (res, data, extra = {}) => res.json({ success: true, data, ...extra });
const err = (res, status, msg)      => res.status(status).json({ success: false, error: msg });

router.get('/feed', requireAuth, async (req, res) => {
  try {
    const page  = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const posts = await feedService.getActivityFeed(req.uid, { page, limit });
    const enriched = await Promise.all(
      posts.map(async (post) => ({ ...post, myReaction: await guildMongo.getUserReaction(post.id, req.uid) })),
    );
    ok(res, enriched, { page, limit });
  } catch (e) { logger.error('GET /feed:', e); err(res, 500, e.message); }
});

router.get('/feed/poll', requireAuth, async (req, res) => {
  try {
    const since  = parseInt(req.query.since) || 0;
    const posts  = await feedService.pollActivityFeed(req.uid, since);
    const enriched = await Promise.all(
      posts.map(async (post) => ({ ...post, myReaction: await guildMongo.getUserReaction(post.id, req.uid) })),
    );
    ok(res, enriched);
  } catch (e) { err(res, 500, e.message); }
});

router.get('/feed/governance', requireAuth, async (req, res) => {
  try {
    ok(res, await feedService.getGovernanceFeed(req.uid));
  } catch (e) { err(res, 500, e.message); }
});

router.post('/guilds/:guildId/posts/:postId/react', requireAuth, async (req, res) => {
  try {
    const { postId, guildId } = req.params;
    const { reactionType }    = req.body;
    if (!reactionType) return err(res, 400, 'reactionType is required');
    const result = await guildMongo.upsertReaction(postId, guildId, req.uid, reactionType);
    refreshPostScore(postId).catch(() => {});
    const summary = await guildMongo.getReactionSummary(postId);
    ok(res, { activeReaction: result, ...summary });
  } catch (e) {
    err(res, e.message.includes('Invalid') ? 400 : 500, e.message);
  }
});

router.get('/guilds/:guildId/posts/:postId/reactions', requireAuth, async (req, res) => {
  try {
    const { postId } = req.params;
    const [summary, myReaction] = await Promise.all([
      guildMongo.getReactionSummary(postId),
      guildMongo.getUserReaction(postId, req.uid),
    ]);
    ok(res, { ...summary, myReaction });
  } catch (e) { err(res, 500, e.message); }
});

router.post('/guilds/:guildId/posts/:postId/repost', requireAuth, async (req, res) => {
  try {
    const { guildId: originalGuildId, postId } = req.params;
    const { username, userAvatar, comment, targetGuildId } = req.body;
    const destGuildId = targetGuildId || originalGuildId;
    const repost = await guildMongo.repostPost(postId, originalGuildId, {
      userId: req.uid, username: username || 'Unknown', userAvatar: userAvatar || null,
      guildId: destGuildId, comment,
    });
    refreshPostScore(postId).catch(() => {});
    ok(res, repost);
  } catch (e) {
    err(res, e.message.includes('already reposted') ? 409 : 500, e.message);
  }
});

router.get('/guilds/:guildId/posts/:postId/repost-status', requireAuth, async (req, res) => {
  try {
    ok(res, { hasReposted: await guildMongo.hasUserReposted(req.params.postId, req.uid) });
  } catch (e) { err(res, 500, e.message); }
});

export default router;
