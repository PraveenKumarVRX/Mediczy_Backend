#!/usr/bin/env node

/**
 * Tag User to Aggregator Organization & Assign Membership Plan
 * Script to associate user@mediczy.com with Aggregator My SmartHealth
 * and attach a live membership plan
 */

import orchestrator from '../db/orchestrator.js';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

const USER_EMAIL = 'user@mediczy.com';
const AGGREGATOR_NAME = 'Aggregator My SmartHealth';
const ORG_TYPE = 'aggregator';

async function tagUserToAggregator() {
  try {
    console.log('🚀 Starting user tagging to aggregator...\n');

    // Step 1: Initialize databases
    console.log('📊 Initializing databases...');
    await orchestrator.initializeAll();
    console.log('✅ Databases initialized\n');

    // Step 2: Find user
    console.log(`🔍 Finding user: ${USER_EMAIL}`);
    const [user] = await sequelize.query(
      `SELECT id, email, "firstName", "lastName" FROM users WHERE email = $1`,
      {
        bind: [USER_EMAIL],
        type: QueryTypes.SELECT
      }
    );

    if (!user) {
      console.error(`❌ User ${USER_EMAIL} not found`);
      process.exit(1);
    }

    console.log(`✅ User found: ${user.firstName} ${user.lastName} (ID: ${user.id})\n`);

    // Step 3: Find or create Aggregator organization
    console.log(`🏢 Looking for "${AGGREGATOR_NAME}" organization...`);
    let [aggregator] = await sequelize.query(
      `SELECT id, hospital_name, status FROM hospitals WHERE LOWER(hospital_name) LIKE LOWER($1) LIMIT 1`,
      {
        bind: [`%${AGGREGATOR_NAME}%`],
        type: QueryTypes.SELECT
      }
    );

    if (!aggregator) {
      console.log(`❌ Organization not found. Creating "${AGGREGATOR_NAME}"...`);
      const [newAgg] = await sequelize.query(
        `INSERT INTO hospitals (hospital_name, email, password, network_type, status, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING id, hospital_name`,
        {
          bind: [
            AGGREGATOR_NAME,
            `admin@${AGGREGATOR_NAME.toLowerCase().replace(/\s+/g, '-')}.com`,
            'temp-password-placeholder', // Will need to be hashed in production
            'aggregator',
            'active'
          ],
          type: QueryTypes.INSERT
        }
      );
      aggregator = newAgg;
      console.log(`✅ Organization created (ID: ${aggregator.id})\n`);
    } else {
      console.log(`✅ Organization found: "${aggregator.hospital_name}" (ID: ${aggregator.id})\n`);
    }

    // Validate aggregator
    if (!aggregator || !aggregator.id) {
      console.error(`❌ Failed to get or create aggregator organization`);
      process.exit(1);
    }

    // Step 4: Check if user is already associated
    console.log(`🔗 Checking existing associations...`);
    const [existing] = await sequelize.query(
      `SELECT id FROM user_associations 
       WHERE "userId" = $1 AND "entityType" = 'hospital' AND "entityId" = $2`,
      {
        bind: [user.id, aggregator.id],
        type: QueryTypes.SELECT
      }
    );

    if (existing) {
      console.log(`⚠️  User already associated with this organization\n`);
    } else {
      console.log(`➕ Creating user association...`);
      await sequelize.query(
        `INSERT INTO user_associations ("userId", "entityType", "entityId", role, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        {
          bind: [user.id, 'hospital', aggregator.id, 'member'],
          type: QueryTypes.INSERT
        }
      );
      console.log(`✅ User associated with organization\n`);
    }

    // Step 5: Get active membership plans
    console.log(`💳 Fetching active membership plans...`);
    const plans = await sequelize.query(
      `SELECT id, name, code, price, "durationMonths", "isActive", tier 
       FROM membership_plans 
       WHERE "isActive" = true AND "isMaster" = true
       ORDER BY tier ASC LIMIT 5`,
      { type: QueryTypes.SELECT }
    );

    if (plans.length === 0) {
      console.error(`❌ No active membership plans found`);
      process.exit(1);
    }

    console.log(`✅ Found ${plans.length} active plans:\n`);
    plans.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.name} - ₹${p.price} (${p.durationMonths} months)`);
    });
    console.log('');

    // Step 6: Assign first active plan (or best tier)
    const plan = plans[0]; // Get the first (usually lowest tier) active plan
    
    console.log(`📋 Assigning plan: ${plan.name} (ID: ${plan.id})...`);

    // Check if user already has active subscription
    const [existing_sub] = await sequelize.query(
      `SELECT id, status FROM user_plans WHERE "userId" = $1 AND status = 'active'`,
      {
        bind: [user.id],
        type: QueryTypes.SELECT
      }
    );

    if (existing_sub) {
      console.log(`⚠️  User already has active subscription: ${existing_sub.id}`);
      console.log(`   Deactivating old subscription...`);
      await sequelize.query(
        `UPDATE user_plans SET status = 'inactive' WHERE id = $1`,
        { bind: [existing_sub.id] }
      );
    }

    // Create new user plan
    const startDate = new Date().toISOString().split('T')[0];
    const endDate = new Date(Date.now() + (plan.durationMonths * 30 * 24 * 60 * 60 * 1000))
      .toISOString()
      .split('T')[0];

    const [userPlan] = await sequelize.query(
      `INSERT INTO user_plans 
       ("userId", "membershipPlanId", "startDate", "endDate", status, "paidAmount", metadata, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING id, "startDate", "endDate"`,
      {
        bind: [
          user.id,
          plan.id,
          startDate,
          endDate,
          'active',
          0, // Free/sponsored
          JSON.stringify({
            planName: plan.name,
            planCode: plan.code,
            assignedBy: 'admin',
            assignedAt: new Date().toISOString()
          })
        ],
        type: QueryTypes.INSERT
      }
    );

    console.log(`✅ Membership plan assigned successfully\n`);
    console.log(`📅 Plan Duration: ${startDate} to ${endDate}\n`);

    // Step 7: Verify assignment
    console.log(`🔍 Verifying assignment...\n`);

    const [verification] = await sequelize.query(
      `SELECT 
        u.id, u.email, u."firstName", u."lastName",
        h.hospital_name as organization,
        mp.name as plan_name, mp.code,
        up."startDate", up."endDate", up.status
       FROM users u
       LEFT JOIN user_associations ua ON u.id = ua."userId" AND ua."entityType" = 'hospital'
       LEFT JOIN hospitals h ON ua."entityId" = h.id
       LEFT JOIN user_plans up ON u.id = up."userId" AND up.status = 'active'
       LEFT JOIN membership_plans mp ON up."membershipPlanId" = mp.id
       WHERE u.id = $1`,
      {
        bind: [user.id],
        type: QueryTypes.SELECT
      }
    );

    if (verification) {
      console.log('✅ ASSIGNMENT VERIFIED:');
      console.log(`   User: ${verification.firstName} ${verification.lastName}`);
      console.log(`   Email: ${verification.email}`);
      console.log(`   Organization: ${verification.organization || 'Not assigned'}`);
      console.log(`   Membership Plan: ${verification.plan_name || 'None'}`);
      if (verification.startDate) {
        console.log(`   Valid From: ${verification.startDate}`);
        console.log(`   Valid Until: ${verification.endDate}`);
        console.log(`   Status: ${verification.status}`);
      }
      console.log('');
    }

    console.log('═'.repeat(70));
    console.log('✨ USER TAGGING COMPLETE!');
    console.log('═'.repeat(70));
    console.log(`
✅ Summary:
   • User tagged to: ${AGGREGATOR_NAME}
   • Membership Plan: ${plan.name}
   • Duration: ${plan.durationMonths} months
   • Valid Until: ${endDate}
   • Status: ACTIVE
    `);

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the script
tagUserToAggregator();
