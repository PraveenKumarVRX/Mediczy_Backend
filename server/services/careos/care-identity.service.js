/**
 * CareOS — Care Identity (professional multi-affiliation)
 */
import crypto from 'crypto';
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/careos-ecosystem.migration.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

function makeProfessionalId(userId) {
  return `CPRO-${crypto.createHash('sha256').update(`pro-${userId}`).digest('hex').slice(0, 16).toUpperCase()}`;
}

export async function getOrCreateProfessionalIdentity(userId, { displayName, specialty, licenseNumber, licenseCountry } = {}) {
  await ensure();
  let { rows } = await pool.query(`SELECT * FROM careos_professional_identity WHERE user_id = $1`, [userId]);
  if (!rows[0]) {
    const ins = await pool.query(
      `INSERT INTO careos_professional_identity
        (user_id, careos_professional_id, display_name, primary_specialty, license_number, license_country)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [userId, makeProfessionalId(userId), displayName, specialty, licenseNumber, licenseCountry]
    );
    rows = ins.rows;
  }
  const identity = rows[0];
  const affiliations = await pool.query(
    `SELECT a.*, n.display_name AS org_name, n.country_code
     FROM careos_professional_affiliations a
     LEFT JOIN careos_network_orgs n ON n.id = a.org_network_id
     WHERE a.professional_id = $1 AND a.status = 'active'`,
    [identity.id]
  );
  return { ...identity, affiliations: affiliations.rows };
}

export async function addAffiliation({ userId, organizationId, orgNetworkId, role, department }) {
  const identity = await getOrCreateProfessionalIdentity(userId);
  const { rows } = await pool.query(
    `INSERT INTO careos_professional_affiliations
      (professional_id, organization_id, org_network_id, role, department)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (professional_id, organization_id, role) DO UPDATE SET status = 'active'
     RETURNING *`,
    [identity.id, organizationId, orgNetworkId || null, role, department || null]
  );
  return rows[0];
}

export default { getOrCreateProfessionalIdentity, addAffiliation };
