/**
 * Trusted-IP binding for admin (isAdmin=true) accounts.
 *
 * Opt-in: an admin with zero trusted-IP rows is unrestricted (same pattern
 * as mfa-step-up.service.js's enrollment-gated enforcement) - adding the
 * first trusted IP is what turns binding on for that account. This avoids
 * any default-on restriction that could lock an admin out before they've
 * configured anything.
 *
 * IPv4 support only (CIDR or exact match) - this is an admin-account
 * safeguard, not a general-purpose network ACL.
 */
import pool from '../db/pgPool.js';

export async function listTrustedIps(userId) {
  const { rows } = await pool.query(
    `SELECT id, ip_or_cidr, label, created_at FROM admin_trusted_ips WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId]
  );
  return rows;
}

export async function addTrustedIp(userId, ipOrCidr, label, createdBy = null) {
  if (!isValidIpOrCidr(ipOrCidr)) {
    throw Object.assign(new Error('Invalid IP address or CIDR range'), { statusCode: 400 });
  }
  const { rows } = await pool.query(
    `INSERT INTO admin_trusted_ips (user_id, ip_or_cidr, label, created_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, ip_or_cidr) DO UPDATE SET label = EXCLUDED.label
     RETURNING id, ip_or_cidr, label, created_at`,
    [userId, ipOrCidr, label || null, createdBy]
  );
  return rows[0];
}

export async function removeTrustedIp(userId, id) {
  const { rows } = await pool.query(
    `DELETE FROM admin_trusted_ips WHERE user_id = $1 AND id = $2 RETURNING id`,
    [userId, id]
  );
  return rows.length > 0;
}

/**
 * true if unrestricted (no rows) or the ip matches a trusted entry.
 */
export async function isIpTrusted(userId, ip) {
  const trusted = await listTrustedIps(userId);
  if (trusted.length === 0) return true;
  return trusted.some((row) => ipMatches(ip, row.ip_or_cidr));
}

function isValidIpOrCidr(value) {
  const [ip, prefix] = String(value).split('/');
  if (!isValidIpv4(ip)) return false;
  if (prefix === undefined) return true;
  const prefixNum = Number(prefix);
  return Number.isInteger(prefixNum) && prefixNum >= 0 && prefixNum <= 32;
}

function isValidIpv4(ip) {
  const parts = String(ip).split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

function ipToInt(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function ipMatches(ip, ipOrCidr) {
  if (!isValidIpv4(ip)) return false;
  const [network, prefix] = ipOrCidr.split('/');
  if (prefix === undefined) return ip === network;
  const prefixNum = Number(prefix);
  const mask = prefixNum === 0 ? 0 : (0xffffffff << (32 - prefixNum)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(network) & mask);
}

export default { listTrustedIps, addTrustedIp, removeTrustedIp, isIpTrusted };
