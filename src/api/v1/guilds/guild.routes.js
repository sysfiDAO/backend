import express from 'express';
import { requireAuth, optionalAuth } from '../../../middleware/auth/guild.js';
import guildDb    from '../../../services/guildDbService.js';
import guildMongo from '../../../services/guildMongoService.js';
import guildRedis from '../../../services/guildRedisService.js';
import logger     from '../../../utils/logger.js';

const router = express.Router();

const ok  = (res, data, extra = {}) => res.json({ success: true, data, ...extra });
const err = (res, status, msg)      => res.status(status).json({ success: false, error: msg });

// ─── Guild CRUD ───────────────────────────────────────────────────────────────

router.get('/guilds/top', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const cached = await guildRedis.getTopGuilds(limit);
    if (cached) return ok(res, cached, { source: 'cache' });
    const guilds = await guildDb.getTopGuilds(limit);
    await guildRedis.setTopGuilds(limit, guilds);
    ok(res, guilds, { source: 'db' });
  } catch (e) { logger.error('GET /guilds/top:', e); err(res, 500, e.message); }
});

router.get('/guilds/search', async (req, res) => {
  try {
    const { q, genre } = req.query;
    if (!q?.trim()) return ok(res, []);
    const cached = await guildRedis.getSearch(q, genre);
    if (cached) return ok(res, cached, { source: 'cache' });
    const results = await guildDb.searchGuilds(q.trim(), genre || null);
    await guildRedis.setSearch(q, genre, results);
    ok(res, results, { source: 'db' });
  } catch (e) { logger.error('GET /guilds/search:', e); err(res, 500, e.message); }
});

router.get('/guilds/invite/:code', async (req, res) => {
  try {
    const invite = await guildDb.getInviteByCode(req.params.code);
    if (!invite) return err(res, 404, 'Invite not found or expired');
    ok(res, invite);
  } catch (e) { err(res, 500, e.message); }
});

router.get('/guilds', requireAuth, async (req, res) => {
  try {
    const cached = await guildRedis.getUserGuilds(req.uid);
    if (cached) return ok(res, cached, { source: 'cache' });
    const guilds = await guildDb.getUserGuilds(req.uid);
    await guildRedis.setUserGuilds(req.uid, guilds);
    ok(res, guilds, { source: 'db' });
  } catch (e) { err(res, 500, e.message); }
});

router.get('/guilds/:guildId', optionalAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    const cached = await guildRedis.getGuild(guildId);
    if (cached) return ok(res, cached, { source: 'cache' });
    const guild = await guildDb.getGuildById(guildId);
    if (!guild) return err(res, 404, 'Guild not found');
    await guildRedis.setGuild(guildId, guild);
    ok(res, guild, { source: 'db' });
  } catch (e) { err(res, 500, e.message); }
});

router.post('/guilds', requireAuth, async (req, res) => {
  try {
    const { name, description, genre, privacy, logoUrl, bannerUrl, tokenGating } = req.body;
    if (!name?.trim()) return err(res, 400, 'Guild name is required');
    const guild = await guildDb.createGuild({
      name: name.trim(), description, genre, privacy: privacy || 'public',
      logoUrl, bannerUrl, createdBy: req.uid, tokenGating,
    });
    await guildRedis.invalidateUserGuilds(req.uid);
    await guildRedis.invalidateTopGuilds();
    ok(res, guild);
  } catch (e) { logger.error('POST /guilds:', e); err(res, 500, e.message); }
});

router.put('/guilds/:guildId', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    const updated = await guildDb.updateGuild(guildId, req.uid, req.body);
    if (!updated) return err(res, 403, 'Not authorized or guild not found');
    await guildRedis.invalidateGuild(guildId);
    await guildRedis.invalidateUserGuilds(req.uid);
    ok(res, updated);
  } catch (e) { err(res, 500, e.message); }
});

router.delete('/guilds/:guildId', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    const deleted = await guildDb.deleteGuild(guildId, req.uid);
    if (!deleted) return err(res, 403, 'Not authorized or guild not found');
    await Promise.all([
      guildRedis.invalidateGuild(guildId),
      guildRedis.invalidateUserGuilds(req.uid),
      guildRedis.invalidateTopGuilds(),
      guildRedis.invalidateMembers(guildId),
    ]);
    ok(res, { deleted: true });
  } catch (e) { err(res, 500, e.message); }
});

