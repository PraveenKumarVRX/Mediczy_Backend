/**
 * Keycloak OIDC scaffold — validates Bearer token when KEYCLOAK_ENABLED=true.
 * Falls through silently when disabled (existing MediQzy JWT auth applies).
 */
import fetch from 'node-fetch';

const ENABLED = process.env.KEYCLOAK_ENABLED === 'true';
const REALM_URL = (process.env.KEYCLOAK_REALM_URL || '').replace(/\/$/, '');
const CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'mediqzy-imaging';

let _jwksCache = null;
let _jwksFetchedAt = 0;

async function fetchJwks() {
  if (_jwksCache && Date.now() - _jwksFetchedAt < 3600000) return _jwksCache;
  if (!REALM_URL) return null;
  const res = await fetch(`${REALM_URL}/protocol/openid-connect/certs`, { timeout: 10000 });
  if (!res.ok) return null;
  _jwksCache = await res.json();
  _jwksFetchedAt = Date.now();
  return _jwksCache;
}

async function introspectToken(token) {
  const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;
  if (!REALM_URL || !clientSecret) return null;
  const res = await fetch(`${REALM_URL}/protocol/openid-connect/token/introspect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      token,
      client_id: CLIENT_ID,
      client_secret: clientSecret,
    }),
    timeout: 10000,
  });
  if (!res.ok) return null;
  const body = await res.json();
  if (!body.active) return null;
  return body;
}

export function optionalKeycloakAuth(req, res, next) {
  if (!ENABLED) return next();
  const authHeader = req.headers.authorization || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) return next();
  const token = authHeader.slice(7).trim();
  introspectToken(token)
    .then((info) => {
      if (!info) return next();
      req.keycloakUser = {
        id: info.sub,
        tenantId: info.tenant_id || info.org_id || info.sub,
        role: info.realm_access?.roles?.includes('radiologist') ? 'doctor' : 'hospital',
        name: info.name || info.preferred_username,
        keycloak: true,
      };
      return next();
    })
    .catch(() => next());
}

export async function getKeycloakJwks() {
  return fetchJwks();
}
