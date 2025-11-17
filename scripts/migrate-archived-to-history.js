/**
 * Migration Script: Move archived conversations to history table
 * 
 * This script:
 * 1. Copies all conversations with status='archived' from rag_conversations to rag_conversations_history
 * 2. Deletes them from rag_conversations (they're now only in history)
 * 
 * Run with: node scripts/migrate-archived-to-history.js
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

async function migrateArchivedConversations() {
  const client = await pool.connect()
  
  try {
    console.log('🔄 Starting migration of archived conversations to history table...\n')
    
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
    
    // Step 1: Get all archived conversations
    const archivedResult = await client.query(
      `SELECT * FROM rag_conversations WHERE status = 'archived'`
    )
    
    const archivedCount = archivedResult.rows.length
    console.log(`📊 Found ${archivedCount} archived conversations to migrate\n`)
    
    if (archivedCount === 0) {
      console.log('✅ No archived conversations to migrate. Exiting.')
      return
    }
    
    // Step 2: Copy each archived conversation to history table
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

    let migrated = 0
    let skipped = 0
    let errors = 0
    
    for (const row of archivedResult.rows) {
      try {
        // Check if already exists in history
        const existingCheck = await client.query(
          `SELECT id FROM rag_conversations_history WHERE original_id = $1`,
          [row.id]
        )
        
        if (existingCheck.rows.length > 0) {
          // Update existing entry
          await client.query(
            `UPDATE rag_conversations_history SET
              user_id = $1,
              class_id = $2,
              title = $3,
              status = 'archived',
              current_topic = $4,
              checkpoint_state = $5::jsonb,
              message_history = $6::jsonb,
              student_problem_data = $7::jsonb,
              cached_context = $8::jsonb,
              last_retrieval_topic = $9,
              cached_sentiment = $10,
              cached_topics = $11::jsonb,
              analytics_last_updated = $12,
              conversation_summary = $13,
              chat_type = $14,
              original_created_at = $15,
              original_updated_at = $16,
              archived_at = CURRENT_TIMESTAMP
            WHERE original_id = $17`,
            [
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
              row.updated_at,
              row.id
            ]
          )
          console.log(`  ✅ Updated conversation ${row.id} in history (was already there)`)
          skipped++
        } else {
          // Insert new entry
          await client.query(
            `INSERT INTO rag_conversations_history (
              original_id, user_id, class_id, title, status, current_topic,
              checkpoint_state, message_history, student_problem_data, cached_context,
              last_retrieval_topic, cached_sentiment, cached_topics, analytics_last_updated,
              conversation_summary, chat_type, original_created_at, original_updated_at, archived_at
            ) VALUES ($1, $2, $3, $4, 'archived', $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12::jsonb, $13, $14, $15, $16, $17, CURRENT_TIMESTAMP)`,
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
          console.log(`  ✅ Migrated conversation ${row.id} to history`)
          migrated++
        }
      } catch (error) {
        console.error(`  ❌ Error migrating conversation ${row.id}:`, error.message)
        errors++
      }
    }
    
    console.log(`\n📊 Migration Summary:`)
    console.log(`   - Migrated: ${migrated}`)
    console.log(`   - Updated (already existed): ${skipped}`)
    console.log(`   - Errors: ${errors}`)
    
    // Step 3: Delete archived conversations from main table
    if (migrated + skipped > 0) {
      console.log(`\n🗑️  Deleting archived conversations from main table...`)
      const deleteResult = await client.query(
        `DELETE FROM rag_conversations WHERE status = 'archived'`
      )
      console.log(`   ✅ Deleted ${deleteResult.rowCount} archived conversations from rag_conversations`)
    }
    
    console.log(`\n✅ Migration completed successfully!`)
    console.log(`\n📝 Note: All archived conversations are now in rag_conversations_history table`)
    console.log(`   with status='archived' and archived_at timestamp.`)
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

// Run migration
migrateArchivedConversations()
  .then(() => {
    console.log('\n✨ Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n💥 Migration failed:', error)
    process.exit(1)
  })

