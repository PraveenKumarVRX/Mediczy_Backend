/**
 * Enterprise SSO — SAML 2.0 SP + OIDC token exchange (Azure AD / Okta)
 */
import jwt from 'jsonwebtoken';
import { SAML } from '@node-saml/node-saml';
import pool from '../db/pgPool.js';
import { JWT_CONFIG } from '../config/auth.config.js';

const SAML_ENABLED = Boolean(process.env.SAML_ENTRY_POINT && process.env.SAML_IDP_CERT);
const OIDC_PROVIDERS = ['azure_ad', 'okta', 'google'];

async function ensureEnterpriseTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS enterprise_sso_identities (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      provider VARCHAR(40) NOT NULL,
      external_id VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (provider, external_id)
    );
    CREATE INDEX IF NOT EXISTS idx_enterprise_sso_user ON enterprise_sso_identities(user_id);
  `);
}

function getSamlInstance() {
  if (!SAML_ENABLED) return null;
  return new SAML({
    entryPoint: process.env.SAML_ENTRY_POINT,
    issuer: process.env.SAML_ISSUER || 'mediqzy-sp',
    callbackUrl: process.env.SAML_CALLBACK_URL || `${process.env.API_PUBLIC_URL || 'https://app.mediqzy.com'}/api/enterprise/auth/saml/acs`,
    idpCert: process.env.SAML_IDP_CERT,
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: false,
  });
}

export function isSamlEnabled() {
  return SAML_ENABLED;
}

export function listProviders() {
  const providers = [];
  if (SAML_ENABLED) providers.push({ id: 'saml', label: 'Enterprise SAML', type: 'saml' });
  if (process.env.AZURE_AD_TENANT_ID) providers.push({ id: 'azure_ad', label: 'Microsoft Azure AD', type: 'oidc' });
  if (process.env.OKTA_ISSUER) providers.push({ id: 'okta', label: 'Okta', type: 'oidc' });
  if (process.env.GOOGLE_CLIENT_ID) providers.push({ id: 'google', label: 'Google Workspace', type: 'oidc' });
  return providers;
}

export async function getSamlLoginUrl(relayState) {
  const saml = getSamlInstance();
  if (!saml) throw new Error('SAML SSO is not configured');
  return saml.getAuthorizeUrlAsync(relayState || '/hospital/dashboard', undefined, {});
}

export async function handleSamlAssertion(body) {
  const saml = getSamlInstance();
  if (!saml) throw new Error('SAML SSO is not configured');
  const { profile } = await saml.validatePostResponseAsync(body);
  const email = profile.email || profile.nameID;
  if (!email) throw new Error('SAML assertion missing email');
  return provisionEnterpriseUser({
    email,
    name: profile.displayName || profile.firstName || email,
    sub: profile.nameID,
    provider: 'saml',
    groups: profile.groups || [],
  });
}

async function fetchJwksPublicKey(jwksUrl, kid) {
  const res = await fetch(jwksUrl);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const { keys } = await res.json();
  const jwk = keys?.find((k) => !kid || k.kid === kid);
  if (!jwk) throw new Error('JWKS key not found');
  const { importJWK } = await import('jose');
  const key = await importJWK(jwk, jwk.alg || 'RS256');
  return key;
}

export async function validateOidcToken(token, provider) {
  if (!OIDC_PROVIDERS.includes(provider)) throw new Error(`Unsupported provider: ${provider}`);

  const decoded = jwt.decode(token, { complete: true });
  if (!decoded?.payload) throw new Error('Invalid token');

  let jwksUrl;
  if (provider === 'azure_ad') {
    const tenant = process.env.AZURE_AD_TENANT_ID;
    if (!tenant) throw new Error('AZURE_AD_TENANT_ID not configured');
    jwksUrl = `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`;
  } else if (provider === 'okta') {
    const issuer = process.env.OKTA_ISSUER;
    if (!issuer) throw new Error('OKTA_ISSUER not configured');
    jwksUrl = `${issuer.replace(/\/$/, '')}/v1/keys`;
  } else {
    jwksUrl = 'https://www.googleapis.com/oauth2/v3/certs';
  }

  try {
    const key = await fetchJwksPublicKey(jwksUrl, decoded.header?.kid);
    const verified = jwt.verify(token, key, { algorithms: ['RS256'] });
    return {
      email: verified.email || verified.preferred_username || verified.upn,
      name: verified.name,
      sub: verified.sub,
      provider,
      groups: verified.groups || verified.roles || [],
    };
  } catch {
    if (process.env.ENTERPRISE_SSO_DEV_MODE === 'true') {
      const payload = decoded.payload;
      return {
        email: payload.email || payload.preferred_username,
        name: payload.name,
        sub: payload.sub,
        provider,
        groups: payload.groups || [],
      };
    }
    throw new Error('OIDC token verification failed');
  }
}

export async function provisionEnterpriseUser({ email, name, sub, provider, groups = [] }) {
  await ensureEnterpriseTables();
  if (!email) throw new Error('Email required for enterprise provisioning');

  const identity = await pool.query(
    `SELECT user_id FROM enterprise_sso_identities WHERE provider = $1 AND external_id = $2`,
    [provider, sub]
  );
  let userId = identity.rows[0]?.user_id;

  if (!userId) {
    const byEmail = await pool.query(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [email.toLowerCase()]);
    userId = byEmail.rows[0]?.id;
    if (!userId) {
      const inserted = await pool.query(
        `INSERT INTO users (email, name, role, is_verified, created_at, updated_at)
         VALUES ($1,$2,'hospital_admin',true,NOW(),NOW()) RETURNING id`,
        [email.toLowerCase(), name || email]
      ).catch(async () => {
        const fallback = await pool.query(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [email.toLowerCase()]);
        return { rows: fallback.rows };
      });
      userId = inserted.rows[0]?.id;
    }
    if (userId) {
      await pool.query(
        `INSERT INTO enterprise_sso_identities (user_id, provider, external_id, email, metadata)
         VALUES ($1,$2,$3,$4,$5::jsonb)
         ON CONFLICT (provider, external_id) DO UPDATE SET email = EXCLUDED.email, metadata = EXCLUDED.metadata`,
        [userId, provider, sub, email, JSON.stringify({ groups })]
      );
    }
  }

  if (!userId) throw new Error('Could not provision enterprise user');

  const accessToken = jwt.sign(
    { id: userId, email, role: 'hospital_admin', type: 'enterprise_sso', provider },
    JWT_CONFIG.SECRET,
    { expiresIn: '8h' }
  );

  return { userId, email, name, provider, accessToken, groups };
}

export async function exchangeOidcToken(token, provider) {
  const profile = await validateOidcToken(token, provider);
  return provisionEnterpriseUser({ ...profile, provider });
}

export default {
  isSamlEnabled, listProviders, getSamlLoginUrl, handleSamlAssertion,
  validateOidcToken, exchangeOidcToken, provisionEnterpriseUser,
};
