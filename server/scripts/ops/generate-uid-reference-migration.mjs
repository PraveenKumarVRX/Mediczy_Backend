#!/usr/bin/env node
/**
 * Generate the migration that adds a uid twin to every integer entity-reference column whose TARGET
 * can be established from evidence. Read-only; writes a SQL file and a manifest.
 *
 *   node scripts/ssm-env-loader.mjs scripts/ops/generate-uid-reference-migration.mjs
 *
 * A column's name is NOT evidence. `tenant_id` means tenants.id in most tables but labs.id in imaging,
 * and 30 columns named tenant_id/hospital_id hold values from another id-space. A target is chosen
 * only when:
 *   1. a declared foreign key names it; or
 *   2. the column's name carries a convention that is corroborated by the code (three resolveTenantId
 *      implementations agree that tenant_id / organization_id / hospital_id mean tenants.id) AND every
 *      distinct value in the column exists in that target; or
 *   3. (imaging family only, documented in utils/tenant-identity.js) tenant_id holds a lab account id:
 *      every value exists in labs but not in tenants.
 * Everything else is listed with the reason and left alone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from '../../db/pgPool.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const db = pool.pool || pool.default || pool;
const q = async (s, a = []) => (await db.query(s, a)).rows;
await db.query("SET statement_timeout = '60s'");

const FAMILY = /(^|_)(tenant|organization|organisation|org|hospital|corporate|tpa|lab|pharmacy|clinic|broker|insurer|ambulance|homecare|aggregator)_id$/;
const CONVENTION = {
  tenant_id: 'tenants', owned_by_tenant_id: 'tenants', hospital_id: 'tenants', organization_id: 'tenants', org_id: 'tenants',
  corporate_id: 'corporates', tpa_id: 'tpas', lab_id: 'labs', clinic_id: 'provider_clinics', broker_id: 'insurance_brokers',
  insurer_id: 'insurance_companies', ambulance_id: 'ambulances', homecare_id: 'homecare_providers', pharmacy_id: 'pharmacies',
  aggregator_id: 'insurance_brokers',   // corporates.aggregator_id has a declared FK to insurance_brokers
};
const IMAGING = /^(imaging_|dicom_|hg_|ris_)/;
const BIG = 200_000;                       // do not rewrite a table this large inside a migration
const SKIP_COLUMNS = new Set(['users.organization_id']);   // organization_uid + its trigger cover it by organisation KIND

const ruled = new Map((await q('SELECT table_name, column_name FROM entity_uid_rules')).map((r) => [r.table_name, r.column_name]));
const idSpaces = [...ruled.keys()].filter((t) => !['users', 'patients', 'doctors', 'nurses', 'doctor_assistants', 'team_members', 'corporate_employees'].includes(t));

const fks = new Map();
for (const r of await q(`SELECT conrelid::regclass::text AS tbl, a.attname AS col, confrelid::regclass::text AS target
    FROM pg_constraint k JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY (k.conkey)
   WHERE k.contype = 'f' AND array_length(k.conkey, 1) = 1`)) fks.set(`${r.tbl}.${r.col}`, r.target);

const existing = new Set((await q('SELECT table_name, int_col FROM entity_uid_references').catch(() => [])).map((r) => `${r.table_name}.${r.int_col}`));
const cols = (await q(`
  SELECT c.table_name, c.column_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
   WHERE c.table_schema = 'public' AND c.data_type IN ('integer', 'bigint', 'smallint')
     AND c.table_name !~ '^(backup_|_probe|pg_|entity_)' ORDER BY 1, 2`)).filter((c) => FAMILY.test(c.column_name));

const idSets = {};
const targetCol = (t) => (t === 'insurance_brokers' ? 'broker_uid' : 'unique_id');
const decided = [];
const left = [];

for (const c of cols) {
  const { table_name: t, column_name: col } = c;
  const key = `${t}.${col}`;
  if (!(await q(`SELECT 1 FROM ${JSON.stringify(t)} LIMIT 1`)).length) continue;           // empty table: nothing to migrate
  const stats = (await q(`SELECT count(*) AS rows, count(${JSON.stringify(col)}) AS nn FROM ${JSON.stringify(t)}`))[0];
  if (Number(stats.nn) === 0) continue;                                                     // never set
  if (existing.has(key)) continue;                                                          // already twinned
  {
    // Judged from the schema: a twin created by an earlier migration (corporates.tenant_uid) is not in
    // entity_uid_references yet, but its uid column exists and already has a foreign key to the registry.
    const twinCol = col.replace(/_id$/, '_uid');
    const already = (await q(`SELECT 1 FROM pg_constraint k JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY (k.conkey)
                               WHERE k.conrelid = $1::regclass AND k.contype = 'f' AND k.confrelid = 'entity_registry'::regclass AND a.attname = $2`, [t, twinCol])).length;
    if (already) continue;
  }
  if (SKIP_COLUMNS.has(key)) { left.push({ key, why: 'covered by users.organization_uid and its guard trigger', rows: Number(stats.rows) }); continue; }
  if (Number(stats.rows) > BIG) { left.push({ key, why: `${stats.rows} rows: too large to rewrite in a migration (already dual-keyed for imaging)`, rows: Number(stats.rows) }); continue; }

  const vals = (await q(`SELECT DISTINCT ${JSON.stringify(col)} AS v FROM ${JSON.stringify(t)} WHERE ${JSON.stringify(col)} IS NOT NULL`)).map((r) => Number(r.v));
  const fits = async (space) => {
    if (!idSets[space]) idSets[space] = new Set((await q(`SELECT id FROM ${JSON.stringify(space)}`)).map((r) => Number(r.id)));
    return vals.every((v) => idSets[space].has(v));
  };

  let target = null; let why = ''; let uidCol = col.replace(/_id$/, '_uid');
  const fk = fks.get(key);
  if (fk) {
    if (!ruled.has(fk)) { left.push({ key, why: `FK target ${fk} is not under the uid rule`, rows: Number(stats.rows) }); continue; }
    target = fk; why = `declared FK -> ${fk}`;
  } else if (CONVENTION[col] || /_tenant_id$/.test(col)) {
    // `<something>_tenant_id` (corporate_tenant_id, partner_tenant_id, owned_by_tenant_id) names a tenants row.
    const conv = CONVENTION[col] || 'tenants';
    if (await fits(conv)) { target = conv; why = `convention ${col} -> ${conv}, all ${vals.length} distinct value(s) exist there`; }
    else if (col === 'tenant_id' && IMAGING.test(t) && await fits('labs') && !(await fits('tenants'))) {
      target = 'labs'; uidCol = 'lab_uid'; why = 'imaging family: tenant_id is a LAB account id (utils/tenant-identity.js); values exist in labs, not in tenants';
    } else if (col === 'tenant_id' && IMAGING.test(t) && await fits('labs')) {
      target = 'labs'; uidCol = 'lab_uid'; why = 'imaging family: tenant_id is a LAB account id; values also exist in tenants (small integers), but the documented imaging semantic is labs';
    } else {
      const inSpaces = [];
      for (const s of idSpaces) if (await fits(s)) inSpaces.push(s);
      left.push({ key, why: `${col} suggests ${conv} but the values do not all exist there (they fit: ${inSpaces.join(', ') || 'no single table'})`, rows: Number(stats.rows) });
      continue;
    }
  } else { left.push({ key, why: 'no FK and no convention for this name', rows: Number(stats.rows) }); continue; }

  const clash = (await q(`SELECT data_type FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`, [t, uidCol]))[0];
  if (clash && clash.data_type !== 'text') { left.push({ key, why: `${uidCol} already exists as ${clash.data_type}`, rows: Number(stats.rows) }); continue; }
  decided.push({ table: t, int: col, uid: uidCol, target, targetCol: targetCol(target), rows: Number(stats.rows), why, fk: !!fk });
}

const header = `-- =============================================================================
-- ENTITY UID REFERENCE TWINS  (2026-10-05)   GENERATED by scripts/ops/generate-uid-reference-migration.mjs
--
-- Adds a uid twin next to ${decided.length} integer entity-reference columns whose target was established
-- from evidence (a declared foreign key, or a convention corroborated by the data; see the generator).
-- The integer keeps working and nothing reads the twin yet: this is the EXPAND step. What changes is
-- that a write where the integer and the uid disagree, or where a uid belongs to a different table,
-- is refused, so the numeric id can never again point somewhere the uid does not.
--
-- ${left.length} populated columns were deliberately NOT twinned; they are listed in
-- docs/architecture/ENTITY_REFERENCE_AUDIT.md with the reason.
-- Idempotent. Run with scripts/ops/apply-migration-checked.mjs.
-- =============================================================================

-- Every twin, recorded, so the verifier can check them all rather than a hard-coded list.
CREATE TABLE IF NOT EXISTS entity_uid_references (
  table_name text NOT NULL,
  int_col    text NOT NULL,
  uid_col    text NOT NULL,
  target     text NOT NULL,
  target_col text NOT NULL DEFAULT 'unique_id',
  attached_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, int_col)
);

-- attach_uid_reference, redefined to (a) record each twin and (b) keep constraint names within
-- Postgres's 63-character limit. An over-long name is truncated silently on creation, so the
-- existence check on the untruncated name never matches and a re-run fails.
CREATE OR REPLACE FUNCTION attach_uid_reference(
  p_table text, p_int_col text, p_uid_col text, p_target text, p_target_col text DEFAULT 'unique_id'
) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE
  v_filled bigint;
  v_fk     text := left('fk_' || p_table || '_' || p_uid_col, 55) || '_' || substr(md5(p_table || '.' || p_uid_col), 1, 7);
  v_idx    text := left('idx_' || p_table || '_' || p_uid_col, 55) || '_' || substr(md5(p_table || '.' || p_uid_col), 1, 7);
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_uid_ref_' || p_uid_col, p_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS %I text', p_table, p_uid_col);
  EXECUTE format('UPDATE %1$I t SET %2$I = g.%5$I FROM %4$I g WHERE t.%3$I = g.id AND t.%2$I IS NULL',
                 p_table, p_uid_col, p_int_col, p_target, p_target_col);
  GET DIAGNOSTICS v_filled = ROW_COUNT;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint k JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY (k.conkey)
                  WHERE k.conrelid = p_table::regclass AND k.contype = 'f'
                    AND k.confrelid = 'entity_registry'::regclass AND a.attname = p_uid_col) THEN
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES entity_registry (uid)', p_table, v_fk, p_uid_col);
  END IF;
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (%I)', v_idx, p_table, p_uid_col);
  EXECUTE format(
    'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I, %I ON %I FOR EACH ROW EXECUTE FUNCTION uid_ref_sync(%L, %L, %L, %L)',
    'trg_uid_ref_' || p_uid_col, p_int_col, p_uid_col, p_table, p_int_col, p_uid_col, p_target, p_target_col);
  INSERT INTO entity_uid_references (table_name, int_col, uid_col, target, target_col)
  VALUES (p_table, p_int_col, p_uid_col, p_target, p_target_col)
  ON CONFLICT (table_name, int_col) DO UPDATE SET uid_col = EXCLUDED.uid_col, target = EXCLUDED.target, target_col = EXCLUDED.target_col;
  RETURN jsonb_build_object('table', p_table, 'int_col', p_int_col, 'uid_col', p_uid_col, 'filled', v_filled);
END
$fn$;

-- uid_ref_sync, redefined. The first version refused any UPDATE of the integer while a uid was already
-- set, because the old uid then "disagreed" with the new integer. Existing application code only knows the
-- integer and re-points it all the time, so that would have started failing. When only ONE side of the
-- pair changes, the other FOLLOWS it; only a write that supplies both sides inconsistently is refused.
CREATE OR REPLACE FUNCTION uid_ref_sync() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_int_col text := TG_ARGV[0];
  v_uid_col text := TG_ARGV[1];
  v_target  text := TG_ARGV[2];
  v_tcol    text := TG_ARGV[3];
  v_row     jsonb  := to_jsonb(NEW);
  v_int     bigint := NULLIF(v_row ->> v_int_col, '')::bigint;
  v_uid     text   := v_row ->> v_uid_col;
  v_old     jsonb;
  v_old_int bigint;
  v_old_uid text;
  v_int_authority boolean := false;
  v_reg_tbl text;
  v_reg_id  bigint;
  v_found   text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old     := to_jsonb(OLD);
    v_old_int := NULLIF(v_old ->> v_int_col, '')::bigint;
    v_old_uid := v_old ->> v_uid_col;
    IF v_int IS DISTINCT FROM v_old_int AND v_uid IS NOT DISTINCT FROM v_old_uid THEN
      v_int_authority := true;          -- only the integer changed: the uid follows it
    ELSIF v_uid IS DISTINCT FROM v_old_uid AND v_int IS NOT DISTINCT FROM v_old_int THEN
      v_int := NULL;                    -- only the uid changed: the integer follows it
    END IF;
  END IF;

  IF v_int_authority OR v_uid IS NULL THEN
    -- the integer is the authority: derive the uid from it (NULL when the integer is NULL or dangling)
    v_found := NULL;
    IF v_int IS NOT NULL THEN
      EXECUTE format('SELECT %I FROM %I WHERE id = $1', v_tcol, v_target) INTO v_found USING v_int;
    END IF;
    IF v_found IS DISTINCT FROM v_uid THEN
      NEW := jsonb_populate_record(NEW, jsonb_build_object(v_uid_col, v_found));
    END IF;
  ELSE
    SELECT source_table, source_id INTO v_reg_tbl, v_reg_id FROM entity_registry WHERE uid = v_uid;
    IF v_reg_tbl IS NULL THEN
      RAISE EXCEPTION 'uid_ref: %.% = "%" is not a registered uid', TG_TABLE_NAME, v_uid_col, v_uid USING ERRCODE = '23503';
    END IF;
    IF v_reg_tbl <> v_target THEN
      RAISE EXCEPTION 'uid_ref: %.% = "%" is a % uid, but this column references %',
        TG_TABLE_NAME, v_uid_col, v_uid, v_reg_tbl, v_target USING ERRCODE = '23514';
    END IF;
    IF v_int IS NULL THEN
      NEW := jsonb_populate_record(NEW, jsonb_build_object(v_int_col, v_reg_id));
    ELSIF v_int <> v_reg_id THEN
      RAISE EXCEPTION 'uid_ref: %.% = % but %.% = "%" points at % #%. The integer and the uid must agree.',
        TG_TABLE_NAME, v_int_col, v_int, TG_TABLE_NAME, v_uid_col, v_uid, v_target, v_reg_id USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;

-- The twin attached in the first migration is recorded too.
INSERT INTO entity_uid_references (table_name, int_col, uid_col, target)
SELECT 'corporates', 'tenant_id', 'tenant_uid', 'tenants'
 WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='corporates' AND column_name='tenant_uid')
ON CONFLICT (table_name, int_col) DO NOTHING;

`;
const body = decided.map((d) =>
  `-- ${d.table}.${d.int} (${d.rows} rows): ${d.why}\nSELECT attach_uid_reference('${d.table}', '${d.int}', '${d.uid}', '${d.target}', '${d.targetCol}');`).join('\n\n');
fs.writeFileSync(path.join(root, 'migrations/20261005000200-entity-uid-reference-twins.sql'), header + body + '\n');
fs.writeFileSync(path.join(root, 'migrations/20261005000200-entity-uid-reference-twins.manifest.json'), JSON.stringify({ decided, left }, null, 1));

console.log(`decided ${decided.length} twins (${decided.reduce((a, d) => a + d.rows, 0).toLocaleString()} rows), left ${left.length} columns alone\n`);
const by = {};
for (const d of decided) { const k = d.fk ? 'A  declared FK' : d.uid === 'lab_uid' ? 'D  imaging (tenant_id = lab id)' : 'B/C  corroborated convention'; (by[k] ||= []).push(d); }
for (const [k, v] of Object.entries(by)) console.log(`  ${k.padEnd(34)} ${String(v.length).padStart(3)} columns ${v.reduce((a, d) => a + d.rows, 0).toLocaleString().padStart(9)} rows`);
const targets = {};
for (const d of decided) targets[d.target] = (targets[d.target] || 0) + 1;
console.log('\n  by target:', Object.entries(targets).map(([k, v]) => `${k}×${v}`).join('  '));
console.log('\n── LEFT ALONE (needs a decision, or is covered elsewhere) ──');
const lr = {};
for (const l of left) (lr[l.why.replace(/\(.*\)/, '').replace(/\d[\d,]* rows/, 'N rows')] ||= []).push(l);
for (const [why, v] of Object.entries(lr).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${String(v.length).padStart(3)} × ${why.slice(0, 110)}`);
  for (const l of v.slice(0, 4)) console.log(`        ${l.key} (${l.rows} rows)`);
}
process.exit(0);
