import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import express from 'express';
import request from 'supertest';
import { up } from '../migrations/20261018000100-dedicated-installations.migration.js';
import { DedicatedInstallationsService } from '../services/dedicated-installations.service.js';
import { dedicatedInstallationsRouter } from '../routes/dedicated-installations.route.js';
import { validateInstallation, validateReport } from '../config/dedicated-installation-profiles.js';
import { sendInstallationReport } from '../scripts/report-dedicated-installation.mjs';

// Own throwaway cluster; never load application configuration, .env, SSM or pgPool.
const bin = '/usr/lib/postgresql/16/bin';
let dir, pool, svc, app, started = false;
const crm = { tenantUid: 'VTEST1', name: 'Hospital CRM', profile: 'crm', modules: ['crm.core'], domain: 'crm.hospital.example' };
const lab = { tenantUid: 'VTEST2', name: 'Laboratory LIS', profile: 'lab', modules: ['lab.core'], domain: 'lab.laboratory.example' };
const report = (metrics = { leads_created: 4 }, observedAt = new Date().toISOString()) => ({ eventId: randomUUID(), observedAt, release: 'test-sha', health: 'healthy', day: observedAt.slice(0, 10), metrics });
const expectCode = code => e => e.code === code;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'dedicated-installations-test-'));
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  execFileSync(join(bin, 'initdb'), ['-D', join(dir, 'data'), '-U', 'postgres', '-A', 'trust', '--no-locale'], { stdio: 'ignore' });
  execFileSync(join(bin, 'pg_ctl'), ['-D', join(dir, 'data'), '-l', join(dir, 'log'), '-o', `-F -h 127.0.0.1 -p ${port} -k ${dir}`, '-w', 'start'], { stdio: 'ignore' });
  started = true;
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres', ssl: false });
  await pool.query(`CREATE TABLE tenants (unique_id VARCHAR(6) UNIQUE NOT NULL, name TEXT, type TEXT);
    INSERT INTO tenants VALUES ('VTEST1','Hospital','hospital'),('VTEST2','Laboratory','lab');
    CREATE TABLE users (id INTEGER PRIMARY KEY, "isAdmin" BOOLEAN, role TEXT, status TEXT);
    INSERT INTO users VALUES (1,true,'system_admin','active'),(2,false,'lab_admin','active'),(3,true,'admin','suspended');`);
  await up(pool); await up(pool);
  svc = new DedicatedInstallationsService(pool);
  app = express();
  app.use('/installations', dedicatedInstallationsRouter({ pool, authenticate(req, res, next) {
    if (req.get('x-test-user')) {
      req.user = { id: Number(req.get('x-test-user')), isAdmin: true };
      req.userRole = req.get('x-test-role') || 'admin';
    }
    next();
  } }));
});
beforeEach(async () => { await pool.query('TRUNCATE dedicated_installations CASCADE'); });
after(async () => {
  if (pool) await pool.end();
  if (started) execFileSync(join(bin, 'pg_ctl'), ['-D', join(dir, 'data'), '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' });
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test('separate CRM and lab installations share registry but not scopes', async () => {
  const a = await svc.save(crm, 1), b = await svc.save(lab, 1);
  assert.notEqual(a.id, b.id);
  assert.equal((await svc.list({ tenantUid: 'VTEST1' })).length, 1);
  assert.equal(a.scope_status, 'requested'); assert.equal(a.billing_status, 'not_linked');
  assert.equal(a.freshness, 'never_reported');
  await assert.rejects(svc.save({ ...crm, tenantUid: lab.tenantUid }, 1), expectCode('tenant_profile_mismatch'));
  await assert.rejects(svc.save({ ...lab, modules: ['lab.core', 'crm.agent'] }, 1), expectCode('validation_failed'));
});
test('strict input validation rejects secrets, malformed domains and prototype keys', () => {
  for (const input of [{ ...crm, password: 'secret' }, { ...crm, profile: '__proto__' }, { ...crm, domain: 'https://x.example/a' },
    { ...crm, modules: [] }, { ...crm, awsAccountId: 123456789012 }, { ...crm, region: 'x'.repeat(100) }]) assert.throws(() => validateInstallation(input));
  assert.throws(() => validateReport({ ...report(), metrics: { patient_name: 'Forbidden' } }, 'crm'));
});
test('duplicate domains and names cannot register another installation', async () => {
  await svc.save(crm, 1);
  await assert.rejects(svc.save({ ...lab, domain: crm.domain }, 1), expectCode('23505'));
  await assert.rejects(svc.save({ ...crm, domain: 'second.example' }, 1), expectCode('23505'));
  assert.equal((await svc.list()).length, 1);
});
test('optimistic edits protect scope and preserve immutable tenant identity', async () => {
  const a = await svc.save(crm, 1);
  const b = await svc.save({ ...crm, version: a.version, modules: ['crm.core', 'crm.agent'] }, 1, a.id);
  assert.equal(b.version, 2);
  await assert.rejects(svc.save({ ...crm, version: a.version }, 1, a.id), expectCode('version_conflict'));
  await assert.rejects(svc.save({ ...lab, version: b.version }, 1, a.id), expectCode('immutable_scope'));
  assert.equal((await svc.detail(a.id)).audit.length, 2);
});
test('failed audit insert rolls back the corresponding configuration', async () => {
  await pool.query(`CREATE FUNCTION reject_installation_audit() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END; $$;
    CREATE TRIGGER reject_audit BEFORE INSERT ON dedicated_installation_audit FOR EACH ROW EXECUTE FUNCTION reject_installation_audit();`);
  try {
    await assert.rejects(svc.save(crm, 1));
    assert.equal((await svc.list()).length, 0);
  } finally { await pool.query('DROP TRIGGER reject_audit ON dedicated_installation_audit; DROP FUNCTION reject_installation_audit()'); }
});
test('connector secret is hashed, never returned by reads, and revocation is immediate', async () => {
  const a = await svc.save(crm, 1);
  const first = await svc.credential(a.id, a.version, 1);
  assert.match(first.token, /^mdi_[a-f0-9]{64}$/);
  const stored = (await pool.query('SELECT token_hash FROM dedicated_installations WHERE id=$1', [a.id])).rows[0].token_hash;
  assert.notEqual(stored, first.token);
  assert.equal(JSON.stringify(await svc.detail(a.id)).includes(first.token), false);
  assert.equal(JSON.stringify(await svc.list()).includes(stored), false);
  const second = await svc.credential(a.id, first.installation.version, 1);
  await assert.rejects(svc.report(first.token, report()), expectCode('invalid_connector'));
  await svc.report(second.token, report());
  await svc.credential(a.id, second.installation.version, 1, true);
  await assert.rejects(svc.report(second.token, report()), expectCode('invalid_connector'));
});
test('report identity is bound to token and product metrics cannot cross scopes', async () => {
  const a = await svc.save(crm, 1), b = await svc.save(lab, 1);
  const key = await svc.credential(a.id, a.version, 1);
  await assert.rejects(svc.report(key.token, { ...report(), installationId: b.id }), expectCode('validation_failed'));
  await assert.rejects(svc.report(key.token, report({ reports_released: 20 })), expectCode('validation_failed'));
  await svc.report(key.token, report());
  assert.equal((await svc.detail(b.id)).dailyMetrics.length, 0);
});
test('concurrent retries deduplicate and changed bodies reject the same event ID', async () => {
  const a = await svc.save(crm, 1), key = await svc.credential(a.id, a.version, 1), payload = report();
  const answers = await Promise.all([svc.report(key.token, payload), svc.report(key.token, payload)]);
  assert.equal(answers.filter(r => r.replayed).length, 1);
  await assert.rejects(svc.report(key.token, { ...payload, metrics: { leads_created: 999 } }), expectCode('event_reuse'));
  assert.equal((await svc.detail(a.id)).dailyMetrics[0].metrics.leads_created, 4);
});
test('newer snapshots replace rather than add; old reports and empty heartbeats do not erase totals', async () => {
  const a = await svc.save(crm, 1), key = await svc.credential(a.id, a.version, 1);
  const now = Date.now();
  await svc.report(key.token, report({ leads_created: 8 }, new Date(now - 1000).toISOString()));
  await svc.report(key.token, report({ leads_created: 2 }, new Date(now - 2000).toISOString()));
  await svc.report(key.token, report({}, new Date(now).toISOString()));
  let detail = await svc.detail(a.id);
  assert.equal(detail.dailyMetrics[0].metrics.leads_created, 8);
  assert.equal(detail.installation.freshness, 'healthy');
  await pool.query("UPDATE dedicated_installations SET last_observed_at=NOW()-INTERVAL '10 minutes' WHERE id=$1", [a.id]);
  detail = await svc.detail(a.id);
  assert.equal(detail.installation.freshness, 'stale');
});
test('HTTP admin guard denies tenant users and stale elevated tokens using persisted role', async () => {
  await request(app).get('/installations').expect(401);
  await request(app).get('/installations').set('x-test-user', '1').set('x-test-role', 'doctor').expect(403);
  await request(app).get('/installations').set('x-test-user', '2').expect(403);
  await request(app).get('/installations').set('x-test-user', '3').expect(403);
  await request(app).get('/installations').set('x-test-user', '1').expect(200);
});
test('HTTP validates registration, version, pagination and connector authorization', async () => {
  const created = await request(app).post('/installations').set('x-test-user', '1').send(crm).expect(201);
  const id = created.body.installation.id;
  await request(app).put(`/installations/${id}`).set('x-test-user', '1').send(crm).expect(422);
  await request(app).get('/installations?limit=-2').set('x-test-user', '1').expect(422);
  await request(app).post('/installations/reports').send(report()).expect(401);
  const key = await request(app).post(`/installations/${id}/connector/rotate`).set('x-test-user', '1').send({ version: 1 }).expect(200);
  assert.equal(key.headers['cache-control'], 'no-store');
  await request(app).post('/installations/reports').set('Authorization', `Bearer ${key.body.token}`).send(report()).expect(200);
  await request(app).get('/installations').set('Authorization', `Bearer ${key.body.token}`).expect(401);
});

test('report client uses HTTPS, refuses redirects and preserves caller event identity', async () => {
  const payload = report();
  let captured;
  const options = { origin: 'https://control.example', profile: 'crm', token: `mdi_${'a'.repeat(64)}`, report: payload,
    fetcher: async (url, init) => { captured = { url, init }; return { ok: true, json: async () => ({ success: true, replayed: true }) }; } };
  assert.deepEqual(await sendInstallationReport(options), { success: true, replayed: true });
  assert.equal(captured.init.redirect, 'error');
  assert.equal(JSON.parse(captured.init.body).eventId, payload.eventId);
  await assert.rejects(sendInstallationReport({ ...options, origin: 'http://control.example' }));
  await assert.rejects(sendInstallationReport({ ...options, origin: 'https://user:secret@control.example' }));
  await assert.rejects(sendInstallationReport({ ...options, fetcher: async () => ({ ok: false, status: 503 }) }), /HTTP 503/);
});

test('connector config pull: opt-in fields, token-bound, ETag/304, revocation', async () => {
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS branding JSONB`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS settings JSONB`);
  await pool.query(`UPDATE tenants SET settings=NULL`);
  await pool.query(`UPDATE tenants SET branding=$1 WHERE unique_id='VTEST1'`,
    [JSON.stringify({ logo_url: '/brand/h.svg', favicon_url: null, primary_color: '#7c3aed', secondary_color: '#5b21b6', internal_note: 'never sent' })]);
  await pool.query(`UPDATE tenants SET branding=$1 WHERE unique_id='VTEST2'`, [JSON.stringify({ primary_color: '#000000' })]);
  const created = await request(app).post('/installations').set('x-test-user', '1').send(crm).expect(201);
  const other = await request(app).post('/installations').set('x-test-user', '1').send(lab).expect(201);
  const key = await request(app).post(`/installations/${created.body.installation.id}/connector/rotate`).set('x-test-user', '1').send({ version: 1 }).expect(200);
  const otherKey = await request(app).post(`/installations/${other.body.installation.id}/connector/rotate`).set('x-test-user', '1').send({ version: 1 }).expect(200);
  const auth = { Authorization: `Bearer ${key.body.token}` };

  await request(app).get('/installations/config').expect(401);
  await request(app).get('/installations/config').set('Authorization', `Bearer mdi_${'0'.repeat(64)}`).expect(401);
  // An admin session is not a connector credential.
  await request(app).get('/installations/config').set('x-test-user', '1').expect(401);

  // Nothing is published until the tenant opts a field in: the installation keeps its own copy.
  const unpublished = await request(app).get('/installations/config').set(auth).expect(200);
  assert.equal(unpublished.body.branding, null);
  assert.equal(unpublished.body.mobileApps, null);
  await pool.query(`UPDATE tenants SET settings=$1 WHERE unique_id IN ('VTEST1','VTEST2')`,
    [JSON.stringify({ dedicatedConfig: { publish: ['branding'] }, mobileApps: { enabled: true, apps: [] } })]);

  const first = await request(app).get('/installations/config').set(auth).expect(200);
  assert.notEqual(first.body.revision, unpublished.body.revision);
  assert.equal(first.headers['cache-control'], 'no-store');
  assert.match(first.body.revision, /^[a-f0-9]{32}$/);
  assert.equal(first.headers.etag, `"${first.body.revision}"`);
  assert.equal(first.body.mobileApps, null);
  assert.deepEqual(first.body.branding, { logo_url: '/brand/h.svg', favicon_url: null, primary_color: '#7c3aed', secondary_color: '#5b21b6' });

  // Bound to the token's own tenant.
  const theirs = await request(app).get('/installations/config').set('Authorization', `Bearer ${otherKey.body.token}`).expect(200);
  assert.deepEqual(theirs.body.branding, { primary_color: '#000000' });
  assert.notEqual(theirs.body.revision, first.body.revision);

  await request(app).get('/installations/config').set(auth).set('If-None-Match', `"${first.body.revision}"`).expect(304);
  await request(app).get('/installations/config').set(auth).set('If-None-Match', '"stale"').expect(200);

  // A console change produces a new revision; revocation is immediate.
  await pool.query(`UPDATE tenants SET branding = branding || '{"primary_color":"#123456"}' WHERE unique_id='VTEST1'`);
  const changed = await request(app).get('/installations/config').set(auth).set('If-None-Match', `"${first.body.revision}"`).expect(200);
  assert.notEqual(changed.body.revision, first.body.revision);
  assert.equal(changed.body.branding.primary_color, '#123456');
  // mobileApps only when published too.
  await pool.query(`UPDATE tenants SET settings=jsonb_set(settings,'{dedicatedConfig,publish}','["branding","mobileApps"]') WHERE unique_id='VTEST1'`);
  assert.deepEqual((await request(app).get('/installations/config').set(auth).expect(200)).body.mobileApps, { enabled: true, apps: [] });
  await request(app).post(`/installations/${created.body.installation.id}/connector/revoke`).set('x-test-user', '1').send({ version: 2 }).expect(200);
  await request(app).get('/installations/config').set(auth).expect(401);
});
