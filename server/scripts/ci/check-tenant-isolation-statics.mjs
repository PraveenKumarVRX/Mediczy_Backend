#!/usr/bin/env node
/**
 * Advisory static check (WP-0.6): flags raw SQL against a known tenant-scoped table that has no
 * organization/tenant filter anywhere nearby in the same file. This is a trip-wire, not a proof —
 * it cannot see whether a wrapper function (scopedDb, a *Scope.* helper, setRlsContext) already
 * applies the filter one call away, so a clean hit here is not itself a guarantee of isolation, and
 * a flagged hit is not automatically a bug. Read every finding; this script's job is to make sure a
 * new raw query against one of these tables gets a human look before it ships, the same way
 * eslint-disable comments get a human look — not to replace the real defenses (FORCE ROW LEVEL
 * SECURITY + the tenant_assert_refs trigger + the per-request RLS context), which remain the actual
 * safety net regardless of what this script does or doesn't catch.
 *
 * Usage: node server/scripts/ci/check-tenant-isolation-statics.mjs [--strict]
 *   --strict   exit 1 on any finding (default: advisory, always exits 0 — matches ci.yml's
 *              "module-checks (advisory)" job, continue-on-error: true)
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STRICT = process.argv.includes('--strict');

// Curated from the tenant-scope factories (services/tenant-scope.service.js, scm-tenant-scope.service.js,
// dept-tenant-scope.service.js) and the migrations that added organization_id to clinical/admin tables this
// session. Extend this list as new tenant-scoped tables are added — it is deliberately not auto-derived from the
// database (a static check should not need a live DB connection to run in CI).
const SCM_PREFIX = 'scm_';
const EXPLICIT_TABLES = [
  'blood_bank_units', 'blood_bank_requisitions', 'blood_bank_donors', 'blood_donor_donations',
  'blood_donor_communications', 'blood_donor_comm_recipients', 'blood_bank_audit_events',
  'cssd_sets', 'cssd_cycles', 'cssd_jobs', 'cssd_set_usage',
  'dietary_orders', 'dietary_templates', 'dietary_counselling',
  'parking_lot', 'parking_vehicle_log', 'parking_pass', 'parking_watchlist', 'parking_incident',
  'parking_overstay_alert', 'parking_device', 'parking_valet_ticket',
  'surveillance_camera', 'surveillance_detection_event', 'surveillance_alert',
  'patient_allergies', 'patient_conditions', 'patient_medications',
  'med_reconciliation', 'med_reconciliation_item', 'clinical_safety_settings', 'prescription_safety_log',
  'appointments', 'prescriptions', 'ip_admissions', 'medication_orders',
  'operations_approvals', 'operations_audit_log',
];
// Broad on purpose: the dominant pattern in this codebase is a session-scoped Postgres client (scopedDb(),
// ensureTables(), setRlsContext()) obtained once near the top of a handler and reused for many queries after —
// not a per-statement `WHERE organization_id = ...`. This check can't tell which specific query a scoped client
// covers, so it treats "this file mentions an isolation mechanism ANYWHERE" as the signal and only flags a file
// that references a tenant-scoped table with NONE of these anywhere in it — coarse, but that trade favours fewer
// false positives over an advisory check nobody will keep reading once it cries wolf.
const ORG_FILTER_HINTS = /organization_id|organizationId|organisationId|current_org_id|setRlsContext|scopedDb|ensureTables|orgFromToken|OrgId\b|scmOrgId|:orgId|\$orgId|req\.tenantId|tenant_id|tenantId/i;
const TABLE_REF_RE = new RegExp(
  `\\b(?:FROM|INTO|UPDATE|JOIN)\\s+"?(${SCM_PREFIX}[a-z_]+|${EXPLICIT_TABLES.join('|')})"?\\b`,
  'gi'
);
// Files that legitimately define or apply the scoping itself, or are migrations (whole-table DDL, not
// per-request reads) — skip these so the check stays about request-time queries.
const SKIP_PATH_RE = /(tenant-scope\.service\.js|scm-tenant-scope\.service\.js|dept-tenant-scope\.service\.js|[\\/]migrations[\\/]|[\\/]scripts[\\/]|[\\/]__tests__[\\/]|[\\/]tests[\\/])/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (entry.endsWith('.js') || entry.endsWith('.mjs')) out.push(full);
  }
  return out;
}

const findings = [];
for (const dir of ['routes', 'services'].map((d) => path.join(SERVER_DIR, d))) {
  let files;
  try { files = walk(dir); } catch { continue; }
  for (const file of files) {
    const rel = path.relative(SERVER_DIR, file);
    if (SKIP_PATH_RE.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    if (ORG_FILTER_HINTS.test(text)) continue; // the file references an isolation mechanism somewhere — skip it
    const lines = text.split('\n');
    for (const m of text.matchAll(TABLE_REF_RE)) {
      const upto = text.slice(0, m.index);
      const lineNo = upto.split('\n').length;
      findings.push({ file: rel, line: lineNo, table: m[1], snippet: lines[lineNo - 1]?.trim().slice(0, 160) });
    }
  }
}

if (findings.length === 0) {
  console.log('✓ No unfiltered references found to the known tenant-scoped tables (advisory check; see script header for what this does and does not prove).');
  process.exit(0);
}

console.log(`⚠ ${findings.length} reference(s) to a tenant-scoped table with no organization/tenant filter nearby:\n`);
for (const f of findings) {
  console.log(`  ${f.file}:${f.line}  [${f.table}]`);
  console.log(`    ${f.snippet}`);
}
console.log('\nEach of these needs a human look: it may already be scoped through a helper this script can\'t see');
console.log('(scopedDb, a *Scope.* method, RLS context set earlier in the same transaction) — or it may be a real gap.');

process.exit(STRICT ? 1 : 0);
