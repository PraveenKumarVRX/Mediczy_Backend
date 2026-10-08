#!/usr/bin/env node
/**
 * Demo chain for the Occupational Health Clinic (OHC):
 *
 *   operator (hospital or clinic)  →  outreach clinic  →  OHC  →  one company
 *     + an OHC doctor and an OHC staff login for the OHC
 *
 *   node scripts/ssm-env-loader.mjs scripts/ops/seed-ohc-demo.mjs                           # dry run: checks and prints the plan
 *   node scripts/ssm-env-loader.mjs scripts/ops/seed-ohc-demo.mjs --apply                   # create what is missing
 *   node scripts/ssm-env-loader.mjs scripts/ops/seed-ohc-demo.mjs --apply --no-force-change # demo convenience: keep the printed password
 *   node scripts/ssm-env-loader.mjs scripts/ops/seed-ohc-demo.mjs --remove                  # end the demo contract and deactivate the demo logins
 *
 * Defaults (the lead's choice, 2026-10-08): operator SmartHealth Clinic (KT5EUW), company "My SmartHealth" (CMSHT1, 4 employees).
 * Override with --operator <uid> --corporate <uid>. Needs migration 20261008000000-care-units.sql.
 *
 * Idempotent: units and users that already exist are reused, never duplicated. Passwords are generated at run time, printed ONCE to
 * this terminal and stored only as hashes; nothing is written to a file. Existing demo users keep their password.
 */
import pool from '../../db/pgPool.js';
import { createCareUnitService } from '../../services/care-units/care-unit.service.js';

const db = pool.pool || pool.default || pool;
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const flag = (n) => process.argv.includes(n);
const APPLY = flag('--apply');
const REMOVE = flag('--remove');
const OPERATOR = arg('--operator', 'KT5EUW');
const CORPORATE = arg('--corporate', 'CMSHT1');
const NAMES = { outreach: 'SmartHealth Outreach (Demo)', ohc: 'My SmartHealth OHC (Demo)' };
const USERS = [
  { role: 'ohc_doctor', firstName: 'Demo', lastName: 'OHC Doctor', email: 'demo.ohc.doctor@mediqzy.com', registrationNumber: 'DEMO-REG-0001' },
  { role: 'ohc_staff', firstName: 'Demo', lastName: 'OHC Nurse', email: 'demo.ohc.staff@mediqzy.com' },
];
const q = async (s, a = []) => (await db.query(s, a)).rows;
const svc = createCareUnitService({ pool: db });
const op = { type: 'operator', ownerUid: OPERATOR, ref: `operator:${OPERATOR}:seed` };
const corp = { type: 'corporate', corporateUid: CORPORATE, ref: `corporate:${CORPORATE}:seed` };

