/**
 * Regression harness for imaging tenants keyed by the lab's entity uid (`lab_uid`; routes/hypergrid-dicom.route.js).
 * Drives the REAL router with real JWTs against a DISPOSABLE local database that has the DICOM/ris/labs tables, a `lab_uid`
 * twin on each imaging table and (for the retired-uid case) entity_uid_aliases + resolve_entity_uid(). Refuses any non-local host (server/.env points at production).
 *
 *   DRYRUN_DATABASE=… DRYRUN_USER=… DRYRUN_PASSWORD=… node scripts/qa/imaging-uid-regression.mjs
 */
const H = process.env.DRYRUN_HOST || '127.0.0.1';
if (!new Set(['127.0.0.1', 'localhost', '::1']).has(H)) { console.error(`REFUSING: host ${H} is not local.`); process.exit(2); }
Object.assign(process.env, {
  POSTGRES_HOST: H, POSTGRES_PORT: process.env.DRYRUN_PORT || '5432', POSTGRES_DATABASE: process.env.DRYRUN_DATABASE, POSTGRES_USER: process.env.DRYRUN_USER,
  POSTGRES_PASSWORD: process.env.DRYRUN_PASSWORD, POSTGRES_SSL: 'false', POSTGRES_FORCE_LOCAL: 'true', DISALLOW_REMOTE_DB: 'true',
  POSTGRES_PRIMARY_HOST: H, POSTGRES_PRIMARY_DATABASE: process.env.DRYRUN_DATABASE, POSTGRES_PRIMARY_USER: process.env.DRYRUN_USER, POSTGRES_PRIMARY_PASSWORD: process.env.DRYRUN_PASSWORD,
  JWT_SECRET: process.env.JWT_SECRET || 'harness-secret', JWT_REFRESH_SECRET: 'harness-refresh', NODE_ENV: 'test', ORTHANC_BRIDGE_TOKEN: 'harness-bridge',
});

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

const { default: express } = await import('express');
const { default: request } = await import('supertest');
const { default: jwt } = await import('jsonwebtoken');
const { default: cookieParser } = await import('cookie-parser');
const { JWT_CONFIG } = await import('../../config/auth.config.js');
const pool = (await import('../../db/pgPool.js')).default;
const { default: router } = await import('../../routes/hypergrid-dicom.route.js');
const tenants = await import('../../services/imaging-tenant.service.js');

const app = express();
app.use(cookieParser()); app.use(express.json());
app.use('/dicom', router);
const sign = (claims) => jwt.sign(claims, JWT_CONFIG.SECRET, { expiresIn: '5m' });
const bridge = (tenantId) => ({ Authorization: 'Bearer harness-bridge', 'X-Tenant-Id': String(tenantId) });
const listUids = (res) => (res.body?.studies || res.body?.data || res.body?.rows || []).map((s) => s.study_instance_uid).sort();

