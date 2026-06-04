// services/swapTrackingService.js
import Database from "../db/postgres.js";

// ─── Write ─────────────────────────────────────────────────────────────────

export async function recordSwap(data) {
  const {
    wallet_address,
    chain_id,
    sell_token_symbol,
    sell_token_address,
    buy_token_symbol,
    buy_token_address,
    sell_amount_raw,
    buy_amount_raw,
    sell_amount_usd = null,
    buy_amount_usd = null,
    tx_hash,
    block_number = null,
    gas_used = null,
    slippage = null,
    price_impact = null,
    fee_amount_raw = null,
    confirmed_at = null,
  } = data;

  const userRow = await Database.query(
    `SELECT id FROM users WHERE wallet_address = $1 LIMIT 1`,
    [wallet_address.trim()],
  );

  const user_id = userRow.rows[0]?.id ?? null;

  const { rows } = await Database.query(
    `INSERT INTO swap_transactions (
        wallet_address, user_id, chain_id,
        sell_token_symbol, sell_token_address,
        buy_token_symbol,  buy_token_address,
        sell_amount_raw,   buy_amount_raw,
        sell_amount_usd,   buy_amount_usd,
        tx_hash, block_number, gas_used,
        slippage, price_impact, fee_amount_raw,
        confirmed_at
      ) VALUES (
        $1,  $2,  $3,
        $4,  $5,
        $6,  $7,
        $8,  $9,
        $10, $11,
        $12, $13, $14,
        $15, $16, $17,
        COALESCE($18::TIMESTAMPTZ, NOW())
      )
      ON CONFLICT (tx_hash) DO NOTHING
      RETURNING *`,
    [
      wallet_address.trim(),
      user_id,
      chain_id,
      sell_token_symbol,
      sell_token_address,
      buy_token_symbol,
      buy_token_address,
      sell_amount_raw,
      buy_amount_raw,
      sell_amount_usd,
      buy_amount_usd,
      tx_hash,
      block_number,
      gas_used,
      slippage,
      price_impact,
      fee_amount_raw,
      confirmed_at,
    ],
  );

  if (rows.length === 0) {
    const existing = await Database.query(
      `SELECT * FROM swap_transactions WHERE tx_hash = $1`,
      [tx_hash],
    );
    return { swap: existing.rows[0], duplicate: true };
  }

  return { swap: rows[0], duplicate: false };
}

// ─── Read: single wallet ────────────────────────────────────────────────────

