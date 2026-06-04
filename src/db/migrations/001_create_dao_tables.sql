
CREATE TABLE IF NOT EXISTS daos (
  id SERIAL PRIMARY KEY,
  dao_address VARCHAR(42) NOT NULL,
  token_address VARCHAR(42) NOT NULL,
  chain_id INTEGER NOT NULL,
  chain_name VARCHAR(50) NOT NULL,
  genre VARCHAR(50) NOT NULL,
  genre_id INTEGER NOT NULL,
  dao_name VARCHAR(255) NOT NULL,
  image_url TEXT,
  threshold VARCHAR(100) NOT NULL,
  quorum INTEGER NOT NULL,
  voting_period_hours INTEGER NOT NULL,
  timelock_period_hours INTEGER NOT NULL,
  created_at BIGINT NOT NULL,
  created_at_date TIMESTAMP NOT NULL,
  explorer VARCHAR(255),
  explorer_url TEXT,
  cached_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(dao_address, chain_id)
);

-- Sync Metadata Table
CREATE TABLE IF NOT EXISTS sync_metadata (
  id SERIAL PRIMARY KEY,
  chain_id INTEGER UNIQUE NOT NULL,
  chain_name VARCHAR(50) NOT NULL,
  total_daos INTEGER DEFAULT 0,
  last_sync_at TIMESTAMP DEFAULT NOW(),
  last_block_number BIGINT,
  sync_status VARCHAR(20) DEFAULT 'idle',
  error_message TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_daos_chain_id ON daos(chain_id);
CREATE INDEX IF NOT EXISTS idx_daos_genre_id ON daos(genre_id);
CREATE INDEX IF NOT EXISTS idx_daos_created_at ON daos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_daos_dao_name ON daos(dao_name);
CREATE INDEX IF NOT EXISTS idx_daos_chain_genre ON daos(chain_id, genre_id);
CREATE INDEX IF NOT EXISTS idx_sync_metadata_chain_id ON sync_metadata(chain_id);

-- Full-text search index for DAO names
CREATE INDEX IF NOT EXISTS idx_daos_name_search ON daos USING gin(to_tsvector('english', dao_name));