try {
  const reg = (await pool.query(`SELECT id::int id, unique_id AS uid, uid::text AS legacy FROM labs WHERE unique_id IS NOT NULL`)).rows;
  const uidOf = Object.fromEntries(reg.map((r) => [r.id, r.uid]));
  const legacyOf = Object.fromEntries(reg.map((r) => [r.id, r.legacy]));

  // ── typed resolution through the bridge (lab id space) ──────────────────────────────────────
  let r = await request(app).get('/dicom/studies').set(bridge(2368));
  const own = listUids(r);
  check('bridge with a real lab id lists exactly that lab\'s studies', r.status === 200 && own.length >= 3 && own.every((u) => u.startsWith('STUDY-2368-') || u.startsWith('NEW-2368')), `${r.status} ${own.length} studies`);
  r = await request(app).get('/dicom/studies').set(bridge(424242));
  check('bridge with an id that is NOT a lab is refused (an arbitrary integer cannot mint a tenant)', r.status === 403 && r.body.code === 'TENANT_CONTEXT_REQUIRED', `${r.status} ${r.body.code}`);

  // ── the identity bug: a doctor whose id equals a tenant id ──────────────────────────────────
  r = await request(app).get('/dicom/studies').set('Authorization', `Bearer ${sign({ id: 70, role: 'doctor' })}`);
  check('doctor 70 (= imaging tenant 70) is refused, NOT served tenant 70\'s studies', r.status === 403 && r.body.code === 'TENANT_CONTEXT_REQUIRED', `${r.status} ${r.body.code}`);
  r = await request(app).get('/dicom/studies').set('Authorization', `Bearer ${sign({ id: 2368, role: 'hospital', userType: 'hospital' })}`);
  check('hospital account 2368 (= lab 2368) is refused too', r.status === 403, String(r.status));

  // ── explicit labUid claim (the lab's entity uid) ────────────────────────────────────────────────
  r = await request(app).get('/dicom/studies').set('Authorization', `Bearer ${sign({ id: 5, role: 'doctor', labUid: uidOf[2368] })}`);
  check('a valid labUid claim resolves to that lab and lists its studies', r.status === 200 && JSON.stringify(listUids(r)) === JSON.stringify(own), `${r.status} ${listUids(r).length}`);
  r = await request(app).get('/dicom/studies').set('Authorization', `Bearer ${sign({ id: 5, role: 'doctor', labUid: 'LZZZZZ' })}`);
  check('an unknown labUid is refused (no fall-through to the integer)', r.status === 403, String(r.status));
  r = await request(app).get('/dicom/studies').set('Authorization', `Bearer ${sign({ id: 2368, role: 'doctor', labUid: "1' OR '1'='1", tenantId: 2368 })}`);
  check('a malformed labUid is refused even alongside a matching integer claim', r.status === 403, String(r.status));

  // ── PACS session cookie ─────────────────────────────────────────────────────────────────────
  const cookie = `pacs_session=${sign({ sub: 9, role: 'doctor', purpose: 'pacs', labUid: uidOf[2433], tenantId: 2433 })}`;
  r = await request(app).get('/dicom/studies').set('Cookie', cookie);
  check('a PACS cookie carrying the lab uid lists that lab only', r.status === 200 && listUids(r).length >= 2 && listUids(r).every((u) => u.startsWith('STUDY-2433')), `${r.status} ${listUids(r).join(',')}`);
  r = await request(app).get('/dicom/studies').set('Cookie', `pacs_session=${sign({ sub: 9, role: 'doctor', purpose: 'pacs', tenantId: null, labUid: null })}`);
  check('a PACS cookie with no tenant (doctor not entitled) is refused, not mapped to the doctor id', r.status === 403, String(r.status));

  // ── compatibility: a cookie issued before 2026-10-07 carries the lab's UUID as tenantUid ───────
  r = await request(app).get('/dicom/studies').set('Cookie', `pacs_session=${sign({ sub: 9, role: 'doctor', purpose: 'pacs', tenantUid: legacyOf[2433], tenantId: 2433 })}`);
  check('LEGACY: a pre-change cookie (UUID tenantUid) still lists that lab only', r.status === 200 && listUids(r).length >= 2 && listUids(r).every((u) => u.startsWith('STUDY-2433')), `${r.status} ${listUids(r).join(',')}`);
  r = await request(app).get('/dicom/studies').set('Cookie', `pacs_session=${sign({ sub: 9, role: 'doctor', purpose: 'pacs', tenantUid: legacyOf[2368], tenantId: 2433 })}`);
  check('LEGACY: the UUID claim wins over a contradicting integer claim (it does not fall through)', r.status === 200 && listUids(r).every((u) => u.startsWith('STUDY-2368') || u.startsWith('NEW-2368')), `${r.status} ${listUids(r).join(',')}`);

  // ── a re-issued (retired) lab uid keeps working ─────────────────────────────────────────────
  await pool.query(`INSERT INTO entity_uid_aliases (old_uid, uid) VALUES ('LOLD00', $1) ON CONFLICT (old_uid) DO UPDATE SET uid = EXCLUDED.uid`, [uidOf[2433]]);
  tenants._clearCache();
  r = await request(app).get('/dicom/studies').set('Cookie', `pacs_session=${sign({ sub: 9, role: 'doctor', purpose: 'pacs', labUid: 'LOLD00', tenantId: 2433 })}`);
  check('a retired lab uid resolves to the lab\'s current uid', r.status === 200 && listUids(r).length >= 2 && listUids(r).every((u) => u.startsWith('STUDY-2433')), `${r.status} ${listUids(r).join(',')}`);

  // ── defence in depth: a row whose lab_uid DISAGREES with its tenant_id is invisible to both labs ──
  const victim = (await pool.query(`SELECT study_instance_uid FROM hg_dicom_studies WHERE tenant_id = 2368 ORDER BY id LIMIT 1`)).rows[0].study_instance_uid;
  await pool.query(`UPDATE hg_dicom_studies SET lab_uid = $2 WHERE study_instance_uid = $1`, [victim, uidOf[2433]]);
  r = await request(app).get('/dicom/studies').set(bridge(2368));
  const seen2368 = listUids(r);
  r = await request(app).get('/dicom/studies').set(bridge(2433));
  check('a study whose lab_uid disagrees with its tenant_id is served to NEITHER lab (both keys must match)', !seen2368.includes(victim) && !listUids(r).includes(victim), `${victim}`);
  r = await request(app).get(`/dicom/studies/${victim}`).set(bridge(2368));
  check('…and its detail is not readable by the lab that owns the integer', r.status === 404 || r.status === 403, String(r.status));
  await pool.query(`UPDATE hg_dicom_studies SET lab_uid = $2 WHERE study_instance_uid = $1`, [victim, uidOf[2368]]);

  // ── the study / worklist read paths use the dual key too ────────────────────────────────────
  const anyStudy = own[0];
  r = await request(app).get(`/dicom/studies/${anyStudy}`).set(bridge(2368));
  check('study detail: the owning tenant can read it', r.status === 200, String(r.status));
  r = await request(app).get(`/dicom/studies/${anyStudy}`).set(bridge(2433));
  check('study detail: another lab gets 404 for it', r.status === 404 || r.status === 403, String(r.status));
  r = await request(app).get('/dicom/worklist').set(bridge(2368));
  check('worklist read runs (dual-keyed) and returns a list', r.status === 200 && Array.isArray(r.body.worklist), String(r.status));

  // ── a legacy writer that only knows the integer still produces a consistent row ─────────────
  const wcols = (await pool.query(`select column_name, data_type from information_schema.columns where table_name='hg_dicom_worklist' and is_nullable='NO' and column_default is null`)).rows;
  const wv = { tenant_id: 2368 };
  for (const c of wcols) if (!(c.column_name in wv)) wv[c.column_name] = /int|numeric/.test(c.data_type) ? 0 : /bool/.test(c.data_type) ? false : /timestamp|date/.test(c.data_type) ? new Date() : /json/.test(c.data_type) ? '{}' : 'x';
  const wn = Object.keys(wv);
  await pool.query(`INSERT INTO hg_dicom_worklist (${wn.map((n) => `"${n}"`).join(',')}) VALUES (${wn.map((_, i) => `$${i + 1}`).join(',')})`, wn.map((n) => wv[n]));
  const wl = (await pool.query(`SELECT lab_uid FROM hg_dicom_worklist WHERE tenant_id = 2368 ORDER BY id DESC LIMIT 1`)).rows[0];
  check('trigger: a worklist row written with only tenant_id has the right lab_uid', !!wl && wl.lab_uid === uidOf[2368], wl ? String(wl.lab_uid) : 'no row');
} catch (err) {
  check('harness completed without a fatal error', false, err.stack || err.message);
} finally {
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  tenants._clearCache();
  await pool.end().catch(() => {});
  process.exit(failed ? 1 : 0);
}
