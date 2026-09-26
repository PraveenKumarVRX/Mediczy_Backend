/**
 * Every scheduled job that reports to the cron registry must go through beginJob (audit OPS-01). Before the fix NONE
 * of the 22 jobs checked tickStart's result, so no guard was active. This is a static consistency check over the
 * source, so a job added or edited later cannot silently lose (or mis-key) its guard.
 */
import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

jest.unstable_mockModule('fs', () => ({ default: fs, ...fs, readFileSync: jest.fn(), writeFileSync: jest.fn(), existsSync: jest.fn(() => false), mkdirSync: jest.fn() }));
const { getStatus } = await import('../utils/cronRegistry.js');
const registered = new Set(getStatus().map((t) => t.key));

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const servicesDir = path.join(root, 'services');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(servicesDir).filter((f) => f.endsWith('.js'));
const src = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')]));
const usesRegistry = (t) => /from\s+['"][^'"]*utils\/cronRegistry\.js['"]/.test(t);

const guarded = [...src].filter(([, t]) => /await beginJob\(/.test(t));
const keysIn = (t) => [...t.matchAll(/await beginJob\(\s*['"]?([A-Za-z0-9_]+)['"]?\s*\)/g)].map((m) => m[1]);
const relname = (f) => path.relative(root, f);

describe('cron guard coverage', () => {
  it('finds the guarded jobs (34 today) — a drop means a guard was removed', () => {
    expect(guarded.length).toBeGreaterThanOrEqual(34);
  });

  it('no service calls tickStart directly any more (its result was never checked, so it guarded nothing)', () => {
    const offenders = [...src].filter(([, t]) => /(^|[^A-Za-z_.])tickStart\(/.test(t)).map(([f]) => relname(f));
    expect(offenders).toEqual([]);
  });

  it.each(guarded.map(([f]) => [relname(f), f]))('%s imports beginJob and awaits it BEFORE doing work', (_n, f) => {
    const t = src.get(f);
    expect(t).toMatch(/import\s*\{[^}]*\bbeginJob\b[^}]*\}\s*from\s*['"][^'"]*utils\/cronRegistry\.js['"]/);
    // the guard must skip (return) when it is not acquired — never fall through into the job
    expect(t).toMatch(/if\s*\(\s*!\s*\(\s*await beginJob\([^)]*\)\s*\)\s*\)\s*return\b/);
  });

  it.each(guarded.map(([f]) => [relname(f), f]))('%s uses registered task keys, and releases each via tick/tickError', (_n, f) => {
    const t = src.get(f);
    const consts = Object.fromEntries([...t.matchAll(/const\s+([A-Z_]+)\s*=\s*['"]([^'"]+)['"]/g)].map((m) => [m[1], m[2]]));
    const keys = keysIn(t).map((k) => consts[k] || k);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(registered.has(key)).toBe(true);                                 // a typo would make getStatus() blind to the job
      const releases = new RegExp(`tick(Error)?\\(\\s*(['"]${key}['"]|${Object.keys(consts).find((c) => consts[c] === key) || '\\b\\B'})`);
      expect(t).toMatch(releases);                                            // otherwise the lease is only freed by the stale timeout
    }
  });

  it('every service that reports to the registry with tick() is either guarded or an explicitly known exception', () => {
    const KNOWN_UNGUARDED = new Set(relnameList(['services/appointment-notification.service.js', 'services/emailAutoProcessService.js']));
    const unguarded = [...src]
      .filter(([, t]) => usesRegistry(t) && /(^|[^A-Za-z_.])tick(Error)?\(/.test(t) && !/await beginJob\(/.test(t))
      .map(([f]) => relname(f))
      .filter((f) => !KNOWN_UNGUARDED.has(f));
    expect(unguarded).toEqual([]);
  });
});



describe('inline jobs in app.js (known exceptions — to be moved onto beginJob when app.js is free to edit)', () => {
  const appSrc = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const inline = [...appSrc.matchAll(/cronTickStart\(\s*['"]([A-Za-z0-9_]+)['"]\s*\)/g)].map((m) => m[1]).sort();

  it('the set of unguarded inline jobs is pinned: it can shrink but never grow', () => {
    expect(inline).toEqual(['ai_demographic_parity', 'ai_drift_monitor', 'audit_chain_verify', 'audit_log_partition', 'corporate_weekly_mis', 'hospital_billing_nightly']);
  });

  it('every inline job key is registered, so its runs are visible in the status view', () => {
    for (const key of inline) expect(registered.has(key)).toBe(true);
  });

  it('the billing work itself IS guarded (inside the service), so the app.js wrapper cannot double-run it across processes', () => {
    const billing = fs.readFileSync(path.join(servicesDir, 'hospital-billing-cron.service.js'), 'utf8');
    expect(billing).toMatch(/await beginJob\(JOB_NAME\)/);
  });
});

function relnameList(a) { return a; }

