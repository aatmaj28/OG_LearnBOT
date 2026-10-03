const { Pool } = require('pg')

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'learnbot',
  password: process.env.DB_PASSWORD || 'password',
  port: parseInt(process.env.DB_PORT || '5433'),
})

async function migrate() {
  const client = await pool.connect()
  
  try {
    console.log('🔍 Checking rag_conversations table...')
    
    // Add class_id column if it doesn't exist
    await client.query(`
      ALTER TABLE rag_conversations 
      ADD COLUMN IF NOT EXISTS class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE;
    `)
    console.log('✅ Column class_id added to rag_conversations (if not exists)')
    
    // Check current conversations
    const result = await client.query('SELECT id, user_id, class_id, title FROM rag_conversations LIMIT 10')
    console.log('\n📋 Sample conversations:')
    if (result.rows.length === 0) {
      console.log('  No conversations found')
    } else {
      result.rows.forEach(row => {
        console.log(`  - ID: ${row.id}, User: ${row.user_id}, Class: ${row.class_id || 'NULL'}, Title: ${row.title}`)
      })
    }
    
    console.log('\n✅ Migration completed successfully!')
    console.log('\n📝 Note: Existing conversations have class_id=NULL.')
    console.log('   New conversations will be linked to specific classes.')
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
  } finally {
    client.release()
    await pool.end()
  }
}

migrate()

