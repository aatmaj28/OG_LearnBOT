/**
 * One-time migration: add ta_mode column to classes table for per-class TA mode.
 * Run from project root: node scripts/migrate-add-class-ta-mode.js
 * Loads .env.local for DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD.
 */
require('dotenv').config({ path: '.env.local' })

const { Pool } = require('pg')

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  port: parseInt(process.env.DB_PORT || '5432', 10),
})

async function migrate() {
  const client = await pool.connect()

  try {
    console.log('🔍 Checking classes table for ta_mode column...')

    await client.query(`
      ALTER TABLE classes
      ADD COLUMN IF NOT EXISTS ta_mode VARCHAR(20) DEFAULT NULL;
    `)
    console.log('✅ Column classes.ta_mode added (or already exists)')

    const result = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'classes' AND column_name = 'ta_mode'
    `)
    if (result.rows.length > 0) {
      console.log('   Verified:', result.rows[0])
    }

    console.log('\n✅ Migration completed successfully!')
  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

migrate()
