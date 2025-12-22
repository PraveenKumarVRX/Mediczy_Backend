/**
 * Create Communication Logs Table Migration
 * Tracks all email, SMS, and WhatsApp communications
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import CommunicationLog from '../models/postgres/communication-log.model.postgres.js';

async function createCommunicationLogsTable() {
  try {
    console.log('🚀 Creating communication_logs table...');
    
    // Sync the model to create the table
    await CommunicationLog.sync({ force: false });
    
    console.log('✅ communication_logs table created successfully');
    console.log('✅ Indexes created: createdBy, organizationId, type, status, createdAt, recipient');
    
    // Verify table exists
    const tableExists = await sequelize.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'communication_logs'
      );
    `);
    
    console.log('✅ Table verification:', tableExists[0][0].exists ? 'EXISTS' : 'NOT FOUND');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating communication_logs table:', error);
    process.exit(1);
  }
}

createCommunicationLogsTable();
