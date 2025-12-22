import { sequelize } from '../db/mariadb.js';

async function dropLabsTable() {
  try {
    await sequelize.authenticate();
    await sequelize.query('DROP TABLE IF EXISTS labs');
    console.log('✅ Labs table dropped successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

dropLabsTable();