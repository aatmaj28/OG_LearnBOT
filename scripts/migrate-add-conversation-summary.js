/**
 * Migration: Add conversation_summary column to rag_conversations table
 * This allows us to store chat summaries for faster analytics processing
 */

const { Pool } = require('pg')

async function migrate() {
  // Load environment variables from .env.local if it exists
  require('dotenv').config({ path: '.env.local' })
  
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5433'),
    database: process.env.DB_NAME || 'learnbot',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password'
  })

  const client = await pool.connect()

  try {
    console.log('Starting migration: Add conversation summary column...')
    console.log(`Connecting to database: ${process.env.DB_NAME || 'learnbot'} on ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5433'}`)

    // Check if column already exists
    const checkResult = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'rag_conversations' 
      AND column_name = 'conversation_summary'
    `)

    if (checkResult.rows.length > 0) {
      console.log('✅ Column conversation_summary already exists, skipping...')
    } else {
      // Add conversation_summary column
      await client.query(`
        ALTER TABLE rag_conversations
        ADD COLUMN conversation_summary TEXT
      `)
      console.log('✅ Added column: conversation_summary')
    }

    // Add index for faster summary queries (IF NOT EXISTS handles if it already exists)
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_rag_conversations_summary 
        ON rag_conversations(user_id, class_id, analytics_last_updated) 
        WHERE conversation_summary IS NOT NULL
      `)
      console.log('✅ Added index for conversation summaries')
    } catch (indexError) {
      // Index might already exist, that's okay
      if (indexError.message.includes('already exists')) {
        console.log('✅ Index already exists, skipping...')
      } else {
        throw indexError
      }
    }

    console.log('✅ Migration completed successfully!')

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Database connection refused. Please ensure:')
      console.error('   1. PostgreSQL is running')
      console.error('   2. Database credentials in .env.local are correct')
      console.error('   3. Database server is accessible')
    }
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch(console.error)