export async function getWalletHistory(walletAddress, opts = {}) {
  const {
    chainId = null,
    limit = 20,
    offset = 0,
    from = null,
    to = null,
  } = opts;

  const conditions = ["wallet_address = $1"];
  const values = [walletAddress.trim()];
  let i = 2;

  if (chainId) {
    conditions.push(`chain_id = $${i++}`);
    values.push(chainId);
  }
  if (from) {
    conditions.push(`confirmed_at >= $${i++}::TIMESTAMPTZ`);
    values.push(from);
  }
  if (to) {
    conditions.push(`confirmed_at <= $${i++}::TIMESTAMPTZ`);
    values.push(to);
  }

  const where = conditions.join(" AND ");

  const [dataRes, countRes] = await Promise.all([
    Database.query(
      `SELECT * FROM swap_transactions
       WHERE ${where}
       ORDER BY confirmed_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...values, limit, offset],
    ),
    Database.query(`SELECT COUNT(*) FROM swap_transactions WHERE ${where}`, values),
  ]);

  return {
    swaps: dataRes.rows,
    total: parseInt(countRes.rows[0].count, 10),
    limit: parseInt(limit, 10),
    offset: parseInt(offset, 10),
  };
}

export async function getWalletStats(
  walletAddress,
  { from = null, to = null } = {},
) {
  const conditions = ["wallet_address = $1"];
  const values = [walletAddress.trim()];
  let i = 2;

  if (from) {
    conditions.push(`confirmed_at >= $${i++}::TIMESTAMPTZ`);
    values.push(from);
  }
  if (to) {
    conditions.push(`confirmed_at <= $${i++}::TIMESTAMPTZ`);
    values.push(to);
  }

  const where = conditions.join(" AND ");

  const { rows } = await Database.query(
    `SELECT
       COUNT(*)                                     AS total_swaps,
       COUNT(DISTINCT chain_id)                     AS chains_used,
       COALESCE(SUM(sell_amount_usd), 0)            AS total_volume_usd,
       COALESCE(AVG(sell_amount_usd), 0)            AS avg_swap_usd,
       COALESCE(MAX(sell_amount_usd), 0)            AS largest_swap_usd,
       MIN(confirmed_at)                            AS first_swap_at,
       MAX(confirmed_at)                            AS last_swap_at,
       COUNT(DISTINCT sell_token_symbol || buy_token_symbol) AS unique_pairs
     FROM swap_transactions
     WHERE ${where}`,
    values,
  );

  return rows[0];
}

// ─── Leaderboards ───────────────────────────────────────────────────────────

export async function getLeaderboard(opts = {}) {
  const {
    from = null,
    to = null,
    chainId = null,
    limit = 50,
    rankBy = "volume",
  } = opts;

  const conditions = ["1=1"];
  const values = [];
  let i = 1;

  if (from) {
    conditions.push(`confirmed_at >= $${i++}::TIMESTAMPTZ`);
    values.push(from);
  }
  if (to) {
    conditions.push(`confirmed_at <= $${i++}::TIMESTAMPTZ`);
    values.push(to);
  }
  if (chainId) {
    conditions.push(`chain_id = $${i++}`);
    values.push(chainId);
  }

  const where = conditions.join(" AND ");
  const orderBy =
    rankBy === "count"
      ? "total_swaps DESC"
      : "total_volume_usd DESC NULLS LAST";

  const { rows } = await Database.query(
    `SELECT
       s.wallet_address,
       u.username,
       COUNT(*)                       AS total_swaps,
       COALESCE(SUM(s.sell_amount_usd), 0) AS total_volume_usd,
       COUNT(DISTINCT s.chain_id)     AS chains_used,
       MAX(s.confirmed_at)            AS last_swap_at,
       RANK() OVER (ORDER BY ${orderBy}) AS rank
     FROM swap_transactions s
     LEFT JOIN users u ON u.wallet_address = s.wallet_address
     WHERE ${where}
     GROUP BY s.wallet_address, u.username
     ORDER BY ${orderBy}
     LIMIT $${i}`,
    [...values, limit],
  );

  return rows;
}

export async function getWalletRank(
  walletAddress,
  { from = null, to = null, rankBy = "volume" } = {},
) {
  const conditions = ["1=1"];
  const values = [];
  let i = 1;

  if (from) {
    conditions.push(`confirmed_at >= $${i++}::TIMESTAMPTZ`);
    values.push(from);
  }
  if (to) {
    conditions.push(`confirmed_at <= $${i++}::TIMESTAMPTZ`);
    values.push(to);
  }

  const where = conditions.join(" AND ");
  const metric =
    rankBy === "count" ? "COUNT(*)" : "COALESCE(SUM(sell_amount_usd), 0)";

  const { rows } = await Database.query(
    `WITH ranked AS (
       SELECT
         wallet_address,
         ${metric} AS score,
         RANK() OVER (ORDER BY ${metric} DESC NULLS LAST) AS rank
       FROM swap_transactions
       WHERE ${where}
       GROUP BY wallet_address
     )
     SELECT rank, score FROM ranked WHERE wallet_address = $${i}`,
    [...values, walletAddress.trim()],
  );

  return rows[0] ?? { rank: null, score: 0 };
}

export async function getTopPairs({
  from = null,
  to = null,
  chainId = null,
  limit = 10,
} = {}) {
  const conditions = ["1=1"];
  const values = [];
  let i = 1;

  if (from) {
    conditions.push(`confirmed_at >= $${i++}::TIMESTAMPTZ`);
    values.push(from);
  }
  if (to) {
    conditions.push(`confirmed_at <= $${i++}::TIMESTAMPTZ`);
    values.push(to);
  }
  if (chainId) {
    conditions.push(`chain_id = $${i++}`);
    values.push(chainId);
  }

  const { rows } = await Database.query(
    `SELECT
       sell_token_symbol,
       buy_token_symbol,
       COUNT(*)                           AS swap_count,
       COALESCE(SUM(sell_amount_usd), 0) AS volume_usd
     FROM swap_transactions
     WHERE ${conditions.join(" AND ")}
     GROUP BY sell_token_symbol, buy_token_symbol
     ORDER BY swap_count DESC
     LIMIT $${i}`,
    [...values, limit],
  );

  return rows;
}
