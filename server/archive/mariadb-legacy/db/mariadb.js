import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize(
  process.env.DB_NAME || 'mediczy',
  process.env.DB_USER || 'mediczy',
  process.env.DB_PASSWORD || 'Mediczy2024Secure',
  {
    host: process.env.DB_HOST || '127.0.0.1',
    dialect: 'mariadb',
    dialectOptions: {
      timezone: 'Etc/GMT+0',
      connectTimeout: 10000,
    },
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: process.env.NODE_ENV === 'production' ? 20 : 5,
      min: process.env.NODE_ENV === 'production' ? 5 : 0,
      acquire: 30000,
      idle: 10000,
      evict: 10000
    },
    retry: {
      max: 3,
      timeout: 3000
    },
    benchmark: process.env.NODE_ENV === 'development'
  }
);

let isConnected = false;

async function connectToDb() {
  if (isConnected) {
    console.log("Using existing database connection");
    return sequelize;
  }

  try {
    await sequelize.authenticate();
    console.log('Database connected successfully');
    isConnected = true;

    // Disable sync now that tables are created cleanly
    console.log('Database tables sync disabled - using clean existing schema');
    
    return sequelize;
  } catch (error) {
    console.error('Unable to connect to the database:', error.message);
    isConnected = false;
    
    // Only retry a few times to prevent infinite loops
    if (!error.retryCount) error.retryCount = 0;
    if (error.retryCount < 3) {
      error.retryCount++;
      setTimeout(() => {
        console.log(`Retrying database connection... (${error.retryCount}/3)`);
        connectToDb();
      }, 5000);
    } else {
      console.error('Max database connection retries reached');
    }
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  try {
    await sequelize.close();
    console.log('Database connection closed through app termination');
    process.exit(0);
  } catch (err) {
    console.error('Error closing database connection:', err);
    process.exit(1);
  }
});

export { sequelize, connectToDb };
export default connectToDb;
