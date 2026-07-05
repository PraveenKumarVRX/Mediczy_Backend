/**
 * CareOS — Federation (org network + cross-border trust)
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/careos-ecosystem.migration.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

export async function registerNetworkOrg({ organizationId, displayName, countryCode, orgType, fhirEndpoint, capabilities = [] }) {
  await ensure();
  const { rows } = await pool.query(
    `INSERT INTO careos_network_orgs (organization_id, display_name, country_code, org_type, fhir_endpoint, capabilities)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [organizationId, displayName, countryCode, orgType || 'hospital', fhirEndpoint || null, capabilities]
  );
  return rows[0];
}

export async function listNetworkOrgs({ countryCode, orgType } = {}) {
  await ensure();
  const params = [];
  let sql = `SELECT * FROM careos_network_orgs WHERE status = 'active'`;
  if (countryCode) { params.push(countryCode); sql += ` AND country_code = $${params.length}`; }
  if (orgType) { params.push(orgType); sql += ` AND org_type = $${params.length}`; }
  sql += ` ORDER BY display_name`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function proposeTrust({ orgAId, orgBId, trustLevel, purposes, approvedBy }) {
  await ensure();
  const { rows } = await pool.query(
    `INSERT INTO careos_federation_trust (org_a_id, org_b_id, trust_level, purposes, status, approved_by, approved_at)
     VALUES ($1,$2,$3,$4,'active',$5,NOW())
     ON CONFLICT (org_a_id, org_b_id) DO UPDATE SET trust_level = EXCLUDED.trust_level, purposes = EXCLUDED.purposes, status = 'active'
     RETURNING *`,
    [orgAId, orgBId, trustLevel || 'referral', purposes || ['second_opinion', 'referral'], approvedBy || null]
  );
  return rows[0];
}

export async function logFederationAudit({ sessionId, actorUserId, actorOrgId, action, resourceType, resourceId, patientId, metadata }) {
  await ensure();
  const { rows } = await pool.query(
    `INSERT INTO careos_federation_audit_log
      (session_id, actor_user_id, actor_org_id, action, resource_type, resource_id, patient_id, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *`,
    [sessionId || null, actorUserId, actorOrgId, action, resourceType, resourceId, patientId || null, JSON.stringify(metadata || {})]
  );
  return rows[0];
}

export async function getFederationStatus(organizationId) {
  await ensure();
  const org = await pool.query(`SELECT * FROM careos_network_orgs WHERE organization_id = $1 LIMIT 1`, [organizationId]);
  const trusts = await pool.query(
    `SELECT t.*, a.display_name AS org_a_name, b.display_name AS org_b_name
     FROM careos_federation_trust t
     JOIN careos_network_orgs a ON a.id = t.org_a_id
     JOIN careos_network_orgs b ON b.id = t.org_b_id
     WHERE (a.organization_id = $1 OR b.organization_id = $1) AND t.status = 'active'`,
    [organizationId]
  );
  return {
    registered: !!org.rows[0],
    networkOrg: org.rows[0] || null,
    activeTrusts: trusts.rows.length,
    trusts: trusts.rows,
  };
}

export default { registerNetworkOrg, listNetworkOrgs, proposeTrust, logFederationAudit, getFederationStatus };
