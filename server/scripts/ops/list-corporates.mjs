// Read-only: lists the corporates table (id, name, email, status, tenant) — corporate login needs status Active or Pending.
// Run: node scripts/ssm-env-loader.mjs scripts/ops/list-corporates.mjs
import pool from '../../db/pgPool.js';

const p = pool.pool || pool.default || pool;
const r = await p.query('select * from corporates order by 1 limit 30');
const keep = ['id', 'companyName', 'company_name', 'name', 'email', 'status', 'tenantId', 'tenant_id'];
console.table(r.rows.map((o) => Object.fromEntries(Object.entries(o).filter(([k]) => keep.includes(k)))));
process.exit(0);
