import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'mediczy_ai',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD
});

console.log('🔍 Checking WhatsApp Configuration from Admin Dashboard...\n');

try {
  await client.connect();
  
  // Check for WhatsApp/communication settings tables
  const tableCheck = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name LIKE '%whatsapp%' OR table_name LIKE '%communication%' OR table_name LIKE '%sms%'
    ORDER BY table_name;
  `);
  
  console.log('📋 Communication-related tables:');
  console.log('='.repeat(70));
  tableCheck.rows.forEach(row => console.log(`   - ${row.table_name}`));
  
  // Try to find WhatsApp configuration
  if (tableCheck.rows.length > 0) {
    for (const table of tableCheck.rows) {
      const tableName = table.table_name;
      console.log(`\n📊 Checking ${tableName}...`);
      
      try {
        const result = await client.query(`SELECT * FROM ${tableName} LIMIT 5;`);
        
        if (result.rows.length > 0) {
          console.log(`   Found ${result.rows.length} record(s):`);
          result.rows.forEach((row, index) => {
            console.log(`\n   Record ${index + 1}:`);
            console.log(JSON.stringify(row, null, 2).split('\n').map(l => '   ' + l).join('\n'));
          });
        } else {
          console.log('   (empty)');
        }
      } catch (err) {
        console.log(`   Error reading table: ${err.message}`);
      }
    }
  }
  
  // Also check settings or config tables
  const configCheck = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND (table_name LIKE '%setting%' OR table_name LIKE '%config%')
    ORDER BY table_name;
  `);
  
  if (configCheck.rows.length > 0) {
    console.log('\n\n⚙️  Settings/Config tables:');
    console.log('='.repeat(70));
    
    for (const table of configCheck.rows) {
      const tableName = table.table_name;
      console.log(`\n📊 ${tableName}:`);
      
      try {
        const result = await client.query(`
          SELECT * FROM ${tableName} 
          WHERE key LIKE '%twilio%' OR key LIKE '%whatsapp%' OR key LIKE '%sms%'
          LIMIT 10;
        `);
        
        if (result.rows.length > 0) {
          result.rows.forEach((row, index) => {
            console.log(`\n   ${index + 1}. ${JSON.stringify(row, null, 2).split('\n').map(l => '   ' + l).join('\n')}`);
          });
        } else {
          console.log('   (no WhatsApp/Twilio settings found)');
        }
      } catch (err) {
        console.log(`   Skipping (different schema): ${err.message}`);
      }
    }
  }
  
  await client.end();
  
} catch (error) {
  console.error('❌ Error:', error.message);
  try { await client.end(); } catch {}
}
