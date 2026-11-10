// Offline audit harness: evaluates the pinned source with in-memory dependencies.
// No application imports, environment loading, network, database, or file writes.
// Usage: node reproduce.mjs /path/to/mediqzy-snapshot
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const root = process.argv[2];
assert(root, 'Pass the Mediqzy source snapshot directory');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
assert.equal(commit, 'cc7008b9be90e714c4e2220910ae45e09a6cb0c2', 'Harness requires the audited snapshot');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const results = [];
async function check(id, fn) { await fn(); results.push({ id, result: 'observed', interpretation: 'Reproduces the reported gap; not a passing product acceptance test' }); }
function adoption(query, send = async () => ({ success: true, channels: { whatsapp: { success: true } } })) {
  const code = read('server/services/medcore-adoption.service.js')
    .replace(/^import .*;\n/gm, '').replace(/^export default .*;\n?/gm, '').replace(/^export /gm, '');
  const ctx = vm.createContext({ pool: { query }, notificationService: { send }, console });
  vm.runInContext(code, ctx, { timeout: 1000 });
  return ctx;
}
await check('R01-unscheduled-workbench-plan', async () => {
  const ctx = adoption(async () => { throw Error('Unexpected DB call'); });
  assert.equal(await ctx.materializeAdherenceEvent({ id: 1, medication: { times: ['08:00'] }, schedule: {} }), null);
});
await check('R02-lab-form-shape-loses-abnormal-value', async () => {
  const ctx = adoption(async () => ({ rows: [] }));
  const output = ctx.buildLabExplainerDraft({ test: 'Synthetic analyte', value: 999, unit: 'test-unit', flag: 'high' });
  assert.match(output, /No out-of-range values were supplied/);
  assert(!output.includes('999'));
});
await check('R03-quiet-hours-permanent-skip', async () => {
  const updates = [];
  const event = { id: 1, patient_id: 'synthetic', quiet_hours: { startHour: 22, endHour: 7 }, medication: {}, channel: 'whatsapp' };
  const ctx = adoption(async (sql, params) => { if (sql.includes('SELECT e.*')) return { rows: [event] }; updates.push({ sql, params }); return { rows: [] }; }, async () => { throw Error('Must not send during quiet hours'); });
  const result = await ctx.runDueAdherenceEvents({ now: new Date('2026-11-08T23:00:00Z') });
  assert.equal(result[0].status, 'skipped'); assert.equal(result[0].deliveryDeferred, true);
  assert.equal(updates[0].params[0], 'skipped'); assert.equal(updates.length, 1);
  assert(!updates[0].sql.includes('due_at ='));
});
await check('R04-concurrent-adherence-double-send', async () => {
  let sends = 0;
  const event = { id: 1, patient_id: 'synthetic', quiet_hours: {}, medication: {}, channel: 'whatsapp' };
  const ctx = adoption(async sql => ({ rows: sql.includes('SELECT e.*') ? [event] : [] }), async () => { sends++; await new Promise(r => setImmediate(r)); return { success: true }; });
  await Promise.all([ctx.runDueAdherenceEvents(), ctx.runDueAdherenceEvents()]);
  assert.equal(sends, 2);
});
await check('R05-concurrent-lab-delivery-double-send', async () => {
  let sends = 0;
  const draft = { id: 1, patient_id: 'synthetic', draft: 'Synthetic explanation' };
  const ctx = adoption(async sql => ({ rows: sql.startsWith('SELECT') ? [draft] : [] }), async () => { sends++; await new Promise(r => setImmediate(r)); return { success: true }; });
  await Promise.all([ctx.deliverApprovedLabExplanation({ draftId: 1, tenantUid: 'synthetic', actorId: 'synthetic' }), ctx.deliverApprovedLabExplanation({ draftId: 1, tenantUid: 'synthetic', actorId: 'synthetic' })]);
  assert.equal(sends, 2);
});
await check('R06-blood-requisition-can-be-issued-twice', async () => {
  const source = read('server/routes/dept/bloodBank.route.js');
  const start = source.indexOf("router.post('/requisitions/:id/issue'");
  const end = source.indexOf("router.post('/cross-match'", start);
  assert(start >= 0 && end > start);
  let handler, allocation = 0;
  const requisition = { id: 1, status: 'pending', blood_group: 'O+', component: 'whole_blood', units_requested: 1 };
  const client = { release() {}, async query(sql, params) {
    if (sql.includes('SELECT * FROM blood_bank_requisitions')) return { rows: [{ ...requisition }] };
    if (sql.includes('SELECT id FROM blood_bank_units')) return { rows: [{ id: ++allocation }] };
    if (sql.includes('UPDATE blood_bank_requisitions')) { requisition.status = 'issued'; requisition.issued_unit_ids = params[1]; return { rows: [{ ...requisition }] }; }
    return { rows: [] };
  } };
  const ctx = vm.createContext({ router: { post(_path, _auth, fn) { handler = fn; } }, authBloodBank() {}, ensureTables: async () => ({ connect: async () => client }), recordAudit: async () => {} });
  vm.runInContext(source.slice(start, end), ctx, { timeout: 1000 });
  const responses = [];
  const response = () => ({ statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { responses.push({ code: this.statusCode, body }); return this; } });
  await handler({ params: { id: '1' } }, response());
  await handler({ params: { id: '1' } }, response());
  assert.equal(allocation, 2); assert.equal(responses[1].code, 200); assert.equal(responses[1].body.success, true);
  assert.equal(requisition.issued_unit_ids[0], 2);
});
console.log(JSON.stringify({ snapshot: commit, mode: 'offline source evaluation with mocked persistence/providers', observations: results }, null, 2));
