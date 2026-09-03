/**
 * DANGER — DB-RDS-PLAN-2026-09-01 Workstream A-07: this script calls
 * .sync({ force: true }) on three models — force:true DROPS and
 * recreates the table, destroying any existing data in it. This is the
 * most dangerous sync() call found in this codebase during the A-07
 * review. Confirmed (2026-09-03) NOT wired into any automatic
 * startup/cron path — it only runs if manually executed. Keep it that
 * way: do not import this file's logic into app.js/initialization
 * .controller.js or any route without replacing sync({force:true}) with
 * a real, non-destructive migration first.
 */
import { postgresSequelize as sequelize } from './db/postgres-sequelize.js';
import MembershipPlan from './models/postgres/membership-plan.model.postgres.js';
import UserSubscription from './models/postgres/user-subscription.model.postgres.js';
import ReferralCode from './models/postgres/referral-code.model.postgres.js';
import CorporatePlanSponsorship from './models/postgres/corporate-plan-sponsorship.model.postgres.js';
import { MEMBERSHIP_PLANS } from './config/membership-plans.config.js';

async function migrateMembershipSystem() {
  console.log('🚀 Starting Membership System migration...\n');

  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('✅ Database connection established\n');

    // Create tables
    console.log('1. Creating subscription_plans table...');
    await MembershipPlan.sync({ force: true }); // Force recreate
    console.log('✅ subscription_plans table created/synced\n');

    console.log('2. Creating referral_codes table...');
    await ReferralCode.sync({ force: true });
    console.log('✅ referral_codes table created/synced\n');

    console.log('3. Creating corporate_plan_sponsorships table...');
    await CorporatePlanSponsorship.sync({ force: true });
    console.log('✅ corporate_plan_sponsorships table created/synced\n');

    console.log('4. Creating user_subscriptions table...');
    await UserSubscription.sync({ force: true });
    console.log('✅ user_subscriptions table created/synced\n');

    // Set up relationships
    console.log('5. Setting up model relationships...');
    
    // UserSubscription relationships
    UserSubscription.belongsTo(MembershipPlan, {
      foreignKey: 'planId',
      as: 'plan'
    });

    UserSubscription.belongsTo(ReferralCode, {
      foreignKey: 'referralCodeId',
      as: 'referralCode'
    });

    UserSubscription.belongsTo(CorporatePlanSponsorship, {
      foreignKey: 'corporateSponsorshipId',
      as: 'sponsorship'
    });

    UserSubscription.belongsTo(UserSubscription, {
      foreignKey: 'previousSubscriptionId',
      as: 'previousSubscription'
    });

    // ReferralCode relationships
    ReferralCode.belongsTo(MembershipPlan, {
      foreignKey: 'planId',
      as: 'plan'
    });

    // CorporatePlanSponsorship relationships
    CorporatePlanSponsorship.belongsTo(MembershipPlan, {
      foreignKey: 'planId',
      as: 'plan'
    });

    console.log('✅ Model relationships configured\n');

    // Seed initial plans
    console.log('6. Seeding membership plans...');
    
    for (const planData of MEMBERSHIP_PLANS) {
      const [plan, created] = await MembershipPlan.findOrCreate({
        where: { slug: planData.slug },
        defaults: planData
      });

      if (created) {
        console.log(`   ✨ Created plan: ${planData.name} (${planData.slug})`);
      } else {
        // Update existing plan with latest config
        await plan.update(planData);
        console.log(`   🔄 Updated plan: ${planData.name} (${planData.slug})`);
      }
    }

    console.log('✅ All plans seeded successfully\n');

    // Display plan summary
    const plans = await MembershipPlan.findAll({
      order: [['type', 'ASC'], ['tier', 'ASC']]
    });

    console.log('📊 Plan Summary:');
    console.log('═'.repeat(80));
    
    console.log('\n🏠 PERSONAL PLANS:');
    plans.filter(p => p.type === 'PERSONAL').forEach(p => {
      console.log(`   • ${p.name.padEnd(20)} | Tier ${p.tier} | ₹${p.price}/month | ${p.requiresReferral ? '🎫 Requires Referral' : ''}`);
    });

    console.log('\n🏢 CORPORATE PLANS:');
    plans.filter(p => p.type === 'CORPORATE').forEach(p => {
      console.log(`   • ${p.name.padEnd(25)} | Tier ${p.tier} | ₹${p.price}/employee/month`);
    });

    console.log('\n' + '═'.repeat(80));
    console.log('✨ Membership System migration complete!');
    console.log('📝 Total plans created: ' + plans.length);
    console.log('🎯 Personal plans: ' + plans.filter(p => p.type === 'PERSONAL').length);
    console.log('🏢 Corporate plans: ' + plans.filter(p => p.type === 'CORPORATE').length);

    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run migration
migrateMembershipSystem();
