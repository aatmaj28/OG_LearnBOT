/**
 * Migration: Enable Row Level Security (RLS) on users table - Faculty Only
 * 
 * This migration:
 * 1. Enables RLS on the users table
 * 2. Creates a SECURITY DEFINER function to check if a user is faculty
 * 3. Creates a restrictive policy that only allows faculty to access the users table
 *    - Faculty can access (they use user_id through application)
 *    - Students/Developers cannot access users table directly
 *    - Application uses service role or sets session variable for faculty queries
 */

const { Pool } = require('pg')
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

async function enableRLS() {
  const client = await pool.connect()
  
  try {
    console.log('🔒 Enabling Row Level Security (RLS) on users table - Faculty Only...')
    
    // Enable RLS on users table
    await client.query('ALTER TABLE users ENABLE ROW LEVEL SECURITY')
    console.log('✅ RLS enabled on users table')
    
    // Create a SECURITY DEFINER function to check if a user is faculty
    // This function bypasses RLS to avoid circular dependency
    await client.query(`
      CREATE OR REPLACE FUNCTION is_faculty_user(user_id_param INTEGER)
      RETURNS BOOLEAN
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $$
      DECLARE
        user_role VARCHAR(50);
      BEGIN
        SELECT role INTO user_role
        FROM users
        WHERE id = user_id_param;
        
        RETURN user_role = 'faculty';
      END;
      $$;
    `)
    console.log('✅ Created SECURITY DEFINER function: is_faculty_user()')
    
    // Create a function to get current user ID from session variable
    // The application will set this using: SET LOCAL app.current_user_id = '123';
    await client.query(`
      CREATE OR REPLACE FUNCTION get_current_user_id()
      RETURNS INTEGER
      LANGUAGE plpgsql
      STABLE
      AS $$
      BEGIN
        RETURN NULLIF(current_setting('app.current_user_id', true), '')::INTEGER;
      EXCEPTION
        WHEN OTHERS THEN
          RETURN NULL;
      END;
      $$;
    `)
    console.log('✅ Created function: get_current_user_id()')
    
    // Drop existing policies if they exist
    await client.query(`
      DROP POLICY IF EXISTS users_faculty_only_policy ON users;
      DROP POLICY IF EXISTS users_access_policy ON users;
    `)
    console.log('✅ Dropped existing policies (if any)')
    
    // Create restrictive policy: Only faculty can access users table
    // Checks if current user (from session variable) is faculty
    await client.query(`
      CREATE POLICY users_faculty_only_policy ON users
      FOR ALL
      USING (
        -- Allow if current user is faculty
        get_current_user_id() IS NOT NULL 
        AND is_faculty_user(get_current_user_id())
      )
      WITH CHECK (
        -- Allow if current user is faculty
        get_current_user_id() IS NOT NULL 
        AND is_faculty_user(get_current_user_id())
      );
    `)
    console.log('✅ Created restrictive RLS policy: Only faculty can access users table')
    
    // Check RLS status
    const rlsStatus = await client.query(`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename = 'users';
    `)
    
    if (rlsStatus.rows.length > 0) {
      const isEnabled = rlsStatus.rows[0].rowsecurity
      console.log(`\n📊 RLS Status: ${isEnabled ? '✅ ENABLED' : '❌ DISABLED'}`)
    }
    
    // List all policies on users table
    const policies = await client.query(`
      SELECT policyname, permissive, roles, cmd, qual, with_check
      FROM pg_policies
      WHERE schemaname = 'public' 
      AND tablename = 'users';
    `)
    
    if (policies.rows.length > 0) {
      console.log('\n📋 Current RLS Policies on users table:')
      policies.rows.forEach((policy, index) => {
        console.log(`   ${index + 1}. ${policy.policyname} (${policy.permissive})`)
        console.log(`      Commands: ${policy.cmd}`)
      })
    }
    
    console.log('\n✅ Migration completed successfully!')
    console.log('\n📝 Important Notes:')
    console.log('   - RLS is now enabled and RESTRICTIVE - only faculty can access users table')
    console.log('   - Application must set session variable for faculty queries:')
    console.log('     SET LOCAL app.current_user_id = \'<faculty_user_id>\';')
    console.log('   - For service role queries (bypasses RLS), use Supabase service role key')
    console.log('   - Students/Developers cannot access users table directly')
    console.log('   - Developers use masked_id in other tables (no access to users table)')
    console.log('\n⚠️  Application Code Update Required:')
    console.log('   Update db-service.ts to set session variable for faculty queries')
    
  } catch (error) {
    console.error('❌ Error enabling RLS:', error.message)
    console.error('   Full error:', error)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

// Run migration
enableRLS()
  .then(() => {
    console.log('\n✨ Migration script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n💥 Migration failed:', error)
    process.exit(1)
  })

