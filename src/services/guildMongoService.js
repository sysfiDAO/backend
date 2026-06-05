// services/guildMongoService.js
// Guild messages and posts — stored in MongoDB for high-write workloads
// and flexible schema evolution.
import { getMongoDB } from '../db/mongodb.js';
import { ObjectId } from 'mongodb';
import logger from '../utils/logger.js';

const EDIT_LIMIT_MS = 15 * 60 * 1000; // 15 minutes

const col = {
  messages:    () => getMongoDB().collection('guild_messages'),
  posts:       () => getMongoDB().collection('guild_posts'),
  likes:       () => getMongoDB().collection('guild_post_likes'),
  comments:    () => getMongoDB().collection('guild_post_comments'),
  impressions: () => getMongoDB().collection('guild_post_impressions'),
};

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function sendMessage(guildId, data) {
  const doc = {
    guildId,
    userId:      data.userId,
    username:    data.username,
    displayName: data.displayName   || null,
    userAvatar:  data.userAvatar    || null,
    text:        data.text.trim(),
    isEdited:    false,
    editedAt:    null,
    isPinned:    false,
    pinnedAt:    null,
    pinnedBy:    null,
    replyTo:     data.replyTo       || null,
    timestamp:   Date.now(),
    createdAt:   new Date(),
  };
  const result = await col.messages().insertOne(doc);
  return { id: result.insertedId.toString(), ...doc };
}

export async function getMessages(guildId, { limit = 30, before = null } = {}) {
  const filter = { guildId };
  if (before) filter.timestamp = { $lt: Number(before) };

  const docs = await col.messages()
    .find(filter)
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();

  return docs.reverse().map(formatMessage);
}

export async function getMessagesSince(guildId, since) {
  const docs = await col.messages()
    .find({ guildId, timestamp: { $gt: Number(since) } })
    .sort({ timestamp: 1 })
    .toArray();
  return docs.map(formatMessage);
}

export async function getPinnedMessages(guildId) {
  const docs = await col.messages()
    .find({ guildId, isPinned: true })
    .sort({ pinnedAt: -1 })
    .toArray();
  return docs.map(formatMessage);
}

export async function editMessage(messageId, userId, newText) {
  const msg = await col.messages().findOne({ _id: new ObjectId(messageId) });
  if (!msg) throw new Error('Message not found');
  if (msg.userId !== userId) throw new Error('You can only edit your own messages');
  if (Date.now() - msg.timestamp > EDIT_LIMIT_MS) throw new Error('Edit window expired (15 min)');

  await col.messages().updateOne(
    { _id: new ObjectId(messageId) },
    { $set: { text: newText.trim(), isEdited: true, editedAt: new Date() } },
  );
  return true;
}

export async function deleteMessage(messageId, userId, isAdmin = false) {
  const msg = await col.messages().findOne({ _id: new ObjectId(messageId) });
  if (!msg) throw new Error('Message not found');
  if (!isAdmin && msg.userId !== userId) throw new Error('You can only delete your own messages');

  await col.messages().deleteOne({ _id: new ObjectId(messageId) });
  return true;
}

export async function deleteAllUserMessages(guildId, userId) {
  const res = await col.messages().deleteMany({ guildId, userId });
  return res.deletedCount;
}

export async function pinMessage(messageId, pinnedBy) {
  await col.messages().updateOne(
    { _id: new ObjectId(messageId) },
    { $set: { isPinned: true, pinnedAt: new Date(), pinnedBy } },
  );
  return true;
}

export async function unpinMessage(messageId) {
  await col.messages().updateOne(
    { _id: new ObjectId(messageId) },
    { $set: { isPinned: false, pinnedAt: null, pinnedBy: null } },
  );
  return true;
}

// ─── Posts ────────────────────────────────────────────────────────────────────

