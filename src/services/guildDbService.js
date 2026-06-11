// services/guildDbService.js
// Guild operations backed by PostgreSQL — core data that needs ACID guarantees:
// guilds, members, moderators, invites, bans, settings.
import db from '../db/postgres.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';

// ─── Guilds ───────────────────────────────────────────────────────────────────

export async function createGuild(data) {
  const {
    name, description, genre, privacy, logoUrl, bannerUrl,
    createdBy, tokenGating,
  } = data;

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const guildRes = await client.query(
      `INSERT INTO guilds (name, description, genre, privacy, logo_url, banner_url, created_by, token_gating, member_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1)
       RETURNING *`,
      [name, description, genre, privacy, logoUrl, bannerUrl, createdBy, tokenGating ? JSON.stringify(tokenGating) : null],
    );
    const guild = guildRes.rows[0];

    // Owner is automatically a member
    await client.query(
      `INSERT INTO guild_members (guild_id, user_id, status) VALUES ($1,$2,'owner')`,
      [guild.id, createdBy],
    );

    // Create default chat settings
    await client.query(
      `INSERT INTO guild_chat_settings (guild_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [guild.id],
    );

    await client.query('COMMIT');
    return normalizeGuild(guild);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getGuildById(guildId) {
  const res = await db.query(`SELECT * FROM guilds WHERE id = $1`, [guildId]);
  return res.rows[0] ? normalizeGuild(res.rows[0]) : null;
}

export async function getGuildsByIds(guildIds) {
  if (!guildIds?.length) return [];
  const res = await db.query(`SELECT * FROM guilds WHERE id = ANY($1)`, [guildIds]);
  return res.rows.map(normalizeGuild);
}

export async function updateGuild(guildId, ownerUid, updates) {
  const allowed = ['name', 'description', 'genre', 'logo_url', 'banner_url'];
  const fields = [];
  const values = [];
  let idx = 1;

  for (const [k, v] of Object.entries(updates)) {
    if (allowed.includes(k)) {
      fields.push(`${k} = $${idx++}`);
      values.push(v);
    }
  }
  if (fields.length === 0) return null;

  fields.push(`updated_at = NOW()`);
  values.push(guildId, ownerUid);

  const res = await db.query(
    `UPDATE guilds SET ${fields.join(', ')}
     WHERE id = $${idx++} AND created_by = $${idx}
     RETURNING *`,
    values,
  );
  return res.rows[0] ? normalizeGuild(res.rows[0]) : null;
}

export async function deleteGuild(guildId, ownerUid) {
  const res = await db.query(
    `DELETE FROM guilds WHERE id = $1 AND created_by = $2 RETURNING id`,
    [guildId, ownerUid],
  );
  return res.rowCount > 0;
}

// ─── Guild lists ──────────────────────────────────────────────────────────────

export async function getUserGuilds(userId) {
  const res = await db.query(
    `SELECT g.* FROM guilds g
     JOIN guild_members gm ON gm.guild_id = g.id
     WHERE gm.user_id = $1
     ORDER BY g.updated_at DESC`,
    [userId],
  );
  return res.rows.map(normalizeGuild);
}

export async function getTopGuilds(limit = 10) {
  const res = await db.query(
    `SELECT * FROM guilds
     WHERE privacy = 'public'
     ORDER BY member_count DESC, created_at DESC
     LIMIT $1`,
    [limit],
  );
  return res.rows.map(normalizeGuild);
}

export async function searchGuilds(query, genre = null, limit = 30) {
  const params = [`%${query}%`];
  let sql = `SELECT * FROM guilds WHERE privacy = 'public'
             AND (name ILIKE $1 OR description ILIKE $1)`;

  if (genre) {
    params.push(genre);
    sql += ` AND genre = $${params.length}`;
  }
  params.push(limit);
  sql += ` ORDER BY member_count DESC LIMIT $${params.length}`;

  const res = await db.query(sql, params);
  return res.rows.map(normalizeGuild);
}

// ─── Membership ───────────────────────────────────────────────────────────────

export async function getMembership(guildId, userId) {
  const res = await db.query(
    `SELECT * FROM guild_members WHERE guild_id = $1 AND user_id = $2`,
    [guildId, userId],
  );
  return res.rows[0] || null;
}

export async function joinGuild(guildId, userId, memberData, inviteId = null) {
  const { username, displayName, userAvatar, walletAddress } = memberData;
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Check ban
    const banCheck = await client.query(
      `SELECT 1 FROM guild_bans WHERE guild_id = $1 AND user_id = $2`,
      [guildId, userId],
    );
    if (banCheck.rowCount > 0) throw new Error('You are banned from this guild');

    // Idempotent insert
    const res = await client.query(
      `INSERT INTO guild_members (guild_id, user_id, username, display_name, user_avatar, wallet_address, status, invite_id)
       VALUES ($1,$2,$3,$4,$5,$6,'member',$7)
       ON CONFLICT (guild_id, user_id) DO NOTHING
       RETURNING *`,
      [guildId, userId, username, displayName, userAvatar, walletAddress, inviteId],
    );

    if (res.rowCount > 0) {
      await client.query(
        `UPDATE guilds SET member_count = member_count + 1, updated_at = NOW() WHERE id = $1`,
        [guildId],
      );

      // Increment invite use count
      if (inviteId) {
        await client.query(
          `UPDATE guild_invites SET uses = uses + 1 WHERE id = $1 AND is_active = TRUE`,
          [inviteId],
        );
      }
    }

    await client.query('COMMIT');
    return res.rows[0] || null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function leaveGuild(guildId, userId) {
  const guild = await getGuildById(guildId);
  if (!guild) throw new Error('Guild not found');
  if (guild.createdBy === userId) throw new Error('Owner cannot leave — delete the guild instead');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const res = await client.query(
      `DELETE FROM guild_members WHERE guild_id = $1 AND user_id = $2 RETURNING user_id`,
      [guildId, userId],
    );
    if (res.rowCount > 0) {
      await client.query(
        `UPDATE guilds SET member_count = GREATEST(member_count - 1, 0), updated_at = NOW() WHERE id = $1`,
        [guildId],
      );
    }
    await client.query('COMMIT');
    return res.rowCount > 0;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getMembers(guildId) {
  const res = await db.query(
    `SELECT * FROM guild_members WHERE guild_id = $1 ORDER BY joined_at ASC`,
    [guildId],
  );
  return res.rows;
}

// ─── Moderators ───────────────────────────────────────────────────────────────

export async function getModerators(guildId) {
  const res = await db.query(
    `SELECT * FROM guild_moderators WHERE guild_id = $1 ORDER BY added_at ASC`,
    [guildId],
  );
  return res.rows;
}

export async function addModerator(guildId, userId, data) {
  const { username, userAvatar, roleName, permissions, addedBy } = data;
  const res = await db.query(
    `INSERT INTO guild_moderators (guild_id, user_id, username, user_avatar, role_name, permissions, added_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (guild_id, user_id) DO UPDATE SET
       role_name = EXCLUDED.role_name,
       permissions = EXCLUDED.permissions,
       added_at = NOW()
     RETURNING *`,
    [guildId, userId, username, userAvatar, roleName, JSON.stringify(permissions), addedBy],
  );
  return res.rows[0];
}

export async function removeModerator(guildId, userId) {
  const res = await db.query(
    `DELETE FROM guild_moderators WHERE guild_id = $1 AND user_id = $2 RETURNING user_id`,
    [guildId, userId],
  );
  return res.rowCount > 0;
}

export async function updateModeratorPermissions(guildId, userId, permissions) {
  const res = await db.query(
    `UPDATE guild_moderators SET permissions = $3 WHERE guild_id = $1 AND user_id = $2 RETURNING *`,
    [guildId, userId, JSON.stringify(permissions)],
  );
  return res.rows[0] || null;
}

// ─── Invite links ─────────────────────────────────────────────────────────────

export async function getInvites(guildId) {
  const res = await db.query(
    `SELECT * FROM guild_invites WHERE guild_id = $1 ORDER BY created_at DESC`,
    [guildId],
  );
  return res.rows;
}

export async function getInviteByCode(code) {
  const res = await db.query(
    `SELECT gi.*, g.name as guild_name, g.description as guild_description,
            g.logo_url, g.banner_url, g.privacy, g.member_count, g.genre,
            g.token_gating, g.created_by
     FROM guild_invites gi
     JOIN guilds g ON g.id = gi.guild_id
     WHERE gi.code = $1 AND gi.is_active = TRUE`,
    [code],
  );
  return res.rows[0] || null;
}

export async function createInvite(guildId, createdBy, options = {}) {
  const code = generateCode();
  const id = `${guildId}_${code}`;
  const res = await db.query(
    `INSERT INTO guild_invites (id, guild_id, code, created_by, expires_at, max_uses)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [id, guildId, code, createdBy, options.expiresAt || null, options.maxUses || null],
  );
  return res.rows[0];
}

export async function deactivateInvite(inviteId, ownerUid) {
  const res = await db.query(
    `UPDATE guild_invites SET is_active = FALSE
     WHERE id = $1 AND guild_id IN (SELECT id FROM guilds WHERE created_by = $2)
     RETURNING id`,
    [inviteId, ownerUid],
  );
  return res.rowCount > 0;
}

// ─── Bans ─────────────────────────────────────────────────────────────────────

export async function banUser(guildId, userId, username, bannedBy) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO guild_bans (guild_id, user_id, username, banned_by)
       VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [guildId, userId, username, bannedBy],
    );
    const delRes = await client.query(
      `DELETE FROM guild_members WHERE guild_id = $1 AND user_id = $2 RETURNING user_id`,
      [guildId, userId],
    );
    if (delRes.rowCount > 0) {
      await client.query(
        `UPDATE guilds SET member_count = GREATEST(member_count - 1, 0) WHERE id = $1`,
        [guildId],
      );
    }
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Chat settings ────────────────────────────────────────────────────────────