// ─── Membership ───────────────────────────────────────────────────────────────

router.get('/guilds/:guildId/members', optionalAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    const cached = await guildRedis.getMembers(guildId);
    if (cached) return ok(res, cached, { source: 'cache' });
    const members = await guildDb.getMembers(guildId);
    await guildRedis.setMembers(guildId, members);
    ok(res, members, { source: 'db' });
  } catch (e) { err(res, 500, e.message); }
});

router.get('/guilds/:guildId/membership', requireAuth, async (req, res) => {
  try {
    const membership = await guildDb.getMembership(req.params.guildId, req.uid);
    ok(res, membership);
  } catch (e) { err(res, 500, e.message); }
});

router.post('/guilds/:guildId/join', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { username, displayName, userAvatar, walletAddress, inviteId } = req.body;
    const guild = await guildDb.getGuildById(guildId);
    if (!guild) return err(res, 404, 'Guild not found');
    const existing = await guildDb.getMembership(guildId, req.uid);
    if (existing) return ok(res, existing, { alreadyMember: true });
    const member = await guildDb.joinGuild(guildId, req.uid, { username, displayName, userAvatar, walletAddress }, inviteId);
    await Promise.all([
      guildRedis.invalidateMembers(guildId),
      guildRedis.invalidateUserGuilds(req.uid),
      guildRedis.invalidateGuild(guildId),
    ]);
    ok(res, member);
  } catch (e) {
    logger.error('POST /guilds/:guildId/join:', e);
    err(res, e.message.includes('banned') ? 403 : 500, e.message);
  }
});

router.post('/guilds/:guildId/leave', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    await guildDb.leaveGuild(guildId, req.uid);
    await Promise.all([
      guildRedis.invalidateMembers(guildId),
      guildRedis.invalidateUserGuilds(req.uid),
      guildRedis.invalidateGuild(guildId),
    ]);
    ok(res, { left: true });
  } catch (e) {
    const status = e.message.includes('not found') ? 404 : e.message.includes('Owner') ? 403 : 500;
    err(res, status, e.message);
  }
});

router.post('/guilds/:guildId/ban/:userId', requireAuth, async (req, res) => {
  try {
    const { guildId, userId } = req.params;
    const { username } = req.body;
    const guild = await guildDb.getGuildById(guildId);
    if (!guild) return err(res, 404, 'Guild not found');
    if (guild.createdBy !== req.uid) {
      const mod = await guildDb.getModerators(guildId);
      const myMod = mod.find((m) => m.user_id === req.uid);
      if (!myMod?.permissions?.canBanMembers) return err(res, 403, 'Not authorized to ban');
    }
    await guildDb.banUser(guildId, userId, username, req.uid);
    await guildMongo.deleteAllUserMessages(guildId, userId);
    await Promise.all([
      guildRedis.invalidateMembers(guildId),
      guildRedis.invalidateGuild(guildId),
    ]);
    ok(res, { banned: true });
  } catch (e) { logger.error('POST /ban:', e); err(res, 500, e.message); }
});

// ─── Chat messages ────────────────────────────────────────────────────────────

router.get('/guilds/:guildId/messages', requireAuth, async (req, res) => {
  try {
    const limit   = Math.min(parseInt(req.query.limit) || 30, 100);
    const before  = req.query.before || null;
    const messages = await guildMongo.getMessages(req.params.guildId, { limit, before });
    ok(res, messages);
  } catch (e) { err(res, 500, e.message); }
});

router.get('/guilds/:guildId/messages/poll', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    const since = parseInt(req.query.since) || 0;
    const messages = await guildMongo.getMessagesSince(guildId, since);
    if (messages.length > 0) await guildRedis.resetUnread(guildId, req.uid);
    ok(res, messages);
  } catch (e) { err(res, 500, e.message); }
});

router.get('/guilds/:guildId/messages/pinned', requireAuth, async (req, res) => {
  try {
    const pinned = await guildMongo.getPinnedMessages(req.params.guildId);
    ok(res, pinned);
  } catch (e) { err(res, 500, e.message); }
});

router.get('/guilds/:guildId/unread', requireAuth, async (req, res) => {
  try {
    const count = await guildRedis.getUnreadCount(req.params.guildId, req.uid);
    ok(res, { count });
  } catch (e) { err(res, 500, e.message); }
});

