#!/usr/bin/env node

/**
 * Create PostgreSQL tables for remaining entities
 * Uses Sequelize models to create tables with proper schema
 */

import postgresSequelize from './server/db/postgres-sequelize.js';
import Corporate from './server/models/postgres/corporate.model.postgres.js';
import Nurse from './server/models/postgres/nurse.model.postgres.js';
import DoctorAssistant from './server/models/postgres/doctor-assistant.model.postgres.js';
import Notification from './server/models/postgres/notification.model.postgres.js';

console.log('\n🔧 Creating PostgreSQL tables...\n');

try {
  await postgresSequelize.authenticate();
  console.log('✅ PostgreSQL connected');
  
  console.log('\n📦 Creating corporates table...');
  await Corporate.sync({ force: false });
  console.log('✅ Corporates table ready');
  
  console.log('\n👨‍⚕️ Creating nurses table...');
  await Nurse.sync({ force: false });
  console.log('✅ Nurses table ready');
  
  console.log('\n👔 Creating doctor_assistants table...');
  await DoctorAssistant.sync({ force: false });
  console.log('✅ Doctor Assistants table ready');
  
  console.log('\n🔔 Creating notifications table...');
  await Notification.sync({ force: false });
  console.log('✅ Notifications table ready');
  
  console.log('\n✅ All tables created successfully!');
  console.log('\nNow run: node migrate-entities-direct.js');
  
  process.exit(0);
} catch (error) {
  console.error('\n❌ Error:', error.message);
  console.error(error);
  process.exit(1);
}
