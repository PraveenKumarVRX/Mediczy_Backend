import { Prescription } from './server/models/index.js';

console.log('Syncing Prescription model...');

try {
  await Prescription.sync({ alter: true });
  console.log('✅ Prescription model synced successfully');
  process.exit(0);
} catch (error) {
  console.error('❌ Error syncing:', error.message);
  process.exit(1);
}
