#!/usr/bin/env node

/**
 * Email Settings Migration Runner
 * Runs the email_settings table creation migration
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectToPostgresDB, postgresSequelize } from '../db/postgres-sequelize.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  console.log('🔧 Running Email Settings Migration...\n');

  try {
    // Connect to database
    console.log('📡 Connecting to PostgreSQL...');
    await connectToPostgresDB();
    console.log('✅ Connected to PostgreSQL\n');

    // Read and execute migration SQL
    console.log('📖 Reading migration file...');
    const migrationPath = path.join(__dirname, '../migrations/202602150800-create-email-settings.sql');
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    console.log('✅ Migration file loaded\n');

    // Execute migration
    console.log('⚙️  Executing migration SQL...');
    const sequelize = postgresSequelize;
    
    // Split by COMMIT and execute each transaction
    const transactions = migrationSQL.split('\nCOMMIT;').filter(tx => tx.trim());
    
    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i].trim();
      if (transaction) {
        const sql = transaction + (transaction.includes('END OF MIGRATION') ? '' : '\nCOMMIT;');
        await sequelize.query(sql, { raw: true });
        console.log(`   ✓ Transaction ${i + 1}/${transactions.length} completed`);
      }
    }

    console.log('\n✅ Migration completed successfully!\n');

    // Verify tables created
    console.log('📊 Verifying table creation...');
    const [results] = await sequelize.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_name = 'email_settings' AND table_schema = 'public'
    `);
    
    if (results.length > 0) {
      console.log('✅ email_settings table created successfully\n');
      
      // Show table structure
      const [columns] = await sequelize.query(`
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'email_settings'
        ORDER BY ordinal_position
        LIMIT 10
      `);
      
      console.log('📋 Table Structure (first 10 columns):');
      columns.forEach((col, idx) => {
        console.log(`   ${idx + 1}. ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULLABLE'}`);
      });
      console.log();
    } else {
      throw new Error('email_settings table was not created');
    }

    // Show indexes
    const [indexes] = await sequelize.query(`
      SELECT indexname FROM pg_indexes 
      WHERE tablename = 'email_settings'
    `);
    
    console.log(`📑 Indexes Created: ${indexes.length}`);
    indexes.forEach(idx => {
      console.log(`   ✓ ${idx.indexname}`);
    });

    console.log('\n✨ All done! Email Settings migration is ready.\n');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    // Close database connection
    try {
      await postgresSequelize.close();
    } catch (e) {
      // Ignore
    }
  }
}

// Run migration
runMigration();