export async function getChatSettings(guildId) {
  const res = await db.query(
    `SELECT * FROM guild_chat_settings WHERE guild_id = $1`,
    [guildId],
  );
  return res.rows[0] || { guild_id: guildId, is_locked: false, message_delay: 0 };
}

export async function updateChatSettings(guildId, ownerUid, settings) {
  const { isLocked, messageDelay } = settings;
  const res = await db.query(
    `INSERT INTO guild_chat_settings (guild_id, is_locked, message_delay, updated_by, updated_at)
     VALUES ($1,$2,$3,$4,NOW())
     ON CONFLICT (guild_id) DO UPDATE SET
       is_locked = EXCLUDED.is_locked,
       message_delay = EXCLUDED.message_delay,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING *`,
    [guildId, isLocked ?? false, messageDelay ?? 0, ownerUid],
  );
  return res.rows[0];
}

// ─── External links ───────────────────────────────────────────────────────────

export async function getExternalLinks(guildId) {
  const res = await db.query(
    `SELECT * FROM guild_external_links WHERE guild_id = $1`,
    [guildId],
  );
  return res.rows[0] || null;
}

export async function updateExternalLinks(guildId, ownerUid, links) {
  const { website, twitter, discord, telegram, other } = links;
  const res = await db.query(
    `INSERT INTO guild_external_links (guild_id, website, twitter, discord, telegram, other, updated_by, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT (guild_id) DO UPDATE SET
       website = EXCLUDED.website, twitter = EXCLUDED.twitter,
       discord = EXCLUDED.discord, telegram = EXCLUDED.telegram,
       other = EXCLUDED.other, updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING *`,
    [guildId, website || null, twitter || null, discord || null, telegram || null, other || null, ownerUid],
  );
  return res.rows[0];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeGuild(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    genre: row.genre,
    privacy: row.privacy,
    logoUrl: row.logo_url,
    bannerUrl: row.banner_url,
    createdBy: row.created_by,
    memberCount: row.member_count,
    tokenGating: row.token_gating,
    linkedDaoAddress: row.linked_dao_address  || null,
    linkedDaoChainId: row.linked_dao_chain_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // snake_case aliases the frontend currently expects
    logo_url:      row.logo_url,
    banner_url:    row.banner_url,
    member_count:  row.member_count,
    created_by:    row.created_by,
    linked_dao_address:  row.linked_dao_address  || null,
    linked_dao_chain_id: row.linked_dao_chain_id || null,
  };
}

