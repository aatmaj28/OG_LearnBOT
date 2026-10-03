/**
 * Migration: Create pending_registrations table
 * This table is used for email verification during registration
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
    console.log('Starting migration: Create pending_registrations table...')
    console.log(`Connecting to database: ${process.env.DB_NAME || 'learnbot'} on ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5433'}`)

    // Check if table already exists
    const checkResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'pending_registrations'
    `)

    if (checkResult.rows.length > 0) {
      console.log('✅ Table pending_registrations already exists, skipping...')
    } else {
      // Create pending_registrations table
      await client.query(`
        CREATE TABLE pending_registrations (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          role VARCHAR(50) NOT NULL CHECK (role IN ('student', 'faculty')),
          nuid VARCHAR(50),
          degree VARCHAR(255),
          major VARCHAR(255),
          otp_code VARCHAR(6) NOT NULL,
          otp_expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)
      console.log('✅ Created table: pending_registrations')
    }

    // Create indexes
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_pending_registrations_email 
        ON pending_registrations(email)
      `)
      console.log('✅ Created index: idx_pending_registrations_email')
    } catch (indexError) {
      if (indexError.message.includes('already exists')) {
        console.log('✅ Index idx_pending_registrations_email already exists')
      } else {
        throw indexError
      }
    }

    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_pending_registrations_expires 
        ON pending_registrations(otp_expires_at)
      `)
      console.log('✅ Created index: idx_pending_registrations_expires')
    } catch (indexError) {
      if (indexError.message.includes('already exists')) {
        console.log('✅ Index idx_pending_registrations_expires already exists')
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

