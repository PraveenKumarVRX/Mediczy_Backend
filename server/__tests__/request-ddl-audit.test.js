import { jest } from '@jest/globals';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The script lives in scripts/qa/, the test in __tests__/ — one level up.
const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(HERE, 'scripts/qa/audit-request-ddl-and-rls.mjs');
const BASELINE = join(HERE, 'scripts/qa/request-ddl-baseline.json');

const run = (args = []) => {
  try {
    return { status: 0, out: execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8' }) };
  } catch (e) {
    return { status: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
};

describe('WP-1.5 request-time DDL audit', () => {
  it('the audit script exists and is runnable', () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const { status, out } = run();
    expect(status).toBe(0);
    expect(out).toContain('WP-1.5 audit');
  });

  it('reports a non-zero finding count — the debt is real, not zero', () => {
    // Guards against the audit silently scanning nothing (a path bug returns 0 and still "passes",
    // which is exactly the failure mode this script had while being written).
    const { out } = run(['--json']);
    const report = JSON.parse(out);
    expect(report.total).toBeGreaterThan(100);
    expect(report.files).toBeGreaterThan(20);
    expect(report.perRequest).toBeGreaterThan(0);
  });

  it('flags the largest known offenders so the list stays actionable', () => {
    const { out } = run(['--json']);
    const report = JSON.parse(out);
    const files = new Set(report.findings.map((f) => f.file));
    // A ratchet, not a floor. This asserted `> 50` files and had been failing
    // since the count fell to 45 — a stale expectation reporting progress as a
    // regression. The debt may shrink, which is the point; it must not grow
    // unnoticed. Lower these numbers when it shrinks further; raising one is a
    // deliberate decision to accept more request-time DDL, not a fix.
    expect(files.size).toBeLessThanOrEqual(45);
    expect(report.tables.length).toBeLessThanOrEqual(121);
    // And still large enough to prove the audit is scanning something real.
    expect(files.size).toBeGreaterThan(20);
    expect(report.tables.length).toBeGreaterThan(50);
  });

  it('distinguishes a module-load guard from a per-request call', () => {
    const { out } = run(['--json']);
    const report = JSON.parse(out);
    // 'guarded' means a one-shot bootstrap flag exists; 'per-request' means it runs every call.
    expect(report.findings.some((f) => f.severity === 'guarded')).toBe(true);
    expect(report.findings.some((f) => f.severity === 'per-request')).toBe(true);
  });

  it('passes against its own committed baseline', () => {
    const { status, out } = run(['--fail-on-new', BASELINE]);
    expect(status).toBe(0);
    expect(out).toContain('no new request-time DDL');
  });

  it('FAILS when the baseline is empty, proving the tripwire actually bites', () => {
    // An empty baseline means "every current statement is new". Without this, a tripwire that
    // silently matches nothing would look green forever.
    const { status, out } = run(['--fail-on-new', '/dev/null']);
    expect(status).toBe(1);
    expect(out).toContain('FAIL:');
    expect(out).toMatch(/new request-time DDL statement/);
  });
});
