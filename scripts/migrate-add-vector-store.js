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
    console.log('🔍 Checking classes table...')
    
    // Add column if it doesn't exist
    await client.query(`
      ALTER TABLE classes 
      ADD COLUMN IF NOT EXISTS vector_store_folder VARCHAR(255);
    `)
    console.log('✅ Column vector_store_folder added (if not exists)')
    
    // Check current classes
    const result = await client.query('SELECT id, name, vector_store_folder FROM classes')
    console.log('\n📋 Current classes:')
    result.rows.forEach(row => {
      console.log(`  - ID: ${row.id}, Name: ${row.name}, Folder: ${row.vector_store_folder || 'NULL'}`)
    })
    
    // Update classes with NULL vector_store_folder
    const updateResult = await client.query(`
      UPDATE classes 
      SET vector_store_folder = 'class_' || id 
      WHERE vector_store_folder IS NULL
      RETURNING id, name, vector_store_folder
    `)
    
    if (updateResult.rowCount > 0) {
      console.log('\n✅ Updated classes with vector_store_folder:')
      updateResult.rows.forEach(row => {
        console.log(`  - ID: ${row.id}, Name: ${row.name}, Folder: ${row.vector_store_folder}`)
      })
    } else {
      console.log('\n✅ All classes already have vector_store_folder set')
    }
    
    console.log('\n✅ Migration completed successfully!')
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
  } finally {
    client.release()
    await pool.end()
  }
}

migrate()

