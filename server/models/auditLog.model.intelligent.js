import { Op } from 'sequelize';
import { postgresSequelize } from '../db/postgres-sequelize.js';

let intelligentDB = null;
let auditLogsTableEnsured = false;

async function getDB() {
  if (!intelligentDB) {
    // For now, use direct PostgreSQL operations
    // TODO: Create proper PostgreSQL AuditLog model
    intelligentDB = postgresSequelize;
  }
  return intelligentDB;
}

async function ensureAuditLogsTable(db) {
  if (auditLogsTableEnsured) return;

  // Minimal schema to support compliance logging. Safe to run multiple times.
  await db.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NULL,
      user_type TEXT NULL,
      user_email TEXT NULL,
      action TEXT NOT NULL,
      resource_type TEXT NULL,
      resource_id TEXT NULL,
      data_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
      changes_before JSONB NOT NULL DEFAULT '{}'::jsonb,
      changes_after JSONB NOT NULL DEFAULT '{}'::jsonb,
      ip_address TEXT NULL,
      user_agent TEXT NULL,
      method TEXT NULL,
      endpoint TEXT NULL,
      status TEXT NULL,
      status_code INTEGER NULL,
      error_message TEXT NULL,
      is_phi BOOLEAN NOT NULL DEFAULT false,
      is_pii BOOLEAN NOT NULL DEFAULT false,
      purpose TEXT NULL,
      consent_id TEXT NULL,
      session_id TEXT NULL,
      retention_date TIMESTAMPTZ NULL,
      timestamp TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`CREATE INDEX IF NOT EXISTS audit_logs_timestamp_idx ON audit_logs (timestamp DESC);`);
  await db.query(`CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON audit_logs (user_id);`);
  await db.query(`CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs (action);`);
  await db.query(`CREATE INDEX IF NOT EXISTS audit_logs_resource_type_idx ON audit_logs (resource_type);`);

  auditLogsTableEnsured = true;
}

const toPlainLog = (record) => {
  if (!record) return null;
  if (typeof record.toJSON === 'function') {
    return record.toJSON();
  }
  if (typeof record.get === 'function') {
    return record.get({ plain: true });
  }
  return record;
};

const buildLogPayload = (params) => {
  const {
    userId,
    userType,
    userEmail,
    action,
    resourceType,
    resourceId,
    dataFields,
    changesBefore,
    changesAfter,
    req,
    status = 'SUCCESS',
    statusCode,
    errorMessage,
    isPHI = false,
    isPII = false,
    purpose,
    consentId,
  } = params;

  const retentionDate = new Date();
  retentionDate.setFullYear(retentionDate.getFullYear() + 6);

  return {
    userId,
    userType,
    userEmail,
    action,
    resourceType,
    resourceId,
    dataFields,
    changesBefore,
    changesAfter,
    ipAddress: req?.ip || req?.connection?.remoteAddress,
    userAgent: req?.headers?.['user-agent'],
    method: req?.method,
    endpoint: req?.originalUrl || req?.url,
    status,
    statusCode,
    errorMessage,
    isPHI,
    isPII,
    purpose,
    consentId,
    sessionId: req?.sessionID || req?.headers?.['x-session-id'],
    retentionDate,
    timestamp: new Date(),
  };
};

const AuditLog = {
  findOne: async (options) => {
    // TODO: Implement with proper PostgreSQL model
    console.warn('AuditLog.findOne not implemented for PostgreSQL');
    return null;
  },

  findByPk: async (id, options = {}) => {
    // TODO: Implement with proper PostgreSQL model
    console.warn('AuditLog.findByPk not implemented for PostgreSQL');
    return null;
  },

  create: async (logData) => {
    try {
      const db = await getDB();
      await ensureAuditLogsTable(db);
      // Use raw SQL for now until proper model is created
      const query = `
        INSERT INTO audit_logs (
          user_id, user_type, user_email, action, resource_type, resource_id,
          data_fields, changes_before, changes_after, ip_address, user_agent,
          method, endpoint, status, status_code, error_message, is_phi, is_pii,
          purpose, consent_id, session_id, retention_date, timestamp, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, NOW(), NOW()
        ) RETURNING *
      `;

      const values = [
        logData.userId,
        logData.userType,
        logData.userEmail,
        logData.action,
        logData.resourceType,
        logData.resourceId,
        JSON.stringify(logData.dataFields || {}),
        JSON.stringify(logData.changesBefore || {}),
        JSON.stringify(logData.changesAfter || {}),
        logData.ipAddress,
        logData.userAgent,
        logData.method,
        logData.endpoint,
        logData.status,
        logData.statusCode,
        logData.errorMessage,
        logData.isPHI,
        logData.isPII,
        logData.purpose,
        logData.consentId,
        logData.sessionId,
        logData.retentionDate,
        logData.timestamp
      ].map((value) => (value === undefined ? null : value));

      const [result] = await db.query(query, {
        bind: values,
        type: db.QueryTypes.INSERT
      });

      return result;
    } catch (error) {
      console.error('Audit log creation failed:', error);
      // Don't throw - audit logging should not break the main flow
      return null;
    }
  },

  findAll: async (options = {}) => {
    // TODO: Implement with proper PostgreSQL model
    console.warn('AuditLog.findAll not implemented for PostgreSQL');
    return [];
  },

  update: async (values, options) => {
    // TODO: Implement with proper PostgreSQL model
    console.warn('AuditLog.update not implemented for PostgreSQL');
    return [0];
  },

  destroy: async (options) => {
    // TODO: Implement with proper PostgreSQL model
    console.warn('AuditLog.destroy not implemented for PostgreSQL');
    return 0;
  },

  count: async (options = {}) => {
    // TODO: Implement with proper PostgreSQL model
    console.warn('AuditLog.count not implemented for PostgreSQL');
    return 0;
  },

  logEvent: async (params) => {
    try {
      const logPayload = buildLogPayload(params);
      return await AuditLog.create(logPayload);
    } catch (error) {
      console.error('Audit logging failed:', error.message);
      return null;
    }
  }
};

export default AuditLog;