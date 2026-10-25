/**
 * Phlebotomist identity: a verified field worker who is NOT the lab's shared login.
 *
 *  - The lab provisions the worker (and attests the verification) and may suspend their membership.
 *  - The worker signs in with their own credentials and gets a short-lived access token plus a rotating
 *    refresh token (portal 'phlebotomy', via the shared portal_refresh_tokens machinery).
 *  - The token carries only identity. What the worker may touch is re-read from the database on EVERY request
 *    (loadPrincipal), so suspending a membership or letting a qualification lapse takes effect immediately
 *    rather than when the access token expires.
 */
import bcrypt from 'bcrypt';
import { CollectionError, invalid, notFound, conflict } from './errors.js';
import { PERMISSIONS, assertCan } from './permissions.js';
import * as v from './validation.js';

export const PHLEBOTOMY_PORTAL = 'phlebotomy';
export const PHLEBOTOMY_AUDIENCE = 'mediczy-phlebotomy';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const BCRYPT_COST = 12;
// Compared against when the email is unknown, so "no such user" costs the same as "wrong password".
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export function passwordProblem(password, email) {
  if (typeof password !== 'string' || password.length < 10) return 'Password must be at least 10 characters';
  if (password.length > 128) return 'Password must be at most 128 characters';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password must contain a letter and a digit';
  if (email && password.toLowerCase() === String(email).toLowerCase()) return 'Password must not be the email address';
  return null;
}

const profileOf = (r) => ({
  uid: r.unique_id, displayName: r.display_name, email: r.email, phone: r.phone, status: r.status,
  qualification: r.qualification, qualificationExpires: r.qualification_expires, verifiedAt: r.verified_at,
  mustChangePassword: r.must_change_password, lastLoginAt: r.last_login_at,
});

