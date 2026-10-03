/**
 * Migration: Add masked_id columns to all tables
 * 
 * This migration:
 * 1. Adds masked_id column to users table
 * 2. Adds masked_id columns to all related tables
 * 3. Populates masked_id for existing data
 * 4. Creates indexes for performance
 */

const { Pool } = require('pg')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

// Load .env.local file if it exists
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8')
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  })
  console.log('✅ Loaded environment variables from .env.local')
}

// Database connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'learnbot',
  password: process.env.DB_PASSWORD || 'password',
  port: parseInt(process.env.DB_PORT || '5432'),
})

/**
 * Generate SHA256 masked_id from user_id
 */
function generateMaskedId(userId) {
  const hash = crypto.createHash('sha256').update(userId.toString()).digest('hex')
  return hash
}

async function migrate() {
  const client = await pool.connect()
  
  try {
    console.log('🚀 Starting masked_id migration...')
    
    // Step 1: Add masked_id to users table
    console.log('📝 Step 1: Adding masked_id to users table...')
    try {
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS masked_id VARCHAR(64)
      `)
      console.log('✅ Added masked_id column to users')
    } catch (error) {
      console.error('❌ Error adding masked_id to users:', error.message)
      throw error
    }
    
    // Step 2: Populate masked_id for existing users
    console.log('📝 Step 2: Populating masked_id for existing users...')
    const usersResult = await client.query('SELECT id FROM users WHERE masked_id IS NULL')
    const users = usersResult.rows
    
    for (const user of users) {
      const maskedId = generateMaskedId(user.id)
      await client.query(
        'UPDATE users SET masked_id = $1 WHERE id = $2',
        [maskedId, user.id]
      )
    }
    console.log(`✅ Populated masked_id for ${users.length} users`)
    
    // Step 3: Make masked_id NOT NULL and add unique constraint
    console.log('📝 Step 3: Setting masked_id constraints...')
    try {
      await client.query(`
        ALTER TABLE users 
        ALTER COLUMN masked_id SET NOT NULL
      `)
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_masked_id 
        ON users(masked_id)
      `)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_users_id_masked 
        ON users(id, masked_id)
      `)
      console.log('✅ Added constraints and indexes for users.masked_id')
    } catch (error) {
      console.error('❌ Error setting constraints:', error.message)
      throw error
    }
    
    // Step 4: Add masked_id columns to related tables
    const tables = [
      { name: 'class_students', column: 'student_masked_id' },
      { name: 'chat_sessions', column: 'user_masked_id' },
      { name: 'chat_messages', column: 'user_masked_id' },
      { name: 'chat_analytics', column: 'user_masked_id' },
      { name: 'rag_conversations', column: 'user_masked_id' },
    ]
    
    for (const table of tables) {
      console.log(`📝 Step 4: Adding ${table.column} to ${table.name}...`)
      try {
        await client.query(`
          ALTER TABLE ${table.name} 
          ADD COLUMN IF NOT EXISTS ${table.column} VARCHAR(64)
        `)
        console.log(`✅ Added ${table.column} to ${table.name}`)
      } catch (error) {
        console.error(`❌ Error adding ${table.column} to ${table.name}:`, error.message)
        throw error
      }
    }
    
    // Step 5: Populate masked_id in related tables
    console.log('📝 Step 5: Populating masked_id in related tables...')
    
    // class_students
    const classStudentsResult = await client.query(`
      SELECT cs.id, cs.student_id, u.masked_id 
      FROM class_students cs
      LEFT JOIN users u ON cs.student_id = u.id
      WHERE cs.student_masked_id IS NULL
    `)
    for (const row of classStudentsResult.rows) {
      if (row.masked_id) {
        await client.query(
          'UPDATE class_students SET student_masked_id = $1 WHERE id = $2',
          [row.masked_id, row.id]
        )
      }
    }
    console.log(`✅ Populated student_masked_id in class_students`)
    
    // chat_sessions
    const chatSessionsResult = await client.query(`
      SELECT cs.id, cs.user_id, u.masked_id 
      FROM chat_sessions cs
      LEFT JOIN users u ON cs.user_id = u.id
      WHERE cs.user_masked_id IS NULL
    `)
    for (const row of chatSessionsResult.rows) {
      if (row.masked_id) {
        await client.query(
          'UPDATE chat_sessions SET user_masked_id = $1 WHERE id = $2',
          [row.masked_id, row.id]
        )
      }
    }
    console.log(`✅ Populated user_masked_id in chat_sessions`)
    
    // chat_messages
    const chatMessagesResult = await client.query(`
      SELECT cm.id, cm.user_id, u.masked_id 
      FROM chat_messages cm
      LEFT JOIN users u ON cm.user_id = u.id
      WHERE cm.user_masked_id IS NULL
    `)
    for (const row of chatMessagesResult.rows) {
      if (row.masked_id) {
        await client.query(
          'UPDATE chat_messages SET user_masked_id = $1 WHERE id = $2',
          [row.masked_id, row.id]
        )
      }
    }
    console.log(`✅ Populated user_masked_id in chat_messages`)
    
    // chat_analytics
    const chatAnalyticsResult = await client.query(`
      SELECT ca.id, ca.user_id, u.masked_id 
      FROM chat_analytics ca
      LEFT JOIN users u ON ca.user_id = u.id
      WHERE ca.user_masked_id IS NULL
    `)
    for (const row of chatAnalyticsResult.rows) {
      if (row.masked_id) {
        await client.query(
          'UPDATE chat_analytics SET user_masked_id = $1 WHERE id = $2',
          [row.masked_id, row.id]
        )
      }
    }
    console.log(`✅ Populated user_masked_id in chat_analytics`)
    
    // rag_conversations
    const ragConversationsResult = await client.query(`
      SELECT rc.id, rc.user_id, u.masked_id 
      FROM rag_conversations rc
      LEFT JOIN users u ON rc.user_id = u.id
      WHERE rc.user_masked_id IS NULL
    `)
    for (const row of ragConversationsResult.rows) {
      if (row.masked_id) {
        await client.query(
          'UPDATE rag_conversations SET user_masked_id = $1 WHERE id = $2',
          [row.masked_id, row.id]
        )
      }
    }
    console.log(`✅ Populated user_masked_id in rag_conversations`)
    
    // Step 6: Make masked_id columns NOT NULL
    console.log('📝 Step 6: Setting NOT NULL constraints...')
    for (const table of tables) {
      try {
        await client.query(`
          ALTER TABLE ${table.name} 
          ALTER COLUMN ${table.column} SET NOT NULL
        `)
        console.log(`✅ Set NOT NULL for ${table.name}.${table.column}`)
      } catch (error) {
        console.error(`❌ Error setting NOT NULL for ${table.name}.${table.column}:`, error.message)
        throw error
      }
    }
    
    // Step 7: Create indexes for performance
    console.log('📝 Step 7: Creating indexes...')
    const indexes = [
      { table: 'class_students', column: 'student_masked_id', name: 'idx_class_students_masked_id' },
      { table: 'chat_sessions', column: 'user_masked_id', name: 'idx_chat_sessions_masked_id' },
      { table: 'chat_messages', column: 'user_masked_id', name: 'idx_chat_messages_masked_id' },
      { table: 'chat_analytics', column: 'user_masked_id', name: 'idx_chat_analytics_masked_id' },
      { table: 'rag_conversations', column: 'user_masked_id', name: 'idx_rag_conversations_masked_id' },
    ]
    
    // Additional composite indexes for rag_conversations
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_rag_conversations_masked_class 
        ON rag_conversations(user_masked_id, class_id) 
        WHERE status = 'active'
      `)
      console.log('✅ Created composite index for rag_conversations (masked_id, class_id)')
    } catch (error) {
      console.error('❌ Error creating composite index:', error.message)
    }
    
    for (const idx of indexes) {
      try {
        await client.query(`
          CREATE INDEX IF NOT EXISTS ${idx.name} 
          ON ${idx.table}(${idx.column})
        `)
        console.log(`✅ Created index ${idx.name}`)
      } catch (error) {
        console.error(`❌ Error creating index ${idx.name}:`, error.message)
      }
    }
    
    console.log('✅ Migration completed successfully!')
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

// Run migration
migrate()
  .then(() => {
    console.log('🎉 Migration script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('💥 Migration script failed:', error)
    process.exit(1)
  })

