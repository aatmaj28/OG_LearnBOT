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
    console.log('🔍 Adding syllabus_vector_store_folder column to classes table...')
    
    // Add column if it doesn't exist
    await client.query(`
      ALTER TABLE classes 
      ADD COLUMN IF NOT EXISTS syllabus_vector_store_folder VARCHAR(255);
    `)
    console.log('✅ Column syllabus_vector_store_folder added (if not exists)')
    
    // Check current classes
    const result = await client.query('SELECT id, name, vector_store_folder, syllabus_vector_store_folder FROM classes')
    console.log('\n📋 Current classes:')
    result.rows.forEach(row => {
      console.log(`  - ID: ${row.id}, Name: ${row.name}`)
      console.log(`    Material Folder: ${row.vector_store_folder || 'NULL'}`)
      console.log(`    Syllabus Folder: ${row.syllabus_vector_store_folder || 'NULL'}`)
    })
    
    console.log('\n✅ Migration completed successfully!')
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
  } finally {
    client.release()
    await pool.end()
  }
}

migrate()

