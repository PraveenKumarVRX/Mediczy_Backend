#!/usr/bin/env node
/**
 * GAP-MIG-001 — Unified migration orchestrator
 * Usage: node server/scripts/migrate-all.mjs [up|status]
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, '..');
const ROOT = path.join(SERVER, '..');

const MANIFEST = [
  { id: 'contact-center', cmd: 'node', args: ['migrations/20261020008000-contact-center.migration.js','--check'], cwd: SERVER },
  { id: 'hmis-chain', cmd: 'node', args: ['run-hmis-migrations.js', 'up'], cwd: SERVER },
  { id: 'hospital-queue-os', cmd: 'node', args: ['migrations/20260617-hospital-queue-os.migration.js'], cwd: SERVER, optional: true },
  { id: 'samd-governance', cmd: 'node', args: ['migrations/samd-interpretability-governance.migration.js'], cwd: SERVER, optional: true },
  { id: 'hospital-crm-foundation', cmd: 'node', args: ['migrations/20260908000000-hospital-crm-foundation.migration.js'], cwd: SERVER },
  { id: 'hospital-crm-worldclass-domains', cmd: 'node', args: ['migrations/20260908000001-hospital-crm-worldclass-domains.migration.js'], cwd: SERVER },
  { id: 'hospital-crm-growth-automation', cmd: 'node', args: ['migrations/20260908000002-hospital-crm-growth-automation.migration.js'], cwd: SERVER },
  { id: 'hospital-crm-specialty-diagnostic-digital', cmd: 'node', args: ['migrations/20260909000000-hospital-crm-specialty-diagnostic-digital.migration.js'], cwd: SERVER },
  { id: 'hospital-crm-communication-hub', cmd: 'node', args: ['migrations/20260909000002-hospital-crm-communication-hub.migration.js'], cwd: SERVER },
  { id: 'crm-channel-credentials', cmd: 'node', args: ['migrations/20261015000000-crm-channel-credentials.migration.js'], cwd: SERVER },
  { id: 'chatwoot-tenant-bridge', cmd: 'node', args: ['migrations/20261003000000-chatwoot-bridge.migration.js'], cwd: SERVER },
  { id: 'phase1-foundations', cmd: 'node', args: ['migrations/20260926000002-phase1-foundations.migration.js'], cwd: SERVER },
  { id: 'audit-remediation', cmd: 'node', args: ['migrations/20260926000003-audit-remediation.migration.js'], cwd: SERVER },
  { id: 'health-checkup-bookings', cmd: 'node', args: ['migrations/20261015006000-health-checkup-bookings.migration.js'], cwd: SERVER },
  { id: 'corporate-health-package-catalog', cmd: 'node', args: ['migrations/20261021009000-corporate-health-package-catalog.migration.js'], cwd: SERVER },
  { id: 'crm-brightbean-chat-adoption', cmd: 'node', args: ['migrations/20261015006900-crm-brightbean-chat-adoption.migration.js'], cwd: SERVER },
  { id: 'crm-report-remediation', cmd: 'node', args: ['migrations/20261024000000-crm-report-remediation.migration.js'], cwd: SERVER },
  { id: 'crm-retest-contact-phones', cmd: 'node', args: ['migrations/20261025000000-crm-retest-contact-phones.migration.js'], cwd: SERVER },
  { id: 'crm-social-content', cmd: 'node', args: ['migrations/20261015007000-crm-social-content.migration.js'], cwd: SERVER },
  { id: 'dedicated-installations', cmd: 'node', args: ['migrations/20261018000100-dedicated-installations.migration.js'], cwd: SERVER },
  { id: 'corporate-consent-ahc-notifications', cmd: 'node', args: ['migrations/20261018000200-corporate-consent-ahc-notifications.migration.js'], cwd: SERVER },
  { id: 'corporate-employee-retroactive-linking', cmd: 'node', args: ['migrations/corporate-employee-retroactive-linking.migration.js'], cwd: SERVER, optional: true },
];

// 2026-Q4 wave — migrations committed in the Oct 2026 build that were not yet in the
// manifest. Run via import+up() (arity-aware) rather than a child `node <file>` because
// 11 of them have no direct-run block. Idempotent (IF NOT EXISTS); re-running is safe.
const NEW_MIGRATIONS_2026Q4 = [
  '20261028000100-health-package-eligibility.migration.js',
  '20261104000300-health-checkup-beneficiary-uniqueness.migration.js',
  '20261022010000-corporate-scheduling-doctor-uid.migration.js',
  '20261022011000-corporate-sso-sessions.migration.js',
  '20261022012000-corporate-identity-uniqueness.migration.js',
  '20261015000100-lab-quality-control.migration.js',
  '20261015000200-department-schema-hardening.migration.js',
  '20261015000300-blood-bank-schema-hardening.migration.js',
  '20261015000400-scm-inventory-traceability.migration.js',
  '20261015000500-lab-result-release-governance.migration.js',
  '20261015000600-scm-inventory-movements.migration.js',
  '20261015000700-blood-crossmatch-transfusion.migration.js',
  '20261015000800-hospital-queue-schema-hardening.migration.js',
  '20261015000900-hospital-os-event-envelope.migration.js',
  '20261015001000-hospital-queue-checkin-idempotency.migration.js',
  '20261015001100-biomedical-pm-cold-chain.migration.js',
  '20261015001200-pharmacy-dispense-governance.migration.js',
  '20261015001300-emar-safety-governance.migration.js',
  '20261015001400-infection-mortuary-workflows.migration.js',
  '20261015001500-finance-clinical-charge-ledger.migration.js',
  '20261015001600-pharmacy-inventory-governance.migration.js',
  '20261015001700-auth-session-revocation.migration.js',
  '20261015001800-mfa-step-up.migration.js',
  '20261015001900-hospital-billing-suite.migration.js',
  '20261015002000-hospital-tariff-master.migration.js',
  '20261015002100-hrms-schema.migration.js',
  '20261015002200-hrms-qualifications-privileges.migration.js',
  '20261015002300-payroll-schema.migration.js',
  '20261015002400-payroll-finance-link.migration.js',
  '20261015002500-hospital-auth-support-schema.migration.js',
  '20261015002600-daily-activity-schema.migration.js',
  '20261015002700-prems-feedback.migration.js',
  '20261015002800-discharge-planning.migration.js',
  '20261015002900-ot-safety-governance.migration.js',
  '20261015003000-operative-notes-governance.migration.js',
  '20261015003100-discharge-readiness-governance.migration.js',
  '20261015003200-ot-consumables-governance.migration.js',
  '20261015003300-nabh-jci-compliance-governance.migration.js',
  '20261015003400-nursing-echart-governance.migration.js',
  '20261015003500-tpa-claims-lifecycle-governance.migration.js',
  '20261015003600-ris-imaging-governance.migration.js',
  '20261015003700-crm-core-governance.migration.js',
  '20261015003800-crm-campaigns-governance.migration.js',
  '20261015003900-crm-extensions-governance.migration.js',
  '20261015004000-team-workspace-governance.migration.js',
  '20261015004100-provider-network-chatbot-governance.migration.js',
  '20261015004200-display-kiosk-governance.migration.js',
  '20261015004300-abdm-hfr-hpr-governance.migration.js',
  '20261015004400-corporate-hmis-governance.migration.js',
  '20261015004500-imaging-evidence-governance.migration.js',
  '20261015004600-imaging-ops-governance.migration.js',
  '20261015004700-enterprise-fhir-governance.migration.js',
  '20261015004800-rwe-export-governance.migration.js',
  '20261015004900-admin-portal-governance.migration.js',
  '20261015005000-ai-governance.migration.js',
  '20261015005100-clinical-billing-governance.migration.js',
  '20261015005200-clinical-services-governance.migration.js',
  '20261015005300-crm-growth-governance.migration.js',
  '20261015005400-hmis-workflows-governance.migration.js',
  '20261015005500-iso27001-governance.migration.js',
  '20261015005600-lab-collection-instructions.migration.js',
  '20261015005700-lab-collection-label-replacement.migration.js',
  '20261015005800-lab-collection-incidents.migration.js',
  '20261015006100-medcore-adoption.migration.js',
  '20261015006200-crm-agentic-operator.migration.js',
  '20261015006300-crm-flow-builder.migration.js',
  '20261015006400-crm-social-growth.migration.js',
  '20261015006500-crm-entity-uid-hardening.migration.js',
  '20261015006600-medcore-tenant-delivery.migration.js',
  '20261015006700-crm-agent-tenant-uid.migration.js',
  '20261015006800-crm-agent-corporate-scope.migration.js',
  '20261016000000-crm-legacy-tenancy.migration.js',
  '20261016000100-feature-flags.migration.js',
  '20261019000100-nursing-workflow-integrity.migration.js',
  '20261101000100-medical-device-gateway-foundation.migration.js',
  '20261101000100-biomedical-device-gateway.migration.js',
  '20261104000200-pre-employment-healthcheckups.migration.js',
  '20261107000100-customer-care-v1.migration.js',
  '20261107000200-customer-care-content-owner.migration.js',
  '20261108000100-adherence-occurrence-integrity.migration.js',
  '20261109000100-scm-receipt-integrity.migration.js',
  '20261109000200-report-schedule-durability.migration.js',
  '20261109000300-email-sync-status-width.migration.js',
  '20261109000400-apple-refresh-tokens.migration.js',
  // MED-MIND-001. The health-coaching framework was never registered in any
  // runner list, so a fresh environment never got its 9 tables (it IS applied in
  // production — Phase 0 PF-1). Register it here, immediately before the
  // migration that depends on it; both are idempotent.
  'health-coaching-framework.migration.js',
  '20261110000100-mental-wellness-instruments.migration.js',
  '20261110000300-order-delivery-fee.migration.js',
  '20261111000100-tpa-member-user-link.migration.js',
  '20261111000200-tpa-member-corporate-link.migration.js',
  '20261111000300-typed-group-policies.migration.js',
  '20261111000400-policy-member-foreign-keys.migration.js',
  '20261111000500-corporate-ahc-entitlement-controls.migration.js',
  '20261111000600-team-email-template-attachments.migration.js',
];

function runStep(step) {
  return new Promise((resolve, reject) => {
    const proc = spawn(step.cmd, step.args, { cwd: step.cwd, stdio: 'inherit', shell: false });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else if (step.optional) {
        console.warn(`[migrate-all] optional step ${step.id} exited ${code} — continuing`);
        resolve();
      } else reject(new Error(`Step ${step.id} failed with code ${code}`));
    });
  });
}

async function runHmisExtended() {
  const { Sequelize } = await import('sequelize');
  const { postgresSequelize: sequelize } = await import('../db/postgres-sequelize.js');
  const qi = sequelize.getQueryInterface();
  const extra = [
    './migrations/20260617000001-create-er-visits.js',
    './migrations/20260617000002-create-charge-master.js',
    './migrations/20260617000003-create-pharmacy-dispense-queue.js',
    './migrations/20260623000001-align-hg-dicom-schema.js',
    './migrations/20260624000001-imaging-platform-phases.js',
    './migrations/20260625000001-imaging-ai-reporting.js',
    './migrations/20260626000001-imaging-interpretability-complete.js',
  ];
  for (const file of extra) {
    const name = path.basename(file);
    // Resolve from the server root; this orchestrator itself runs from
    // server/scripts, so './migrations/...' points at a non-existent folder.
    const migrationFile = path.join(SERVER, 'migrations', name);
    console.log(`  Migrating: ${name}...`);
    const mod = await import(migrationFile);
    await mod.up(qi, Sequelize).catch((e) => {
      if (e.message?.includes('already exists')) console.log(`  Skipped (exists): ${name}`);
      else throw e;
    });
    console.log(`  Done: ${name}`);
  }
}

// Run the 2026-Q4 wave. up() comes in three shapes in this wave; dispatch by arity:
//   up()                        -> pg-style, uses its own pgPool import         (length 0; also covers up(db = pool))
//   up(pool)                    -> pg-style, expects the shared pg pool          (length 1)
//   up(queryInterface, Sequelize) -> Sequelize-style                            (length 2)
async function runNew2026Migrations() {
  const { Sequelize } = await import('sequelize');
  const { postgresSequelize: sequelize } = await import('../db/postgres-sequelize.js');
  const { default: pgPool } = await import('../db/pgPool.js');
  const qi = sequelize.getQueryInterface();
  for (const name of NEW_MIGRATIONS_2026Q4) {
    const file = path.join(SERVER, 'migrations', name);
    if (!fs.existsSync(file)) { console.warn(`  Missing (skip): ${name}`); continue; }
    try {
      const mod = await import(file);
      if (typeof mod.up !== 'function') { console.warn(`  Skipped (no up): ${name}`); continue; }
      console.log(`  Migrating: ${name}...`);
      if (mod.up.length >= 2) await mod.up(qi, Sequelize);
      else if (mod.up.length === 1) await mod.up(pgPool);
      else await mod.up();
      console.log(`  Done: ${name}`);
    } catch (e) {
      // This atomic clinical migration must fail visibly on historical conflicts.
      if (name === '20261019000100-nursing-workflow-integrity.migration.js' || name.startsWith('2026102201')) throw e;
      if (/already exists|duplicate|exists/i.test(e.message || '')) console.log(`  Skipped (exists): ${name}`);
      else throw e;
    }
  }
}

const cmd = process.argv[2] || 'up';

if (cmd === 'status') {
  console.log('Migration manifest (GAP-MIG-001):');
  for (const m of MANIFEST) console.log(`  - ${m.id}`);
  console.log('  - hmis-extended (er_visits, charge_master, pharmacy_dispense_queue)');
  console.log(`\n2026-Q4 wave (${NEW_MIGRATIONS_2026Q4.length} migrations, run via import+up):`);
  for (const name of NEW_MIGRATIONS_2026Q4) {
    const present = fs.existsSync(path.join(SERVER, 'migrations', name));
    console.log(`  ${present ? '-' : '! MISSING'} ${name}`);
  }
  const hmisRunner = path.join(SERVER, 'run-hmis-migrations.js');
  console.log(fs.existsSync(hmisRunner) ? '\nHMIS runner: OK' : '\nHMIS runner: MISSING');
  process.exit(0);
}

console.log('[migrate-all] Starting unified migration orchestrator...\n');
for (const step of MANIFEST) {
  console.log(`\n==> ${step.id}`);
  await runStep(step);
}
console.log('\n==> hmis-extended');
await runHmisExtended();
console.log('\n==> 2026-Q4 wave');
await runNew2026Migrations();
console.log('\n[migrate-all] All steps completed.');
