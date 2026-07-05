/**
 * HealthOS — Multi-tenant federation gateway
 * Bridges Care Cloud trust registry → remote FHIR endpoints with audit.
 * Uses existing multitenancy (organization_id) + careos_federation_trust.
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/careos-ecosystem.migration.js';
import { logFederationAudit } from './care-federation.service.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

async function hasActiveTrust(orgAId, orgBId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM careos_federation_trust
     WHERE status = 'active'
       AND ((org_a_id = $1 AND org_b_id = $2) OR (org_a_id = $2 AND org_b_id = $1))
     LIMIT 1`,
    [orgAId, orgBId]
  );
  return rows.length > 0;
}

export async function getGatewayStatus(organizationId) {
  await ensure();
  const org = await pool.query(
    `SELECT * FROM careos_network_orgs WHERE organization_id = $1 LIMIT 1`,
    [organizationId]
  );
  const trusts = await pool.query(
    `SELECT COUNT(*) AS cnt FROM careos_federation_trust t
     JOIN careos_network_orgs a ON a.id = t.org_a_id
     JOIN careos_network_orgs b ON b.id = t.org_b_id
     WHERE (a.organization_id = $1 OR b.organization_id = $1) AND t.status = 'active'`,
    [organizationId]
  );
  const edgeGateways = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE status = 'online') AS online,
            COUNT(*) AS total
     FROM hg_edge_gateways WHERE tenant_id = $1`,
    [organizationId]
  ).catch(() => ({ rows: [{ online: 0, total: 0 }] }));

  return {
    registered: !!org.rows[0],
    networkOrgId: org.rows[0]?.id || null,
    activeTrusts: Number(trusts.rows[0]?.cnt || 0),
    edgeGateways: {
      online: Number(edgeGateways.rows[0]?.online || 0),
      total: Number(edgeGateways.rows[0]?.total || 0),
    },
    multitenancy: 'active',
    capabilities: ['fhir_proxy', 'trust_validation', 'audit_log', 'edge_sync'],
  };
}

export async function proxyFhirToOrg({
  fromOrgNetworkId, toOrgNetworkId, method = 'GET', fhirPath,
  body, actorUserId, actorOrgId, patientId,
}) {
  await ensure();
  if (!await hasActiveTrust(fromOrgNetworkId, toOrgNetworkId)) {
    throw new Error('No active federation trust between organizations');
  }

  const { rows } = await pool.query(
    `SELECT * FROM careos_network_orgs WHERE id = $1 AND status = 'active'`,
    [toOrgNetworkId]
  );
  const targetOrg = rows[0];
  if (!targetOrg?.fhir_endpoint) {
    throw new Error('Target organization has no FHIR endpoint configured');
  }

  const url = `${targetOrg.fhir_endpoint.replace(/\/$/, '')}/${fhirPath.replace(/^\//, '')}`;
  const res = await fetch(url, {
    method: method.toUpperCase(),
    headers: { 'Content-Type': 'application/fhir+json', Accept: 'application/fhir+json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });

  const data = await res.json().catch(() => ({}));
  await logFederationAudit({
    actorUserId, actorOrgId,
    action: 'fhir_proxy', resourceType: 'FHIR', resourceId: fhirPath, patientId,
    metadata: { method, toOrgNetworkId, status: res.status, url },
  });

  return { status: res.status, data, targetOrg: targetOrg.display_name };
}

export default { getGatewayStatus, proxyFhirToOrg };
