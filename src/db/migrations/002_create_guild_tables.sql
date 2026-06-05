-- ============================================================
-- Guild System Tables — PostgreSQL
-- Run: node src/scripts/migrate.js --file 002_create_guild_tables
-- ============================================================

-- Core guild data
CREATE TABLE IF NOT EXISTS guilds (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100)  NOT NULL,
  description   TEXT,
  genre         VARCHAR(50),
  privacy       VARCHAR(10)   NOT NULL DEFAULT 'public'
                  CHECK (privacy IN ('public', 'private')),
  logo_url      TEXT,
  banner_url    TEXT,
  created_by    VARCHAR(128)  NOT NULL,   -- Firebase UID
  member_count  INTEGER       NOT NULL DEFAULT 1,
  token_gating  JSONB,                    -- { tokenType, tokenAddress, minTokenAmount, name, symbol, decimals }
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Membership records
CREATE TABLE IF NOT EXISTS guild_members (
  guild_id        UUID          NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id         VARCHAR(128)  NOT NULL,  -- Firebase UID
  username        VARCHAR(100),
  display_name    VARCHAR(100),
  user_avatar     TEXT,
  wallet_address  VARCHAR(42),
  status          VARCHAR(20)   NOT NULL DEFAULT 'member'
                    CHECK (status IN ('member', 'moderator', 'owner', 'pending')),
  invite_id       VARCHAR(100),
  joined_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id)
);

-- Moderators with granular permissions
CREATE TABLE IF NOT EXISTS guild_moderators (
  guild_id      UUID         NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id       VARCHAR(128) NOT NULL,
  username      VARCHAR(100),
  user_avatar   TEXT,
  role_name     VARCHAR(50),
  permissions   JSONB NOT NULL DEFAULT '{
    "canLockChat": false,
    "canDeleteMessages": false,
    "canPinMessages": false,
    "canBanMembers": false,
    "canManageMembers": false
  }'::jsonb,
  added_by      VARCHAR(128),
  added_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id)
);

-- Invite links
CREATE TABLE IF NOT EXISTS guild_invites (
  id          VARCHAR(100)  PRIMARY KEY,
  guild_id    UUID          NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  code        VARCHAR(20)   UNIQUE NOT NULL,
  created_by  VARCHAR(128)  NOT NULL,
  expires_at  TIMESTAMPTZ,
  max_uses    INTEGER,
  uses        INTEGER       NOT NULL DEFAULT 0,
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Banned users
CREATE TABLE IF NOT EXISTS guild_bans (
  guild_id   UUID         NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id    VARCHAR(128) NOT NULL,
  username   VARCHAR(100),
  banned_by  VARCHAR(128),
  banned_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id)
);

-- Per-guild chat settings
CREATE TABLE IF NOT EXISTS guild_chat_settings (
  guild_id      UUID         PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
  is_locked     BOOLEAN      NOT NULL DEFAULT FALSE,
  message_delay INTEGER      NOT NULL DEFAULT 0,   -- seconds
  updated_by    VARCHAR(128),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Per-guild external links
CREATE TABLE IF NOT EXISTS guild_external_links (
  guild_id    UUID  PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
  website     TEXT,
  twitter     TEXT,
  discord     TEXT,
  telegram    TEXT,
  other       TEXT,
  updated_by  VARCHAR(128),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_guilds_privacy       ON guilds(privacy);
CREATE INDEX IF NOT EXISTS idx_guilds_genre         ON guilds(genre);
CREATE INDEX IF NOT EXISTS idx_guilds_member_count  ON guilds(member_count DESC);
CREATE INDEX IF NOT EXISTS idx_guilds_created_by    ON guilds(created_by);
CREATE INDEX IF NOT EXISTS idx_guilds_name_fts      ON guilds USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_guilds_updated_at    ON guilds(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_guild_members_user_id  ON guild_members(user_id);
CREATE INDEX IF NOT EXISTS idx_guild_members_status   ON guild_members(guild_id, status);

CREATE INDEX IF NOT EXISTS idx_guild_invites_code      ON guild_invites(code) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_guild_invites_guild_id  ON guild_invites(guild_id);

CREATE INDEX IF NOT EXISTS idx_guild_bans_guild_id ON guild_bans(guild_id);
