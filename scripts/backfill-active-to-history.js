/**
 * Backfill Script: Copy existing active conversations to history table
 * 
 * This script ensures all existing active conversations have a corresponding entry
 * in the history table (in case they were created before history tracking was added).
 * 
 * Run with: node scripts/backfill-active-to-history.js
 */

const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'learnbot',
  password: process.env.DB_PASSWORD || 'password',
  port: parseInt(process.env.DB_PORT || '5432'),
})

async function backfillActiveConversations() {
  const client = await pool.connect()
  
  try {
    console.log('🔄 Starting backfill of active conversations to history table...\n')
    
    // First, ensure the history table exists
    console.log('📋 Creating rag_conversations_history table if it doesn\'t exist...')
    await client.query(`
      CREATE TABLE IF NOT EXISTS rag_conversations_history (
        id SERIAL PRIMARY KEY,
        original_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
        title VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL,
        current_topic TEXT,
        checkpoint_state JSONB,
        message_history JSONB DEFAULT '[]',
        student_problem_data JSONB,
        cached_context JSONB,
        last_retrieval_topic TEXT,
        cached_sentiment DECIMAL(3,2) DEFAULT 0,
        cached_topics JSONB DEFAULT '[]',
        analytics_last_updated TIMESTAMP,
        conversation_summary TEXT,
        chat_type VARCHAR(50) DEFAULT 'class_material',
        original_created_at TIMESTAMP,
        original_updated_at TIMESTAMP,
        archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rag_conversations_history_user 
      ON rag_conversations_history(user_id, archived_at DESC)
    `)
    
    console.log('✅ History table ready!\n')
    
    // Step 1: Get all active conversations that don't have a history entry
    const activeResult = await client.query(
      `SELECT r.* FROM rag_conversations r
       LEFT JOIN rag_conversations_history h ON r.id = h.original_id
       WHERE r.status = 'active' AND h.id IS NULL`
    )
    
    const activeCount = activeResult.rows.length
    console.log(`📊 Found ${activeCount} active conversations without history entries\n`)
    
    if (activeCount === 0) {
      console.log('✅ All active conversations already have history entries. Exiting.')
      return
    }
    
    // Step 2: Copy each active conversation to history table
    let copied = 0
    let errors = 0
    
    // Helper function to safely convert to JSON string
    const toJsonString = (value) => {
      if (value === null || value === undefined) return null
      if (typeof value === 'string') {
        // Already a string, validate it's valid JSON
        try {
          JSON.parse(value)
          return value
        } catch {
          // Invalid JSON string, stringify it
          return JSON.stringify(value)
        }
      }
      // It's an object, stringify it
      return JSON.stringify(value)
    }

    for (const row of activeResult.rows) {
      try {
        await client.query(
          `INSERT INTO rag_conversations_history (
            original_id, user_id, class_id, title, status, current_topic,
            checkpoint_state, message_history, student_problem_data, cached_context,
            last_retrieval_topic, cached_sentiment, cached_topics, analytics_last_updated,
            conversation_summary, chat_type, original_created_at, original_updated_at
          ) VALUES ($1, $2, $3, $4, 'active', $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12::jsonb, $13, $14, $15, $16, $17)`,
          [
            row.id,
            row.user_id,
            row.class_id,
            row.title,
            row.current_topic,
            toJsonString(row.checkpoint_state),
            toJsonString(row.message_history),
            toJsonString(row.student_problem_data),
            toJsonString(row.cached_context),
            row.last_retrieval_topic,
            row.cached_sentiment || 0,
            toJsonString(row.cached_topics),
            row.analytics_last_updated,
            row.conversation_summary,
            row.chat_type || 'class_material',
            row.created_at,
            row.updated_at
          ]
        )
        console.log(`  ✅ Copied conversation ${row.id} to history`)
        copied++
      } catch (error) {
        console.error(`  ❌ Error copying conversation ${row.id}:`, error.message)
        errors++
      }
    }
    
    console.log(`\n📊 Backfill Summary:`)
    console.log(`   - Copied: ${copied}`)
    console.log(`   - Errors: ${errors}`)
    console.log(`\n✅ Backfill completed!`)
    
  } catch (error) {
    console.error('❌ Backfill failed:', error)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

// Run backfill
backfillActiveConversations()
  .then(() => {
    console.log('\n✨ Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n💥 Backfill failed:', error)
    process.exit(1)
  })

