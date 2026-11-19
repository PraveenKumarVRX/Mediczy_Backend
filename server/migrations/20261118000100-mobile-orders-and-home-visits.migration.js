/**
 * Records who a medicine order is for, and brings consultationTypes.homeVisit in line with the
 * home-visit service each doctor has switched on.
 *
 * family_members has no entity uid, so `patient` keeps a snapshot of the name and relationship
 * as ordered alongside that table's private id.
 *
 * Run: node scripts/ssm-env-loader.mjs scripts/run-one-migration.mjs migrations/20261118000100-mobile-orders-and-home-visits.migration.js
 */
export async function up(client) {
  await client.query('ALTER TABLE patient_pharmacy_orders ADD COLUMN IF NOT EXISTS patient jsonb');
  await client.query(`
    UPDATE doctors
       SET "consultationTypes" = jsonb_set(
             COALESCE("consultationTypes", '{}'::jsonb), '{homeVisit}',
             COALESCE("consultationTypes"->'homeVisit', '{}'::jsonb)
               || jsonb_build_object('available', true, 'fee', home_visit_fee),
             true)
     WHERE offers_home_visits IS TRUE AND COALESCE(home_visit_fee, 0) > 0`);
}

export async function down(client) {
  await client.query('ALTER TABLE patient_pharmacy_orders DROP COLUMN IF EXISTS patient');
}
