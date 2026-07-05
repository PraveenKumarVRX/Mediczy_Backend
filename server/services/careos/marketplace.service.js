/**
 * HealthOS Stage 4 — Care Marketplace
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/healthos-phases-2-4.migration.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

export async function listMarketplaceApps({ category, status = 'published' } = {}) {
  await ensure();
  const params = [status];
  let sql = `SELECT * FROM healthos_marketplace_apps WHERE status = $1`;
  if (category) { params.push(category); sql += ` AND category = $${params.length}`; }
  sql += ` ORDER BY install_count DESC, name`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function installApp({ organizationId, appId, installedBy, config }) {
  await ensure();
  const { rows } = await pool.query(
    `INSERT INTO healthos_org_app_installs (organization_id, app_id, installed_by, config)
     VALUES ($1,$2,$3,$4::jsonb)
     ON CONFLICT (organization_id, app_id) DO UPDATE SET status = 'active', config = EXCLUDED.config
     RETURNING *`,
    [organizationId, appId, installedBy, JSON.stringify(config || {})]
  );
  await pool.query(`UPDATE healthos_marketplace_apps SET install_count = install_count + 1 WHERE id = $1`, [appId]);
  return rows[0];
}

export async function listInstalledApps(organizationId) {
  await ensure();
  const { rows } = await pool.query(
    `SELECT i.*, a.name, a.slug, a.category, a.vendor, a.api_scopes
     FROM healthos_org_app_installs i
     JOIN healthos_marketplace_apps a ON a.id = i.app_id
     WHERE i.organization_id = $1 AND i.status = 'active'`,
    [organizationId]
  );
  return rows;
}

export default { listMarketplaceApps, installApp, listInstalledApps };
