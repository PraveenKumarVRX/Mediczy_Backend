#!/usr/bin/env node
/**
 * Removes the fabricated TPA data from the database.
 *
 * Surveyed on 2026-11-11: every row in the production TPA tables was invented.
 * Three memberships came from a demo seeder the service ran on a read (removed
 * in the commit before this one); the rest were left behind by
 * scripts/smoke-tpa-login.mjs run against the live database. No membership
 * belongs to a real person, none is linked to an account, and each carries a
 * policy number, coverage amount, used balance and insurer that do not exist.
 *
 * They are not harmless. Nothing distinguishes them from real records to the
 * screens that read them; the member-facing e-card renders whatever it finds,
 * with a QR code and a verification URL. The invented network hospitals are
 * worse: three carry the real brand names Apollo, Max and Fortis with invented
 * cashless eligibility and tariff data attached.
 *
 *   node scripts/ssm-env-loader.mjs scripts/purge-fabricated-tpa-members.mjs            # dump + report
 *   node scripts/ssm-env-loader.mjs scripts/purge-fabricated-tpa-members.mjs --apply    # delete
 *   ... --out=/path/to/dump.json
 *
 * Reports by default. The dump is always written before anything is deleted.
 *
 * Deliberately narrow: every row is named explicitly AND must carry the name
 * the invention is known by. A row that does not match is left alone and
 * reported, because the one mistake this script must not make is deleting
 * something that turned out to be real.
 */
import { QueryTypes } from 'sequelize';
import { writeFileSync } from 'node:fs';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';

/** tpa_members.member_id -> the employee_name that row must carry. */
const MEMBERS = {
  'MEM-001': 'Rajesh Kumar',
  'MEM-002': 'Priya Sharma',
  'MEM-003': 'Amit Patel',
  'MEM-ENR-SMOKE-1788720744110': 'Enrollment Smoke Member',
  'MEM-003-1788721204741': 'Enrollment Smoke Member',
  'MEM-003-1788722978504': 'Enrollment Smoke Member',
};

/**
 * A member id that appears on claims but has no tpa_members row of its own:
 * the smoke pass posted claims directly. Same verification, claim side.
 */
const CLAIM_ONLY_MEMBERS = { 'MEM-SMOKE': 'Smoke Test Member' };

/** tpa_network_hospitals.hospital_code -> the hospital_name that row must carry. */
const HOSPITALS = {
  'HOSP-APL-CHN': 'Apollo Hospital',
  'HOSP-MAX-DEL': 'Max Healthcare',
  'HOSP-FOR-BLR': 'Fortis Hospital',
  'HOSP-QA-NET': 'QA Network Hospital',
  'PROV-SMOKE-1788720744110': 'Smoke Network Hospital',
  'PROV-SMOKE-1788721204715': 'Smoke Network Hospital',
  'PROV-SMOKE-1788722978482': 'Smoke Network Hospital',
  'PROV-SMOKE-1788723299119': 'SMOKE Network Hospital',
};

/**
 * The provider-side and policy-side residue the same smoke pass left behind.
 * Each is keyed on a code that only the smoke pass ever minted, and verified
 * against the name that code must carry.
 */
const UNDERWRITING = {
  'UW-SMOKE-1788720744110': 'Mediqzy QA Corporate',
  'UW-SMOKE-1788721204715': 'Mediqzy QA Corporate',
  'UW-SMOKE-1788722978482': 'Mediqzy QA Corporate',
};

const CASHLESS_FORMS = {
  'FORM-SMOKE-1788720744110': 'Smoke Cashless Preauth Form',
  'FORM-SMOKE-1788721204715': 'Smoke Cashless Preauth Form',
  'FORM-SMOKE-1788722978482': 'Smoke Cashless Preauth Form',
};

/**
 * The demo seeder's policy numbers. Their rules (co-pay, room-rent caps,
 * non-payable percentages) outlive the invented members they were written for,
 * and a payable calculation would still apply them. Only removed once no
 * membership carries the policy number — see the check in main().
 */
const DEMO_POLICIES = ['POL-2026-001', 'POL-2026-002', 'POL-2026-003'];

/**
 * tpa_provider_contracts.provider_code -> the provider_name it must carry.
 * Listed separately from HOSPITALS because the contract, its SOC versions and
 * its blacklist entry outlive the network-hospital row: deleting the hospital
 * first leaves these behind, pointing at a provider that no longer exists.
 */
