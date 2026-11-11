import { describe, expect, it } from '@jest/globals';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

/**
 * The TPA service used to insert demo data on a READ. Seven methods —
 * listClaims, getClaim, listPreAuths, listMembers, getMemberEligibility,
 * listNetworkHospitals, calculateClaimPayable — each called a seeder first,
 * guarded only by "does this TPA have rows yet". So a TPA opening its portal
 * for the first time was given three invented members carrying invented policy
 * numbers, coverage amounts, used balances, exclusions and a non-existent
 * insurer, in production as readily as anywhere else.
 *
 * All six TPA memberships found in production on 2026-11-11 were fabricated:
 * three from this seeder, three left behind by a smoke script writing to the
 * live database. Once the member-facing e-card shipped, either kind would have
 * rendered to a real person as their own insurance card.
 */
describe('a read does not invent data', () => {
  const service = read('services/tpa-claims-lifecycle.service.js');

  it('has no seeder left to call', () => {
    expect(service).not.toContain('seedDemoData');
    expect(service).not.toContain('seedReferenceData');
  });

  it('carries none of the invented people or policies', () => {
    for (const invention of [
      'Rajesh Kumar', 'Priya Sharma', 'Amit Patel',
      'Tech Solutions Pvt Ltd', 'Digital Marketing Inc', 'Manufacturing Corp',
      'Mediqzy Health Assurance', 'POL-2026-001', 'Gold Floater',
    ]) {
      expect(service).not.toContain(invention);
    }
  });

  it('issues no INSERT from a read path', () => {
    // Every remaining INSERT belongs to a create/decide/attach method. None of
    // the read methods below may reach one.
    const readMethods = [
      'listMembers', 'getMemberEligibility', 'listNetworkHospitals',
      'listClaims', 'getClaim', 'listPreAuths',
    ];
    for (const name of readMethods) {
      const start = service.indexOf(`async ${name}(`);
      expect(start).toBeGreaterThan(-1);
      const next = service.indexOf('\n  async ', start + 1);
      const body = service.slice(start, next === -1 ? undefined : next);
      expect(body).not.toMatch(/INSERT INTO/i);
    }
  });
});

describe('the reads still refuse to work on an unmigrated database', () => {
  const service = read('services/tpa-claims-lifecycle.service.js');

  // These seven verified their schema only as a side effect of the seeder they
  // called first, so deleting the seeder would have quietly deleted the check
  // with it and turned a missing table back into a raw 500.
  it.each([
    'listMembers', 'getMemberEligibility', 'listNetworkHospitals',
    'listClaims', 'getClaim', 'listPreAuths', 'calculateClaimPayable',
  ])('%s verifies its schema itself', (name) => {
    const start = service.indexOf(`async ${name}(`);
    const firstStatement = service.slice(start, start + 400);
    expect(firstStatement).toMatch(/\{\s*\n\s*await this\.ensureSchema\(\);/);
  });
});

describe('the demo data, where a human runs it on purpose', () => {
  const path = 'scripts/demo/seed-tpa-demo.mjs';

  it('exists, and holds what the service used to', () => {
    expect(existsSync(join(ROOT, path))).toBe(true);
    const script = read(path);
    expect(script).toContain('export async function seedDemoMembers(');
    expect(script).toContain('export async function seedDemoClaims(');
    expect(script).toContain('Rajesh Kumar');
  });

  it('refuses a production database unless told explicitly', () => {
    const script = read(path);
    expect(script).toContain('SELECT current_database() AS db');
    expect(script).toMatch(/\/prod\/i\.test\(db\) && !process\.argv\.includes\('--allow-production'\)/);
  });

  it('needs to be told which TPA, rather than defaulting to one', () => {
    expect(read(path)).toMatch(/if \(!Number\.isSafeInteger\(tpaId\)/);
  });
});

describe('the smoke pass', () => {
  const script = read('scripts/smoke-tpa-login.mjs');

  it('will not write enrolments and claims into production', () => {
    expect(script).toContain('SELECT current_database() AS db');
    expect(script).toMatch(/Refusing to run the TPA smoke pass against/);
    expect(script).toMatch(/\/prod\/i\.test\(db\) && !process\.argv\.includes\('--allow-production'\)/);
  });

  it('refuses before it reaches the first write', () => {
    const guard = script.indexOf('Refusing to run the TPA smoke pass');
    const firstPost = script.indexOf(".post('/api/tpa/");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(firstPost);
  });
});