export async function createPost(guildId, data) {
  const doc = {
    guildId,
    userId:       data.userId,
    username:     data.username,
    userAvatar:   data.userAvatar || null,
    description:  data.description.trim(),
    imageUrl:     data.imageUrl   || null,
    likesCount:     0,
    commentsCount:  0,
    impressionCount: 0,
    isDeleted:      false,
    timestamp:      Date.now(),
    createdAt:      new Date(),
    updatedAt:      null,
  };
  const result = await col.posts().insertOne(doc);
  return { id: result.insertedId.toString(), ...doc };
}

export async function getPosts(guildId, { limit = 10, before = null } = {}) {
  const filter = { guildId, isDeleted: false };
  if (before) filter.timestamp = { $lt: Number(before) };

  const docs = await col.posts()
    .find(filter)
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();
  return docs.map(formatPost);
}

export async function getPostById(postId) {
  const doc = await col.posts().findOne({ _id: new ObjectId(postId), isDeleted: false });
  return doc ? formatPost(doc) : null;
}

export async function deletePost(postId, userId, isAdmin = false) {
  const post = await col.posts().findOne({ _id: new ObjectId(postId) });
  if (!post) throw new Error('Post not found');
  if (!isAdmin && post.userId !== userId) throw new Error('You can only delete your own posts');

  await col.posts().updateOne(
    { _id: new ObjectId(postId) },
    { $set: { isDeleted: true, updatedAt: new Date() } },
  );
  return true;
}

// ─── Likes ────────────────────────────────────────────────────────────────────

export async function toggleLike(postId, guildId, userId, username) {
  const existing = await col.likes().findOne({ postId, userId });

  if (existing) {
    await col.likes().deleteOne({ _id: existing._id });
    await col.posts().updateOne(
      { _id: new ObjectId(postId) },
      { $inc: { likesCount: -1 } },
    );
    return { liked: false };
  }

  await col.likes().insertOne({
    postId, guildId, userId, username, likedAt: new Date(),
  });
  await col.posts().updateOne(
    { _id: new ObjectId(postId) },
    { $inc: { likesCount: 1 } },
  );
  return { liked: true };
}

export async function isPostLiked(postId, userId) {
  const doc = await col.likes().findOne({ postId, userId });
  return !!doc;
}

export async function getPostLikes(postId, limit = 50) {
  return col.likes().find({ postId }).sort({ likedAt: -1 }).limit(limit).toArray();
}

// ─── Reactions ────────────────────────────────────────────────────────────────

const VALID_REACTIONS = new Set(['fire', 'heart', 'thumbsup', 'laugh', 'wow', 'sad']);

/**
 * Upsert a reaction. One reaction per user per post; changing type replaces old one.
 * Returns the new reaction type (or null if unchanged).
 */
export async function upsertReaction(postId, guildId, userId, reactionType) {
  if (!VALID_REACTIONS.has(reactionType)) throw new Error('Invalid reaction type');

  const reactions = getMongoDB().collection('post_reactions');
  const existing  = await reactions.findOne({ postId, userId });

  const posts = col.posts();

  if (existing) {
    if (existing.reactionType === reactionType) {
      // Same reaction — treat as toggle-off (remove)
      await reactions.deleteOne({ _id: existing._id });
      await posts.updateOne(
        { _id: new ObjectId(postId) },
        {
          $inc:  { [`reactionCounts.${reactionType}`]: -1 },
          $addToSet: {}, // placeholder; uniqueReactors handled below
        },
      );
      // Decrement uniqueReactors if this was their only reaction
      const remaining = await reactions.countDocuments({ postId, userId });
      if (remaining === 0) {
        await posts.updateOne({ _id: new ObjectId(postId) }, { $inc: { uniqueReactors: -1 } });
      }
      return null;
    }
    // Different reaction — swap
    await reactions.updateOne({ _id: existing._id }, { $set: { reactionType, updatedAt: new Date() } });
    await posts.updateOne(
      { _id: new ObjectId(postId) },
      {
        $inc: {
          [`reactionCounts.${existing.reactionType}`]: -1,
          [`reactionCounts.${reactionType}`]: 1,
        },
      },
    );
    return reactionType;
  }

  // New reaction
  await reactions.insertOne({ postId, guildId, userId, reactionType, createdAt: new Date() });
  await posts.updateOne(
    { _id: new ObjectId(postId) },
    {
      $inc: { [`reactionCounts.${reactionType}`]: 1, uniqueReactors: 1 },
      $setOnInsert: {},
    },
  );
  return reactionType;
}