const PROVIDERS = {
  'PROV-SMOKE-1788720744110': 'Smoke Network Hospital',
  'PROV-SMOKE-1788721204715': 'Smoke Network Hospital',
  'PROV-SMOKE-1788722978482': 'Smoke Network Hospital',
};

const APPLY = process.argv.includes('--apply');
const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const OUT = arg('out') || `/tmp/tpa-fabricated-dump-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

const q = (sql, replacements) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
const inr = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

/**
 * Which tables carry a given reference, read from the catalogue rather than
 * hardcoded, so a table added since does not get silently skipped.
 */
const tablesWith = async (column) => {
  const rows = await q(
    `SELECT table_name || '' AS "t"
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name LIKE 'tpa%'
        AND column_name = :column`,
    { column }
  );
  return rows.map((r) => r.t || r[0]).filter(Boolean).sort();
};

/** Keeps only the rows whose name matches what the invention is known by. */
const verify = (rows, expected, idCol, nameCol, label, refused) => {
  const confirmed = [];
  for (const row of rows) {
    if (row[nameCol] === expected[row[idCol]]) confirmed.push(row);
    else refused.push(`${label} ${row[idCol]} is named "${row[nameCol]}", expected "${expected[row[idCol]]}"`);
  }
  return confirmed;
};

const main = async () => {
  const [{ db }] = await q('SELECT current_database() AS db');
  console.log(`database: ${db}\n`);
  const refused = [];

  // --- memberships ----------------------------------------------------------
  const memberIds = Object.keys(MEMBERS);
  const memberRows = await q(
    `SELECT member_id, tpa_id, employee_id, employee_name, corporate_name, policy_number,
            coverage_amount, used_amount, status, user_id, ecard_verification_code
       FROM tpa_members WHERE member_id = ANY(ARRAY[:memberIds]::text[])`,
    { memberIds }
  );
  const members = verify(memberRows, MEMBERS, 'member_id', 'employee_name', 'member', refused);

  // A membership someone has since linked to an account is one somebody
  // treated as real. Stop and let a human look at it.
  const linked = members.filter((row) => row.user_id !== null);
  if (linked.length) {
    console.error(`Refusing: ${linked.map((r) => r.member_id).join(', ')} now point at a user account.`);
    console.error('Someone has treated these as real. Unlink them first if they are not.');
    return 1;
  }

  // --- claims ---------------------------------------------------------------
  const claimOnlyIds = Object.keys(CLAIM_ONLY_MEMBERS);
  const claimOnlyRows = await q(
    `SELECT id, claim_number, member_id, employee_name, corporate_name, claimed_amount, status
       FROM tpa_claims WHERE member_id = ANY(ARRAY[:claimOnlyIds]::text[])`,
    { claimOnlyIds }
  );
  const claimOnly = verify(claimOnlyRows, CLAIM_ONLY_MEMBERS, 'member_id', 'employee_name', 'claim member', refused);

  const allMemberIds = [...members.map((m) => m.member_id), ...new Set(claimOnly.map((c) => c.member_id))];
  const claims = allMemberIds.length
    ? await q('SELECT * FROM tpa_claims WHERE member_id = ANY(ARRAY[:allMemberIds]::text[])', { allMemberIds })
    : [];
  const claimIds = claims.map((c) => c.id);

  // --- network hospitals ----------------------------------------------------
  const hospitalCodes = Object.keys(HOSPITALS);
  const hospitalRows = await q(
    `SELECT hospital_code, tpa_id, hospital_name, city, cashless_enabled
       FROM tpa_network_hospitals WHERE hospital_code = ANY(ARRAY[:hospitalCodes]::text[])`,
    { hospitalCodes }
  );
  const hospitals = verify(hospitalRows, HOSPITALS, 'hospital_code', 'hospital_name', 'hospital', refused);

  // --- underwriting, cashless forms, provider contracts, policy rules -------
  const uwNumbers = Object.keys(UNDERWRITING);
  const uwRows = await q(
    `SELECT case_number, corporate_name, policy_type, sum_insured, status
       FROM tpa_policy_underwriting_cases WHERE case_number = ANY(ARRAY[:uwNumbers]::text[])`,
    { uwNumbers }
  );
  const underwriting = verify(uwRows, UNDERWRITING, 'case_number', 'corporate_name', 'underwriting case', refused);

  const formCodes = Object.keys(CASHLESS_FORMS);
  const formRows = await q(
    `SELECT form_code, form_name, status FROM tpa_cashless_forms WHERE form_code = ANY(ARRAY[:formCodes]::text[])`,
    { formCodes }
  );
  const forms = verify(formRows, CASHLESS_FORMS, 'form_code', 'form_name', 'cashless form', refused);

  const providerCodes = Object.keys(PROVIDERS);
  const contractRows = await q(
    `SELECT provider_code, provider_name, contract_status
       FROM tpa_provider_contracts WHERE provider_code = ANY(ARRAY[:providerCodes]::text[])`,
    { providerCodes }
  );
  const contracts = verify(contractRows, PROVIDERS, 'provider_code', 'provider_name', 'provider contract', refused);
  // Confirmed codes: a contract that verified, plus any network-hospital row
  // of the same code still present. Either confirmation is enough, and both
  // survive the other's row having already been removed.
  const purgeProviderCodes = [...new Set([
    ...contracts.map((c) => c.provider_code),
    ...hospitals.map((h) => h.hospital_code),
  ])];

  // A policy rule goes only if no membership anywhere carries its policy
  // number — otherwise it belongs to somebody.
  const stillHeld = await q(
    `SELECT DISTINCT policy_number FROM tpa_members WHERE policy_number = ANY(ARRAY[:DEMO_POLICIES]::text[])`,
    { DEMO_POLICIES }
  );
  const heldNumbers = new Set(stillHeld.map((r) => r.policy_number));
  for (const number of DEMO_POLICIES) {
    if (heldNumbers.has(number)) refused.push(`policy rules for ${number} — a membership still carries that policy`);
  }
  const orphanPolicies = DEMO_POLICIES.filter((n) => !heldNumbers.has(n));
  const policyRules = orphanPolicies.length
    ? await q(
        `SELECT id, policy_number, rule_code, rule_type FROM tpa_policy_rules
          WHERE policy_number = ANY(ARRAY[:orphanPolicies]::text[])`,
        { orphanPolicies }
      )
    : [];

  // --- report ---------------------------------------------------------------
  for (const message of refused) console.log(`  ⚠️  ${message} — LEFT ALONE`);
  if (refused.length) console.log('');

  console.log(`memberships      ${members.length} of ${memberIds.length} named`);
  for (const row of members) {
    console.log(`  ${row.member_id}  ${row.employee_name}  "${row.corporate_name}"  ${row.policy_number}  cover ${inr(row.coverage_amount)}  used ${inr(row.used_amount)}`);
  }
  console.log(`\nclaims           ${claims.length} (${claimOnly.length} under a member id with no membership row)`);
  console.log(`network hospitals ${hospitals.length} of ${hospitalCodes.length} named`);
  for (const row of hospitals) {
    console.log(`  ${row.hospital_code.padEnd(28)} ${row.hospital_name} (${row.city})${row.cashless_enabled ? '  cashless' : ''}`);
  }

  console.log(`\nunderwriting      ${underwriting.length} of ${uwNumbers.length} named`);
  console.log(`cashless forms    ${forms.length} of ${formCodes.length} named`);
  console.log(`provider contracts ${contracts.length} of ${providerCodes.length} named`);
  console.log(`policy rules      ${policyRules.length} (for ${orphanPolicies.join(', ') || 'no orphaned policy'})`);
  for (const row of policyRules) console.log(`  ${row.policy_number}  ${row.rule_code} (${row.rule_type})`);

  const nothing = ![members, claims, hospitals, underwriting, forms, contracts, policyRules, purgeProviderCodes].some((set) => set.length);
  if (nothing) {
    console.log('\nNothing to remove.');
    return 0;
  }

  // --- everything that hangs off them --------------------------------------
  const memberTables = (await tablesWith('member_id')).filter((t) => t !== 'tpa_members');
  const claimTables = (await tablesWith('claim_id')).filter((t) => t !== 'tpa_claims');
  const dump = {
    database: db, takenAt: new Date().toISOString(),
    members, hospitals, claims, underwriting, forms, contracts, policyRules, related: {},
  };

  // A table can carry both references (tpa_provider_cases does), so rows are
  // merged by primary key rather than concatenated — otherwise the report
  // double-counts what is actually one row.
  const collect = (table, rows) => {
    if (!rows.length) return;
    const seen = new Map((dump.related[table] || []).map((r) => [r.id ?? JSON.stringify(r), r]));
    for (const row of rows) seen.set(row.id ?? JSON.stringify(row), row);
    dump.related[table] = [...seen.values()];
  };

  for (const table of memberTables) {
    if (!allMemberIds.length) break;
    collect(table, await q(`SELECT * FROM ${table} WHERE member_id = ANY(ARRAY[:allMemberIds]::text[])`, { allMemberIds }));
  }
  for (const table of claimTables) {
    if (!claimIds.length) break;
    collect(table, await q(`SELECT * FROM ${table} WHERE claim_id = ANY(ARRAY[:claimIds]::bigint[])`, { claimIds }));
  }

  console.log('\nrelated rows:');
  const counts = Object.entries(dump.related).sort();
  if (!counts.length) console.log('  (none)');
  for (const [table, rows] of counts) console.log(`  ${table.padEnd(34)} ${rows.length}`);

  writeFileSync(OUT, JSON.stringify(dump, null, 2));
  console.log(`\ndump written: ${OUT}`);

  if (!APPLY) {
    console.log('\nNothing deleted. Re-run with --apply to delete the rows above.');
    return 0;
  }

  // --- delete, children first, all or nothing ------------------------------
  const transaction = await sequelize.transaction();
  const deleted = {};
  try {
    const exec = async (sql, replacements) => {
      const [, meta] = await sequelize.query(sql, { replacements, transaction });
      return meta?.rowCount ?? 0;
    };

    for (const table of claimTables) {
      if (!claimIds.length) break;
      const n = await exec(`DELETE FROM ${table} WHERE claim_id = ANY(ARRAY[:claimIds]::bigint[])`, { claimIds });
      if (n) deleted[table] = (deleted[table] || 0) + n;
    }
    for (const table of memberTables) {
      if (!allMemberIds.length) break;
      const n = await exec(`DELETE FROM ${table} WHERE member_id = ANY(ARRAY[:allMemberIds]::text[])`, { allMemberIds });
      if (n) deleted[table] = (deleted[table] || 0) + n;
    }
    if (members.length) {
      deleted.tpa_members = await exec(
        'DELETE FROM tpa_members WHERE member_id = ANY(ARRAY[:ids]::text[])',
        { ids: members.map((m) => m.member_id) }
      );
    }
    if (hospitals.length) {
      deleted.tpa_network_hospitals = await exec(
        'DELETE FROM tpa_network_hospitals WHERE hospital_code = ANY(ARRAY[:codes]::text[])',
        { codes: hospitals.map((h) => h.hospital_code) }
      );
    }
    // Everything keyed to a confirmed provider code: contracts, their SOC
    // versions and their blacklist entries.
    for (const table of purgeProviderCodes.length ? await tablesWith('provider_code') : []) {
      if (table === 'tpa_network_hospitals') continue;
      const n = await exec(
        `DELETE FROM ${table} WHERE provider_code = ANY(ARRAY[:codes]::text[])`,
        { codes: purgeProviderCodes }
      );
      if (n) deleted[table] = (deleted[table] || 0) + n;
    }
    if (underwriting.length) {
      deleted.tpa_policy_underwriting_cases = await exec(
        'DELETE FROM tpa_policy_underwriting_cases WHERE case_number = ANY(ARRAY[:nums]::text[])',
        { nums: underwriting.map((u) => u.case_number) }
      );
    }
    if (forms.length) {
      deleted.tpa_cashless_forms = await exec(
        'DELETE FROM tpa_cashless_forms WHERE form_code = ANY(ARRAY[:codes]::text[])',
        { codes: forms.map((f) => f.form_code) }
      );
    }
    if (policyRules.length) {
      deleted.tpa_policy_rules = await exec(
        'DELETE FROM tpa_policy_rules WHERE id = ANY(ARRAY[:ids]::bigint[])',
        { ids: policyRules.map((r) => r.id) }
      );
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    console.error('\nRolled back, nothing deleted:', error.message);
    return 1;
  }

  console.log('\ndeleted:');
  for (const [table, n] of Object.entries(deleted).sort()) console.log(`  ${table.padEnd(34)} ${n}`);

  console.log('\nremaining:');
  for (const table of ['tpa_members', 'tpa_claims', 'tpa_member_enrollments', 'tpa_network_hospitals',
    'tpa_preauth_requests', 'tpa_cashless_requests', 'tpa_provider_cases', 'tpa_provider_contracts',
    'tpa_provider_soc_versions', 'tpa_provider_blacklist', 'tpa_cashless_forms', 'tpa_policy_rules',
    'tpa_policy_underwriting_cases']) {
    const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM ${table}`);
    console.log(`  ${table.padEnd(34)} ${n}`);
  }
  return 0;
};

main()
  .then(async (code) => { await sequelize.close().catch(() => {}); process.exit(code); })
  .catch(async (error) => { console.error(error); await sequelize.close().catch(() => {}); process.exit(1); });
