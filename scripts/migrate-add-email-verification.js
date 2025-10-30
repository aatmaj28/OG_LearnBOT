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
    console.log('Starting migration: Add email verification table...')

    // Create pending_registrations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS pending_registrations (
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
      );
    `)
    console.log('✅ Created table: pending_registrations')

    // Add index for faster OTP lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pending_registrations_email 
      ON pending_registrations(email);
    `)
    console.log('✅ Added index on email')

    // Add index for OTP expiration cleanup
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pending_registrations_expires 
      ON pending_registrations(otp_expires_at);
    `)
    console.log('✅ Added index on otp_expires_at')

    console.log('✅ Migration completed successfully!')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch(e => {
  console.error(e)
  process.exit(1)
})

