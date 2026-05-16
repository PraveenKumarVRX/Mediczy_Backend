export const ensureOperationsGovernanceTables = async (db) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS operations_approvals (
      id SERIAL PRIMARY KEY,
      module VARCHAR(80) NOT NULL,
      entity_type VARCHAR(80) NOT NULL,
      entity_id INTEGER NOT NULL,
      action VARCHAR(80) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'pending',
      requested_by VARCHAR(160),
      requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
      decided_by VARCHAR(160),
      decided_at TIMESTAMP,
      notes TEXT,
      UNIQUE (module, entity_type, entity_id, action)
    );
    CREATE TABLE IF NOT EXISTS operations_audit_log (
      id SERIAL PRIMARY KEY,
      module VARCHAR(80) NOT NULL,
      entity_type VARCHAR(80) NOT NULL,
      entity_id INTEGER NOT NULL,
      action VARCHAR(120) NOT NULL,
      actor VARCHAR(160),
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
};

export const actorFrom = (user, fallback) =>
  user?.name || user?.email || user?.username || fallback;

export const recordOperationsAudit = async (db, { module, entityType, entityId, action, actor, details = {} }) => {
  await db.query(`
    INSERT INTO operations_audit_log (module, entity_type, entity_id, action, actor, details)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb)
  `, [module, entityType, entityId, action, actor || null, JSON.stringify(details)]);
};

export const requestOperationsApproval = async (db, {
  module, entityType, entityId, action, requestedBy, notes,
}) => {
  const { rows } = await db.query(`
    INSERT INTO operations_approvals (module, entity_type, entity_id, action, requested_by, notes)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (module, entity_type, entity_id, action)
    DO UPDATE SET
      status = CASE WHEN operations_approvals.status = 'rejected' THEN 'pending' ELSE operations_approvals.status END,
      requested_by = EXCLUDED.requested_by,
      requested_at = CASE WHEN operations_approvals.status = 'rejected' THEN NOW() ELSE operations_approvals.requested_at END,
      notes = EXCLUDED.notes
    RETURNING *
  `, [module, entityType, entityId, action, requestedBy || null, notes || null]);
  return rows[0];
};

export const decideOperationsApproval = async (db, {
  id, status, decidedBy, notes,
}) => {
  const { rows } = await db.query(`
    UPDATE operations_approvals
    SET status = $2, decided_by = $3, decided_at = NOW(), notes = COALESCE($4, notes)
    WHERE id = $1 AND status = 'pending'
    RETURNING *
  `, [id, status, decidedBy || null, notes || null]);
  return rows[0];
};

export const listOperationsApprovals = async (db, module) => {
  const { rows } = await db.query(`
    SELECT *
    FROM operations_approvals
    WHERE ($1::text IS NULL OR module = $1)
    ORDER BY requested_at DESC
  `, [module || null]);
  return rows;
};

export const listOperationsAudit = async (db, module, limit = 100) => {
  const { rows } = await db.query(`
    SELECT *
    FROM operations_audit_log
    WHERE ($1::text IS NULL OR module = $1)
    ORDER BY created_at DESC
    LIMIT $2
  `, [module || null, limit]);
  return rows;
};
