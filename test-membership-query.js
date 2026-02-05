#!/usr/bin/env node

import 'dotenv/config.js';
import { Sequelize } from 'sequelize';

async function testMembershipQuery() {
  try {
    const host = process.env.POSTGRES_PRIMARY_HOST || process.env.POSTGRES_HOST || '127.0.0.1';
    const port = parseInt(process.env.POSTGRES_PRIMARY_PORT || process.env.POSTGRES_PORT || '5432', 10);
    const database = process.env.POSTGRES_PRIMARY_DATABASE || process.env.POSTGRES_DATABASE || 'mediczy_ai';
    const username = process.env.POSTGRES_PRIMARY_USER || process.env.POSTGRES_USER || 'mediczy_helper';
    const password = process.env.POSTGRES_PRIMARY_PASSWORD || process.env.POSTGRES_PASSWORD || 'change_me';

    const sequelize = new Sequelize(database, username, password, {
      host,
      port,
      dialect: 'postgres',
      logging: false
    });

    // Import UserPlan model
    const { UserPlan } = (await import('./server/models/postgres/membershipPlan.model.postgres.js'));

    const userId = 19;
    console.log('\n🔍 Testing membership query for user:', userId);
    console.log('Search criteria:');
    console.log('  - userId:', userId);
    console.log('  - status: active');
    console.log('  - startDate <=', new Date());
    console.log('  - endDate >=', new Date());

    const activePlan = await UserPlan.findOne({
      where: {
        userId,
        status: 'active',
        startDate: { [Sequelize.Op.lte]: new Date() },
        endDate: { [Sequelize.Op.gte]: new Date() }
      }
    });

    if (activePlan) {
      console.log('\n✅ ACTIVE PLAN FOUND:');
      console.log('  - ID:', activePlan.id);
      console.log('  - Status:', activePlan.status);
      console.log('  - Start Date:', activePlan.startDate);
      console.log('  - End Date:', activePlan.endDate);
      console.log('  - Created At:', activePlan.createdAt);
    } else {
      console.log('\n❌ NO ACTIVE PLAN FOUND');
      
      // Let's see all plans for this user
      console.log('\nAll plans for user', userId, ':');
      const allPlans = await UserPlan.findAll({ where: { userId } });
      allPlans.forEach((plan, idx) => {
        console.log(`  Plan ${idx + 1}:`, {
          id: plan.id,
          status: plan.status,
          startDate: plan.startDate,
          endDate: plan.endDate
        });
      });
    }

    await sequelize.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testMembershipQuery();