router.post('/guilds/:guildId/unread/reset', requireAuth, async (req, res) => {
  try {
    await guildRedis.resetUnread(req.params.guildId, req.uid);
    ok(res, { reset: true });
  } catch (e) { err(res, 500, e.message); }
});

router.post('/guilds/:guildId/messages', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { text, username, displayName, userAvatar, replyTo } = req.body;
    if (!text?.trim()) return err(res, 400, 'Message text is required');
    const settings = await guildDb.getChatSettings(guildId);
    const guild    = await guildDb.getGuildById(guildId);
    const isAdmin  = guild?.createdBy === req.uid;
    if (settings.is_locked && !isAdmin) return err(res, 403, 'Chat is currently locked');
    if (!isAdmin && settings.message_delay > 0) {
      const wait = await guildRedis.checkMessageRateLimit(guildId, req.uid, settings.message_delay);
      if (wait > 0) return err(res, 429, `Please wait ${wait}s before sending another message`);
    }
    const message = await guildMongo.sendMessage(guildId, { userId: req.uid, username, displayName, userAvatar, text, replyTo });
    guildDb.getMembers(guildId).then((members) => {
      const others = members.filter((m) => m.user_id !== req.uid);
      Promise.all(others.map((m) => guildRedis.incrementUnread(guildId, m.user_id))).catch(() => {});
    }).catch(() => {});
    ok(res, message);
  } catch (e) { logger.error('POST /messages:', e); err(res, 500, e.message); }
});

router.put('/guilds/:guildId/messages/:messageId', requireAuth, async (req, res) => {
  try {
    const { newText } = req.body;
    if (!newText?.trim()) return err(res, 400, 'newText is required');
    await guildMongo.editMessage(req.params.messageId, req.uid, newText);
    ok(res, { edited: true });
  } catch (e) {
    err(res, e.message.includes('not found') || e.message.includes('only edit') ? 403 : 500, e.message);
  }
});

router.delete('/guilds/:guildId/messages/:messageId', requireAuth, async (req, res) => {
  try {
    const { guildId, messageId } = req.params;
    const guild   = await guildDb.getGuildById(guildId);
    const isAdmin = guild?.createdBy === req.uid;
    await guildMongo.deleteMessage(messageId, req.uid, isAdmin);
    ok(res, { deleted: true });
  } catch (e) {
    err(res, e.message.includes('only delete') ? 403 : 500, e.message);
  }
});

router.post('/guilds/:guildId/messages/:messageId/pin', requireAuth, async (req, res) => {
  try {
    const { guildId, messageId } = req.params;
    const guild = await guildDb.getGuildById(guildId);
    if (guild?.createdBy !== req.uid) return err(res, 403, 'Only admins can pin messages');
    await guildMongo.pinMessage(messageId, req.uid);
    ok(res, { pinned: true });
  } catch (e) { err(res, 500, e.message); }
});

router.delete('/guilds/:guildId/messages/:messageId/pin', requireAuth, async (req, res) => {
  try {
    const { guildId, messageId } = req.params;
    const guild = await guildDb.getGuildById(guildId);
    if (guild?.createdBy !== req.uid) return err(res, 403, 'Only admins can unpin messages');
    await guildMongo.unpinMessage(messageId);
    ok(res, { unpinned: true });
  } catch (e) { err(res, 500, e.message); }
});

router.post('/guilds/:guildId/messages/batch-delete', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { userId: targetUserId } = req.body;
    if (!targetUserId) return err(res, 400, 'userId is required');
    const guild = await guildDb.getGuildById(guildId);
    if (guild?.createdBy !== req.uid) return err(res, 403, 'Only admins can bulk-delete messages');
    const count = await guildMongo.deleteAllUserMessages(guildId, targetUserId);
    ok(res, { deleted: count });
  } catch (e) { err(res, 500, e.message); }
});

// ─── Chat settings ────────────────────────────────────────────────────────────

router.get('/guilds/:guildId/settings/chat', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    const cached = await guildRedis.getChatSettings(guildId);
    if (cached) return ok(res, cached, { source: 'cache' });
    const settings = await guildDb.getChatSettings(guildId);
    await guildRedis.setChatSettings(guildId, settings);
    ok(res, settings, { source: 'db' });
  } catch (e) { err(res, 500, e.message); }
});

