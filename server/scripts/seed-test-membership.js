#!/usr/bin/env node
/**
 * Seed active membership for test user
 * Usage: node server/scripts/seed-test-membership.js [userId]
 */

import { MembershipPlan, UserPlan } from '../models/membershipPlan.model.intelligent.js';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';

const DEFAULT_TEST_USER_ID = 19;

async function seedTestMembership(userId = DEFAULT_TEST_USER_ID) {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Find or create a basic membership plan
    let plan = await MembershipPlan.findOne({
      where: { code: 'BASIC_TEST' }
    });

    let created = false;
    if (!plan) {
      plan = await MembershipPlan.create({
        name: 'Basic Test Plan',
        code: 'BASIC_TEST',
        description: 'Test membership plan for development',
        type: 'individual',
        price: 0.00,
        discountedPrice: 0.00,
        durationMonths: 12,
        features: ['profile_access', 'appointments', 'health_records'],
        benefits: ['Unlimited appointments', 'Health record storage'],
        limitations: {},
        maxUsers: 1,
        isActive: true,
        isFeatured: false,
        sortOrder: 0
      });
      created = true;
    }

    console.log(created ? '✅ Created test membership plan' : '✅ Found existing test plan');
    console.log('📦 Plan:', { id: plan.id, name: plan.name, code: plan.code });

    // Check if user already has an active plan
    const existingPlan = await UserPlan.findOne({
      where: { userId, status: 'active' }
    });

    if (existingPlan) {
      console.log('⚠️  User already has an active membership plan');
      console.log('📋 Existing plan:', {
        id: existingPlan.id,
        planId: existingPlan.membershipPlanId,
        status: existingPlan.status,
        startDate: existingPlan.startDate,
        endDate: existingPlan.endDate
      });
      
      // Update end date to ensure it's in the future
      const newEndDate = new Date();
      newEndDate.setFullYear(newEndDate.getFullYear() + 1);
      
      await UserPlan.update(
        { 
          endDate: newEndDate.toISOString().split('T')[0],
          status: 'active'
        },
        { where: { id: existingPlan.id } }
      );
      
      console.log('✅ Updated existing plan end date to:', newEndDate.toISOString().split('T')[0]);
      return;
    }

    // Create new active user plan
    const startDate = new Date();
    const endDate = new Date();
    endDate.setFullYear(endDate.getFullYear() + 1); // Valid for 1 year

    const userPlan = await UserPlan.create({
      userId,
      membershipPlanId: plan.id,
      status: 'active',
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      autoRenew: false,
      paymentMethod: 'test',
      paidAmount: 0.00,
      metadata: { source: 'test-seed-script', createdAt: new Date().toISOString() }
    });

    console.log('✅ Created active membership for user', userId);
    console.log('📋 User Plan:', {
      id: userPlan.id,
      userId: userPlan.userId,
      planId: userPlan.membershipPlanId,
      status: userPlan.status,
      startDate: userPlan.startDate,
      endDate: userPlan.endDate
    });

    console.log('\n✨ Membership seeding completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding membership:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Parse command line args
const userIdArg = process.argv[2];
const userId = userIdArg ? parseInt(userIdArg, 10) : DEFAULT_TEST_USER_ID;

if (isNaN(userId)) {
  console.error('❌ Invalid userId. Usage: node seed-test-membership.js [userId]');
  process.exit(1);
}

console.log(`🌱 Seeding membership for user ID: ${userId}`);
seedTestMembership(userId).then(() => process.exit(0));
