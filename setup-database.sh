#!/bin/bash
# Database Connection Setup Script
# Run this after updating .env with your database credentials

echo "🔍 Database Connection Setup"
echo "================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "Please create .env file with your database credentials"
    exit 1
fi

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Check if credentials are set
if [ "$POSTGRES_PASSWORD" = "YOUR_ACTUAL_PASSWORD_HERE" ]; then
    echo "❌ Please update your database credentials in .env file"
    echo ""
    echo "You need to set:"
    echo "  - POSTGRES_HOST (your database server)"
    echo "  - POSTGRES_PASSWORD (your database password)"
    echo ""
    echo "Options:"
    echo "  1. Cloud Database (Azure PostgreSQL, AWS RDS, Google Cloud SQL)"
    echo "  2. Remote PostgreSQL server"
    echo "  3. Local PostgreSQL (requires installation)"
    exit 1
fi

echo "📡 Testing connection to: $POSTGRES_HOST:$POSTGRES_PORT"
echo "   Database: $POSTGRES_DATABASE"
echo "   User: $POSTGRES_USER"
echo ""

# Test connection using Node.js
node -e "
import('pg').then(({ default: pg }) => {
  const { Pool } = pg;
  const pool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT,
    database: process.env.POSTGRES_DATABASE,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  pool.query('SELECT version()', (err, result) => {
    if (err) {
      console.log('❌ Connection failed:', err.message);
      console.log('');
      console.log('Troubleshooting:');
      console.log('  - Verify host/port are correct');
      console.log('  - Check username and password');
      console.log('  - Ensure database exists');
      console.log('  - Check firewall allows connection from this IP');
      console.log('  - For cloud databases, enable SSL: POSTGRES_SSL=true');
      process.exit(1);
    }
    
    console.log('✅ Connection successful!');
    console.log('');
    console.log('Database Info:');
    console.log('  ' + result.rows[0].version);
    console.log('');
    
    // Run migration
    console.log('🔄 Running database migration...');
    import('fs').then(fs => {
      const sql = fs.default.readFileSync('./server/migrations/20260206_create_api_v1_schemas.sql', 'utf8');
      
      pool.query(sql, (err) => {
        if (err) {
          console.log('⚠️  Migration error:', err.message);
          if (err.message.includes('already exists')) {
            console.log('ℹ️  Tables already exist, checking...');
            checkTables(pool);
          } else {
            pool.end();
            process.exit(1);
          }
        } else {
          console.log('✅ Migration completed!');
          checkTables(pool);
        }
      });
    });
  });

  function checkTables(pool) {
    pool.query(\"SELECT COUNT(*) as count FROM pg_tables WHERE tablename LIKE 'api_%'\", (err, result) => {
      if (err) {
        console.log('Error checking tables:', err.message);
      } else {
        console.log('');
        console.log('📊 API Tables: ' + result.rows[0].count);
        console.log('');
        console.log('🎉 Database setup complete!');
        console.log('');
        console.log('Next steps:');
        console.log('  1. Start your server: npm start');
        console.log('  2. Test API: curl http://localhost:5000/v1/health');
      }
      pool.end();
    });
  }
});
"
