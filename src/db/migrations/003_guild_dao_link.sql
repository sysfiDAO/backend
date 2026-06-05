-- ============================================================
-- Guild ↔ DAO link columns
-- Safe to re-run (ADD COLUMN IF NOT EXISTS).
-- ============================================================

ALTER TABLE guilds
  ADD COLUMN IF NOT EXISTS linked_dao_address VARCHAR(42)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS linked_dao_chain_id INTEGER     DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_guilds_linked_dao
  ON guilds(linked_dao_address, linked_dao_chain_id)
  WHERE linked_dao_address IS NOT NULL;
