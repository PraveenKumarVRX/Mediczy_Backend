/**
 * HyperGrid SMART on FHIR App Platform
 *
 * Implements an OAuth2 authorization server extension for third-party SMART apps.
 * Apps register once, get client credentials, and can access patient data
 * across any hospital on HyperGrid via scoped FHIR tokens.
 *
 * POST   /api/hypergrid/smart/apps                Register app (dynamic client reg)
 * GET    /api/hypergrid/smart/apps                List registered apps
 * GET    /api/hypergrid/smart/apps/:clientId      Get app details
 * DELETE /api/hypergrid/smart/apps/:clientId      Revoke app
 * GET    /api/hypergrid/smart/.well-known/smart-configuration  Discovery
 * POST   /api/hypergrid/smart/authorize           Authorization endpoint
 * POST   /api/hypergrid/smart/token               Token endpoint
 * POST   /api/hypergrid/smart/token/introspect    Introspection
 * GET    /api/hypergrid/smart/launch              EHR launch handler
 */

import express from 'express';
import crypto  from 'crypto';
import jwt     from 'jsonwebtoken';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { connectPostgres }       from '../db/postgres.js';

const router       = express.Router();
const SMART_SECRET = process.env.SMART_JWT_SECRET || process.env.JWT_SECRET;
const BASE_URL     = process.env.APP_BASE_URL      || 'https://app.mediqzy.com';
const TOKEN_TTL    = parseInt(process.env.SMART_TOKEN_TTL || '3600', 10);

// Allowed SMART scopes
const VALID_SCOPES = new Set([
  'openid', 'fhirUser', 'profile', 'launch', 'launch/patient',
  'patient/*.read', 'patient/Patient.read', 'patient/Observation.read',
  'patient/Condition.read', 'patient/MedicationRequest.read',
  'patient/Encounter.read', 'patient/AllergyIntolerance.read',
  'patient/DiagnosticReport.read',
  'user/*.read', 'user/Patient.read',
  'offline_access',
]);

function validateScopes(requested) {
  return requested.filter(s => VALID_SCOPES.has(s));
}

// ── Discovery endpoint ────────────────────────────────────────────────────────
router.get('/.well-known/smart-configuration', (req, res) => {
  res.json({
    issuer:                `${BASE_URL}`,
    authorization_endpoint:`${BASE_URL}/api/hypergrid/smart/authorize`,
    token_endpoint:        `${BASE_URL}/api/hypergrid/smart/token`,
    introspection_endpoint:`${BASE_URL}/api/hypergrid/smart/token/introspect`,
    jwks_uri:              `${BASE_URL}/api/hypergrid/smart/.well-known/jwks`,
    registration_endpoint: `${BASE_URL}/api/hypergrid/smart/apps`,
    scopes_supported:      [...VALID_SCOPES],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'client_credentials'],
    code_challenge_methods_supported: ['S256'],
    capabilities: [
      'launch-ehr', 'launch-standalone', 'client-public', 'client-confidential-symmetric',
      'sso-openid-connect', 'context-ehr-patient', 'permission-patient',
      'permission-user', 'authorize-post',
    ],
  });
});