function generateCode(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return Array.from({ length: len }, () => chars[crypto.randomInt(chars.length)]).join('');
}

// ─── DAO link ─────────────────────────────────────────────────────────────────

export async function linkDao(guildId, ownerUid, daoAddress, chainId) {
  const res = await db.query(
    `UPDATE guilds
     SET linked_dao_address = $3, linked_dao_chain_id = $4, updated_at = NOW()
     WHERE id = $1 AND created_by = $2
     RETURNING *`,
    [guildId, ownerUid, daoAddress.toLowerCase(), chainId],
  );
  return res.rows[0] ? normalizeGuild(res.rows[0]) : null;
}

export async function unlinkDao(guildId, ownerUid) {
  const res = await db.query(
    `UPDATE guilds
     SET linked_dao_address = NULL, linked_dao_chain_id = NULL, updated_at = NOW()
     WHERE id = $1 AND created_by = $2
     RETURNING *`,
    [guildId, ownerUid],
  );
  return res.rows[0] ? normalizeGuild(res.rows[0]) : null;
}

export default {
  createGuild, getGuildById, getGuildsByIds, updateGuild, deleteGuild,
  getUserGuilds, getTopGuilds, searchGuilds,
  getMembership, joinGuild, leaveGuild, getMembers,
  getModerators, addModerator, removeModerator, updateModeratorPermissions,
  getInvites, getInviteByCode, createInvite, deactivateInvite,
  banUser,
  getChatSettings, updateChatSettings,
  getExternalLinks, updateExternalLinks,
  linkDao, unlinkDao,
};
