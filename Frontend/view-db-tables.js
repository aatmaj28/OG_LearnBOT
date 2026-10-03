// View all tables and their data in the database
// Run: node view-db-tables.js

const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'postgres',
  password: process.env.DB_PASSWORD || 'dashbox@26',
  port: parseInt(process.env.DB_PORT || '5433'),
});

async function viewTables() {
  try {
    const client = await pool.connect();
    console.log('🔍 Viewing database tables...\n');
    
    // List all tables
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    if (tablesResult.rows.length === 0) {
      console.log('❌ No tables found in database');
      client.release();
      await pool.end();
      return;
    }
    
    console.log(`📋 Found ${tablesResult.rows.length} table(s):\n`);
    
    // For each table, show structure and row count
    for (const tableRow of tablesResult.rows) {
      const tableName = tableRow.table_name;
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📊 Table: ${tableName}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      
      // Get column information
      const columnsResult = await client.query(`
        SELECT 
          column_name, 
          data_type, 
          is_nullable,
          column_default
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);
      
      console.log('\n📐 Columns:');
      columnsResult.rows.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
        console.log(`   • ${col.column_name} (${col.data_type}) ${nullable}${defaultVal}`);
      });
      
      // Get row count
      const countResult = await client.query(`SELECT COUNT(*) as count FROM ${tableName}`);
      const rowCount = countResult.rows[0].count;
      console.log(`\n📈 Row count: ${rowCount}`);
      
      // Show sample data (first 5 rows)
      if (parseInt(rowCount) > 0) {
        try {
          const sampleResult = await client.query(`SELECT * FROM ${tableName} LIMIT 5`);
          if (sampleResult.rows.length > 0) {
            console.log(`\n📝 Sample data (first ${sampleResult.rows.length} row(s)):`);
            sampleResult.rows.forEach((row, idx) => {
              console.log(`\n   Row ${idx + 1}:`);
              Object.entries(row).forEach(([key, value]) => {
                // Truncate long values for display
                const displayValue = value && value.toString().length > 50 
                  ? value.toString().substring(0, 50) + '...' 
                  : value;
                console.log(`      ${key}: ${displayValue}`);
              });
            });
            if (parseInt(rowCount) > 5) {
              console.log(`\n   ... and ${parseInt(rowCount) - 5} more row(s)`);
            }
          }
        } catch (err) {
          console.log(`\n   ⚠️  Could not fetch sample data: ${err.message}`);
        }
      }
      
      console.log('\n');
    }
    
    client.release();
    await pool.end();
    console.log('✅ Done!');
  } catch (error) {
    console.error('\n❌ Error viewing tables!');
    console.error(`   Error: ${error.message}`);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Make sure SSH tunnel is running: ssh -L 5433:localhost:5432 ra_aatmaj@129.10.224.226');
    console.error('   2. Check your .env.local file has correct settings');
    process.exit(1);
  }
}

viewTables();
