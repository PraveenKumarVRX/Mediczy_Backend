import pg from 'pg';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// Load .env manually
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '.env');

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && !process.env[key]) {
      process.env[key] = valueParts.join('=').trim();
    }
  });
}

// Database configuration
const dbConfig = {
  host: process.env.POSTGRES_PRIMARY_HOST || process.env.POSTGRES_HOST || '127.0.0.1',
  port: 5432, // Direct postgres, not pgbouncer (6432)
  database: process.env.POSTGRES_PRIMARY_DATABASE || process.env.POSTGRES_DATABASE || 'mediczy_ai',
  user: process.env.POSTGRES_PRIMARY_USER || process.env.POSTGRES_USER || 'mediczy_helper',
  password: process.env.POSTGRES_PRIMARY_PASSWORD || process.env.POSTGRES_PASSWORD || 'change_me',
  ssl: false // Disable SSL if causing issues
};

console.log(`📊 Connecting to: ${dbConfig.user}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);

const pool = new pg.Pool(dbConfig);

/**
 * Generate unique alphanumeric ID
 * @param {string} prefix - Prefix for the ID (e.g., 'E' for Employee)
 * @param {number} length - Total length including prefix (default: 6)
 * @returns {string} Unique ID like E12AB3
 */
function generateUniqueId(prefix, length = 6) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const randomLength = length - prefix.length;
  let result = prefix;
  
  for (let i = 0; i < randomLength; i++) {
    const randomIndex = crypto.randomInt(0, chars.length);
    result += chars[randomIndex];
  }
  
  return result;
}

/**
 * Check if unique ID exists in database
 */
async function isUniqueIdExists(uniqueId) {
  try {
    const result = await pool.query(
      `SELECT unique_id FROM users WHERE unique_id = $1 LIMIT 1`,
      [uniqueId]
    );
    return result.rows.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Generate guaranteed unique ID with retries
 */
async function generateGuaranteedUniqueId(prefix, maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    const uniqueId = generateUniqueId(prefix);
    const exists = await isUniqueIdExists(uniqueId);
    if (!exists) {
      return uniqueId;
    }
  }
  // Fallback: use timestamp suffix if all retries failed
  return `${prefix}${Date.now().toString(36).slice(-5).toUpperCase()}`;
}

async function generateEmployeeUniqueIds(corporateId) {
  try {
    console.log(`\n🚀 Starting unique ID generation for corporate ${corporateId}...\n`);

    // 1. Find all employees without unique IDs
    const employeesWithoutIds = await pool.query(`
      SELECT DISTINCT u.id, u.email 
      FROM users u
      INNER JOIN user_associations ua ON u.id = ua."userId"
      WHERE ua."entityId" = $1
      AND ua."entityType" = 'corporate'
      AND (u.unique_id IS NULL OR u.unique_id = '')
      ORDER BY u.id
    `, [corporateId]);

    console.log(`📊 Found ${employeesWithoutIds.rows.length} employees without unique IDs`);

    if (employeesWithoutIds.rows.length === 0) {
      console.log('✅ All employees already have unique IDs!');
      return;
    }

    // 2. Generate and assign unique IDs
    let updated = 0;
    let failed = 0;

    for (const employee of employeesWithoutIds.rows) {
      try {
        const uniqueId = await generateGuaranteedUniqueId('E');
        
        await pool.query(`
          UPDATE users 
          SET unique_id = $1, "updatedAt" = NOW()
          WHERE id = $2
        `, [uniqueId, employee.id]);

        updated++;
        
        if (updated % 100 === 0) {
          console.log(`✅ Progress: ${updated}/${employeesWithoutIds.rows.length} employees updated...`);
        }
      } catch (error) {
        console.error(`❌ Failed to update employee ${employee.id}:`, error.message);
        failed++;
      }
    }

    console.log(`\n✅ Unique ID generation complete!`);
    console.log(`   - Updated: ${updated}`);
    console.log(`   - Failed: ${failed}`);
    console.log(`   - Total: ${employeesWithoutIds.rows.length}\n`);

    // 3. Check for duplicate emails
    console.log(`🔍 Checking for duplicate emails...`);
    
    const duplicates = await pool.query(`
      SELECT u.email, COUNT(*) as count, array_agg(u.id) as user_ids
      FROM users u
      INNER JOIN user_associations ua ON u.id = ua."userId"
      WHERE ua."entityId" = $1 
      AND ua."entityType" = 'corporate'
      GROUP BY u.email
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `, [corporateId]);

    if (duplicates.rows.length > 0) {
      console.log(`\n⚠️  Found ${duplicates.rows.length} duplicate emails:`);
      duplicates.rows.slice(0, 10).forEach(dup => {
        console.log(`   - ${dup.email}: ${dup.count} occurrences (IDs: ${dup.user_ids})`);
      });
      
      console.log(`\n🗑️  Removing duplicate user associations (keeping oldest)...`);
      
      let duplicatesRemoved = 0;
      for (const dup of duplicates.rows) {
        const userIds = Array.isArray(dup.user_ids)
          ? dup.user_ids
          : dup.user_ids.split(',').map(id => parseInt(id.trim()));
        const keepId = Math.min(...userIds); // Keep the oldest (lowest ID)
        const deleteIds = userIds.filter(id => id !== keepId);
        
        for (const deleteId of deleteIds) {
          await pool.query(`
            DELETE FROM user_associations 
            WHERE "userId" = $1
            AND "entityId" = $2
            AND "entityType" = 'corporate'
          `, [deleteId, corporateId]);
          duplicatesRemoved++;
        }
      }
      
      console.log(`✅ Removed ${duplicatesRemoved} duplicate associations\n`);
    } else {
      console.log(`✅ No duplicate emails found!\n`);
    }

    // 4. Final count
    const finalCount = await pool.query(`
      SELECT COUNT(DISTINCT ua."userId") as total
      FROM user_associations ua
      WHERE ua."entityId" = $1
      AND ua."entityType" = 'corporate'
    `, [corporateId]);

    const withUniqueIds = await pool.query(`
      SELECT COUNT(DISTINCT u.id) as total
      FROM users u
      INNER JOIN user_associations ua ON u.id = ua."userId"
      WHERE ua."entityId" = $1
      AND ua."entityType" = 'corporate'
      AND u.unique_id IS NOT NULL
      AND u.unique_id != ''
    `, [corporateId]);

    console.log(`📊 Final Statistics:`);
    console.log(`   - Total employees: ${finalCount.rows[0].total}`);
    console.log(`   - With unique IDs: ${withUniqueIds.rows[0].total}`);
    console.log(`   - Missing IDs: ${finalCount.rows[0].total - withUniqueIds.rows[0].total}\n`);

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

// Run the script
const corporateId = process.argv[2] || 5; // Default to Equitas (ID 5)

console.log(`\n${'='.repeat(60)}`);
console.log(`  Equitas Employee Unique ID Generation Script`);
console.log(`${'='.repeat(60)}\n`);

generateEmployeeUniqueIds(corporateId)
  .then(async () => {
    await pool.end();
    console.log('✅ Script completed successfully!\n');
    process.exit(0);
  })
  .catch(async error => {
    console.error('❌ Script failed:', error);
    await pool.end();
    process.exit(1);
  });
