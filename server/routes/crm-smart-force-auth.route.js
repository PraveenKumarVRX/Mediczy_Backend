/** Smart-Force mobile app auth for this dedicated CRM.
 *
 * The app (github.com/MySmartHealth/smart-force) calls POST /api/team/login, /api/team/refresh-token
 * and /api/team/forgot-password, then /api/field/* with the access token. The shared platform serves
 * those from team.route.js (2.7k lines of platform team features) and a global middleware that sets
 * req.user. This module provides just what the app needs, against the CRM's own users and roles:
 *
 *  - Who may sign in: active users of THIS tenant whose CRM role has field_force:read (Business Head,
 *    Marketing Head, Field Marketing Executive; admins) or app:agent (Call Centre Agents). field_force:manage
 *    adds manager rights. The user carries modes: field, manager, agent; the app opens on the first.
 *  - Tokens: 4h access + 30d refresh, stored hashed in api_v2_refresh_tokens (scope 'smart-force'),
 *    revocable. The refresh token is not rotated because the app keeps its first refresh token.
 *  - smartForceAuth() authenticates /api/field/* and pins every request to this tenant, setting
 *    req.teamUser / req.user the way the shared route expects; the route's own authTeam defers to it.
 *
 * Permission names match the app and the shared routes exactly: "Field Force" for everyone with
 * field access, plus "Field Force Manager" for field_force:manage (requirePermission is exact-match). */
import express from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { createHash, randomUUID } from 'node:crypto';
import sharedPool from '../db/pgPool.js';
import { JWT_CONFIG } from '../config/auth.config.js';
import userModel from '../models/user.model.intelligent.js';
import { hasCRMCapability, CRM_ROLE_LABELS } from '../config/crm-roles.config.js';
import { requestPasswordReset } from '../services/crm-password-reset.service.js';

const SCOPE = 'smart-force';
const ACCESS_TTL = '4h';
const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000;
const LOCKOUT_WINDOW_MIN = 15;
const LOCKOUT_MAX_ATTEMPTS = 10;

const parse = (v) => { if (!v) return {}; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch { return {}; } };
const sha = (s) => createHash('sha256').update(s).digest('hex');
// The app shows json.error; CRM screens read json.message. Send both.
const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, error: message, message, ...extra });

function fieldAccess(user) {
  const metadata = parse(user.metadata);
  const crmUser = { crmRole: metadata.crmRole, isAdmin: Boolean(user.isAdmin) };
  const isAdmin = Boolean(user.isAdmin) || metadata.crmRole === 'admin';
  return {
    metadata, isAdmin,
    canRead: isAdmin || hasCRMCapability(crmUser, 'field_force:read'),
    canManage: isAdmin || hasCRMCapability(crmUser, 'field_force:manage'),
    canAgent: isAdmin || hasCRMCapability(crmUser, 'app:agent'),
  };
}
const canUseApp = (access) => access.canRead || access.canAgent;
const permissionsOf = (access) => [...(access.canRead ? ['Field Force'] : []), ...(access.canManage ? ['Field Force Manager'] : []), ...(access.canAgent ? ['Agent'] : [])];
function modesOf(access) {
  return [...(access.canManage ? ['manager'] : access.canRead ? ['field'] : []), ...(access.canAgent ? ['agent'] : [])];
}

