/**
 * Route Migration Helper - PostgreSQL Transition
 * 
 * This helper provides utilities to gradually migrate routes from MariaDB to PostgreSQL
 * using the dual-write adapter pattern.
 * 
 * Usage in routes:
 * 
 * BEFORE:
 *   import User from '../models/user.model.mariadb.js';
 *   const user = await User.findByPk(id);
 * 
 * AFTER (Phase 1 - Dual Write):
 *   import { useModel } from '../utils/route-migration-helper.js';
 *   const User = useModel('User');
 *   const user = await User.findByPk(id);  // Reads from PostgreSQL, falls back to MariaDB
 * 
 * AFTER (Phase 2 - PostgreSQL Only):
 *   import { User } from '../models/index.js';
 *   const user = await User.findByPk(id);  // PostgreSQL only
 */

import dualWriteAdapter from '../db/dual-write-adapter.js';

// Import PostgreSQL models
import UserPostgres from '../models/postgres/user.model.postgres.js';
import DoctorPostgres from '../models/postgres/doctor.model.postgres.js';
import AppointmentPostgres from '../models/postgres/appointment.model.postgres.js';
import PrescriptionPostgres from '../models/postgres/prescription.model.postgres.js';

// Import MariaDB models for fallback
import UserMariaDB from '../models/user.model.mariadb.js';
import DoctorMariaDB from '../models/doctor.model.mariadb.js';
import AppointmentMariaDB from '../models/appointment.model.mariadb.js';
import PrescriptionMariaDB from '../models/prescription.model.mariadb.js';

// Model registry
const MODEL_REGISTRY = {
  User: { postgres: UserPostgres, mariadb: UserMariaDB },
  Doctor: { postgres: DoctorPostgres, mariadb: DoctorMariaDB },
  Appointment: { postgres: AppointmentPostgres, mariadb: AppointmentMariaDB },
  Prescription: { postgres: PrescriptionPostgres, mariadb: PrescriptionMariaDB }
};

/**
 * Get migration mode from environment
 */
function getMigrationMode() {
  return process.env.MIGRATION_MODE || 'dual-write';
}

/**
 * Get model wrapper based on migration mode
 * 
 * @param {string} modelName - Name of the model (User, Doctor, Appointment, Prescription)
 * @returns {Object} Model wrapper with dual-write support
 */
export function useModel(modelName) {
  const models = MODEL_REGISTRY[modelName];
  
  if (!models) {
    throw new Error(`Model ${modelName} not found in registry`);
  }

  const mode = getMigrationMode();

  // Phase 3: PostgreSQL only
  if (mode === 'postgres-only') {
    return models.postgres;
  }

  // Phase 0: MariaDB only (backward compatibility)
  if (mode === 'mariadb-only') {
    return models.mariadb;
  }

  // Phase 1 & 2: Dual-write mode (default)
  return createDualWriteWrapper(models.mariadb, models.postgres, modelName);
}

/**
 * Create a dual-write wrapper for a model
 */
function createDualWriteWrapper(MariaModel, PostgresModel, modelName) {
  return {
    // Read operations - use PostgreSQL with MariaDB fallback
    async findAll(options = {}) {
      return await dualWriteAdapter.findAll(MariaModel, PostgresModel, options);
    },

    async findOne(options = {}) {
      return await dualWriteAdapter.findOne(MariaModel, PostgresModel, options);
    },

    async findByPk(id, options = {}) {
      return await dualWriteAdapter.findByPk(MariaModel, PostgresModel, id, options);
    },

    async count(options = {}) {
      return await dualWriteAdapter.count(MariaModel, PostgresModel, options);
    },

    // Write operations - write to both databases
    async create(data, options = {}) {
      return await dualWriteAdapter.create(MariaModel, PostgresModel, data, options);
    },

    async bulkCreate(records, options = {}) {
      return await dualWriteAdapter.bulkCreate(MariaModel, PostgresModel, records, options);
    },

    async update(data, options = {}) {
      return await dualWriteAdapter.update(MariaModel, PostgresModel, data, options);
    },

    async destroy(options = {}) {
      return await dualWriteAdapter.destroy(MariaModel, PostgresModel, options);
    },

    // Transaction support
    async transaction(callback) {
      return await dualWriteAdapter.transaction(MariaModel, PostgresModel, callback);
    },

    // Direct model access (for special cases)
    get postgres() {
      return PostgresModel;
    },

    get mariadb() {
      return MariaModel;
    },

    get primary() {
      const mode = getMigrationMode();
      return mode === 'postgres-only' || mode === 'dual-write' ? PostgresModel : MariaModel;
    },

    // Model name
    name: modelName
  };
}

/**
 * Batch migrate multiple models
 */
export function useModels(...modelNames) {
  return modelNames.reduce((acc, name) => {
    acc[name] = useModel(name);
    return acc;
  }, {});
}

/**
 * Check if dual-write is enabled
 */
export function isDualWriteEnabled() {
  const mode = getMigrationMode();
  return mode === 'dual-write' || mode === 'postgres-primary';
}

/**
 * Get current migration status
 */
export function getMigrationStatus() {
  const mode = getMigrationMode();
  
  return {
    mode,
    phase: getPhaseFromMode(mode),
    primaryDb: mode === 'mariadb-only' ? 'mariadb' : 'postgresql',
    dualWriteEnabled: isDualWriteEnabled(),
    timestamp: new Date().toISOString()
  };
}

function getPhaseFromMode(mode) {
  switch (mode) {
    case 'mariadb-only':
      return 'Phase 0: MariaDB Only (Legacy)';
    case 'dual-write':
      return 'Phase 1: Dual-Write (Both DBs Active)';
    case 'postgres-primary':
      return 'Phase 2: PostgreSQL Primary (MariaDB Backup)';
    case 'postgres-only':
      return 'Phase 3: PostgreSQL Only (MariaDB Retired)';
    default:
      return 'Unknown Phase';
  }
}

export default {
  useModel,
  useModels,
  isDualWriteEnabled,
  getMigrationStatus,
  getMigrationMode
};
