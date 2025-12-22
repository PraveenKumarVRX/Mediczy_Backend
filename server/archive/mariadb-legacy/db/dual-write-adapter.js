/**
 * Dual-Write Adapter for MariaDB → PostgreSQL Migration
 * Writes to both databases, reads from PostgreSQL with MariaDB fallback
 * 
 * Environment Variables:
 * - READ_FROM_POSTGRES (default: true) - Read from PostgreSQL first
 * - WRITE_TO_POSTGRES (default: true) - Write to PostgreSQL
 * - WRITE_TO_MARIADB (default: true) - Write to MariaDB (for backward compatibility)
 * - MIGRATION_MODE (dual-write | postgres-only | mariadb-only)
 */

import { sequelize as mariadb } from './mariadb.js';
import { postgresSequelize as postgres } from './postgres-sequelize.js';

class DualWriteAdapter {
  constructor() {
    // Read mode configuration based on MIGRATION_MODE
    const mode = process.env.MIGRATION_MODE || 'dual-write';
    
    switch (mode) {
      case 'postgres-only':
        this.readFromPostgres = true;
        this.writeToPostgres = true;
        this.writeToMariaDB = false;
        break;
      case 'postgres-primary':
        this.readFromPostgres = true;
        this.writeToPostgres = true;
        this.writeToMariaDB = false; // Don't write to MariaDB for new primary mode
        break;
      case 'mariadb-only':
        this.readFromPostgres = false;
        this.writeToPostgres = false;
        this.writeToMariaDB = true;
        break;
      case 'dual-write':
      default:
        this.readFromPostgres = process.env.READ_FROM_POSTGRES !== 'false';
        this.writeToPostgres = process.env.WRITE_TO_POSTGRES !== 'false';
        this.writeToMariaDB = process.env.WRITE_TO_MARIADB !== 'false';
    }
    
    console.log(`🔄 Dual-Write Adapter initialized (mode: ${mode})`);
    console.log(`   Read from PostgreSQL: ${this.readFromPostgres}`);
    console.log(`   Write to PostgreSQL: ${this.writeToPostgres}`);
    console.log(`   Write to MariaDB: ${this.writeToMariaDB}`);
  }

  /**
   * Create a new record in both databases
   */
  async create(MariaModel, PostgresModel, data, options = {}) {
    const results = {
      success: false,
      postgres: null,
      mariadb: null,
      errors: []
    };
    
    // Write to PostgreSQL (primary target)
    if (this.writeToPostgres && PostgresModel) {
      try {
        results.postgres = await PostgresModel.create(data, options);
        results.success = true;
      } catch (error) {
        console.error('❌ PostgreSQL create failed:', error.message);
        results.errors.push({ db: 'postgres', error: error.message });
      }
    }
    
    // Write to MariaDB (legacy support)
    if (this.writeToMariaDB && MariaModel) {
      try {
        results.mariadb = await MariaModel.create(data, options);
        if (!results.success) results.success = true;
      } catch (error) {
        console.error('❌ MariaDB create failed:', error.message);
        results.errors.push({ db: 'mariadb', error: error.message });
      }
    }
    
    if (!results.success) {
      throw new Error(`Failed to create record in any database: ${JSON.stringify(results.errors)}`);
    }
    
    // Return PostgreSQL result if available, otherwise MariaDB
    return results.postgres || results.mariadb;
  }

  /**
   * Find all records
   */
  async findAll(MariaModel, PostgresModel, options = {}) {
    // Try PostgreSQL first
    if (this.readFromPostgres && PostgresModel) {
      try {
        return await PostgresModel.findAll(options);
      } catch (error) {
        console.warn('⚠️  PostgreSQL findAll failed, falling back to MariaDB:', error.message);
      }
    }
    
    // Fallback to MariaDB
    if (MariaModel) {
      return await MariaModel.findAll(options);
    }
    
    throw new Error('No database models available for findAll');
  }

  /**
   * Find one record
   */
  async findOne(MariaModel, PostgresModel, options = {}) {
    if (this.readFromPostgres && PostgresModel) {
      try {
        return await PostgresModel.findOne(options);
      } catch (error) {
        console.warn('⚠️  PostgreSQL findOne failed, falling back to MariaDB:', error.message);
      }
    }
    
    if (MariaModel) {
      return await MariaModel.findOne(options);
    }
    
    throw new Error('No database models available for findOne');
  }

  /**
   * Find by primary key
   */
  async findByPk(MariaModel, PostgresModel, id, options = {}) {
    if (this.readFromPostgres && PostgresModel) {
      try {
        return await PostgresModel.findByPk(id, options);
      } catch (error) {
        console.warn('⚠️  PostgreSQL findByPk failed, falling back to MariaDB:', error.message);
      }
    }
    
    if (MariaModel) {
      return await MariaModel.findByPk(id, options);
    }
    
    throw new Error('No database models available for findByPk');
  }

