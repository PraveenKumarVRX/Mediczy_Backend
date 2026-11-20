#!/usr/bin/env node
/**
 * Fill a blank pharmacy_medicines.schedule from the product's active ingredients.
 *
 * Why: 249,391 of 254,210 catalogue products had no schedule, and the cart and the server price
 * check only ask for a prescription when the schedule is H, H1 or X. So Schedule H drugs such as
 * Amlodipine went into the cart with no prescription (app QA, 2026-11-20).
 *
 * How: the catalogue's own single-ingredient products that are marked H/H1/X name the ingredients
 * that need a prescription. An ingredient that is also sold marked OTC is left out. A blank product
 * containing any of those ingredients gets the strictest schedule found (X > H1 > H). Only blank
 * schedules are written; a schedule someone set is never changed. Re-run after a catalogue import.
 *
 *   node scripts/ssm-env-loader.mjs scripts/backfill-medicine-schedules.mjs            # dry run
 *   node scripts/ssm-env-loader.mjs scripts/backfill-medicine-schedules.mjs --rehearse # write, then roll back
 *   node scripts/ssm-env-loader.mjs scripts/backfill-medicine-schedules.mjs --apply    # write
 *
 * --apply first copies every row it changes into backup_medicine_schedule_backfill (id, old
 * schedule, new schedule, when), so a run can be undone:
 *   UPDATE pharmacy_medicines m SET schedule = b.old_schedule FROM backup_medicine_schedule_backfill b
 *    WHERE b.medicine_id = m.id AND b.run_at = '<run>';
 */
import { postgresSequelize } from '../db/postgres-sequelize.js';

const APPLY = process.argv.includes('--apply');
const REHEARSE = process.argv.includes('--rehearse'); // does every write, then rolls back

// Strength, pharmacopoeia and release-form words and salt forms are not the ingredient.
const NOT_INGREDIENT = 'hydrochloride|dihydrochloride|hcl|besylate|besilate|calcium|sodium|potassium|magnesium|dihydrate|monohydrate|trihydrate|hydrobromide|maleate|tartrate|succinate|fumarate|mesylate|citrate|phosphate|sulphate|sulfate|acetate|bromide|hyclate|sr|er|xr|cr|mr|od|ip|bp|usp';
// Left out on purpose: what remains of "sodium bicarbonate" (antacid/ORS forms are OTC), and
// category tokens that came in as compositions from a bad import.
export const EXCLUDED_INGREDIENTS = ['bicarbonate', 'anti-infectivesgen', 'cardiovasculargen', 'dermatologygen', 'gastroenterologygen',
  'hormonesgen', 'musculoskeletalgen', 'obstetricsgen', 'oncologygen', 'ophthalmologygen', 'respiratorygen'];

const ING = `regexp_replace(trim(regexp_replace(regexp_replace(regexp_replace(lower(i), '\\(.*?\\)', ' ', 'g'), '[0-9].*$', ''),
  '\\m(${NOT_INGREDIENT})\\M', ' ', 'g')), '\\s+', ' ', 'g')`;

export const PLAN_SQL = `
  WITH parts AS (
    SELECT m.id, upper(trim(COALESCE(m.schedule, ''))) AS sch, ${ING} AS ing,
           cardinality(regexp_split_to_array(m.composition, '\\+|,')) AS n
      FROM pharmacy_medicines m, unnest(regexp_split_to_array(m.composition, '\\+|,')) i
     WHERE COALESCE(m.composition, '') <> ''),
  otc AS (SELECT DISTINCT ing FROM parts WHERE n = 1 AND sch = 'OTC'),
  rx AS (SELECT ing, CASE WHEN bool_or(sch = 'X') THEN 3 WHEN bool_or(sch = 'H1') THEN 2 ELSE 1 END AS rank
           FROM parts WHERE n = 1 AND sch IN ('H', 'H1', 'X') AND length(ing) >= 4
            AND ing NOT IN (SELECT ing FROM otc) AND ing NOT IN (:excluded)
          GROUP BY ing)
  SELECT p.id AS medicine_id, (ARRAY['H', 'H1', 'X'])[max(rx.rank)] AS new_schedule
    FROM parts p JOIN rx USING (ing)
   WHERE p.sch = ''
   GROUP BY p.id`;

async function main() {
  const tx = await postgresSequelize.transaction();
  try {
    const replacements = { excluded: EXCLUDED_INGREDIENTS };
    const [summary] = await postgresSequelize.query(
      `SELECT count(*)::int AS products, count(*) FILTER (WHERE new_schedule = 'X')::int AS x,
              count(*) FILTER (WHERE new_schedule = 'H1')::int AS h1, count(*) FILTER (WHERE new_schedule = 'H')::int AS h
         FROM (${PLAN_SQL}) plan`, { replacements, transaction: tx, type: postgresSequelize.QueryTypes.SELECT });
    console.log(`Blank schedules to fill: ${summary.products} (H ${summary.h}, H1 ${summary.h1}, X ${summary.x})`);
    if (!APPLY && !REHEARSE) { await tx.rollback(); console.log('Dry run, nothing written. Add --apply to write.'); return; }

    await postgresSequelize.query(`CREATE TABLE IF NOT EXISTS backup_medicine_schedule_backfill (
      medicine_id INTEGER NOT NULL, old_schedule TEXT, new_schedule TEXT NOT NULL, run_at TIMESTAMPTZ NOT NULL)`, { transaction: tx });
    const [[{ run_at: runAt }]] = await postgresSequelize.query('SELECT now() AS run_at', { transaction: tx });
    await postgresSequelize.query(
      `INSERT INTO backup_medicine_schedule_backfill (medicine_id, old_schedule, new_schedule, run_at)
       SELECT m.id, m.schedule, plan.new_schedule, :runAt FROM (${PLAN_SQL}) plan JOIN pharmacy_medicines m ON m.id = plan.medicine_id`,
      { replacements: { ...replacements, runAt }, transaction: tx });
    const [, meta] = await postgresSequelize.query(
      `UPDATE pharmacy_medicines m SET schedule = b.new_schedule
         FROM backup_medicine_schedule_backfill b
        WHERE b.run_at = :runAt AND b.medicine_id = m.id AND COALESCE(trim(m.schedule), '') = ''`,
      { replacements: { runAt }, transaction: tx });
    const updated = meta?.rowCount ?? meta;
    if (updated !== summary.products) throw new Error(`Expected ${summary.products} updates, got ${updated}; rolled back`);
    if (REHEARSE) {
      const [check] = await postgresSequelize.query(
        `SELECT count(*) FILTER (WHERE COALESCE(trim(schedule), '') = '')::int AS blank,
                count(*) FILTER (WHERE composition ILIKE 'amlodipine (%' AND schedule = 'H')::int AS amlodipine_h
           FROM pharmacy_medicines`, { transaction: tx, type: postgresSequelize.QueryTypes.SELECT });
      await tx.rollback();
      console.log(`Rehearsal: would update ${updated}; blank left ${check.blank}; single-ingredient Amlodipine now H: ${check.amlodipine_h}. Rolled back.`);
      return;
    }
    await tx.commit();
    console.log(`Updated ${updated} products. Backup run_at = ${new Date(runAt).toISOString()}`);
  } catch (error) {
    await tx.rollback().catch(() => {});
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv.some((a) => a.endsWith('backfill-medicine-schedules.mjs'))) {
  main().then(() => process.exit(0), (error) => { console.error(error.message); process.exit(1); });
}