export function createPhlebotomistService({ pool, tokens, now = () => new Date() }) {
  async function tx(fn) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const out = await fn(c);
      await c.query('COMMIT');
      return out;
    } catch (err) {
      await c.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      c.release();
    }
  }

  /**
   * Resolve a worker id to a principal, or explain why not. Called on every authenticated request.
   * Returns { principal } or { reason } — the reason is for logs, never for the client.
   */
  async function loadPrincipal(phlebotomistUid) {
    const c = await pool.connect();
    try {
      const { rows: people } = await c.query(
        `SELECT id, unique_id, display_name, status, qualification_expires, verified_at, must_change_password
           FROM lab_phlebotomists WHERE unique_id = $1`, [phlebotomistUid]);
      const p = people[0];
      if (!p) return { reason: 'unknown_worker' };
      if (p.status !== 'active') return { reason: `worker_${p.status}` };
      if (!p.verified_at) return { reason: 'worker_unverified' };
      if (p.qualification_expires && new Date(p.qualification_expires) < new Date(now().toISOString().slice(0, 10))) {
        return { reason: 'qualification_expired' };
      }
      const { rows: ms } = await c.query(
        `SELECT m.owner_uid, m.scopes, m.can_home, m.can_ward
           FROM lab_phlebotomist_memberships m
           LEFT JOIN entity_registry r ON r.uid = m.owner_uid
           LEFT JOIN labs l ON r.source_table = 'labs' AND l.unique_id = m.owner_uid
          WHERE m.phlebotomist_uid = $1 AND m.status = 'active' AND m.active_from <= now()
            AND (m.active_to IS NULL OR m.active_to > now())
            AND (l.id IS NULL OR (l.status = 'active' AND l."isVerified" IS NOT FALSE))`, [phlebotomistUid]);
      if (!ms.length) return { reason: 'no_active_membership' };
      return {
        principal: {
          type: 'phlebotomist', uid: p.unique_id, ref: `phleb:${p.unique_id}`, displayName: p.display_name,
          mustChangePassword: p.must_change_password,
          memberships: ms.map((m) => ({ ownerUid: m.owner_uid, scopes: m.scopes, canHome: m.can_home, canWard: m.can_ward })),
        },
      };
    } finally {
      c.release();
    }
  }

  const tokenPayload = (p) => ({ id: p.uid, role: 'phlebotomist', aud: PHLEBOTOMY_AUDIENCE, name: p.display_name });

  async function login({ email, password, deviceId, expectedOwnerUid }) {
    const e = String(email || '').toLowerCase().trim();
    if (!e || typeof password !== 'string' || !password) throw invalid('Email and password are required');
    const invalidCreds = () => new CollectionError('invalid_credentials', 401, 'Invalid email or password');

    const { rows } = await pool.query(
      `SELECT id, unique_id, password_hash, status, failed_logins, locked_until FROM lab_phlebotomists WHERE email = $1`, [e]);
    const row = rows[0];
    const matches = await bcrypt.compare(password, row ? row.password_hash : DUMMY_HASH);
    if (!row) throw invalidCreds();
    if (row.locked_until && new Date(row.locked_until) > now()) throw invalidCreds();
    if (!matches) {
      await pool.query(
        `UPDATE lab_phlebotomists SET failed_logins = failed_logins + 1,
                locked_until = CASE WHEN failed_logins + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
          WHERE id = $1`, [row.id, MAX_FAILED, LOCK_MINUTES]);
      throw invalidCreds();
    }
    const { principal, reason } = await loadPrincipal(row.unique_id);
    if (!principal) {
      // Correct password, but not allowed in: a distinct, non-revealing status so the app can show "contact your lab".
      throw new CollectionError('account_unavailable', 403, 'This account cannot sign in. Contact your lab administrator.', { reason });
    }
    if (expectedOwnerUid && !principal.memberships.some(m => m.ownerUid === expectedOwnerUid)) throw invalidCreds();
    await pool.query('UPDATE lab_phlebotomists SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [row.id]);
    const pair = await tokens.issuePortalTokenPair(tokenPayload(principal), {
      portal: PHLEBOTOMY_PORTAL, deviceFp: deviceId || null, accessTtl: '15m', refreshTtl: '7d',
    });
    return { ...pair, mustChangePassword: principal.mustChangePassword, worker: { uid: principal.uid, displayName: principal.displayName } };
  }

  async function refresh({ refreshToken, deviceId, expectedOwnerUid }) {
    const rotated = await tokens.rotatePortalRefreshToken(refreshToken, {
      portal: PHLEBOTOMY_PORTAL, deviceFp: deviceId || null, accessTtl: '15m',
      // Re-check the worker at refresh time: a suspended worker's refresh token stops working here.
      resolvePayload: async (decoded) => {
        const { principal } = await loadPrincipal(decoded.userId);
        return principal && (!expectedOwnerUid || principal.memberships.some(m => m.ownerUid === expectedOwnerUid)) ? tokenPayload(principal) : null;
      },
    });
    if (!rotated) throw new CollectionError('invalid_refresh_token', 401, 'Session expired. Sign in again.');
    return rotated;
  }

  async function logout({ refreshToken }) {
    const jti = tokens.decodeRefreshJti ? tokens.decodeRefreshJti(refreshToken) : null;
    if (jti) await tokens.revokeToken(jti);
    return { ok: true };
  }

  async function changePassword(principal, { currentPassword, newPassword }) {
    const { rows } = await pool.query('SELECT password_hash, email FROM lab_phlebotomists WHERE unique_id = $1', [principal.uid]);
    if (!rows[0] || !(await bcrypt.compare(String(currentPassword || ''), rows[0].password_hash))) {
      throw new CollectionError('invalid_credentials', 401, 'Current password is incorrect');
    }
    const problem = passwordProblem(newPassword, rows[0].email);
    if (problem) throw invalid(problem, { field: 'newPassword' });
    if (await bcrypt.compare(newPassword, rows[0].password_hash)) throw invalid('Choose a password you have not used', { field: 'newPassword' });
    await pool.query('UPDATE lab_phlebotomists SET password_hash = $2, must_change_password = false WHERE unique_id = $1',
      [principal.uid, await bcrypt.hash(newPassword, BCRYPT_COST)]);
    await tokens.revokeAllForUser(principal.uid, PHLEBOTOMY_PORTAL);
    return { ok: true };
  }

  async function me(principal) {
    const { rows } = await pool.query('SELECT * FROM lab_phlebotomists WHERE unique_id = $1', [principal.uid]);
    return {
      worker: profileOf(rows[0]),
      memberships: principal.memberships,
      capabilities: { home: principal.memberships.some((m) => m.canHome), ward: principal.memberships.some((m) => m.canWard) },
      serverTime: now().toISOString(),
    };
  }

  // ── lab-side provisioning ──────────────────────────────────────────────────
  async function create(principal, input) {
    assertCan(principal, PERMISSIONS.ADMIN, principal.ownerUid);
    const b = v.exactly(v.body(input), 'body',
      ['displayName', 'email', 'phone', 'password', 'qualification', 'qualificationExpires', 'canHome', 'canWard']);
    const email = v.str(b.email, 'email', { max: 160 }).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw invalid('email is not valid', { field: 'email' });
    const problem = passwordProblem(b.password, email);
    if (problem) throw invalid(problem, { field: 'password' });
    const canHome = v.bool(b.canHome, 'canHome') ?? true;
    const canWard = v.bool(b.canWard, 'canWard') ?? false;
    if (!canHome && !canWard) throw invalid('Enable home and/or ward collection', { field: 'canHome' });
    const expires = b.qualificationExpires ? v.date(b.qualificationExpires, 'qualificationExpires') : null;
    const hash = await bcrypt.hash(b.password, BCRYPT_COST);
    return tx(async (c) => {
      const dup = await c.query('SELECT 1 FROM lab_phlebotomists WHERE email = $1', [email]);
      // Same answer whether the person works for this lab or another: no cross-lab membership enumeration.
      if (dup.rows[0]) throw conflict('email_in_use', 'A worker with that email already exists');
      const ins = await c.query(
        `INSERT INTO lab_phlebotomists (display_name, email, phone, password_hash, qualification, qualification_expires, verified_at, verified_by, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, now(), $7, $7) RETURNING *`,
        [v.str(b.displayName, 'displayName', { min: 2, max: 120 }), email, v.str(b.phone, 'phone', { max: 20, optional: true }), hash,
          v.str(b.qualification, 'qualification', { max: 120, optional: true }), expires ? expires.toISOString().slice(0, 10) : null, principal.ref]);
      await c.query(
        `INSERT INTO lab_phlebotomist_memberships (phlebotomist_uid, owner_uid, can_home, can_ward, created_by) VALUES ($1, $2, $3, $4, $5)`,
        [ins.rows[0].unique_id, principal.ownerUid, canHome, canWard, principal.ref]);
      return profileOf(ins.rows[0]);
    });
  }

  async function list(principal) {
    assertCan(principal, PERMISSIONS.READ, principal.ownerUid);
    const { rows } = await pool.query(
      `SELECT p.*, m.status AS m_status, m.can_home, m.can_ward, m.active_to,
              (SELECT count(*) FROM lab_collection_tasks t WHERE t.assigned_uid = p.unique_id AND t.owner_uid = m.owner_uid
                  AND t.status IN ('assigned','accepted','en_route','arrived','at_bedside','verified','consented'))::int AS open_tasks,
              (SELECT count(*) FROM lab_collection_tasks t WHERE t.assigned_uid = p.unique_id AND t.owner_uid = m.owner_uid
                  AND t.status IN ('collected','in_transit'))::int AS carrying
         FROM lab_phlebotomist_memberships m JOIN lab_phlebotomists p ON p.unique_id = m.phlebotomist_uid
        WHERE m.owner_uid = $1 AND m.status <> 'ended' ORDER BY p.display_name`, [principal.ownerUid]);
    const today = now().toISOString().slice(0, 10);
    return {
      phlebotomists: rows.map((r) => ({
        ...profileOf(r), membership: { status: r.m_status, canHome: r.can_home, canWard: r.can_ward, activeTo: r.active_to },
        workload: { openTasks: r.open_tasks, carryingSpecimens: r.carrying },
        // What dispatch needs to know before offering them a task, computed in one place.
        eligible: r.status === 'active' && r.m_status === 'active' && Boolean(r.verified_at)
          && !(r.qualification_expires && new Date(r.qualification_expires) < new Date(today)),
      })),
    };
  }

  async function updateMembership(principal, phlebotomistUid, input) {
    assertCan(principal, PERMISSIONS.ADMIN, principal.ownerUid);
    const id = v.workerUid(phlebotomistUid, 'phlebotomistUid');
    const b = v.exactly(v.body(input), 'body', ['status', 'canHome', 'canWard', 'activeTo']);
    const status = b.status === undefined ? null : v.oneOf(b.status, 'status', ['active', 'suspended', 'ended']);
    const canHome = v.bool(b.canHome, 'canHome');
    const canWard = v.bool(b.canWard, 'canWard');
    const activeTo = b.activeTo === undefined ? undefined : v.date(b.activeTo, 'activeTo');
    return tx(async (c) => {
      const { rows } = await c.query(
        `UPDATE lab_phlebotomist_memberships SET status = COALESCE($3, status), can_home = COALESCE($4, can_home),
                can_ward = COALESCE($5, can_ward), active_to = CASE WHEN $6::boolean THEN $7::timestamptz ELSE active_to END
          WHERE phlebotomist_uid = $1 AND owner_uid = $2 AND status <> 'ended' RETURNING status, can_home, can_ward`,
        [id, principal.ownerUid, status, canHome, canWard, activeTo !== undefined, activeTo === undefined ? null : activeTo]);
      if (!rows[0]) throw notFound('Worker');
      if (!rows[0].can_home && !rows[0].can_ward) throw invalid('Enable home and/or ward collection');
      const open = await c.query(
        `SELECT count(*)::int AS n FROM lab_collection_tasks WHERE assigned_uid = $1 AND owner_uid = $2
            AND status NOT IN ('unassigned','lab_received','rejected_by_lab','refused','cancelled')`, [id, principal.ownerUid]);
      if (rows[0].status !== 'active') await tokens.revokeAllForUser(id, PHLEBOTOMY_PORTAL);
      return { status: rows[0].status, canHome: rows[0].can_home, canWard: rows[0].can_ward, openTasksToReassign: open.rows[0].n };
    });
  }

  async function resetPassword(principal, phlebotomistUid, input) {
    assertCan(principal, PERMISSIONS.ADMIN, principal.ownerUid);
    const id = v.workerUid(phlebotomistUid, 'phlebotomistUid');
    const b = v.exactly(v.body(input), 'body', ['password']);
    const member = await pool.query(
      `SELECT p.email FROM lab_phlebotomists p JOIN lab_phlebotomist_memberships m ON m.phlebotomist_uid = p.unique_id
        WHERE p.unique_id = $1 AND m.owner_uid = $2 AND m.status <> 'ended'`, [id, principal.ownerUid]);
    if (!member.rows[0]) throw notFound('Worker');
    const problem = passwordProblem(b.password, member.rows[0].email);
    if (problem) throw invalid(problem, { field: 'password' });
    await pool.query(
      'UPDATE lab_phlebotomists SET password_hash = $2, must_change_password = true, failed_logins = 0, locked_until = NULL WHERE unique_id = $1',
      [id, await bcrypt.hash(b.password, BCRYPT_COST)]);
    await tokens.revokeAllForUser(id, PHLEBOTOMY_PORTAL);
    return { ok: true, mustChangePassword: true };
  }

  return { loadPrincipal, login, refresh, logout, changePassword, me, create, list, updateMembership, resetPassword };
}
