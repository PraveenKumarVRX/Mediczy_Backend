/**
 * Individual plan lineup (owner decision 2026-11-20, "implement all this", from the report
 * "Individual health plan lineup India"): three tiers on one upgrade path — Start (₹99/month),
 * One (₹1,499/yr), Family (₹3,999/yr) — and add-ons that attach to One or Family: Parents,
 * Mind, Chronic Care and Extra child. Insurance and VitalTrack leave the plans.
 *
 * - Start reuses the ₹99 entry plan (code BASIC_MONTHLY, sold since this morning) so existing
 *   Start members and the sign-up code keep working.
 * - The 12 old primary plans and 6 old add-ons stop being sold (isActive=false); anyone holding
 *   one keeps it to its end date. The one paid Silver member moves to One at the same price.
 * - GP teleconsults are "unlimited" under fair use (coverageDetails.onlineConsult.fairUse) and
 *   specialists are a count; lab member prices are coverageDetails.labTests.discountPct (5/10/15,
 *   editable in the admin Plans screen). Medicines: members get the member discount.
 * - metadata.lineup = '2026-11' marks the new plans; add-ons carry requiresBaseTier,
 *   familyExtension and teleconsultExtra.
 *
 * Run: node scripts/ssm-env-loader.mjs scripts/run-one-migration.mjs migrations/20261120000700-individual-plan-lineup.migration.js
 */
const DIGITAL = "AI health chat, health risk assessment, diet plan and women's health tools included";
const NONE = { dental: { limitINR: 0 }, homeCare: { limitINR: 0 }, ambulance: { limitINR: 0 }, insurance: { life: 0, health: 0, accident: 0 } };

