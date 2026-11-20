/**
 * The health check-up included in One (1, the member) and Family (2: the member and spouse) —
 * booked as a ₹0 package through /api/health-checkups (services/plan-checkup.service.js).
 *
 * The core panel below is the common Indian basic health check-up composition and is a PROPOSAL
 * pending clinical sign-off (metadata ...healthCheck.reviewRequired = true). Team can change it in
 * the admin Plans screen (membership plan metadata).
 *
 * Run: node scripts/ssm-env-loader.mjs scripts/run-one-migration.mjs migrations/20261120000800-plan-checkup-panel.migration.js
 */
export const CORE_PANEL = [
  'Complete Blood Count (CBC)', 'Fasting Blood Sugar', 'HbA1c', 'Lipid Profile',
  'Liver Function Test (LFT)', 'Kidney Function Test (KFT)', 'Thyroid Stimulating Hormone (TSH)', 'Urine Routine',
];
export const PREPARATION = ['Fast for 10–12 hours before the sample (water is fine)', 'Take your usual medicines unless your doctor says otherwise', 'Carry a photo ID'];
const RELATIONS = { ONE_ANNUAL: ['self'], FAMILY_ANNUAL: ['self', 'spouse'] };

export async function up(client) {
  for (const [code, relations] of Object.entries(RELATIONS)) {
    await client.query(
      `UPDATE membership_plans
          SET metadata = jsonb_set(metadata, '{coverageDetails,healthCheck}',
                COALESCE(metadata->'coverageDetails'->'healthCheck', '{}'::jsonb)
                || jsonb_build_object('tests', $2::jsonb, 'eligibleRelations', $3::jsonb, 'preparationInstructions', $4::jsonb, 'reviewRequired', true), true),
              "updatedAt" = now()
        WHERE code = $1`,
      [code, JSON.stringify(CORE_PANEL), JSON.stringify(relations), JSON.stringify(PREPARATION)]);
  }
}

export async function down(client) {
  await client.query(`UPDATE membership_plans SET metadata = metadata #- '{coverageDetails,healthCheck,tests}' #- '{coverageDetails,healthCheck,eligibleRelations}'
                        #- '{coverageDetails,healthCheck,preparationInstructions}' #- '{coverageDetails,healthCheck,reviewRequired}' WHERE code = ANY($1)`, [Object.keys(RELATIONS)]);
}
