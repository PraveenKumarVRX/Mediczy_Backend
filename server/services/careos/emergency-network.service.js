/**
 * HealthOS Stage 4 — Global Emergency Network
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/healthos-phases-2-4.migration.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

export async function registerEmergencyResource({ organizationId, orgNetworkId, resourceType, quantityAvailable, quantityTotal, locationName, geoRegion }) {
  await ensure();
  const existing = await pool.query(
    `SELECT id FROM healthos_emergency_resources WHERE organization_id = $1 AND resource_type = $2 LIMIT 1`,
    [organizationId, resourceType]
  );
  if (existing.rows[0]) {
    const upd = await pool.query(
      `UPDATE healthos_emergency_resources SET quantity_available = $3, quantity_total = COALESCE($4, quantity_total),
       location_name = COALESCE($5, location_name), geo_region = COALESCE($6, geo_region), last_updated = NOW()
       WHERE id = $1 RETURNING *`,
      [existing.rows[0].id, resourceType, quantityAvailable, quantityTotal, locationName, geoRegion]
    );
    return upd.rows[0];
  }
  const { rows } = await pool.query(
    `INSERT INTO healthos_emergency_resources
      (organization_id, org_network_id, resource_type, quantity_available, quantity_total, location_name, geo_region, last_updated)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING *`,
    [organizationId, orgNetworkId, resourceType, quantityAvailable, quantityTotal, locationName, geoRegion]
  );
  return rows[0];
}

export async function searchEmergencyResources({ resourceType, geoRegion } = {}) {
  await ensure();
  const params = [];
  let sql = `SELECT r.*, n.display_name AS org_name, n.country_code
    FROM healthos_emergency_resources r
    LEFT JOIN careos_network_orgs n ON n.id = r.org_network_id
    WHERE r.status = 'available' AND r.quantity_available > 0`;
  if (resourceType) { params.push(resourceType); sql += ` AND r.resource_type = $${params.length}`; }
  if (geoRegion) { params.push(geoRegion); sql += ` AND r.geo_region ILIKE $${params.length}`; }
  sql += ` ORDER BY r.quantity_available DESC LIMIT 50`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function getEmergencyNetworkSummary() {
  await ensure();
  const { rows } = await pool.query(
    `SELECT resource_type, SUM(quantity_available) AS total_available, COUNT(DISTINCT organization_id) AS org_count
     FROM healthos_emergency_resources WHERE status = 'available' GROUP BY resource_type`
  );
  return { resources: rows, refreshedAt: new Date().toISOString() };
}

export default { registerEmergencyResource, searchEmergencyResources, getEmergencyNetworkSummary };
