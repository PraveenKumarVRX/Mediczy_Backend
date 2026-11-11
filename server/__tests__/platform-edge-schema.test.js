import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());

test('RWE and HyperGrid routes are migration-owned and fail closed', () => {
  const rwe = fs.readFileSync(path.join(root, 'routes/rwe-platform.route.js'), 'utf8');
  const hypergrid = fs.readFileSync(path.join(root, 'routes/hypergrid-connector.route.js'), 'utf8');
  expect(rwe).not.toMatch(/CREATE\s+(TABLE|INDEX)|ALTER\s+TABLE/i);
  expect(hypergrid).not.toMatch(/CREATE\s+(TABLE|INDEX)|ALTER\s+TABLE/i);
  expect(rwe).toContain('SCHEMA_NOT_MIGRATED');
  expect(hypergrid).toContain('SCHEMA_NOT_MIGRATED');
  expect(rwe).toContain('schema-guard.js');
  expect(hypergrid).toContain('schema-guard.js');
});

test('RWE export persistence is owned by a deployment migration', () => {
  const migration = fs.readFileSync(
    path.join(root, 'migrations/20261015004800-rwe-export-governance.migration.js'),
    'utf8',
  );
  expect(migration).toContain('CREATE TABLE IF NOT EXISTS rwe_export_requests');
  expect(migration).toContain('DROP TABLE IF EXISTS rwe_export_requests CASCADE');
});

test('AI governance persistence is migration-owned and request paths are read-only', () => {
  const governance = fs.readFileSync(path.join(root, 'routes/ai-governance.route.js'), 'utf8');
  const doctor = fs.readFileSync(path.join(root, 'routes/ai.js'), 'utf8');
  const proactive = fs.readFileSync(path.join(root, 'services/ai-proactive-alerts-cron.service.js'), 'utf8');
  for (const source of [governance, doctor, proactive]) {
    expect(source).not.toMatch(/CREATE\s+TABLE|CREATE\s+INDEX/i);
    expect(source).toContain('schema-guard.js');
  }
  const migration = fs.readFileSync(
    path.join(root, 'migrations/20261015005000-ai-governance.migration.js'),
    'utf8',
  );
  for (const table of ['ai_adverse_events', 'ai_doctor_metrics', 'ai_proactive_alerts']) {
    expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
  }
});

test('clinical intelligence and billing estimate services are migration-owned', () => {
  const clinical = fs.readFileSync(path.join(root, 'services/clinical-intelligence.service.js'), 'utf8');
  const billing = fs.readFileSync(path.join(root, 'services/billing-estimate.service.js'), 'utf8');
  for (const source of [clinical, billing]) {
    expect(source).not.toMatch(/CREATE\s+TABLE|CREATE\s+INDEX/i);
    expect(source).toContain('schema-guard.js');
    expect(source).toContain('SCHEMA_NOT_MIGRATED');
  }
  const migration = fs.readFileSync(
    path.join(root, 'migrations/20261015005100-clinical-billing-governance.migration.js'),
    'utf8',
  );
  for (const table of ['clinical_alerts', 'clinical_coding_suggestions', 'billing_estimates', 'non_payable_items']) {
    expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
  }
});

test('clinical support services are migration-owned and fail closed', () => {
  const files = [
    'services/bed-allocation.service.js',
    'services/cda-r2.service.js',
    'services/cdss-feedback.service.js',
    'services/closed-loop-notifier.service.js',
    'services/corporate-employee-qc.service.js',
  ];
  for (const relative of files) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    expect(source).not.toMatch(/CREATE\s+TABLE|CREATE\s+INDEX/i);
    expect(source).toContain('schema-guard.js');
    expect(source).toContain('SCHEMA_NOT_MIGRATED');
  }
  const migration = fs.readFileSync(
    path.join(root, 'migrations/20261015005200-clinical-services-governance.migration.js'),
    'utf8',
  );
  for (const table of ['bed_reservations', 'cda_documents', 'ai_cdss_feedback', 'ticket_resolution_followups', 'corporate_employee_qc_log']) {
    expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
  }
});

test('CRM growth automation and segments are migration-owned', () => {
  for (const relative of ['services/crm-automations.service.js', 'services/crm-segments.service.js']) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    expect(source).not.toMatch(/CREATE\s+TABLE|CREATE\s+INDEX/i);
    expect(source).toContain('schema-guard.js');
    expect(source).toContain('SCHEMA_NOT_MIGRATED');
  }
  const migration = fs.readFileSync(path.join(root, 'migrations/20261015005300-crm-growth-governance.migration.js'), 'utf8');
  for (const table of ['crm_automations', 'crm_automation_executions', 'crm_segments', 'crm_segment_members']) {
    expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
  }
});

test('HMIS workflow persistence is migration-owned', () => {
  for (const relative of ['services/discharge-workflow.service.js', 'services/hmis-automation.service.js', 'services/hmis-preauth.service.js']) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    expect(source).not.toMatch(/CREATE\s+TABLE|CREATE\s+INDEX/i);
    expect(source).toContain('schema-guard.js');
    expect(source).toContain('SCHEMA_NOT_MIGRATED');
  }
  const migration = fs.readFileSync(path.join(root, 'migrations/20261015005400-hmis-workflows-governance.migration.js'), 'utf8');
  for (const table of ['discharge_packets', 'automation_jobs', 'automation_run_log', 'hmis_preauth_requests', 'hmis_preauth_documents']) expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
});

