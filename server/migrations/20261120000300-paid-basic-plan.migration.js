/**
 * Paid entry plan (owner decision 2026-11-20): no free individual plan. A new member buys the
 * ₹99 / 1 month "Basic" plan at sign-up, or redeems a promo coupon, and can upgrade from there.
 *
 * Basic carries the former free Basic offer (plan code BASIC_FREE: wellness tools, digital
 * prescriptions, self only), scaled from its 3-month allowance to one month: 3 GP
 * teleconsultations and 1 emergency consultation. Admins can change the contents in the Plans
 * screen (PUT /api/membership/admin/plans/:id) without code.
 *
 * The five ₹0 individual plans stop being sold (isActive=false). Nobody loses a plan: members
 * already holding one keep it until its end date (the nightly sync reads user_plans, not the
 * catalogue).
 *
 * Run: node scripts/ssm-env-loader.mjs scripts/run-one-migration.mjs migrations/20261120000300-paid-basic-plan.migration.js
 */
export const ENTRY_PLAN = {
  code: 'BASIC_MONTHLY',
  name: 'Basic',
  description: 'Start with My SmartHealth for ₹99 a month — 3 GP teleconsultations, wellness tools and emergency consultation for yourself. Upgrade any time.',
  price: 99,
  durationMonths: 1,
  benefits: [
    '3 GP teleconsultations per month',
    '1 emergency consultation per month',
    'HRA (Health Risk Assessment)',
    'AI health chat assistant',
    'Activity tracker',
    'Personalised diet plan',
    'Digital prescriptions',
    '1 member (self only)',
  ],
  limitations: {
    homecare: 'Not included',
    labTests: 'Not included',
    pharmacy: 'Not included',
    ambulance: 'Not included',
    insurance: 'Not included',
    familyMembers: 'Self only',
  },
  metadata: {
    icon: 'zap',
    color: '#6b7280',
    monthlyPrice: 99,
    entryPlan: true,
    wellness: { hra: true, aiChat: true, dietPlan: true, mentalHealth: false, activityTracker: true },
    coverageDetails: {
      dental: { limitINR: 0 },
      homeCare: { limitINR: 0 },
      labTests: { limitINR: 0 },
      pharmacy: { limitINR: 0, discountPct: 0 },
      ambulance: { limitINR: 0 },
      insurance: { life: 0, health: 0, accident: 0 },
      healthCheck: { package: 'None' },
      onlineConsult: { unit: 'GP/month', limit: 3 },
      physicalConsult: { limit: 0 },
      emergencyConsult: { limit: 1 },
    },
  },
};

export const RETIRED_FREE_PLAN_CODES = ['BASIC', 'BASIC_TEST', 'FREE_TRIAL', 'BASIC_FREE', 'SMART_BASIC'];

export async function up(client) {
  const p = ENTRY_PLAN;
  await client.query(
    `INSERT INTO membership_plans
       (name, code, description, type, "planType", tier, "tierName", price, "durationMonths",
        features, benefits, limitations, metadata, "maxUsers", "isActive", "isFeatured", "sortOrder", "isMaster", "createdAt", "updatedAt")
     SELECT $1::text, $2::text, $3::text, 'personal', 'primary', 0, 'Basic', $4, $5, '{}'::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, 1, true, true, 0, true, now(), now()
      WHERE NOT EXISTS (SELECT 1 FROM membership_plans WHERE code = $2::text)`,
    [p.name, p.code, p.description, p.price, p.durationMonths, JSON.stringify(p.benefits), JSON.stringify(p.limitations), JSON.stringify(p.metadata)]
  );
  await client.query(
    `UPDATE membership_plans SET "isActive" = false, "updatedAt" = now()
      WHERE code = ANY($1) AND COALESCE(price, 0) = 0 AND COALESCE("discountedPrice", 0) = 0`,
    [RETIRED_FREE_PLAN_CODES]
  );
}

export async function down(client) {
  await client.query(`UPDATE membership_plans SET "isActive" = true, "updatedAt" = now() WHERE code = ANY($1)`, [RETIRED_FREE_PLAN_CODES]);
  await client.query(`UPDATE membership_plans SET "isActive" = false, "updatedAt" = now() WHERE code = $1`, [ENTRY_PLAN.code]);
}
