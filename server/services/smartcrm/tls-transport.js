/**
 * The transport for SmartCRM partner calls: HTTPS with mutual TLS.
 *
 * The partner API is reached over the VPC's private network
 * (smartcrm.internal.mediqzy.com -> SmartCRM's private IP), on a listener
 * whose security group admits only Mediqzy's. Traffic between these instance
 * types is not encrypted by AWS on its own, so TLS stays on; and SmartCRM
 * verifies Mediqzy's client certificate, so being inside the VPC is not
 * enough to call it. The API key and X-Mediqzy-User-Id ride on top.
 *
 *   SMARTCRM_TLS_CA_FILE    the private CA that signed SmartCRM's server cert
 *   SMARTCRM_TLS_CERT_FILE  Mediqzy's client certificate
 *   SMARTCRM_TLS_KEY_FILE   its private key (0600, never in the repo)
 *   SMARTCRM_REQUIRE_MTLS   default true; 'false' only for a deliberate,
 *                           temporary non-mTLS setup (the CA alone may then
 *                           be set to trust a private server certificate)
 *
 * Files are read once per process: rotating a certificate needs a reload.
 * Redirects are never followed — a 3xx is returned as-is and refused by the
 * client, so a SmartCRM misconfiguration cannot send the key elsewhere.
 */
import fs from 'node:fs';
import https from 'node:https';
import { SmartCrmError } from './config.js';

const MAX_BODY_BYTES = 1024 * 1024;
let cached = null; // { signature, agent }

export const mtlsRequired = () =>
  String(process.env.SMARTCRM_REQUIRE_MTLS ?? 'true').trim().toLowerCase() !== 'false';

const notConfigured = (why) =>
  new SmartCrmError('NOT_CONFIGURED', 'Insurance sync is not configured for this employer.', 503, { tls: why });

/** Reads the configured files. Partial configuration is refused, not half-used. */
export function tlsMaterial() {
  const caFile = process.env.SMARTCRM_TLS_CA_FILE?.trim();
  const certFile = process.env.SMARTCRM_TLS_CERT_FILE?.trim();
  const keyFile = process.env.SMARTCRM_TLS_KEY_FILE?.trim();
  if (Boolean(certFile) !== Boolean(keyFile)) throw notConfigured('client certificate and key must both be set');
  if (mtlsRequired() && !(caFile && certFile && keyFile)) throw notConfigured('mutual TLS required but not configured');
  const read = (file) => {
    try { return fs.readFileSync(file); } catch { throw notConfigured(`cannot read ${file}`); }
  };
  return {
    ca: caFile ? read(caFile) : undefined,
    cert: certFile ? read(certFile) : undefined,
    key: keyFile ? read(keyFile) : undefined,
    signature: [caFile, certFile, keyFile].join('|'),
  };
}

function agentFor(material) {
  if (cached?.signature === material.signature) return cached.agent;
  cached?.agent.destroy();
  const agent = new https.Agent({
    keepAlive: true,
    maxSockets: 20,
    ca: material.ca,
    cert: material.cert,
    key: material.key,
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2',
  });
  cached = { signature: material.signature, agent };
  return agent;
}
export const _resetTransport = () => { cached?.agent.destroy(); cached = null; };

/**
 * A fetch-shaped function: (url, { method, headers, body, signal }) ->
 * { status, text() }. Errors carry name 'AbortError' on timeout.
 */
export function createTlsTransport() {
  const agent = agentFor(tlsMaterial());
  return (url, { method = 'GET', headers = {}, body, signal } = {}) => new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers, agent, signal }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES + 1) { res.destroy(); return; }
        chunks.push(chunk);
      });
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, text: async () => text });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

export default { createTlsTransport, tlsMaterial, mtlsRequired };
