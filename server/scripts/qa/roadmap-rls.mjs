/**
 * Rehearses migration 20260926000006 + routes/roadmap-intelligence.route.js on a DISPOSABLE local database, as the
 * NON-superuser table OWNER (the production situation: the app role owns its tables, so RLS only bites with FORCE).
 *   DRYRUN_DATABASE=… DRYRUN_USER=… DRYRUN_PASSWORD=… node scripts/qa/roadmap-rls.mjs
 */
const H = process.env.DRYRUN_HOST || '127.0.0.1';
if (!new Set(['127.0.0.1', 'localhost', '::1']).has(H)) { console.error('REFUSING: not a local host'); process.exit(2); }
Object.assign(process.env, {
  POSTGRES_HOST: H, POSTGRES_PORT: process.env.DRYRUN_PORT || '5432', POSTGRES_DATABASE: process.env.DRYRUN_DATABASE, POSTGRES_USER: process.env.DRYRUN_USER,
  POSTGRES_PASSWORD: process.env.DRYRUN_PASSWORD, POSTGRES_SSL: 'false', POSTGRES_FORCE_LOCAL: 'true', DISALLOW_REMOTE_DB: 'true',
  POSTGRES_PRIMARY_HOST: H, POSTGRES_PRIMARY_DATABASE: process.env.DRYRUN_DATABASE, POSTGRES_PRIMARY_USER: process.env.DRYRUN_USER, POSTGRES_PRIMARY_PASSWORD: process.env.DRYRUN_PASSWORD,
  JWT_SECRET: process.env.JWT_SECRET || 'harness-secret', JWT_REFRESH_SECRET: 'harness-refresh', NODE_ENV: 'test',
});
let failed = 0;
const check = (name, ok, d = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${d ? ` — ${d}` : ''}`); };

const pool = (await import('../../db/pgPool.js')).default;
const { up, TABLES } = await import('../../migrations/20260926000006-roadmap-intelligence.migration.js');
const { default: express } = await import('express');
const { default: request } = await import('supertest');
const { default: jwt } = await import('jsonwebtoken');
const { JWT_CONFIG } = await import('../../config/auth.config.js');

const su = (await pool.query('SELECT rolsuper FROM pg_roles WHERE rolname = current_user')).rows[0].rolsuper;
check('running as a NON-superuser (a superuser would bypass RLS and prove nothing)', su === false);

await pool.query(`DROP TABLE IF EXISTS ${TABLES.join(',')}, appointments, patients, doctors, users CASCADE; DROP TYPE IF EXISTS g_enum`);
await pool.query(`CREATE TYPE g_enum AS ENUM ('Male','Female','Other')`);
await pool.query(`CREATE TABLE users (id SERIAL PRIMARY KEY, organization_id INT, gender g_enum);
  CREATE TABLE patients (id SERIAL PRIMARY KEY, "userId" INT);
  CREATE TABLE doctors (id SERIAL PRIMARY KEY, hospital_id INT, organization_id INT);
  CREATE TABLE appointments (id SERIAL PRIMARY KEY, "appointmentDate" TIMESTAMP, organization_id INT);`);
// hospital 4: users 1..8 (patient user 1 → patients.id 1); hospital 9: users 9..10
await pool.query(`INSERT INTO users (organization_id, gender) SELECT 4, CASE WHEN g <= 6 THEN 'Female'::g_enum ELSE 'Male'::g_enum END FROM generate_series(1,8) g;
  INSERT INTO users (organization_id, gender) VALUES (9,'Male'),(9,'Female');
  INSERT INTO patients ("userId") VALUES (1), (9); INSERT INTO doctors (hospital_id) VALUES (4);
  INSERT INTO appointments ("appointmentDate", organization_id) VALUES (now(), 4), (now(), 4), (now(), 9)`);

await pool.query(`ALTER TABLE users ENABLE ROW LEVEL SECURITY; ALTER TABLE users FORCE ROW LEVEL SECURITY;
  CREATE POLICY u_iso ON users USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::int OR current_setting('app.is_platform_admin', true) = 'true')`);   // after seeding
await up();
await up();                                          // idempotent
check('migration is idempotent and every table has FORCE row-level security', (await pool.query(`SELECT count(*)::int n FROM pg_class WHERE relname = ANY($1) AND relrowsecurity AND relforcerowsecurity`, [TABLES])).rows[0].n === TABLES.length);

const { default: router } = await import('../../routes/roadmap-intelligence.route.js');
const app = express(); app.use(express.json()); app.use('/r', router);
const tok = (c) => `Bearer ${jwt.sign(c, JWT_CONFIG.SECRET, { expiresIn: '5m' })}`;
const nurse4 = tok({ id: 50, role: 'nurse', organization_id: 4 });
const nurse9 = tok({ id: 51, role: 'nurse', organization_id: 9 });

let r = await request(app).post('/r/wounds').set('authorization', nurse4).send({ patientId: 1, woundType: 'ulcer', stage: '2' });
check('hospital 4 nurse records a wound for hospital 4\'s patient', r.status === 201 && r.body.data.tenant_id === 4, `${r.status}`);
r = await request(app).post('/r/wounds').set('authorization', nurse4).send({ patientId: 9, woundType: 'x' });
check('…but not for a patient of hospital 9 (users id 9) — 404', r.status === 404, `${r.status}`);
r = await request(app).get('/r/wounds/1').set('authorization', nurse9);
check('hospital 9 cannot read hospital 4\'s wound records for that patient id', r.status === 200 && r.body.data.length === 0, `${r.status} ${r.body.data?.length}`);
r = await request(app).get('/r/wounds/1').set('authorization', nurse4);
check('hospital 4 reads its own', r.body.data?.length === 1);

const noCtx = (await pool.query('SELECT count(*)::int n FROM wound_tracking_records')).rows[0].n;
check('a raw query with NO tenant context sees ZERO rows (FORCE RLS holds for the owner)', noCtx === 0, `saw ${noCtx}`);

await request(app).post('/r/esg/entries').set('authorization', nurse9).send({ category: 'diesel_litre', quantity: 10, unit: 'l' });
r = await request(app).get('/r/esg/summary').set('authorization', nurse4);
check('ESG summary for hospital 4 does not include hospital 9\'s entry', r.body.data.length === 0);
r = await request(app).get('/r/esg/summary').set('authorization', tok({ id: 1, role: 'admin' }));
check('platform admin sees the platform ESG view (RLS bypass by app.is_platform_admin)', r.body.data.length === 1);

r = await request(app).get('/r/rwe/aggregate').set('authorization', nurse4);
const f = r.body.data.find((x) => x.gender === 'Female'); const m = r.body.data.find((x) => x.gender === 'Male');
check('RWE: real hospital-4 counts (Female 6), small cell (Male 2) suppressed, on a real ENUM column', r.status === 200 && f?.patientCount === 6 && m?.suppressed === true, JSON.stringify(r.body.data));
r = await request(app).get('/r/rwe/aggregate').set('authorization', tok({ id: 1, role: 'admin' }));
check('RWE: platform view counts every hospital (Female 7)', r.body.data.find((x) => x.gender === 'Female')?.patientCount === 7, JSON.stringify(r.body.data));
r = await request(app).get('/r/staffing/forecast').set('authorization', nurse4);
check('staffing forecast: hospital 4 samples only its own appointments (1 day, 2 visits)', r.status === 200 && r.body.data.samples === 1 && r.body.data.projectedPatients === 2, JSON.stringify(r.body.data));

r = await request(app).get('/r/esg/summary').set('authorization', tok({ id: 1, role: 'doctor' }));
check('doctor 1 (hospital_id 4) resolves through the doctors table to hospital 4', r.status === 200);
r = await request(app).get('/r/esg/summary').set('authorization', tok({ id: 2, role: 'doctor' }));
check('a doctor with no doctors row / no hospital is refused', r.status === 403, `${r.status}`);

await pool.query(`DROP TABLE IF EXISTS ${TABLES.join(',')}, appointments, patients, doctors, users CASCADE; DROP TYPE IF EXISTS g_enum`);
console.log(`\n${failed ? 'FAILED' : 'all checks passed'}`);
await pool.end?.();
process.exit(failed ? 1 : 0);
