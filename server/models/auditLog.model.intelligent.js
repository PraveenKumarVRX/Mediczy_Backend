import { Op } from 'sequelize';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { maskPhi } from '../utils/phi-masker.js';
import { setRlsContext } from '../middleware/rls-context.middleware.js';
import { getClientIp } from '../utils/clientIp.js';

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
  if (process.env.DEDICATED_CRM_RUNTIME === 'true') {
    // The dedicated installer owns DDL; its application role must never need it.
    await db.query('SELECT id, user_id, action, timestamp FROM audit_logs LIMIT 0');
    auditLogsTableEnsured = true;
    return;
  }

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
    dataFields: maskPhi(dataFields || {}),
    changesBefore: maskPhi(changesBefore || {}),
    changesAfter: maskPhi(changesAfter || {}),
    ipAddress: req ? getClientIp(req) : null,
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

// audit_logs has no tenant_id/organization_id column (it logs system and
// cross-tenant events too, e.g. health checks, unauthenticated requests) —
// so unlike PHI tables there is no per-tenant RLS boundary to run reads
// under. Reads use the same trusted-system platform-admin context that
// `create` already uses below; the actual access boundary for this data is
// enforced at the route layer (requireRole, see routes/audit.route.js), not
// by RLS. Do not expose these read methods without that route-level gate.
async function withAuditReadContext(callback) {
  const db = await getDB();
  await ensureAuditLogsTable(db);
  const transaction = await db.transaction();
  try {
    await setRlsContext(transaction, { orgId: 0, userId: 0, isPlatformAdmin: true });
    const result = await callback(db, transaction);
    await transaction.commit();
    return result;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

const FILTERABLE_COLUMNS = {
  userId: 'user_id',
  userType: 'user_type',
  userEmail: 'user_email',
  action: 'action',
  resourceType: 'resource_type',
  resourceId: 'resource_id',
  status: 'status',
  isPHI: 'is_phi',
  isPII: 'is_pii',
  sessionId: 'session_id',
};

function buildWhereClause(where = {}) {
  const clauses = [];
  const values = [];

  for (const [key, column] of Object.entries(FILTERABLE_COLUMNS)) {
    if (where[key] === undefined || where[key] === null || where[key] === '') continue;
    values.push(where[key]);
    clauses.push(`${column} = $${values.length}`);
  }

  if (where.dateFrom) {
    values.push(where.dateFrom);
    clauses.push(`timestamp >= $${values.length}`);
  }
  if (where.dateTo) {
    values.push(where.dateTo);
    clauses.push(`timestamp <= $${values.length}`);
  }
  if (where.search) {
    values.push(`%${where.search}%`);
    clauses.push(`(action ILIKE $${values.length} OR resource_type ILIKE $${values.length} OR endpoint ILIKE $${values.length})`);
  }

  return {
    sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    values,
  };
}

const AuditLog = {
  findOne: async (options) => {
    const rows = await AuditLog.findAll({ ...options, limit: 1 });
    return rows[0] || null;
  },

  findByPk: async (id, options = {}) => {
    return withAuditReadContext(async (db, transaction) => {
      const rows = await db.query('SELECT * FROM audit_logs WHERE id = $1', {
        bind: [id],
        type: db.QueryTypes.SELECT,
        transaction,
      });
      return rows[0] || null;
    });
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

      // audit_logs has FORCE ROW LEVEL SECURITY (tenant-isolation + platform-admin
      // policies). This writer runs outside any per-request RLS context (it's a
      // background audit sink, invoked for anonymous/system requests too), so
      // without explicitly setting a context first every insert was silently
      // rejected — "new row violates row-level security policy" — since 2026-07-03.
      // The audit log itself is a trusted system writer, not tenant-scoped user
      // data, so it runs under the platform-admin RLS bypass rather than trying
      // to derive a per-tenant org/user context that may not exist (e.g. health
      // checks, unauthenticated requests).
      const transaction = await db.transaction();
      let result;
      try {
        await setRlsContext(transaction, { orgId: 0, userId: 0, isPlatformAdmin: true });
        [result] = await db.query(query, {
          bind: values,
          type: db.QueryTypes.INSERT,
          transaction,
        });
        await transaction.commit();
      } catch (err) {
        await transaction.rollback();
        throw err;
      }

      return result;
    } catch (error) {
      console.error('Audit log creation failed:', error);
      // Don't throw - audit logging should not break the main flow
      return null;
    }
  },

  findAll: async (options = {}) => {
    const { where = {}, limit = 50, offset = 0, order = 'DESC' } = options;
    const safeLimit = Math.min(parseInt(limit, 10) || 50, 500);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
    const safeOrder = order === 'ASC' ? 'ASC' : 'DESC';

    return withAuditReadContext(async (db, transaction) => {
      const { sql: whereSql, values } = buildWhereClause(where);
      const limitParamIndex = values.length + 1;
      const offsetParamIndex = values.length + 2;

      return db.query(
        `SELECT * FROM audit_logs ${whereSql}
         ORDER BY timestamp ${safeOrder}
         LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`,
        {
          bind: [...values, safeLimit, safeOffset],
          type: db.QueryTypes.SELECT,
          transaction,
        }
      );
    });
  },

  // Audit logs are append-only by design — mutating or deleting a compliance
  // record defeats its purpose. Nothing in this codebase should call these;
  // they exist so a stray call fails loudly instead of silently no-op'ing.
  // count() only understands the whitelisted equality filters in buildWhereClause and silently
  // ignores Sequelize operators (Op.lt etc.), so date-bounded retention counts need this method.
  countOlderThan: async ({ before, actions = null }) => {
    return withAuditReadContext(async (db, transaction) => {
      const bind = [before];
      let sql = 'SELECT COUNT(*)::int AS count FROM audit_logs WHERE timestamp < $1';
      if (Array.isArray(actions) && actions.length) {
        bind.push(actions);
        sql += ' AND action = ANY($2)';
      }
      const rows = await db.query(sql, { bind, type: db.QueryTypes.SELECT, transaction });
      return rows[0]?.count || 0;
    });
  },

  // Read-only aggregate for the compliance report: findAll() only supports where/limit/order,
  // so grouped counts need their own query (same trusted read context as findAll).
  countByAction: async ({ since }) => {
    return withAuditReadContext(async (db, transaction) => {
      return db.query(
        `SELECT action, COUNT(*)::int AS count FROM audit_logs WHERE timestamp >= $1 GROUP BY action ORDER BY count DESC`,
        { bind: [since], type: db.QueryTypes.SELECT, transaction }
      );
    });
  },

  update: async () => {
    throw new Error('AuditLog records are immutable — update is not supported');
  },

  destroy: async () => {
    throw new Error('AuditLog records are immutable — destroy is not supported');
  },

  count: async (options = {}) => {
    const { where = {} } = options;
    return withAuditReadContext(async (db, transaction) => {
      const { sql: whereSql, values } = buildWhereClause(where);
      const rows = await db.query(`SELECT COUNT(*)::int AS count FROM audit_logs ${whereSql}`, {
        bind: values,
        type: db.QueryTypes.SELECT,
        transaction,
      });
      return rows[0]?.count || 0;
    });
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