export async function getUserReaction(postId, userId) {
  const r = await getMongoDB().collection('post_reactions').findOne({ postId, userId });
  return r?.reactionType || null;
}

export async function getReactionSummary(postId) {
  const post = await col.posts().findOne({ _id: new ObjectId(postId) }, { projection: { reactionCounts: 1, uniqueReactors: 1 } });
  return {
    counts:        post?.reactionCounts || {},
    uniqueReactors: post?.uniqueReactors || 0,
  };
}

// ─── Reposts ──────────────────────────────────────────────────────────────────

export async function repostPost(originalPostId, originalGuildId, data) {
  const { userId, username, userAvatar, guildId, comment } = data;

  // Fetch original post
  const original = await col.posts().findOne({ _id: new ObjectId(originalPostId) });
  if (!original) throw new Error('Original post not found');

  const reposts = getMongoDB().collection('post_reposts');

  // Prevent duplicate reposts from same user
  const existing = await reposts.findOne({ originalPostId, userId });
  if (existing) throw new Error('You already reposted this');

  // Record the repost action
  await reposts.insertOne({
    originalPostId,
    originalGuildId,
    userId, username, userAvatar,
    guildId,
    comment: comment?.trim() || null,
    timestamp: Date.now(),
    createdAt: new Date(),
  });

  // Increment repostCount on original
  await col.posts().updateOne(
    { _id: new ObjectId(originalPostId) },
    { $inc: { repostCount: 1 } },
  );

  // Create a "repost entry" in the target guild's post feed so it appears in timeline
  const repostDoc = {
    guildId,
    userId, username,
    userAvatar: userAvatar || null,
    description: original.description,
    imageUrl:    original.imageUrl || null,
    isRepost:    true,
    originalPostId,
    originalAuthor:   original.username,
    originalGuildId,
    repostComment:    comment?.trim() || null,
    likesCount:   0,
    reactionCounts: {},
    commentsCount: 0,
    repostCount:   0,
    uniqueReactors: 0,
    visibilityScore: 0,
    isDeleted: false,
    timestamp: Date.now(),
    createdAt: new Date(),
  };

  const result = await col.posts().insertOne(repostDoc);
  return { id: result.insertedId.toString(), ...repostDoc };
}

