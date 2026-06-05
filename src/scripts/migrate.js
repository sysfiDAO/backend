// src/scripts/migrate.js
// Runs all SQL migration files in alphabetical order.
// Already-applied migrations are safe to re-run (all use IF NOT EXISTS / ON CONFLICT).
import dotenv from 'dotenv';
import db from '../db/postgres.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, '../db/migrations');

async function migrate() {
  try {
    console.log('🔄 Running database migrations...');
    console.log(`📍 Connecting to: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);

    if (!process.env.DB_HOST) {
      throw new Error('Environment variables not loaded! Check your .env file');
    }

    // Run a specific file if passed as argument, otherwise run all *.sql in order
    const target = process.argv[2];
    let files;

    if (target) {
      const name = target.endsWith('.sql') ? target : `${target}.sql`;
      files = [name];
      console.log(`📄 Running single migration: ${name}`);
    } else {
      files = fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .sort();
      console.log(`📄 Found ${files.length} migration file(s): ${files.join(', ')}`);
    }

    for (const file of files) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Migration file not found: ${filePath}`);
      }
      console.log(`\n▶  ${file}`);
      const sql = fs.readFileSync(filePath, 'utf8');
      await db.query(sql);
      console.log(`✅  ${file} — done`);
    }

    console.log('\n✅ All migrations complete!');
    await db.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

migrate();
