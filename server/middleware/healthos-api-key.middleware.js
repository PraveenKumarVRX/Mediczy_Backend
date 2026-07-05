/**
 * HealthOS — API key authentication (optional, alongside JWT)
 */
import crypto from 'crypto';
import pool from '../db/pgPool.js';

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export async function healthosApiKeyOrUser(req, res, next) {
  const headerKey = req.headers['x-healthos-api-key'] || req.headers['x-api-key'];
  if (!headerKey || !String(headerKey).startsWith('hos_')) {
    return next();
  }

  try {
    const prefix = String(headerKey).slice(0, 12);
    const { rows } = await pool.query(
      `SELECT * FROM healthos_api_keys
       WHERE key_prefix = $1 AND key_hash = $2 AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [prefix, hashKey(headerKey)]
    );
    const key = rows[0];
    if (!key) return res.status(401).json({ success: false, error: 'Invalid API key' });

    await pool.query(`UPDATE healthos_api_keys SET last_used_at = NOW() WHERE id = $1`, [key.id]);
    req.healthosApiKey = key;
    req.user = req.user || {
      id: key.created_by || 0,
      role: 'admin',
      organization_id: key.organization_id,
      tenant_id: key.organization_id,
      apiKeyAuth: true,
    };
    req.organization_id = key.organization_id;
    return next();
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

export default { healthosApiKeyOrUser };
