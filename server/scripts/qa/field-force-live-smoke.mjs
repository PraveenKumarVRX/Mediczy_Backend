/** Read-only live smoke. Run through ssm-env-loader; tokens never leave this process. */
import pool from '../../db/pgPool.js';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../../config/auth.config.js';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const base = process.env.FIELD_SMOKE_BASE || 'https://app.mediqzy.com/api';
const results = [];
try {
  const actor = async name => {
    const { rows } = await pool.query(`SELECT id,metadata FROM users WHERE LOWER(TRIM(CONCAT_WS(' ',"firstName","lastName")))=$1 AND status='active'`, [name]);
    assert.equal(rows.length, 1, `Expected one designated ${name} QA account`);
    return rows[0];
  };
  const field = await actor('field tester');
  const manager = await actor('crm admin');
  const token = (id, claims) => jwt.sign({ id, tokenType:'access', ...claims }, JWT_CONFIG.SECRET, { expiresIn:'5m' });
  const fieldToken = token(field.id, { isTeam:true, role:'team', userType:'team' });
  const managerToken = token(manager.id, { isCRM:true, userType:'crm' });
  async function call(path, auth, expected, method='GET', body) {
    const response = await fetch(base+path, { method, headers:{'content-type':'application/json',...(auth?{authorization:`Bearer ${auth}`}:{})}, body:body?JSON.stringify(body):undefined, signal:AbortSignal.timeout(30000) });
    const json = await response.json().catch(()=>null);
    const passed = response.status===expected;
    results.push({method,path,status:response.status,expected,passed});
    assert(passed,`${method} ${path}: expected ${expected}, received ${response.status}`);
    return json;
  }
  for(const path of ['/field/attendance/today','/field/attendance/history?month=2026-02','/field/visits','/field/tour-plans','/field/leads?status=contacted','/field/expenses','/field/my/targets','/field/notifications','/field/daily-report/today']) await call(path,fieldToken,200);
  for(const path of ['/crm/field-force/daily-reports','/crm/field-force/summary','/crm/field-force/leads?status=contacted','/crm/field-force/approvals']) await call(path,managerToken,200);
  // These bodies must fail before writes, even if an ID happens to exist.
  await call('/crm/field-force/leads/0/convert',managerToken,400,'PATCH',{contract_value:-1});
  await call('/crm/field-force/expenses/0/approve',managerToken,400,'PATCH',{approved_amount:-1});
  await call('/crm/field-force/targets/reallocate',managerToken,400,'POST',{from_user_id:99998,to_user_id:99998,transfer_qty:1});
  await call('/field/visits',fieldToken,400,'POST',{entity_name:'Synthetic validation only',purpose:'other',planned_at:'2000-01-01'});
  for(const path of ['/field/notifications','/field/attendance/history','/crm/field-force/daily-reports']) await call(path,null,401);
  const evidence={at:new Date().toISOString(),base,passed:true,checks:results.length,mode:'Read-only QA identities; short-lived server-signed tokens; invalid requests rejected before writes; login not tested',results};
  if(process.env.FIELD_SMOKE_EVIDENCE)writeFileSync(process.env.FIELD_SMOKE_EVIDENCE,JSON.stringify(evidence,null,2),{mode:0o600});
  console.log(JSON.stringify(evidence));
} catch(error) {
  const evidence={at:new Date().toISOString(),base,passed:false,error:error.message,results};
  if(process.env.FIELD_SMOKE_EVIDENCE)writeFileSync(process.env.FIELD_SMOKE_EVIDENCE,JSON.stringify(evidence,null,2),{mode:0o600});
  console.log(JSON.stringify(evidence));process.exitCode=1;
} finally { await pool.end(); }
