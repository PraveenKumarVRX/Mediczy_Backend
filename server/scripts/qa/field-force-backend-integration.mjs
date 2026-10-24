/** Run as the local postgres OS user. Uses a disposable local database only. */
import { Client, Pool } from 'pg';
import express from 'express';
import request from 'supertest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const name = `field_force_qa_${Date.now()}`;
const local = { host: '/var/run/postgresql', user: 'postgres' };
const admin = new Client({ ...local, database: 'postgres' });
await admin.connect();
let pool;
const checks = [];
try {
  await admin.query(`CREATE DATABASE "${name}"`);
  pool = new Pool({ ...local, database: name });
  // Production column metadata is read-only and contains no application records.
  const schema = JSON.parse(readFileSync(process.argv[2], 'utf8').split('\n').find(line => line.startsWith('{')));
  assert.equal(schema.passed, true);
  for (const table of [...new Set(schema.columns.map(c => c.table_name))]) {
    const cols = schema.columns.filter(c => c.table_name === table).map(c => {
      let type = c.data_type;
      if (c.column_name === 'id') return 'id BIGSERIAL PRIMARY KEY';
      if (type === 'USER-DEFINED') type = 'text';
      if (type === 'ARRAY') type = 'text[]';
      if (table === 'field_expense_claims' && c.column_name === 'claim_month') type = 'varchar(7)';
      let defaults = '';
      if (c.column_name === 'status' && ['field_tour_plans','field_expense_claims'].includes(table)) defaults = " DEFAULT 'draft'";
      if (c.column_name === 'created_at') defaults = ' DEFAULT NOW()';
      return `"${c.column_name}" ${type}${defaults}`;
    });
    await pool.query(`CREATE TABLE "${table}" (${cols.join(',')})`);
  }
  await pool.query(`CREATE TABLE field_attendance(id BIGSERIAL PRIMARY KEY,user_id INTEGER,date DATE,clock_in_at TIMESTAMPTZ,clock_out_at TIMESTAMPTZ);
    ALTER TABLE field_tour_plans ADD UNIQUE(user_id,month);
    ALTER TABLE daily_field_reports ADD UNIQUE(user_id,report_date);
    ALTER TABLE field_targets ADD UNIQUE(user_id,month);
    INSERT INTO users(id,tenant_id,"isTeam",metadata) VALUES(7,11,true,'{"permissions":["Field Force"]}'),(9,11,true,'{"permissions":["Field Force"]}'),(10,12,true,'{"permissions":["Field Force"]}');`);
  globalThis.__fieldQaPool = pool;
  const allow = (req, res, next) => { req.user = { id: 7, tenantId: 11 }; req.crmUser = { id: 8, tenantId: 11 }; next(); };
  globalThis.__fieldQaAllow = allow;
  async function load(relative) {
    const url = new URL(relative, import.meta.url);
    let source = readFileSync(url, 'utf8');
    source = source.replace(/import (sharedPool|pool) from '\.\.\/db\/pgPool.js';/, 'const $1 = globalThis.__fieldQaPool;')
      .replace(/import \{ authTeam, requirePermission \} from '[^']+';/, 'const authTeam=globalThis.__fieldQaAllow; const requirePermission=()=>authTeam;')
      .replace(/import \{ authCRM, requireCRMCapability \} from '[^']+';/, 'const authCRM=globalThis.__fieldQaAllow; const requireCRMCapability=()=>authCRM;')
      .replace(/import llmProvider from '[^']+';/, 'const llmProvider={};')
      .replace(/import HealthCamp from '[^']+';/, 'const HealthCamp={};')
      .replace("from 'express'", `from '${new URL('../../node_modules/express/index.js', import.meta.url).href}'`);
    return (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).default;
  }
  const app = express(); app.use(express.json());
  app.use('/field', await load('../../routes/field-force.route.js'));
  app.use('/manager', await load('../../routes/crm-field-force.route.js'));
  const check = async (label, fn) => { await fn(); checks.push(label); };
  await check('approved tour plan protected', async () => {
    await pool.query("INSERT INTO field_tour_plans(user_id,tenant_id,month,status,notes) VALUES(7,11,'2026-10-01','approved','original')");
    assert.equal((await request(app).post('/field/tour-plans').send({ month:'2026-10-01',notes:'overwrite' })).status,409);
    assert.equal((await pool.query('SELECT notes FROM field_tour_plans')).rows[0].notes,'original');
  });
  await check('expense date fits production month and approval writes one notification', async () => {
    const created = await request(app).post('/field/expenses').send({ claim_date:'2026-10-24',claim_type:'travel',total_amount:250 });
    assert.equal(created.status,201); assert.equal(created.body.claim_month,'2026-10');
    const id=created.body.id; await pool.query("UPDATE field_expense_claims SET status='submitted' WHERE id=$1",[id]);
    assert.equal((await request(app).patch(`/manager/expenses/${id}/approve`).send({approved_amount:251})).status,404);
    assert.equal((await request(app).patch(`/manager/expenses/${id}/approve`).send({approved_amount:200})).status,200);
    assert.equal((await request(app).patch(`/manager/expenses/${id}/approve`).send({approved_amount:200})).status,404);
    assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM field_notifications')).rows[0].n),1);
  });
  await check('tour decision scoped to tenant and notification rolls back on failure',async()=>{
    const row=(await pool.query("INSERT INTO field_tour_plans(user_id,tenant_id,month,status) VALUES(7,12,'2026-11-01','submitted') RETURNING id")).rows[0];
    assert.equal((await request(app).patch(`/manager/approvals/tour-plans/${row.id}/approve`).send({})).status,404);
    await pool.query('UPDATE field_tour_plans SET tenant_id=11 WHERE id=$1',[row.id]);
    await pool.query("ALTER TABLE field_notifications ADD CONSTRAINT fail_notification CHECK(type <> 'approval') NOT VALID");
    assert.equal((await request(app).patch(`/manager/approvals/tour-plans/${row.id}/approve`).send({})).status,500);
    assert.equal((await pool.query('SELECT status FROM field_tour_plans WHERE id=$1',[row.id])).rows[0].status,'submitted');
    await pool.query('ALTER TABLE field_notifications DROP CONSTRAINT fail_notification');
    assert.equal((await request(app).patch(`/manager/approvals/tour-plans/${row.id}/approve`).send({})).status,200);
  });
  await check('quota preserves total and rejects invalid/insufficient transfer',async()=>{
    await pool.query("INSERT INTO field_targets(user_id,tenant_id,month,visits_target) VALUES(7,11,TO_CHAR(NOW(),'YYYY-MM'),120)");
    for(const body of [{from_user_id:7,to_user_id:99999,transfer_qty:1},{from_user_id:7,to_user_id:10,transfer_qty:1}])assert.equal((await request(app).post('/manager/targets/reallocate').send(body)).status,400);
    assert.equal((await request(app).post('/manager/targets/reallocate').send({from_user_id:7,to_user_id:9,transfer_qty:121})).status,409);
    assert.equal((await request(app).post('/manager/targets/reallocate').send({from_user_id:7,to_user_id:9,transfer_qty:5})).status,200);
    const rows=(await pool.query('SELECT visits_target FROM field_targets ORDER BY user_id')).rows;
    assert.deepEqual(rows.map(r=>r.visits_target),[115,5]);
  });
  await check('reports use completed visits and retry preserves row identity',async()=>{
    await pool.query("INSERT INTO field_visits(user_id,tenant_id,entity_name,status,planned_at,check_out_at) VALUES(7,11,'Synthetic','completed',NOW(),NOW())");
    const a=await request(app).post('/field/daily-report').send({completed_visits:999,summary:'Synthetic report'});
    assert.equal(a.status,201); assert.equal(a.body.completed_visits,1); assert.equal(a.body.key_achievements,'Synthetic report');
    const b=await request(app).post('/field/daily-report').send({completed_visits:999});
    assert.equal(b.status,201); assert.equal(b.body.id,a.body.id);
    assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM daily_field_reports')).rows[0].n),1);
    assert.equal((await request(app).get('/manager/daily-reports?exec_id=7')).body.length,1);
  });
  await check('February history boundary executes on PostgreSQL',async()=>assert.equal((await request(app).get('/field/attendance/history?month=2026-02')).status,200));
  await check('lead stage response and filtered list agree',async()=>{
    const {rows:[lead]}=await pool.query("INSERT INTO field_leads(user_id,tenant_id,status,pipeline_stage) VALUES(7,11,'new','new') RETURNING id");
    const changed=await request(app).patch(`/manager/leads/${lead.id}/stage`).send({stage:'contacted'});
    assert.equal(changed.status,200); assert.equal(changed.body.status,'contacted');
    assert.equal((await request(app).get('/field/leads?status=contacted')).body[0].status,'contacted');
  });
  console.log(JSON.stringify({passed:true,checks:checks.length,results:checks,productionWrites:0}));
} finally {
  delete globalThis.__fieldQaPool; delete globalThis.__fieldQaAllow;
  await pool?.end(); await admin.query(`DROP DATABASE IF EXISTS "${name}"`); await admin.end();
}
