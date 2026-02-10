// Quick database connection test
// Run: node test-db-connection.js

const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'postgres',
  password: process.env.DB_PASSWORD || 'dashbox@26',
  port: parseInt(process.env.DB_PORT || '5433'),
});

async function testConnection() {
  try {
    console.log('🔌 Testing database connection...');
    console.log(`   Host: ${process.env.DB_HOST || 'localhost'}`);
    console.log(`   Port: ${process.env.DB_PORT || '5433'}`);
    console.log(`   Database: ${process.env.DB_NAME || 'postgres'}`);
    console.log(`   User: ${process.env.DB_USER || 'postgres'}`);
    console.log('');
    
    const client = await pool.connect();
    console.log('✅ Successfully connected to database!');
    
    // Test query
    const result = await client.query('SELECT version()');
    console.log('\n📊 PostgreSQL Version:');
    console.log(`   ${result.rows[0].version}`);
    
    // List databases
    const dbResult = await client.query('SELECT datname FROM pg_database WHERE datistemplate = false');
    console.log('\n📁 Available databases:');
    dbResult.rows.forEach(row => {
      console.log(`   - ${row.datname}`);
    });
    
    // List all tables
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    console.log('\n📋 Tables in database:');
    if (tablesResult.rows.length === 0) {
      console.log('   (No tables found)');
    } else {
      tablesResult.rows.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
    }
    
    // Show row counts for each table
    console.log('\n📊 Table row counts:');
    for (const row of tablesResult.rows) {
      try {
        const countResult = await client.query(`SELECT COUNT(*) as count FROM ${row.table_name}`);
        console.log(`   - ${row.table_name}: ${countResult.rows[0].count} rows`);
      } catch (err) {
        console.log(`   - ${row.table_name}: (unable to count)`);
      }
    }
    
    client.release();
    await pool.end();
    console.log('\n✅ Connection test completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Connection failed!');
    console.error(`   Error: ${error.message}`);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Make sure SSH tunnel is running: ssh -L 5433:localhost:5432 ra_aatmaj@129.10.224.226');
    console.error('   2. Check your .env.local file has correct settings');
    console.error('   3. Verify DB_HOST=localhost and DB_PORT=5433');
    process.exit(1);
  }
}

testConnection();