test('ISO 27001 persistence is migration-owned', () => {
  const service = fs.readFileSync(path.join(root, 'services/iso27001.service.js'), 'utf8');
  expect(service).not.toMatch(/CREATE\s+TABLE|CREATE\s+INDEX/i);
  expect(service).toContain('schema-guard.js');
  expect(service).toContain('SCHEMA_NOT_MIGRATED');
  const migration = fs.readFileSync(path.join(root, 'migrations/20261015005500-iso27001-governance.migration.js'), 'utf8');
  for (const table of ['iso27001_controls', 'iso27001_evidence', 'iso27001_risk_register']) {
    expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
  }
});

test('collection instructions are migration-owned and acceptance-scoped', () => {
  const service = fs.readFileSync(path.join(root, 'services/collection/collection.service.js'), 'utf8');
  expect(service).not.toMatch(/ALTER\s+TABLE|CREATE\s+TABLE|CREATE\s+INDEX/i);
  expect(service).toContain("v.str(body.instructions, 'instructions'");
  expect(service).toContain('AFTER_ACCEPT.includes(row.status)');
  expect(service).toContain('task.instructions || null, task.id, principal.ref');
  const migration = fs.readFileSync(path.join(root, 'migrations/20261015005600-lab-collection-instructions.migration.js'), 'utf8');
  expect(migration).toContain('ADD COLUMN IF NOT EXISTS instructions TEXT');
  expect(migration).toContain('char_length(instructions) <= 2000');
});

test('collection label replacement is migration-owned, retired and auditable', () => {
  const service = fs.readFileSync(path.join(root, 'services/collection/collection.service.js'), 'utf8');
  const labRouter = fs.readFileSync(path.join(root, 'routes/lab/collection.router.js'), 'utf8');
  const phlebRouter = fs.readFileSync(path.join(root, 'routes/phlebotomy.router.js'), 'utf8');
  expect(service).not.toMatch(/ALTER\s+TABLE|CREATE\s+TABLE|CREATE\s+INDEX/i);
  expect(service).toContain('barcode_retired');
  expect(service).toContain('replaceSpecimenBarcode');
  expect(service).toContain('requestLabelReplacement');
  expect(service).toContain("code = 'label_replacement_requested' AND status = 'open'");
  expect(labRouter).toContain("'/specimens/:id/replace-label'");
  expect(labRouter).toContain('operationMeta(req, { required: true })');
  expect(phlebRouter).toContain("'/tasks/:id/specimens/:specimenId/replace-label-request'");
  const migration = fs.readFileSync(path.join(root, 'migrations/20261015005700-lab-collection-label-replacement.migration.js'), 'utf8');
  expect(migration).toContain('CREATE TABLE IF NOT EXISTS lab_collection_specimen_replacements');
  expect(migration).toContain('original_barcode');
  expect(migration).toContain('barcode_replaced');
  expect(migration).toContain('uq_lab_collection_exception_open');
});

test('collection incident reporting is migration-owned and exposed to both actors', () => {
  const service = fs.readFileSync(path.join(root, 'services/collection/collection.service.js'), 'utf8');
  const labRouter = fs.readFileSync(path.join(root, 'routes/lab/collection.router.js'), 'utf8');
  const phlebRouter = fs.readFileSync(path.join(root, 'routes/phlebotomy.router.js'), 'utf8');
  expect(service).not.toMatch(/ALTER\s+TABLE|CREATE\s+TABLE|CREATE\s+INDEX/i);
  expect(service).toContain('reportIncident');
  expect(service).toContain('listIncidents');
  expect(service).toContain('resolveIncident');
  expect(labRouter).toContain("'/incidents'");
  expect(labRouter).toContain("'/incidents/:id/resolve'");
  expect(phlebRouter).toContain("'/tasks/:id/incidents'");
  const migration = fs.readFileSync(path.join(root, 'migrations/20261015005800-lab-collection-incidents.migration.js'), 'utf8');
  expect(migration).toContain('CREATE TABLE IF NOT EXISTS lab_collection_incidents');
  expect(migration).toContain('needlestick');
  expect(migration).toContain('uq_lab_collection_incidents_operation');
});

test('handoff records bounded QC in immutable custody evidence', () => {
  const service = fs.readFileSync(path.join(root, 'services/collection/collection.service.js'), 'utf8');
  const openapi = fs.readFileSync(path.join(root, '..', 'docs/api/phlebotomy-collection.openapi.yaml'), 'utf8');
  expect(service).toContain("v.str(payload.sealId, 'sealId'");
  expect(service).toContain("temperatureC must be a number between -80 and 80");
  expect(service).toContain("v.bool(payload.labelMatch, 'labelMatch')");
  expect(service).toContain("conflict('label_mismatch'");
  expect(service).toContain('evidence: { receiverKind, receiverRef, sealId, temperatureC: temperatureRaw, labelMatch }');
  expect(openapi).toContain('sealId');
  expect(openapi).toContain('temperatureC');
  expect(openapi).toContain('labelMatch');
});
