// Migration script to add vector_store_folder column to classes table
// Run this once to update your Supabase database

const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

// Read .env.local file
const envPath = path.join(__dirname, '..', '.env.local')
const envContent = fs.readFileSync(envPath, 'utf-8')
const envVars = {}
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/)
  if (match) {
    envVars[match[1].trim()] = match[2].trim()
  }
})

async function migrateDatabase() {
  const pool = new Pool({
    host: envVars.DB_HOST,
    port: parseInt(envVars.DB_PORT || '5432'),
    database: envVars.DB_NAME,
    user: envVars.DB_USER,
    password: envVars.DB_PASSWORD,
    ssl: envVars.DB_HOST?.includes('supabase') ? { rejectUnauthorized: false } : false
  })

  const client = await pool.connect()
  
  try {
    console.log('🔧 Starting migration: Adding vector_store_folder column to classes table...')
    
    // Check if column exists
    const checkResult = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'classes' 
      AND column_name = 'vector_store_folder'
    `)
    
    if (checkResult.rows.length > 0) {
      console.log('✅ Column vector_store_folder already exists in classes table')
    } else {
      // Add the column
      await client.query(`
        ALTER TABLE classes 
        ADD COLUMN vector_store_folder VARCHAR(255)
      `)
      console.log('✅ Successfully added vector_store_folder column to classes table')
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

// Run the migration
migrateDatabase()
  .then(() => {
    console.log('✅ All migrations completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  })

