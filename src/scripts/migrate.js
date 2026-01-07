// src/scripts/migrate.js
import dotenv from 'dotenv';
import db from '../config/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ✅ Load environment variables FIRST
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate() {
  try {
    console.log('🔄 Running database migrations...');
    console.log(`📍 Connecting to: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
    
    // Check if environment variables are loaded
    if (!process.env.DB_HOST) {
      throw new Error('Environment variables not loaded! Check your .env file');
    }
    
    const sql = fs.readFileSync(
      path.join(__dirname, '../migrations/001_create_dao_tables.sql'),
      'utf8'
    );
    
    await db.query(sql);
    
    console.log('✅ Database tables created!');
    console.log('✅ Indexes created!');
    console.log('✅ Migration complete!');
    
    await db.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

migrate();