try {
  const dbName = (await q('SELECT current_database() d'))[0].d;
  console.log(`database : ${dbName}\nmode     : ${REMOVE ? 'REMOVE' : APPLY ? 'APPLY' : 'DRY RUN'}\noperator : ${OPERATOR}   company : ${CORPORATE}\n`);

  if (!(await q(`SELECT to_regclass('public.ohc_access_log') r`))[0].r || !(await q(`SELECT 1 FROM information_schema.columns WHERE table_name = 'hospital_branch' AND column_name = 'unit_type'`)).length) {
    console.log('The care-units migration (20261008000000) has not been applied. Apply it first.'); process.exit(1);
  }
  const owner = (await q(`SELECT r.kind, t.name FROM entity_registry r JOIN tenants t ON t.unique_id = r.uid WHERE r.uid = $1`, [OPERATOR]))[0];
  if (!owner || !['hospital', 'clinic'].includes(owner.kind)) throw new Error(`${OPERATOR} is not a hospital or clinic tenant`);
  const company = (await q(`SELECT "companyName", status FROM corporates WHERE unique_id = $1`, [CORPORATE]))[0];
  if (!company) throw new Error(`${CORPORATE} is not a company record in the corporates table`);
  if (!/^active$/i.test(company.status)) throw new Error(`${company.companyName} is ${company.status}, not active`);
  const empCount = (await q(`SELECT count(*)::int n FROM corporate_employees WHERE corporate_uid = $1 AND "isActive"`, [CORPORATE]))[0].n;
  console.log(`operator ${owner.name} (${owner.kind}); company ${company.companyName} (${empCount} active employees)\n`);

  const existing = async (name) => (await q(`SELECT unique_id, contract_status, is_active FROM hospital_branch WHERE owner_uid = $1 AND name = $2`, [OPERATOR, name]))[0] || null;
  const outreach = await existing(NAMES.outreach);
  const ohc = await existing(NAMES.ohc);

  if (REMOVE) {
    if (!ohc) { console.log('No demo OHC found; nothing to remove.'); process.exit(0); }
    if (!APPLY) { console.log(`Would end the demo contract of ${NAMES.ohc} (${ohc.unique_id}) and deactivate its staff and the demo logins. Re-run with --remove --apply.`); process.exit(0); }
    await svc.endContract(op, ohc.unique_id, { reason: 'Demo removed by the seed script' });
    await db.query(`UPDATE users SET status = 'inactive' WHERE lower(email) = ANY($1::text[]) AND role IN ('ohc_doctor','ohc_staff') AND organization_uid = $2`, [USERS.map((u) => u.email), OPERATOR]);
    console.log('Demo contract ended and demo logins deactivated.'); process.exit(0);
  }

  console.log('plan:');
  console.log(`  outreach clinic  "${NAMES.outreach}"  ${outreach ? `exists (${outreach.unique_id})` : 'will be created (weekly visits)'}`);
  console.log(`  OHC              "${NAMES.ohc}"  ${ohc ? `exists (${ohc.unique_id}, contract ${ohc.contract_status})` : `will be created for ${company.companyName}`}`);
  const have = await q(`SELECT lower(email) e FROM users WHERE lower(email) = ANY($1::text[])`, [USERS.map((u) => u.email)]);
  for (const u of USERS) console.log(`  ${u.role.padEnd(10)} ${u.email}  ${have.some((h) => h.e === u.email) ? 'exists (password unchanged)' : 'will be created'}`);
  if (!APPLY) { console.log('\nDry run: nothing written. Re-run with --apply.'); process.exit(0); }

  let outUid = outreach?.unique_id;
  if (!outUid) outUid = (await svc.createUnit(op, { type: 'outreach_clinic', name: NAMES.outreach, visitPattern: 'weekly', city: 'Chennai', services: ['Community screening'] })).body.unit.uid;
  let ohcUid = ohc?.unique_id;
  if (!ohcUid) {
    ohcUid = (await svc.createUnit(op, {
      type: 'ohc', name: NAMES.ohc, parentUid: outUid, corporateUid: CORPORATE, initiatedBy: 'corporate', contractRef: 'DEMO-OHC-001',
      services: ['Pre-employment medical examination', 'Periodic medical examination', 'Fitness certificates', 'First aid and emergency response'],
    })).body.unit.uid;
  }
  if ((await existing(NAMES.ohc)).contract_status === 'proposed') await svc.acceptContract(corp, ohcUid);

  const printed = [];
  for (const u of USERS) {
    if (have.some((h) => h.e === u.email)) continue;
    const r = await svc.createStaff(op, ohcUid, { firstName: u.firstName, lastName: u.lastName, email: u.email, role: u.role, registrationNumber: u.registrationNumber });
    if (flag('--no-force-change')) await db.query(`UPDATE users SET metadata = metadata - 'mustChangePassword' WHERE unique_id = $1`, [r.body.staff.uid]);
    printed.push({ role: u.role, email: u.email, password: r.body.tempPassword });
  }
  console.log(`\n✅ outreach clinic ${outUid}, OHC ${ohcUid} (contract active)`);
  if (printed.length) {
    console.log(`\nSign in at /ohc/login — shown ONCE, not stored anywhere${flag('--no-force-change') ? '' : ' (a password change is required at first sign-in)'}:`);
    for (const p of printed) console.log(`  ${p.role.padEnd(10)} ${p.email}   ${p.password}`);
  } else console.log('\nBoth demo logins already existed; their passwords are unchanged.');
  console.log(`\nThe company sees this OHC at /corporate/ohc; the operator manages it under Branches, Outreach & OHC.`);
} catch (e) {
  console.log(`\n❌ ${e.message}`); process.exitCode = 1;
} finally { process.exit(process.exitCode || 0); }
