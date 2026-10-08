import { jest } from '@jest/globals';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const hasClamd = (() => {
  try { execFileSync('clamdscan', ['--ping', '1'], { stdio: 'ignore' }); return true; } catch { return false; }
})();

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

async function load(env = {}) {
  jest.resetModules();
  const saved = { ...process.env };
  Object.assign(process.env, { AV_SCAN_ENABLED: 'true', ...env });
  const mod = await import('../services/minio-upload.service.js');
  Object.keys(env).forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
  return mod;
}

// Loads the service with clamdscan replaced by a stub that fails like a dead daemon (exit 2).
async function loadWithBrokenScanner(env = {}) {
  jest.resetModules();
  const real = await import('child_process');
  jest.unstable_mockModule('child_process', () => ({
    ...real,
    default: real,
    execFile: (bin, args, opts, cb) => {
      const callback = typeof opts === 'function' ? opts : cb;
      callback(Object.assign(new Error('ERROR: Could not connect to clamd'), { code: 2, stdout: '' }));
    },
  }));
  const saved = process.env.AV_SCAN_FAIL_OPEN;
  Object.assign(process.env, { AV_SCAN_ENABLED: 'true', ...env });
  if (!('AV_SCAN_FAIL_OPEN' in env)) delete process.env.AV_SCAN_FAIL_OPEN;
  try { return await import('../services/minio-upload.service.js'); }
  finally { if (saved === undefined) delete process.env.AV_SCAN_FAIL_OPEN; else process.env.AV_SCAN_FAIL_OPEN = saved; }
}

describe('AV scanning in minio-upload.service', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'av-test-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  (hasClamd ? it : it.skip)('passes a clean 0600 file the daemon cannot read by path (fdpass)', async () => {
    const f = path.join(dir, 'clean.txt');
    fs.writeFileSync(f, 'hello', { mode: 0o600 });
    const { scanOnly } = await load();
    expect((await scanOnly(f)).clean).toBe(true);
  });

  (hasClamd ? it : it.skip)('flags EICAR from a buffer as infected', async () => {
    const { scanOnly } = await load();
    const r = await scanOnly(Buffer.from(EICAR));
    expect(r.clean).toBe(false);
    expect(r.detail).toMatch(/Eicar/i);
  });

  it('rejects with AV_SCAN_UNAVAILABLE (503) when the scanner errors and fail-open is off', async () => {
    const { scanOnly } = await loadWithBrokenScanner();
    await expect(scanOnly(Buffer.from('x'))).rejects.toMatchObject({ code: 'AV_SCAN_UNAVAILABLE', status: 503 });
  });

  it('allows the upload on scanner error only with AV_SCAN_FAIL_OPEN=true', async () => {
    const { scanOnly } = await loadWithBrokenScanner({ AV_SCAN_FAIL_OPEN: 'true' });
    expect((await scanOnly(Buffer.from('x'))).clean).toBe(true);
  });
});