async function loadUser(id, tenantId) {
  const { rows } = await sharedPool.query(
    `SELECT id, email, "firstName", "lastName", role, status, COALESCE("isAdmin", FALSE) AS "isAdmin", metadata, tenant_id
       FROM users WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [id, tenantId]);
  return rows[0] || null;
}

async function lockedOut(email, ip) {
  const { rows } = await sharedPool.query(
    `SELECT COUNT(*)::int AS n FROM crm_login_attempts
      WHERE (email = $1 OR ip_address = $2) AND succeeded = FALSE AND created_at >= now() - make_interval(mins => $3)`,
    [email, ip, LOCKOUT_WINDOW_MIN]);
  return rows[0].n >= LOCKOUT_MAX_ATTEMPTS;
}
const recordAttempt = (email, ip, ok) => sharedPool.query(
  `INSERT INTO crm_login_attempts (email, ip_address, succeeded) VALUES ($1, $2, $3)`, [email, ip, ok]).catch(() => {});
const audit = (tenantId, userId, event, details) => sharedPool.query(
  `INSERT INTO crm_audit_log (tenant_id, entity_type, entity_id, event_type, actor_user_id, new_value)
   VALUES ($1, 'smart_force_session', $2, $3, $2, $4::jsonb)`, [tenantId, userId || null, event, JSON.stringify(details)]).catch(() => {});

function appUser(user, access, tenantId) {
  return {
    id: user.id,
    name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email,
    email: user.email,
    tenantId,
    role: CRM_ROLE_LABELS[access.metadata.crmRole] || 'Field team',
    crmRole: access.isAdmin ? 'admin' : (access.metadata.crmRole || 'sales_rep'),
    permissions: permissionsOf(access),
    modes: modesOf(access),
    mode: modesOf(access)[0] || 'field',
  };
}

export function buildSmartForceAuthRouter({ tenantId, tenantUid }) {
  const router = express.Router();
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (req, res) => fail(res, 429, 'Too many attempts. Try again in a few minutes.') });

  router.post('/login', limiter, async (req, res) => {
    const ip = req.ip || 'unknown';
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password || email.length > 254 || password.length > 1024) return fail(res, 400, 'Enter your email and password.');
    try {
      if (await lockedOut(email, ip)) return fail(res, 429, `Too many failed attempts. Try again in ${LOCKOUT_WINDOW_MIN} minutes.`);
      const user = await userModel.findOne({ where: { email } });
      // One message for unknown user, wrong tenant and wrong password: no account enumeration.
      if (!user || Number(user.tenant_id) !== Number(tenantId) || !(await user.comparePassword(password))) {
        await recordAttempt(email, ip, false);
        return fail(res, 401, 'Invalid email or password');
      }
      if (user.status && user.status !== 'active') return fail(res, 403, 'Account is inactive. Contact your administrator.');
      const access = fieldAccess(user);
      if (!canUseApp(access)) {
        await recordAttempt(email, ip, false);
        await audit(tenantId, user.id, 'login_denied', { reason: 'no app role' });
        return fail(res, 403, 'Your role does not include the app. Ask your Business Head.');
      }
      const jti = randomUUID();
      const accessToken = jwt.sign({ id: user.id, email: user.email, role: 'team', userType: 'team', isTeam: true, scope: SCOPE,
        tenantId, tokenType: 'access', jti }, JWT_CONFIG.SECRET, { expiresIn: ACCESS_TTL });
      const refreshToken = jwt.sign({ id: user.id, jti, scope: SCOPE, tokenType: 'refresh' }, JWT_CONFIG.SECRET, { expiresIn: REFRESH_TTL_MS / 1000 });
      await sharedPool.query(
        `INSERT INTO api_v2_refresh_tokens (jti, user_id, role, token_hash, expires_at, ip_address) VALUES ($1, $2, $3, $4, $5, $6)`,
        [jti, user.id, SCOPE, sha(refreshToken), new Date(Date.now() + REFRESH_TTL_MS), ip]);
      await sharedPool.query(`DELETE FROM crm_login_attempts WHERE email = $1 AND succeeded = FALSE`, [email]).catch(() => {});
      await audit(tenantId, user.id, 'login', { ip });
      return res.json({ success: true, accessToken, refreshToken, user: appUser(user, access, tenantId) });
    } catch (error) {
      console.error('[SmartForce login]', error.message);
      return fail(res, 500, 'Sign-in is temporarily unavailable.');
    }
  });

  router.post('/refresh-token', limiter, async (req, res) => {
    const token = String(req.body?.refreshToken || '');
    let decoded;
    try { decoded = jwt.verify(token, JWT_CONFIG.SECRET); } catch { return fail(res, 401, 'Session expired. Please sign in again.'); }
    if (decoded.tokenType !== 'refresh' || decoded.scope !== SCOPE) return fail(res, 401, 'Session expired. Please sign in again.');
    try {
      const { rows: [stored] } = await sharedPool.query(
        `SELECT revoked, token_hash, expires_at FROM api_v2_refresh_tokens WHERE jti = $1 AND role = $2`, [decoded.jti, SCOPE]);
      if (!stored || stored.revoked || stored.token_hash !== sha(token) || new Date(stored.expires_at) < new Date()) return fail(res, 401, 'Session expired. Please sign in again.');
      const user = await loadUser(decoded.id, tenantId);
      if (!user || (user.status && user.status !== 'active') || !canUseApp(fieldAccess(user))) return fail(res, 401, 'Session expired. Please sign in again.');
      const accessToken = jwt.sign({ id: user.id, email: user.email, role: 'team', userType: 'team', isTeam: true, scope: SCOPE,
        tenantId, tokenType: 'access', jti: decoded.jti }, JWT_CONFIG.SECRET, { expiresIn: ACCESS_TTL });
      return res.json({ success: true, accessToken });
    } catch (error) {
      console.error('[SmartForce refresh]', error.message);
      return fail(res, 500, 'Sign-in is temporarily unavailable.');
    }
  });

  // Same OTP flow as the CRM's forgot-password; always the same answer so emails can't be probed.
  router.post('/forgot-password', limiter, async (req, res) => {
    await requestPasswordReset({ email: req.body?.email, tenantId }).catch(() => null);
    return res.json({ success: true, message: 'If this email has an account, a reset code has been sent.' });
  });

  router.post('/logout', smartForceAuth({ tenantId, tenantUid }), async (req, res) => {
    await sharedPool.query(`UPDATE api_v2_refresh_tokens SET revoked = TRUE WHERE jti = $1 AND role = $2`, [req.smartForceJti, SCOPE]).catch(() => {});
    return res.json({ success: true });
  });

  router.get('/auth/verify', smartForceAuth({ tenantId, tenantUid }), (req, res) => res.json({ success: true, user: req.smartForceUser }));
  return router;
}

/** Authenticates Smart-Force access tokens and pins the request to this installation's tenant. */
export function smartForceAuth({ tenantId, tenantUid = null }) {
  return async (req, res, next) => {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return fail(res, 401, 'Please sign in.');
    let decoded;
    try { decoded = jwt.verify(token, JWT_CONFIG.SECRET); } catch (e) { return fail(res, 401, e.name === 'TokenExpiredError' ? 'Session expired. Please sign in again.' : 'Please sign in.'); }
    if (decoded.tokenType !== 'access' || decoded.scope !== SCOPE || Number(decoded.tenantId) !== Number(tenantId)) return fail(res, 401, 'Please sign in.');
    try {
      const { rows: [session] } = await sharedPool.query(`SELECT revoked FROM api_v2_refresh_tokens WHERE jti = $1 AND role = $2`, [decoded.jti, SCOPE]);
      if (!session || session.revoked) return fail(res, 401, 'Session ended. Please sign in again.');
      const user = await loadUser(decoded.id, tenantId);
      if (!user || (user.status && user.status !== 'active')) return fail(res, 403, 'Account is inactive. Contact your administrator.');
      const access = fieldAccess(user);
      if (!canUseApp(access)) return fail(res, 403, 'Your role no longer includes the app.');
      const base = { id: user.id, email: user.email, tenantId, tenant_id: tenantId, organizationId: tenantId, organization_id: tenantId };
      req.teamUser = { ...base, role: access.isAdmin ? 'admin' : 'team', isTeam: true, isAdmin: access.isAdmin,
        permissions: permissionsOf(access), grantedModules: [], editableModules: [], deletableModules: [] };
      req.user = { ...base, role: req.teamUser.role, isTeam: true, isAdmin: access.isAdmin };
      req.tenantId = tenantId;
      req.smartForceJti = decoded.jti;
      req.smartForceUser = appUser(user, access, tenantId);
      req.dedicatedTeamAuth = true;
      // The same shape authCRM gives web requests, so the app's /api/app routes reuse the CRM services and rules.
      req.crmUser = { id: user.id, email: user.email, tenantId, tenantUid, crmRole: access.isAdmin ? 'admin' : (access.metadata.crmRole || 'sales_rep'), isAdmin: access.isAdmin };
      return next();
    } catch (error) {
      console.error('[SmartForce auth]', error.message);
      return fail(res, 500, 'Authentication is temporarily unavailable.');
    }
  };
}
