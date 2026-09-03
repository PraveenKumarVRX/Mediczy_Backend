/**
 * IAM (Identity & Access Management) Module (Upgrade Plan Track A, Phase A3)
 *
 * Consolidates the CORE identity surface — login, token refresh, SSO,
 * OAuth, enterprise auth, roles, module-access — behind one documented
 * /api/iam/* namespace, without touching any existing auth route file's
 * logic. Each sub-path below simply re-mounts the SAME router instance
 * already mounted elsewhere in app.js (see /_surface for the legacy
 * paths) — same code, same behavior, zero regression risk, purely an
 * additional consolidated entry point plus documentation.
 *
 * Scope note (see Upgrade Plan risk register): app.js has roughly 20
 * separate auth-related mount points once vertical-specific portals
 * (clinic, ambulance, homecare, corporate, hospital, lab, psu, insurer,
 * ngo, aggregator, pharmacy) are counted — more than the ~8 core files
 * the plan originally scoped. This phase consolidates the core identity
 * surface only; the vertical-specific portals are listed under
 * "verticalAuthSurfaces" in /_surface as a mapped-but-not-yet-consolidated
 * follow-up, deliberately left out of this pass rather than folded in
 * without the four-eyes review that scale of change would warrant.
 */
import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import authLoginRouter from './auth.login.route.js';
import authTokenRouter from './auth.token.route.js';
import ssoRouter from './sso.route.js';
import oauthRouter from './oauth.route.js';
import enterpriseAuthRouter from './enterprise-auth.route.js';
import roleRouter from './role.route.js';
import moduleAccessRouter from './module-access.route.js';

const router = express.Router();

router.use('/login', authLoginRouter);
router.use('/token', authTokenRouter);
router.use('/sso', ssoRouter);
router.use('/oauth', oauthRouter);
router.use('/enterprise', enterpriseAuthRouter);
router.use('/roles', roleRouter);
router.use('/module-access', moduleAccessRouter);

// GET /api/iam/_surface — documents every auth-related mount point in the
// app, consolidated and legacy alike. Source of truth for A3's remaining
// scope; admin-only since it's an internal map of the auth attack surface.
router.get('/_surface', authUser, requireRole(['admin', 'system_admin']), (req, res) => {
  res.json({
    success: true,
    data: {
      consolidated: {
        '/api/iam/login': 'auth.login.route.js',
        '/api/iam/token': 'auth.token.route.js',
        '/api/iam/sso': 'sso.route.js',
        '/api/iam/oauth': 'oauth.route.js',
        '/api/iam/enterprise': 'enterprise-auth.route.js',
        '/api/iam/roles': 'role.route.js',
        '/api/iam/module-access': 'module-access.route.js',
      },
      legacyCoreSurfaces: {
        '/api/auth': ['oauth.route.js', 'auth.login.route.js', 'auth.token.route.js'],
        '/oauth': 'oauth.route.js',
        '/api/sso': 'sso.route.js',
        '/api/enterprise/auth': 'enterprise-auth.route.js',
        '/api/admin/roles': 'role.route.js',
        '/api/roles': 'role.route.js',
        '/api/admin/module-access': 'module-access.route.js',
        '/api/module-access': 'module-access.route.js',
      },
      // Domain-specific portals with their own login/logout/verify routers —
      // mapped here, not yet consolidated. Each has a distinct user model
      // (clinic staff, ambulance operator, homecare provider, etc.), so
      // folding these into /api/iam is a separate, larger change than this
      // phase's scope, not an oversight.
      verticalAuthSurfaces: [
        '/api/clinic (clinicAuthRouter, clinicStaffAuthRouter)',
        '/api/ambulance (ambulanceAuthRouter)',
        '/api/homecare (homecareAuthRouter)',
        '/api/corporate (corporateAuthRouter)',
        '/api/hospital (hospitalAuthAliasRouter)',
        '/api/hospital/auth (hospitalAuthRouter)',
        '/api/lab (labAuthRouter)',
        '/api/psu (psuAuthRouter)',
        '/api/insurer (insurerAuthRouter)',
        '/api/ngo (ngoAuthRouter)',
        '/api/aggregator-auth (aggregatorAuthRouter)',
        '/api/pharmacy (pharmacyRouter)',
        '/api/hospital-insurance/auth (hospitalInsuranceAuthRouter)',
      ],
      note: 'All /api/iam/* paths above are the same router instances mounted at their legacy paths — identical behavior, additive only. No existing auth route file was modified for this consolidation.',
    },
  });
});

export default router;