router.put('/guilds/:guildId/settings/chat', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    const guild = await guildDb.getGuildById(guildId);
    if (guild?.createdBy !== req.uid) return err(res, 403, 'Only the guild owner can update chat settings');
    const settings = await guildDb.updateChatSettings(guildId, req.uid, req.body);
    await guildRedis.invalidateChatSettings(guildId);
    ok(res, settings);
  } catch (e) { err(res, 500, e.message); }
});

// ─── Posts ────────────────────────────────────────────────────────────────────

router.get('/guilds/:guildId/posts', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    const limit  = Math.min(parseInt(req.query.limit) || 10, 50);
    const before = req.query.before || null;
    const posts  = await guildMongo.getPosts(guildId, { limit, before });
    const enriched = await Promise.all(
      posts.map(async (p) => ({
        ...p,
        isLiked:    await guildMongo.isPostLiked(p.id, req.uid),
        myReaction: await guildMongo.getUserReaction(p.id, req.uid),
      })),
    );
    ok(res, enriched);
  } catch (e) { err(res, 500, e.message); }
});

router.get('/guilds/:guildId/posts/:postId', requireAuth, async (req, res) => {
  try {
    const post = await guildMongo.getPostById(req.params.postId);
    if (!post) return err(res, 404, 'Post not found');
    const myReaction = await guildMongo.getUserReaction(post.id, req.uid);
    ok(res, { ...post, myReaction });
  } catch (e) { err(res, 500, e.message); }
});

router.post('/guilds/:guildId/posts', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { description, imageUrl, username, userAvatar } = req.body;
    if (!description?.trim()) return err(res, 400, 'Post description is required');
    const post = await guildMongo.createPost(guildId, { userId: req.uid, username, userAvatar, description, imageUrl });
    ok(res, post);
  } catch (e) { err(res, 500, e.message); }
});

router.delete('/guilds/:guildId/posts/:postId', requireAuth, async (req, res) => {
  try {
    const { guildId, postId } = req.params;
    const guild   = await guildDb.getGuildById(guildId);
    const isAdmin = guild?.createdBy === req.uid;
    await guildMongo.deletePost(postId, req.uid, isAdmin);
    ok(res, { deleted: true });
  } catch (e) {
    err(res, e.message.includes('only delete') ? 403 : 500, e.message);
  }
});

router.post('/guilds/:guildId/posts/:postId/like', requireAuth, async (req, res) => {
  try {
    const { guildId, postId } = req.params;
    const { username } = req.body;
    const result = await guildMongo.toggleLike(postId, guildId, req.uid, username);
    ok(res, result);
  } catch (e) { err(res, 500, e.message); }
});

router.get('/guilds/:guildId/posts/:postId/likes', requireAuth, async (req, res) => {
  try {
    ok(res, await guildMongo.getPostLikes(req.params.postId));
  } catch (e) { err(res, 500, e.message); }
});

router.post('/guilds/:guildId/posts/:postId/impression', requireAuth, async (req, res) => {
  try {
    const { postId } = req.params;
    await guildMongo.addImpression(postId, req.uid);
    res.status(204).end();  // no content — fire-and-forget from the client
  } catch (e) { err(res, 500, e.message); }
});

router.get('/guilds/:guildId/posts/:postId/comments', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const skip  = parseInt(req.query.skip) || 0;
    ok(res, await guildMongo.getComments(req.params.postId, { limit, skip }));
  } catch (e) { err(res, 500, e.message); }
});

router.post('/guilds/:guildId/posts/:postId/comments', requireAuth, async (req, res) => {
  try {
    const { guildId, postId } = req.params;
    const { text, username, userAvatar } = req.body;
    if (!text?.trim()) return err(res, 400, 'Comment text is required');
    const comment = await guildMongo.addComment(postId, guildId, { userId: req.uid, username, userAvatar, text });
    ok(res, comment);
  } catch (e) { err(res, 500, e.message); }
});

// ─── Moderators ───────────────────────────────────────────────────────────────

router.get('/guilds/:guildId/moderators', requireAuth, async (req, res) => {
  try {
    ok(res, await guildDb.getModerators(req.params.guildId));
  } catch (e) { err(res, 500, e.message); }
});