  /**
   * Count records
   */
  async count(MariaModel, PostgresModel, options = {}) {
    if (this.readFromPostgres && PostgresModel) {
      try {
        return await PostgresModel.count(options);
      } catch (error) {
        console.warn('⚠️  PostgreSQL count failed, falling back to MariaDB:', error.message);
      }
    }
    
    if (MariaModel) {
      return await MariaModel.count(options);
    }
    
    throw new Error('No database models available for count');
  }

  /**
   * Update records in both databases
   */
  async update(MariaModel, PostgresModel, data, options = {}) {
    const results = {
      success: false,
      postgres: null,
      mariadb: null,
      errors: []
    };
    
    if (this.writeToPostgres && PostgresModel) {
      try {
        results.postgres = await PostgresModel.update(data, options);
        results.success = true;
      } catch (error) {
        console.error('❌ PostgreSQL update failed:', error.message);
        results.errors.push({ db: 'postgres', error: error.message });
      }
    }
    
    if (this.writeToMariaDB && MariaModel) {
      try {
        results.mariadb = await MariaModel.update(data, options);
        if (!results.success) results.success = true;
      } catch (error) {
        console.error('❌ MariaDB update failed:', error.message);
        results.errors.push({ db: 'mariadb', error: error.message });
      }
    }
    
    if (!results.success) {
      throw new Error(`Failed to update record in any database: ${JSON.stringify(results.errors)}`);
    }
    
    return results.postgres || results.mariadb;
  }

  /**
   * Delete records from both databases
   */
  async destroy(MariaModel, PostgresModel, options = {}) {
    const results = {
      success: false,
      postgres: null,
      mariadb: null,
      errors: []
    };
    
    if (this.writeToPostgres && PostgresModel) {
      try {
        results.postgres = await PostgresModel.destroy(options);
        results.success = true;
      } catch (error) {
        console.error('❌ PostgreSQL destroy failed:', error.message);
        results.errors.push({ db: 'postgres', error: error.message });
      }
    }
    
    if (this.writeToMariaDB && MariaModel) {
      try {
        results.mariadb = await MariaModel.destroy(options);
        if (!results.success) results.success = true;
      } catch (error) {
        console.error('❌ MariaDB destroy failed:', error.message);
        results.errors.push({ db: 'mariadb', error: error.message });
      }
    }
    
    if (!results.success) {
      throw new Error(`Failed to destroy record in any database: ${JSON.stringify(results.errors)}`);
    }
    
    return results.postgres || results.mariadb;
  }

  /**
   * Bulk create records
   */
  async bulkCreate(MariaModel, PostgresModel, records, options = {}) {
    const results = {
      success: false,
      postgres: null,
      mariadb: null,
      errors: []
    };
    
    if (this.writeToPostgres && PostgresModel) {
      try {
        results.postgres = await PostgresModel.bulkCreate(records, options);
        results.success = true;
      } catch (error) {
        console.error('❌ PostgreSQL bulkCreate failed:', error.message);
        results.errors.push({ db: 'postgres', error: error.message });
      }
    }
    
    if (this.writeToMariaDB && MariaModel) {
      try {
        results.mariadb = await MariaModel.bulkCreate(records, options);
        if (!results.success) results.success = true;
      } catch (error) {
        console.error('❌ MariaDB bulkCreate failed:', error.message);
        results.errors.push({ db: 'mariadb', error: error.message });
      }
    }
    
    if (!results.success) {
      throw new Error(`Failed to bulkCreate records in any database: ${JSON.stringify(results.errors)}`);
    }
    
    return results.postgres || results.mariadb;
  }

  /**
   * Execute raw SQL query
   */
  async query(MariaModel, PostgresModel, sql, options = {}) {
    if (this.readFromPostgres && postgres) {
      try {
        return await postgres.query(sql, options);
      } catch (error) {
        console.warn('⚠️  PostgreSQL query failed, falling back to MariaDB:', error.message);
      }
    }
    
    if (mariadb) {
      return await mariadb.query(sql, options);
    }
    
    throw new Error('No database available for query');
  }

  /**
   * Get the appropriate database connection for transactions
   */
  getConnection() {
    if (this.readFromPostgres) {
      return postgres;
    }
    return mariadb;
  }

  /**
   * Start a transaction
   */
  async transaction(callback) {
    const connection = this.getConnection();
    return await connection.transaction(callback);
  }
}

// Singleton instance
export const dualWriteAdapter = new DualWriteAdapter();
export default dualWriteAdapter;
