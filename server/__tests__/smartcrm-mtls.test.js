import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The partner link's mutual TLS, end to end against a real local HTTPS server
 * that demands a client certificate — the way SmartCRM's private listener
 * will. Certificates come from scripts/smartcrm-pki.sh itself, so the script
 * and the client are tested together. No call leaves this machine.
 */
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKI = path.join(ROOT, 'scripts/smartcrm-pki.sh');

const { partnerRequest, _resetBreakers } = await import('../services/smartcrm/partner-client.js');
const { _resetTransport } = await import('../services/smartcrm/tls-transport.js');

let dir; let server; let port; let otherCa;
const BINDING = { tenant_slug: 't', smartcrm_corporate: 'C', api_key_env: 'SMARTCRM_KEY_T', read_enabled: true };
const LINK = { emp_id: 'E1' };
const call = () => partnerRequest(BINDING, LINK, { op: 'summary', userId: 1 });

const run = (args, env) => execFileSync('bash', [PKI, ...args], { env: { ...process.env, ...env }, stdio: 'pipe' });

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smartcrm-mtls-'));
  const env = { PKI_DIR: path.join(dir, 'pki'), SERVER_NAME: 'localhost' };
  run(['init'], env);
  run(['client'], env);
  execFileSync('openssl', ['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', path.join(dir, 'server.key')]);
  execFileSync('openssl', ['req', '-new', '-key', path.join(dir, 'server.key'), '-out', path.join(dir, 'server.csr'), '-subj', '/CN=localhost']);
  run(['sign-server', path.join(dir, 'server.csr')], env);
  // A second, unrelated CA — what an impostor's certificates would chain to.
  run(['init'], { PKI_DIR: path.join(dir, 'other') });
  otherCa = path.join(dir, 'other/ca.crt');

  const pki = (f) => fs.readFileSync(path.join(dir, 'pki', f));
  server = https.createServer({
    key: fs.readFileSync(path.join(dir, 'server.key')),
    cert: pki('server.crt'),
    ca: pki('ca.crt'),
    requestCert: true,
    rejectUnauthorized: true,
  }, (req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ cn: req.socket.getPeerCertificate().subject?.CN, key: req.headers['x-api-key'], actor: req.headers['x-mediqzy-user-id'] }));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});

afterAll(async () => {
  _resetTransport();
  await new Promise((r) => server.close(r));
  fs.rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  _resetTransport();
  _resetBreakers();
  process.env.SMARTCRM_INTEGRATION_ENABLED = 'true';
  process.env.SMARTCRM_PARTNER_BASE_URL = `https://localhost:${port}`;
  process.env.SMARTCRM_KEY_T = 'k-123';
  process.env.SMARTCRM_TLS_CA_FILE = path.join(dir, 'pki/ca.crt');
  process.env.SMARTCRM_TLS_CERT_FILE = path.join(dir, 'pki/client.crt');
  process.env.SMARTCRM_TLS_KEY_FILE = path.join(dir, 'pki/client.key');
  delete process.env.SMARTCRM_REQUIRE_MTLS;
});

describe('partner link mutual TLS', () => {
  it('connects with the client certificate and the server is verified against the private CA', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ cn: 'mediqzy-partner-client', key: 'k-123', actor: '1' });
  });

  it('refuses to send anything when mTLS is required but not configured', async () => {
    delete process.env.SMARTCRM_TLS_CERT_FILE;
    delete process.env.SMARTCRM_TLS_KEY_FILE;
    await expect(call()).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  });

  it('refuses a half-configured client certificate', async () => {
    delete process.env.SMARTCRM_TLS_KEY_FILE;
    process.env.SMARTCRM_REQUIRE_MTLS = 'false';
    await expect(call()).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  });

  it('the server turns away a caller without a client certificate', async () => {
    process.env.SMARTCRM_REQUIRE_MTLS = 'false';
    delete process.env.SMARTCRM_TLS_CERT_FILE;
    delete process.env.SMARTCRM_TLS_KEY_FILE;
    await expect(call()).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
  });

  it('does not trust a server whose certificate chains to a different CA', async () => {
    process.env.SMARTCRM_TLS_CA_FILE = otherCa;
    await expect(call()).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
  });

  it('does not trust the server under a name its certificate does not carry', async () => {
    process.env.SMARTCRM_PARTNER_BASE_URL = `https://127.0.0.1:${port}`;
    await expect(call()).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
  });
});