export const LINEUP = [
  {
    code: 'BASIC_MONTHLY', name: 'Start', tier: 0, planType: 'primary', price: 99, months: 1, maxUsers: 1, featured: false, sort: 0,
    description: 'A doctor on call for ₹99 a month. Your first ₹99 counts toward One or Family.',
    benefits: ['Up to 3 GP teleconsultations a month', 'Member prices on lab tests and medicines', 'Digital prescriptions', DIGITAL, 'Self only', 'Your first ₹99 counts toward One or Family'],
    limitations: { specialists: 'Not included', healthCheck: 'Not included', insurance: 'Not included', familyMembers: 'Self only' },
    metadata: { familyCoverage: 'employee', annualCreditINR: 99, coverageDetails: { ...NONE, onlineConsult: { unit: 'GP/month', limit: 0, fairUse: { perDay: null, perMonth: 3 } }, specialistConsult: { unit: 'plan', limit: 0 }, healthCheck: { count: 0, package: 'None' }, labTests: { limitINR: 0, discountPct: 5 }, pharmacy: { limitINR: 0, memberPrice: true } } },
  },
  {
    code: 'ONE_ANNUAL', name: 'One', tier: 1, planType: 'primary', price: 1499, months: 12, maxUsers: 1, featured: false, sort: 1,
    description: 'Your yearly check-up and a doctor whenever you need one — about ₹4 a day.',
    benefits: ['Unlimited GP teleconsultations (fair use: up to 1 a day, 6 a month)', '3 specialist teleconsultations a year', '1 annual health check-up (core panel, free home collection)', 'Member prices on lab tests and medicines', '1 counsellor session', DIGITAL, 'Self only'],
    limitations: { insurance: 'Not included', homeVisits: 'Pay per visit where available', familyMembers: 'Self only' },
    metadata: { familyCoverage: 'employee', coverageDetails: { ...NONE, onlineConsult: { unit: 'GP fair use', limit: 0, fairUse: { perDay: 1, perMonth: 6 } }, specialistConsult: { unit: 'year', limit: 3 }, healthCheck: { count: 1, package: 'Core health check-up (home collection)' }, labTests: { limitINR: 0, discountPct: 10 }, pharmacy: { limitINR: 0, memberPrice: true }, mentalHealth: { sessions: 1 } } },
  },
  {
    code: 'FAMILY_ANNUAL', name: 'Family', tier: 2, planType: 'primary', price: 3999, months: 12, maxUsers: 4, featured: true, sort: 2,
    description: "One plan for your family's doctor, tests and medicines — about ₹1,000 a person.",
    benefits: ['Unlimited GP teleconsultations for all 4 (fair use: about 6 a month each)', '6 specialist teleconsultations a year, shared', '2 adult health check-ups (core panel, free home collection)', 'Consultations for your children', '2 counsellor sessions, shared', 'Best member prices on lab tests and medicines', DIGITAL, '2 adults + 2 children (extra child ₹499)'],
    limitations: { insurance: 'Not included', parents: 'Add the Parents add-on', homeVisits: 'Pay per visit where available' },
    metadata: { familyCoverage: 'employee_spouse_children', coverageDetails: { ...NONE, onlineConsult: { unit: 'GP fair use', limit: 0, fairUse: { perDay: 4, perMonth: 24 } }, specialistConsult: { unit: 'year', limit: 6 }, healthCheck: { count: 2, package: 'Core health check-up (home collection)' }, labTests: { limitINR: 0, discountPct: 15 }, pharmacy: { limitINR: 0, memberPrice: true }, mentalHealth: { sessions: 2 } } },
  },
  {
    code: 'PARENTS_ONE', name: 'Parents (1 parent)', tier: 21, planType: 'addon', price: 4999, months: 12, maxUsers: 1, featured: true, sort: 21,
    description: 'Look after Mum or Dad from wherever you are. Attaches to One or Family.',
    benefits: ['Unlimited GP teleconsultations for your parent (fair use)', '2 physician or specialist consultations', '1 senior health check-up with home collection', 'Monthly care-coordinator call', 'Medicine refill reminders and delivery', 'Emergency coordination (booking help, not an ambulance service)', 'Caregiver view for you'],
    limitations: { insurance: 'Not included', device: 'Fall-detection device not included' },
    metadata: { requiresBaseTier: 1, familyExtension: { parents: 1 }, teleconsultExtra: { perDay: 1, perMonth: 6, specialist: 2 } },
  },
  {
    code: 'PARENTS_TWO', name: 'Parents (2 parents)', tier: 22, planType: 'addon', price: 8999, months: 12, maxUsers: 2, featured: false, sort: 22,
    description: 'Look after Mum and Dad (or your in-laws) from wherever you are. Attaches to One or Family.',
    benefits: ['Unlimited GP teleconsultations for both parents (fair use)', '2 physician or specialist consultations each', '1 senior health check-up each, with home collection', 'Monthly care-coordinator call', 'Medicine refill reminders and delivery', 'Emergency coordination (booking help, not an ambulance service)', 'Caregiver view for you'],
    limitations: { insurance: 'Not included', device: 'Fall-detection device not included' },
    metadata: { requiresBaseTier: 1, familyExtension: { parents: 2 }, teleconsultExtra: { perDay: 2, perMonth: 12, specialist: 4 } },
  },
  {
    code: 'MIND_ANNUAL', name: 'Mind', tier: 23, planType: 'addon', price: 2999, months: 12, maxUsers: 1, featured: false, sort: 23,
    description: 'Talk to a professional, privately. Attaches to One or Family.',
    benefits: ['4 counsellor sessions (1:1)', '2 psychologist sessions (1:1)', 'Further sessions at ₹599'],
    limitations: { groupSessions: 'Not included' },
    metadata: { requiresBaseTier: 1, sessions: { counsellor: 4, psychologist: 2 }, extraSessionINR: 599 },
  },
  {
    code: 'CHRONIC_CARE_ANNUAL', name: 'Chronic Care', tier: 24, planType: 'addon', price: 5999, months: 12, maxUsers: 1, featured: false, sort: 24,
    description: 'Stay on top of sugar, BP and weight with a care team. One track: diabetes, BP/heart or weight.',
    benefits: ['3 doctor reviews (1 specialist)', 'Dietitian intake + 3 follow-ups', '12 short coach check-ins', '2 lab panels a year', 'Logging and alerts', 'Medicine refills at member price', 'Glucose sensor (CGM) available as a paid extra'],
    limitations: { cgm: 'Paid extra', outcomes: 'No outcome guarantee' },
    metadata: { requiresBaseTier: 1, tracks: ['diabetes', 'bp_heart', 'weight_metabolic'], teleconsultExtra: { specialist: 1 } },
  },
  {
    code: 'CHRONIC_CARE_3M', name: 'Chronic Care (3-month start)', tier: 25, planType: 'addon', price: 1999, months: 3, maxUsers: 1, featured: false, sort: 25,
    description: 'Try Chronic Care for 3 months: one track — diabetes, BP/heart or weight.',
    benefits: ['1 doctor review', 'Dietitian intake + 1 follow-up', '3 short coach check-ins', '1 lab panel', 'Logging and alerts', 'Glucose sensor (CGM) available as a paid extra'],
    limitations: { cgm: 'Paid extra', outcomes: 'No outcome guarantee' },
    metadata: { requiresBaseTier: 1, tracks: ['diabetes', 'bp_heart', 'weight_metabolic'] },
  },
  {
    code: 'EXTRA_CHILD', name: 'Extra child', tier: 26, planType: 'addon', price: 499, months: 12, maxUsers: 1, featured: false, sort: 26,
    description: 'Add a third (or further) child to your Family plan.',
    benefits: ['Adds one more child to your Family plan'],
    limitations: {},
    metadata: { requiresBaseTier: 2, familyExtension: { children: 1 }, teleconsultExtra: { perDay: 1, perMonth: 6 } },
  },
];

