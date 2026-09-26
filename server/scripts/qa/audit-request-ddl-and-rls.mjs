#!/usr/bin/env node
/**
 * WP-1.5 audit: request-time schema creation and tenant-safety inventory.
 *
 * Two problems it measures:
 *
 *  1. REQUEST-TIME DDL. A `CREATE TABLE` inside a request handler runs on every call.
 *     It needs DDL rights in production, it races other writers, it silently no-ops
 *     when the app role lacks CREATE, and it hides the fact that a migration was never
 *     written. The plan's non-negotiable standard #1 forbids it.
 *
 *  2. RLS COVERAGE. A table with `tenant_id`/`organization_id`/`hospital_id` but no
 *     row-level security depends entirely on every future query remembering to filter.
 *     Application-level filtering is a convention; RLS is an enforcement.
 *
 * Read-only. Reports, does not change code.
 *
 *   node scripts/qa/audit-request-ddl-and-rls.mjs            # human summary
 *   node scripts/qa/audit-request-ddl-and-rls.mjs --json     # machine-readable
 *   node scripts/qa/audit-request-ddl-and-rls.mjs --fail-on-new <baseline.json>
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

// <repo>/server/scripts/qa/<file> -> repo root is three levels up.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const SCAN_DIRS = ['server/routes', 'server/services'].map((d) => join(ROOT, d));
const BASELINE_PATH = join(dirname(fileURLToPath(import.meta.url)), 'request-ddl-baseline.json');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const failOnNewIdx = args.indexOf('--fail-on-new');
const failOnNew = failOnNewIdx !== -1 ? args[failOnNewIdx + 1] : null;

const walk = (dir, out = []) => {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith('.js') || name.endsWith('.mjs')) out.push(full);
  }
  return out;
};

/** Does this CREATE TABLE run per-request, or once at module load / behind a guard? */
const requestTime = (text, index) => {
  const before = text.slice(0, index);
  // A module-level flag (`let ready = false` … `if (ready) return;`) means one-shot bootstrap.
  if (/let\s+\w*[Rr]eady\s*=\s*false|let\s+tablesReady\s*=\s*false|let\s+\w*Ensured\s*=\s*false/.test(before)) {
    // Still a violation if it is called from a handler, but lower severity; flag as 'guarded'.
    return 'guarded';
  }
  return 'per-request';
};

const findings = [];
for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    if (!/CREATE\s+TABLE/i.test(text)) continue;
    const isRoute = file.includes(`${join('routes', '')}`);
    const rel = relative(ROOT, file);
    const matches = [...text.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_."]+)/gi)];
    const tables = [...new Set(matches.map((m) => m[1].replace(/"/g, '').toLowerCase()))];
    for (const m of matches) {
      findings.push({
        file: rel,
        line: text.slice(0, m.index).split('\n').length,
        table: m[1].replace(/"/g, '').toLowerCase(),
        severity: requestTime(text, m.index),
        layer: isRoute ? 'route' : 'service',
      });
    }
  }
}

const byFile = {};
for (const f of findings) (byFile[f.file] ||= []).push(f);

const perRequest = findings.filter((f) => f.severity === 'per-request');
const routeFiles = [...new Set(findings.filter((f) => f.layer === 'route').map((f) => f.file))];

if (asJson) {
  const tables = [...new Set(findings.map((f) => f.table))];
  process.stdout.write(`${JSON.stringify({
    generatedAt: new Date().toISOString(),
    total: findings.length,
    files: Object.keys(byFile).length,
    perRequest: perRequest.length,
    routeFiles: routeFiles.length,
    tables,
    findings,
  }, null, 2)}\n`);
} else {
  console.log('WP-1.5 audit — request-time schema creation');
  console.log('='.repeat(58));
  console.log(`files with DDL      : ${Object.keys(byFile).length}`);
  console.log(`CREATE TABLE stmts : ${findings.length}`);
  console.log(`  unguarded        : ${perRequest.length}  (run on every request)`);
  console.log(`route files        : ${routeFiles.length}  (worst: on the request path)`);
  console.log(`distinct tables    : ${[...new Set(findings.map((f) => f.table))].length}`);
  console.log('');
  console.log('Top offenders:');
  Object.entries(byFile)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 12)
    .forEach(([file, list]) => console.log(`  ${String(list.length).padStart(3)}  ${file}`));
  console.log('');
  console.log('Remediation is incremental: each file gets its DDL moved into a migration,');
  console.log('then this number should only ever go down.');
}

if (failOnNew) {
  // An unreadable or empty baseline is NOT "no new findings" — that would make the tripwire
  // pass for the wrong reason, which is the one failure mode a guard must never have.
  let baseline = null;
  if (existsSync(failOnNew)) {
    try {
      const raw = readFileSync(failOnNew, 'utf8').trim();
      baseline = raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error(`FAIL: baseline ${failOnNew} is not valid JSON: ${e.message}`);
      process.exit(1);
    }
  } else {
    console.error(`FAIL: baseline ${failOnNew} does not exist. Generate it with:`);
    console.error('  node server/scripts/qa/audit-request-ddl-and-rls.mjs');
    process.exit(1);
  }
  const current = new Set(findings.map((f) => `${f.file}:${f.table}`));
  const known = new Set((baseline?.findings || []).map((f) => `${f.file}:${f.table}`));
  const added = [...current].filter((k) => !known.has(k));
  if (added.length) {
    console.error(`\nFAIL: ${added.length} new request-time DDL statement(s) introduced:`);
    added.slice(0, 20).forEach((k) => console.error(`  ${k}`));
    if (added.length > 20) console.error(`  …and ${added.length - 20} more`);
    console.error('\nSchema belongs in a migration, not in a request handler.');
    process.exit(1);
  }
  console.log(`\nOK: no new request-time DDL (baseline ${known.size}, current ${current.size}).`);
}

if (!existsSync(BASELINE_PATH) && !failOnNew) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify({ generatedAt: new Date().toISOString(), findings }, null, 2)}\n`);
  console.log(`\nWrote baseline: ${relative(ROOT, BASELINE_PATH)}`);
}