export async function hasUserReposted(originalPostId, userId) {
  const r = await getMongoDB().collection('post_reposts').findOne({ originalPostId, userId });
  return !!r;
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export async function addComment(postId, guildId, data) {
  const doc = {
    postId, guildId,
    userId:     data.userId,
    username:   data.username,
    userAvatar: data.userAvatar || null,
    text:       data.text.trim(),
    isDeleted:  false,
    timestamp:  Date.now(),
    createdAt:  new Date(),
  };
  const result = await col.comments().insertOne(doc);
  await col.posts().updateOne(
    { _id: new ObjectId(postId) },
    { $inc: { commentsCount: 1 } },
  );
  return { id: result.insertedId.toString(), ...doc };
}

export async function getComments(postId, { limit = 30, skip = 0 } = {}) {
  const docs = await col.comments()
    .find({ postId, isDeleted: false })
    .sort({ timestamp: 1 })
    .skip(skip)
    .limit(limit)
    .toArray();
  return docs.map(d => ({ ...d, id: d._id.toString() }));
}

export async function deleteComment(commentId, userId, isAdmin = false) {
  const comment = await col.comments().findOne({ _id: new ObjectId(commentId) });
  if (!comment) throw new Error('Comment not found');
  if (!isAdmin && comment.userId !== userId) throw new Error('Cannot delete others\' comments');

  await col.comments().updateOne(
    { _id: new ObjectId(commentId) },
    { $set: { isDeleted: true } },
  );
  await col.posts().updateOne(
    { _id: new ObjectId(comment.postId) },
    { $inc: { commentsCount: -1 } },
  );
  return true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMessage(doc) {
  return {
    id:          doc._id.toString(),
    guildId:     doc.guildId,
    userId:      doc.userId,
    username:    doc.username,
    displayName: doc.displayName,
    userAvatar:  doc.userAvatar,
    text:        doc.text,
    isEdited:    doc.isEdited,
    editedAt:    doc.editedAt,
    isPinned:    doc.isPinned,
    pinnedAt:    doc.pinnedAt,
    pinnedBy:    doc.pinnedBy,
    replyTo:     doc.replyTo,
    createdAt:   doc.createdAt,
    timestamp:   doc.timestamp,
  };
}

// ─── Impressions ──────────────────────────────────────────────────────────────

// Records one impression per user per post (deduped via unique index).
// Returns true if it was a new impression, false if the user already viewed it.
export async function addImpression(postId, userId) {
  try {
    await col.impressions().insertOne({
      postId,
      userId,
      createdAt: new Date(),
    });
    // New impression — increment the counter on the post
    await col.posts().updateOne(
      { _id: new ObjectId(postId) },
      { $inc: { impressionCount: 1 } },
    );
    return true;
  } catch (e) {
    // Duplicate key (11000) = user already viewed — silently skip
    if (e.code === 11000) return false;
    throw e;
  }
}

function formatPost(doc) {
  return {
    id:              doc._id.toString(),
    guildId:         doc.guildId,
    userId:          doc.userId,
    username:        doc.username,
    userAvatar:      doc.userAvatar,
    description:     doc.description,
    imageUrl:        doc.imageUrl,
    likesCount:      doc.likesCount      ?? 0,
    commentsCount:   doc.commentsCount   ?? 0,
    reactionCounts:  doc.reactionCounts  || {},
    repostCount:     doc.repostCount     ?? 0,
    uniqueReactors:  doc.uniqueReactors  ?? 0,
    impressionCount: doc.impressionCount ?? 0,
    isDeleted:       doc.isDeleted,
    createdAt:       doc.createdAt,
    timestamp:       doc.timestamp,
  };
}

export async function ensureGuildIndexes(db) {
  const messages = db.collection('guild_messages');
  await messages.createIndexes([
    { key: { guildId: 1, timestamp: -1 } },
    { key: { guildId: 1, timestamp: 1 } },
    { key: { guildId: 1, isPinned: 1 } },
    { key: { guildId: 1, userId: 1 } },
  ]);

  const posts = db.collection('guild_posts');
  await posts.createIndexes([
    { key: { guildId: 1, timestamp: -1 } },
    { key: { guildId: 1, isDeleted: 1, timestamp: -1 } },
  ]);

  const likes = db.collection('guild_post_likes');
  await likes.createIndexes([
    { key: { postId: 1, userId: 1 }, unique: true },
    { key: { postId: 1 } },
  ]);

  const comments = db.collection('guild_post_comments');
  await comments.createIndexes([
    { key: { postId: 1, timestamp: 1 } },
    { key: { postId: 1, isDeleted: 1 } },
  ]);

  const impressions = db.collection('guild_post_impressions');
  await impressions.createIndexes([
    { key: { postId: 1, userId: 1 }, unique: true },  // deduplication
    { key: { postId: 1 } },
  ]);
}

export default {
  sendMessage, getMessages, getMessagesSince, getPinnedMessages,
  editMessage, deleteMessage, deleteAllUserMessages,
  pinMessage, unpinMessage,
  createPost, getPosts, getPostById, deletePost,
  toggleLike, isPostLiked, getPostLikes,
  upsertReaction, getUserReaction, getReactionSummary,
  repostPost, hasUserReposted,
  addComment, getComments, deleteComment,
  addImpression,
  ensureGuildIndexes,
};
