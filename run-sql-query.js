// Run SQL queries against the database
// Usage: node run-sql-query.js "SELECT * FROM users"

const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'postgres',
  password: process.env.DB_PASSWORD || 'dashbox@26',
  port: parseInt(process.env.DB_PORT || '5433'),
});

async function runQuery() {
  const query = process.argv[2];
  
  if (!query) {
    console.error('❌ Please provide a SQL query');
    console.error('Usage: node run-sql-query.js "SELECT * FROM users"');
    process.exit(1);
  }

  try {
    const client = await pool.connect();
    console.log('🔌 Executing query...\n');
    console.log(`📝 Query: ${query}\n`);
    
    const result = await client.query(query);
    
    if (result.rows.length === 0) {
      console.log('📊 Result: (0 rows)');
    } else {
      console.log(`📊 Result: ${result.rows.length} row(s)\n`);
      console.table(result.rows);
    }
    
    client.release();
    await pool.end();
    console.log('\n✅ Query completed!');
  } catch (error) {
    console.error('\n❌ Query failed!');
    console.error(`   Error: ${error.message}`);
    process.exit(1);
  }
}

runQuery();
