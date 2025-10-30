/**
 * Migration: Add analytics caching columns to rag_conversations table
 * This allows us to pre-compute sentiment and topics during chat instead of on-demand
 */

const { Pool } = require('pg')

async function migrate() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5433'),
    database: process.env.DB_NAME || 'learnbot',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password'
  })

  const client = await pool.connect()

  try {
    console.log('Starting migration: Add conversation analytics cache...')

    // Add new columns for caching sentiment and topics
    await client.query(`
      ALTER TABLE rag_conversations
      ADD COLUMN IF NOT EXISTS cached_sentiment DECIMAL(3,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS cached_topics JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS analytics_last_updated TIMESTAMP
    `)

    console.log('✅ Added columns: cached_sentiment, cached_topics, analytics_last_updated')

    // Add index for faster queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rag_conversations_user_class 
      ON rag_conversations(user_id, class_id) 
      WHERE status = 'active'
    `)

    console.log('✅ Added index on user_id and class_id')

    console.log('✅ Migration completed successfully!')

  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch(console.error)

