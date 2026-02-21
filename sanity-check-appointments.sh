#!/bin/bash

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  APPOINTMENT SYSTEM SANITY CHECK                         ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get DB credentials from .env
source /home/ubuntu/Mediczy/.env 2>/dev/null

DB_HOST=${POSTGRES_HOST:-127.0.0.1}
DB_PORT=${POSTGRES_PORT:-6432}
DB_NAME=${POSTGRES_DATABASE:-mediczy_ai}
DB_USER=${POSTGRES_USER:-mediczy_helper}

TEST_EMAIL="user@mediczy.com"

echo "📋 Test Configuration:"
echo "   Email: $TEST_EMAIL"
echo "   Database: $DB_NAME@$DB_HOST:$DB_PORT"
echo ""

# Test 1: Check if user exists
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 1: User Lookup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

USER_ID=$(node -e "
const { Client } = require('pg');
const client = new Client({
  host: '$DB_HOST',
  port: $DB_PORT,
  database: '$DB_NAME',
  user: '$DB_USER',
  password: '$POSTGRES_PASSWORD'
});

(async () => {
  try {
    await client.connect();
    const result = await client.query(
      'SELECT id, email, \"firstName\", \"lastName\" FROM users WHERE email = \$1',
      ['$TEST_EMAIL']
    );
    if (result.rows.length > 0) {
      console.log(result.rows[0].id);
      process.stderr.write('✅ User found: ' + result.rows[0].firstName + ' ' + result.rows[0].lastName + ' (ID: ' + result.rows[0].id + ')\\n');
    } else {
      process.stderr.write('❌ User not found\\n');
      process.exit(1);
    }
    await client.end();
  } catch (error) {
    process.stderr.write('❌ Database error: ' + error.message + '\\n');
    process.exit(1);
  }
})();
" 2>&1)

if [ $? -ne 0 ]; then
  echo -e "${RED}FAILED: Could not find user${NC}"
  exit 1
fi

echo ""

# Test 2: Check appointments for user
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 2: Appointments Count"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

node -e "
const { Client } = require('pg');
const client = new Client({
  host: '$DB_HOST',
  port: $DB_PORT,
  database: '$DB_NAME',
  user: '$DB_USER',
  password: '$POSTGRES_PASSWORD'
});

(async () => {
  try {
    await client.connect();
    const result = await client.query(
      'SELECT COUNT(*) as total, status FROM appointments WHERE \"userId\" = \$1 GROUP BY status',
      [$USER_ID]
    );
    
    console.log('📊 Appointments by status:');
    if (result.rows.length === 0) {
      console.log('   ⚠️  No appointments found');
    } else {
      result.rows.forEach(row => {
        console.log('   ' + row.status + ': ' + row.total);
      });
    }
    
    await client.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
"

echo ""

# Test 3: Check recent appointments with details
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 3: Recent Appointments (Last 5)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

node -e "
const { Client } = require('pg');
const client = new Client({
  host: '$DB_HOST',
  port: $DB_PORT,
  database: '$DB_NAME',
  user: '$DB_USER',
  password: '$POSTGRES_PASSWORD'
});

(async () => {
  try {
    await client.connect();
    const result = await client.query(
      \`SELECT id, \"appointmentDate\", \"appointmentTime\", status, 
              \"consultationType\", \"doctorName\", \"createdAt\"
       FROM appointments 
       WHERE \"userId\" = \$1 
       ORDER BY \"createdAt\" DESC 
       LIMIT 5\`,
      [$USER_ID]
    );
    
    if (result.rows.length === 0) {
      console.log('   ⚠️  No appointments found');
    } else {
      result.rows.forEach((apt, idx) => {
        console.log(\`   [\${idx + 1}] ID: \${apt.id}\`);
        console.log(\`       Date: \${apt.appointmentDate} \${apt.appointmentTime}\`);
        console.log(\`       Doctor: \${apt.doctorName}\`);
        console.log(\`       Status: \${apt.status}\`);
        console.log(\`       Type: \${apt.consultationType}\`);
        console.log(\`       Created: \${apt.createdAt}\`);
        console.log('');
      });
    }
    
    await client.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
"

# Test 4: Check for Feb 20, 2026 appointment
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 4: Feb 20, 2026 Appointment Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

FEB_20_COUNT=$(node -e "
const { Client } = require('pg');
const client = new Client({
  host: '$DB_HOST',
  port: $DB_PORT,
  database: '$DB_NAME',
  user: '$DB_USER',
  password: '$POSTGRES_PASSWORD'
});

(async () => {
  try {
    await client.connect();
    const result = await client.query(
      \`SELECT id, \"appointmentDate\", \"appointmentTime\", status, \"doctorName\"
       FROM appointments 
       WHERE \"userId\" = \$1 
         AND \"appointmentDate\" = '2026-02-20'
       ORDER BY \"appointmentTime\"\`,
      [$USER_ID]
    );
    
    console.log(result.rows.length);
    if (result.rows.length > 0) {
      result.rows.forEach(apt => {
        process.stderr.write(\`   ✅ Found: ID \${apt.id}, Time: \${apt.appointmentTime}, Status: \${apt.status}, Doctor: \${apt.doctorName}\\n\`);
      });
    } else {
      process.stderr.write('   ❌ No appointments found for Feb 20, 2026\\n');
    }
    
    await client.end();
  } catch (error) {
    process.stderr.write('❌ Error: ' + error.message + '\\n');
    process.exit(1);
  }
})();
" 2>&1)

echo ""

# Test 5: Check backend API health
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 5: Backend API Health"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

pm2 describe mediczy-backend &>/dev/null
if [ $? -eq 0 ]; then
  echo "   ✅ Backend process running"
  pm2 info mediczy-backend | grep -E "status|uptime|restarts" | head -3
else
  echo "   ❌ Backend process not running"
fi

echo ""

# Test 6: Check frontend deployment
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 6: Frontend Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

LATEST_JS=$(aws s3 ls s3://app.mediqzy.com/assets/ --recursive | grep "index-.*\.js$" | tail -1)
if [ -n "$LATEST_JS" ]; then
  echo "   ✅ Latest frontend build:"
  echo "      $LATEST_JS"
else
  echo "   ❌ No frontend build found"
fi

# Check index.html
INDEX_REF=$(aws s3 cp s3://app.mediqzy.com/index.html - 2>/dev/null | grep -oP 'assets/index-[^"]+\.js' | head -1)
if [ -n "$INDEX_REF" ]; then
  echo "   ✅ index.html references: $INDEX_REF"
else
  echo "   ⚠️  Could not verify index.html"
fi

echo ""

# Test 7: Date comparison logic test
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 7: Date Logic Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

node -e "
const today = new Date();
today.setHours(0, 0, 0, 0);

const feb20 = new Date('2026-02-20');
feb20.setHours(0, 0, 0, 0);

console.log('   Today:', today.toISOString().split('T')[0]);
console.log('   Feb 20:', feb20.toISOString().split('T')[0]);
console.log('   Feb 20 < Today?', feb20 < today, '(should be false)');
console.log('   Feb 20 >= Today?', feb20 >= today, '(should be true)');

if (feb20 >= today) {
  console.log('   ✅ Feb 20 is in the future - should show as UPCOMING');
} else {
  console.log('   ❌ Feb 20 appears as past date - BUG!');
}
"

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  SANITY CHECK COMPLETE                                   ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "🔍 Next Steps:"
echo "   1. Check browser console at: https://app.mediqzy.com/appointments"
echo "   2. Look for debug messages starting with 📅"
echo "   3. Hard refresh browser: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)"
echo ""