export const RETIRED_CODES = ['SILVER', 'SILVER_INS', 'SILVER_PRO', 'GOLD', 'GOLD_INS', 'GOLD_PRO', 'PLATINUM', 'PLATINUM_INS', 'PLATINUM_PRO',
  'DIAMOND', 'DIAMOND_INS', 'DIAMOND_PRO', 'RIDER_MENTAL', 'RIDER_WEIGHT', 'RIDER_DIABETES', 'RIDER_CARDIAC', 'RIDER_ELDERLY', 'VITALTRACK'];

/** The appliedLimits snapshot subscribe would store for a plan (mirrors buildAppliedLimits). */
export function appliedLimitsFor(p) {
  const c = p.metadata.coverageDetails || {};
  return {
    benefitLimits: { pharmacyLimitINR: 0, homeCareLimitINR: 0, ambulanceLimitINR: 0 },
    teleConsultLimits: {
      allSpecialties: 0,
      ...(c.onlineConsult?.fairUse ? { gpFairUse: { perDay: c.onlineConsult.fairUse.perDay ?? null, perMonth: c.onlineConsult.fairUse.perMonth }, specialist: c.specialistConsult?.limit ?? 0 } : {}),
    },
    healthCheckPackage: c.healthCheck?.package ?? null,
    priceINR: p.price,
  };
}

export async function up(client) {
  for (const p of LINEUP) {
    const metadata = { ...p.metadata, lineup: '2026-11' };
    const exists = (await client.query('SELECT id FROM membership_plans WHERE code = $1', [p.code])).rows[0];
    const values = [p.name, p.description, p.planType, p.tier, p.price, p.months, JSON.stringify(p.benefits), JSON.stringify(p.limitations), JSON.stringify(metadata), p.maxUsers, p.featured, p.sort];
    if (exists) {
      await client.query(
        `UPDATE membership_plans SET name = $2, description = $3, type = 'personal', "planType" = $4, tier = $5, "tierName" = $2, price = $6,
           "discountedPrice" = NULL, "durationMonths" = $7, benefits = $8::jsonb, limitations = $9::jsonb, metadata = COALESCE(metadata, '{}'::jsonb) || $10::jsonb,
           "maxUsers" = $11, "isActive" = true, "isFeatured" = $12, "sortOrder" = $13, "isMaster" = true, "updatedAt" = now()
         WHERE id = $1`, [exists.id, ...values]);
    } else {
      await client.query(
        `INSERT INTO membership_plans (code, name, description, type, "planType", tier, "tierName", price, "durationMonths", features, benefits, limitations, metadata,
           "maxUsers", "isActive", "isFeatured", "sortOrder", "isMaster", "createdAt", "updatedAt")
         VALUES ($1::text, $2::text, $3::text, 'personal', $4, $5, $2::text, $6, $7, '{}'::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11, true, $12, $13, true, now(), now())`,
        [p.code, ...values]);
    }
  }
  await client.query(`UPDATE membership_plans SET "isActive" = false, "isFeatured" = false, "updatedAt" = now() WHERE code = ANY($1)`, [RETIRED_CODES]);

  // The single paid Silver member moves to One at the same price, keeping dates and usage.
  const one = (await client.query(`SELECT id FROM membership_plans WHERE code = 'ONE_ANNUAL'`)).rows[0];
  const oneSpec = LINEUP.find((p) => p.code === 'ONE_ANNUAL');
  await client.query(
    `UPDATE user_plans up SET "membershipPlanId" = $1,
       metadata = COALESCE(up.metadata, '{}'::jsonb) || jsonb_build_object('planName', 'One', 'tier', 1, 'migratedFrom', 'SILVER', 'migratedAt', now()::text,
         'benefits', $2::jsonb, 'appliedLimits', $3::jsonb), "updatedAt" = now()
      FROM membership_plans mp
     WHERE mp.id = up."membershipPlanId" AND mp.code = 'SILVER' AND up.status = 'active' AND up."endDate" >= current_date`,
    [one.id, JSON.stringify(oneSpec.benefits), JSON.stringify(appliedLimitsFor(oneSpec))]);
}

export async function down(client) {
  await client.query(`UPDATE membership_plans SET "isActive" = true, "updatedAt" = now() WHERE code = ANY($1)`, [RETIRED_CODES]);
  await client.query(`UPDATE membership_plans SET "isActive" = false, "updatedAt" = now() WHERE code = ANY($1)`, [LINEUP.filter((p) => p.code !== 'BASIC_MONTHLY').map((p) => p.code)]);
}