router.post('/guilds/:guildId/moderators', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { userId, username, userAvatar, roleName, permissions } = req.body;
    if (!userId) return err(res, 400, 'userId is required');
    const guild = await guildDb.getGuildById(guildId);
    if (guild?.createdBy !== req.uid) return err(res, 403, 'Only the guild owner can add moderators');
    const mod = await guildDb.addModerator(guildId, userId, { username, userAvatar, roleName, permissions: permissions || {}, addedBy: req.uid });
    ok(res, mod);
  } catch (e) { err(res, 500, e.message); }
});

router.delete('/guilds/:guildId/moderators/:userId', requireAuth, async (req, res) => {
  try {
    const { guildId, userId } = req.params;
    const guild = await guildDb.getGuildById(guildId);
    if (guild?.createdBy !== req.uid) return err(res, 403, 'Only the guild owner can remove moderators');
    await guildDb.removeModerator(guildId, userId);
    ok(res, { removed: true });
  } catch (e) { err(res, 500, e.message); }
});

router.put('/guilds/:guildId/moderators/:userId/permissions', requireAuth, async (req, res) => {
  try {
    const { guildId, userId } = req.params;
    const guild = await guildDb.getGuildById(guildId);
    if (guild?.createdBy !== req.uid) return err(res, 403, 'Only the guild owner can update permissions');
    const mod = await guildDb.updateModeratorPermissions(guildId, userId, req.body.permissions);
    ok(res, mod);
  } catch (e) { err(res, 500, e.message); }
});

// ─── Invites ──────────────────────────────────────────────────────────────────

router.get('/guilds/:guildId/invites', requireAuth, async (req, res) => {
  try {
    ok(res, await guildDb.getInvites(req.params.guildId));
  } catch (e) { err(res, 500, e.message); }
});

router.post('/guilds/:guildId/invites', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    const guild = await guildDb.getGuildById(guildId);
    if (guild?.createdBy !== req.uid) return err(res, 403, 'Only the guild owner can create invites');
    const invite = await guildDb.createInvite(guildId, req.uid, req.body);
    ok(res, invite);
  } catch (e) { err(res, 500, e.message); }
});

router.delete('/guilds/:guildId/invites/:inviteId', requireAuth, async (req, res) => {
  try {
    const deactivated = await guildDb.deactivateInvite(req.params.inviteId, req.uid);
    if (!deactivated) return err(res, 403, 'Not authorized or invite not found');
    ok(res, { deactivated: true });
  } catch (e) { err(res, 500, e.message); }
});

// ─── DAO link ─────────────────────────────────────────────────────────────────

router.post('/guilds/:guildId/dao', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { daoAddress, chainId } = req.body;
    if (!daoAddress || !chainId) return err(res, 400, 'daoAddress and chainId are required');
    const updated = await guildDb.linkDao(guildId, req.uid, daoAddress, Number(chainId));
    if (!updated) return err(res, 403, 'Not authorized or guild not found');
    await guildRedis.invalidateGuild(guildId);
    await guildRedis.invalidateUserGuilds(req.uid);
    ok(res, updated);
  } catch (e) { logger.error('POST /guilds/:guildId/dao:', e); err(res, 500, e.message); }
});

router.delete('/guilds/:guildId/dao', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    const updated = await guildDb.unlinkDao(guildId, req.uid);
    if (!updated) return err(res, 403, 'Not authorized or guild not found');
    await guildRedis.invalidateGuild(guildId);
    await guildRedis.invalidateUserGuilds(req.uid);
    ok(res, updated);
  } catch (e) { logger.error('DELETE /guilds/:guildId/dao:', e); err(res, 500, e.message); }
});

// ─── External links ───────────────────────────────────────────────────────────

router.get('/guilds/:guildId/settings/links', requireAuth, async (req, res) => {
  try {
    ok(res, await guildDb.getExternalLinks(req.params.guildId));
  } catch (e) { err(res, 500, e.message); }
});

router.put('/guilds/:guildId/settings/links', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    const guild = await guildDb.getGuildById(guildId);
    if (guild?.createdBy !== req.uid) return err(res, 403, 'Only the guild owner can update links');
    const links = await guildDb.updateExternalLinks(guildId, req.uid, req.body);
    ok(res, links);
  } catch (e) { err(res, 500, e.message); }
});

export default router;