// ── Dynamic client registration ───────────────────────────────────────────────
router.post('/apps', authUser, async (req, res) => {
  try {
    const {
      clientName, redirectUris, logoUri, contacts,
      grantTypes = ['authorization_code'],
      scope,
    } = req.body;

    if (!clientName) return res.status(400).json({ error: 'client_name required' });
    if (!redirectUris || !Array.isArray(redirectUris) || redirectUris.length === 0)
      return res.status(400).json({ error: 'redirect_uris required' });

    const clientId     = `smart_${crypto.randomBytes(12).toString('hex')}`;
    const clientSecret = crypto.randomBytes(32).toString('hex');
    const allowedScopes = scope ? validateScopes(scope.split(' ')).join(' ')
                                : 'launch patient/*.read openid fhirUser';

    const pool = await connectPostgres();
    const r    = await pool.query(
      `INSERT INTO hg_smart_apps
         (client_id, client_secret_hash, client_name, redirect_uris, logo_uri,
          contacts, grant_types, allowed_scopes, registered_by, active, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,NOW())
       RETURNING client_id, client_name, redirect_uris, allowed_scopes, grant_types, created_at`,
      [
        clientId,
        crypto.createHash('sha256').update(clientSecret).digest('hex'),
        clientName,
        JSON.stringify(redirectUris),
        logoUri  || null,
        contacts ? JSON.stringify(contacts) : null,
        JSON.stringify(grantTypes),
        allowedScopes,
        req.user.id,
      ]
    );

    res.status(201).json({
      client_id:                clientId,
      client_secret:            clientSecret,
      client_name:              clientName,
      redirect_uris:            redirectUris,
      grant_types:              grantTypes,
      scope:                    allowedScopes,
      token_endpoint_auth_method: 'client_secret_basic',
      registration_access_token: jwt.sign({ clientId, type: 'registration' }, SMART_SECRET, { expiresIn: '30d' }),
      note: 'Store client_secret securely — it will not be shown again.',
    });
  } catch (err) {
    console.error('[SMART] Register app error:', err);
    res.status(500).json({ error: 'server_error', error_description: 'Failed to register app' });
  }
});

// ── List apps ─────────────────────────────────────────────────────────────────
router.get('/apps', authUser, requireRole(['admin']), async (req, res) => {
  try {
    const pool = await connectPostgres();
    const r    = await pool.query(
      `SELECT client_id, client_name, redirect_uris, allowed_scopes,
              grant_types, active, created_at
       FROM hg_smart_apps WHERE active = TRUE ORDER BY created_at DESC`
    );
    res.json({ success: true, apps: r.rows });
  } catch (err) {
    res.status(500).json({ error: 'server_error' });
  }
});

