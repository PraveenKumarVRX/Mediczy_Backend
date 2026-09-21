// Handles bound to a hospital (scoped SCM db) expose orgId; unscoped callers (CSSD, dietary — WP-0.5 PR 3) get null
// and behave as before. When an organization is known every insert stores it and every read/decision filters by it.
const orgOf = (db) => (Number.isInteger(db?.orgId) ? db.orgId : null);

let orgColumnEnsured = false;
const ensureOrgColumns = async (db) => {
  if (orgColumnEnsured) return;
  const raw = db.raw || db;
  for (const t of ['operations_approvals', 'operations_audit_log']) {
    const { rows } = await raw.query(`SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = 'organization_id'`, [t]);
    if (!rows[0]) await raw.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS organization_id INTEGER`);
  }
  orgColumnEnsured = true;
};

export const ensureOperationsGovernanceTables = async (db) => {
  await (db.raw || db).query(`
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
  await ensureOrgColumns(db);
};

export const actorFrom = (user, fallback) =>
  user?.name || user?.email || user?.username || fallback;

export const recordOperationsAudit = async (db, { module, entityType, entityId, action, actor, details = {} }) => {
  await db.query(`
    INSERT INTO operations_audit_log (module, entity_type, entity_id, action, actor, details, organization_id)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
  `, [module, entityType, entityId, action, actor || null, JSON.stringify(details), orgOf(db)]);
};

export const requestOperationsApproval = async (db, {
  module, entityType, entityId, action, requestedBy, notes,
}) => {
  const { rows } = await db.query(`
    INSERT INTO operations_approvals (module, entity_type, entity_id, action, requested_by, notes, organization_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (module, entity_type, entity_id, action)
    DO UPDATE SET
      status = CASE WHEN operations_approvals.status = 'rejected' THEN 'pending' ELSE operations_approvals.status END,
      requested_by = EXCLUDED.requested_by,
      requested_at = CASE WHEN operations_approvals.status = 'rejected' THEN NOW() ELSE operations_approvals.requested_at END,
      notes = EXCLUDED.notes
    WHERE operations_approvals.organization_id IS NOT DISTINCT FROM EXCLUDED.organization_id
    RETURNING *
  `, [module, entityType, entityId, action, requestedBy || null, notes || null, orgOf(db)]);
  return rows[0];
};

export const decideOperationsApproval = async (db, {
  id, status, decidedBy, notes,
}) => {
  const { rows } = await db.query(`
    UPDATE operations_approvals
    SET status = $2, decided_by = $3, decided_at = NOW(), notes = COALESCE($4, notes)
    WHERE id = $1 AND status = 'pending' AND ($5::int IS NULL OR organization_id = $5)
    RETURNING *
  `, [id, status, decidedBy || null, notes || null, orgOf(db)]);
  return rows[0];
};

export const listOperationsApprovals = async (db, module) => {
  const { rows } = await db.query(`
    SELECT *
    FROM operations_approvals
    WHERE ($1::text IS NULL OR module = $1) AND ($2::int IS NULL OR organization_id = $2)
    ORDER BY requested_at DESC
  `, [module || null, orgOf(db)]);
  return rows;
};

export const listOperationsAudit = async (db, module, limit = 100) => {
  const { rows } = await db.query(`
    SELECT *
    FROM operations_audit_log
    WHERE ($1::text IS NULL OR module = $1) AND ($3::int IS NULL OR organization_id = $3)
    ORDER BY created_at DESC
    LIMIT $2
  `, [module || null, limit, orgOf(db)]);
  return rows;
};