// ── Get app ───────────────────────────────────────────────────────────────────
router.get('/apps/:clientId', authUser, requireRole(['admin']), async (req, res) => {
  try {
    const pool = await connectPostgres();
    const r    = await pool.query(
      `SELECT client_id, client_name, redirect_uris, allowed_scopes,
              grant_types, logo_uri, active, created_at
       FROM hg_smart_apps WHERE client_id = $1`,
      [req.params.clientId]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json({ success: true, app: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'server_error' });
  }
});

// ── Revoke app ────────────────────────────────────────────────────────────────
router.delete('/apps/:clientId', authUser, requireRole(['admin']), async (req, res) => {
  try {
    const pool = await connectPostgres();
    await pool.query(
      `UPDATE hg_smart_apps SET active = FALSE WHERE client_id = $1`,
      [req.params.clientId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'server_error' });
  }
});

// ── Authorization endpoint — issues auth code ─────────────────────────────────
router.post('/authorize', authUser, async (req, res) => {
  try {
    const { client_id, redirect_uri, scope, state, code_challenge, code_challenge_method } = req.body;
    if (!client_id || !redirect_uri)
      return res.status(400).json({ error: 'invalid_request', error_description: 'client_id and redirect_uri required' });

    const pool = await connectPostgres();
    const app  = await pool.query(
      `SELECT * FROM hg_smart_apps WHERE client_id = $1 AND active = TRUE`, [client_id]
    );
    if (!app.rows[0]) return res.status(400).json({ error: 'invalid_client' });

    const uris = JSON.parse(app.rows[0].redirect_uris);
    if (!uris.includes(redirect_uri)) return res.status(400).json({ error: 'invalid_redirect_uri' });

    const requestedScopes = (scope || '').split(' ');
    const grantedScopes   = validateScopes(requestedScopes).join(' ');
    const code            = crypto.randomBytes(32).toString('hex');
    const expiresAt       = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await pool.query(
      `INSERT INTO hg_smart_auth_codes
         (code, client_id, user_id, scope, redirect_uri, code_challenge,
          code_challenge_method, patient_id, expires_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
      [code, client_id, req.user.id, grantedScopes, redirect_uri,
       code_challenge || null, code_challenge_method || null,
       req.user.patientId || null, expiresAt]
    );

    res.json({ code, state: state || null, scope: grantedScopes });
  } catch (err) {
    console.error('[SMART] Authorize error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// ── Token endpoint ────────────────────────────────────────────────────────────
router.post('/token', async (req, res) => {
  try {
    const { grant_type, code, redirect_uri, client_id, client_secret,
            code_verifier, refresh_token } = req.body;

    if (!grant_type) return res.status(400).json({ error: 'invalid_request' });

    const pool = await connectPostgres();

    // Validate client
    const appR = await pool.query(
      `SELECT * FROM hg_smart_apps WHERE client_id = $1 AND active = TRUE`, [client_id]
    );
    if (!appR.rows[0]) return res.status(401).json({ error: 'invalid_client' });

    const app = appR.rows[0];
    if (client_secret) {
      const hash = crypto.createHash('sha256').update(client_secret).digest('hex');
      if (hash !== app.client_secret_hash)
        return res.status(401).json({ error: 'invalid_client' });
    }

    let userId, scope, patientId;

    if (grant_type === 'authorization_code') {
      const codeR = await pool.query(
        `SELECT * FROM hg_smart_auth_codes
         WHERE code = $1 AND client_id = $2 AND expires_at > NOW() AND used = FALSE`,
        [code, client_id]
      );
      if (!codeR.rows[0]) return res.status(400).json({ error: 'invalid_grant' });
      const authCode = codeR.rows[0];
      if (authCode.redirect_uri !== redirect_uri)
        return res.status(400).json({ error: 'invalid_grant' });

      // PKCE verification
      if (authCode.code_challenge && code_verifier) {
        const challenge = crypto.createHash('sha256')
          .update(code_verifier).digest('base64url');
        if (challenge !== authCode.code_challenge)
          return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE mismatch' });
      }

      await pool.query(`UPDATE hg_smart_auth_codes SET used = TRUE WHERE code = $1`, [code]);
      userId    = authCode.user_id;
      scope     = authCode.scope;
      patientId = authCode.patient_id;
    } else {
      return res.status(400).json({ error: 'unsupported_grant_type' });
    }

    const accessToken = jwt.sign(
      { sub: userId, client_id, scope, patient: patientId, type: 'smart_access' },
      SMART_SECRET,
      { expiresIn: TOKEN_TTL }
    );
    const refreshTokenVal = crypto.randomBytes(32).toString('hex');

    await pool.query(
      `INSERT INTO hg_smart_tokens (access_token_hash, refresh_token, client_id, user_id, scope, patient_id, expires_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW() + $7::interval,NOW())`,
      [crypto.createHash('sha256').update(accessToken).digest('hex'),
       refreshTokenVal, client_id, userId, scope, patientId || null, `${TOKEN_TTL} seconds`]
    );

    res.json({
      access_token:  accessToken,
      token_type:    'Bearer',
      expires_in:    TOKEN_TTL,
      scope,
      refresh_token: refreshTokenVal,
      patient:       patientId || undefined,
    });
  } catch (err) {
    console.error('[SMART] Token error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// ── Token introspection ───────────────────────────────────────────────────────
router.post('/token/introspect', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.json({ active: false });
    try {
      const decoded = jwt.verify(token, SMART_SECRET);
      if (decoded.type !== 'smart_access') return res.json({ active: false });
      res.json({ active: true, sub: decoded.sub, scope: decoded.scope,
        client_id: decoded.client_id, patient: decoded.patient, exp: decoded.exp });
    } catch {
      res.json({ active: false });
    }
  } catch (err) {
    res.status(500).json({ error: 'server_error' });
  }
});

// ── EHR launch handler ────────────────────────────────────────────────────────
router.get('/launch', authUser, async (req, res) => {
  const { iss, launch } = req.query;
  if (!iss) return res.status(400).json({ error: 'iss required' });
  // Return launch context for EHR-embedded SMART apps
  res.json({
    launch_token: launch || null,
    iss,
    smart_style_url: `${BASE_URL}/smart-style.json`,
    user: { id: req.user.id, role: req.user.role },
  });
});

export default router;
