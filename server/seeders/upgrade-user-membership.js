/**
 * Upgrade User Membership to Family Plan
 * 
 * This script upgrades user@mediczy.com from individual to family membership
 * so they can add family members for testing
 */

import orchestrator from '../db/orchestrator.js';

async function upgradeUserMembership() {
  try {
    console.log('🚀 Starting user membership upgrade...\n');

    // Get PostgreSQL Sequelize connection
    const postgres = orchestrator.postgresSequelize;
    if (!postgres) {
      throw new Error('PostgreSQL Sequelize connection not available');
    }

    // Check current membership
    console.log('📊 Checking current membership...');
    const [currentUser] = await postgres.query(
      'SELECT id, email, membership_tier, membership_type FROM "User" WHERE email = :email',
      {
        replacements: { email: 'user@mediczy.com' },
        type: postgres.QueryTypes.SELECT
      }
    );

    if (!currentUser) {
      console.error('❌ User user@mediczy.com not found');
      return;
    }

    console.log(`Current membership: ${currentUser.membership_type || 'none'} (tier: ${currentUser.membership_tier || 'none'})`);

    // Upgrade to family plan
    console.log('\n📈 Upgrading to family plan...');
    await postgres.query(
      `UPDATE "User" 
       SET membership_tier = 3,
           membership_type = 'family',
           "updatedAt" = NOW()
       WHERE email = :email`,
      {
        replacements: { email: 'user@mediczy.com' },
        type: postgres.QueryTypes.UPDATE
      }
    );

    // Verify upgrade
    const [upgraded] = await postgres.query(
      'SELECT id, email, membership_tier, membership_type FROM "User" WHERE email = :email',
      {
        replacements: { email: 'user@mediczy.com' },
        type: postgres.QueryTypes.SELECT
      }
    );

    console.log('✅ Membership upgraded successfully!');
    console.log(`New membership: ${upgraded.membership_type} (tier: ${upgraded.membership_tier})`);
    console.log('\n📝 Family plan allows adding up to 4 family members');

  } catch (error) {
    console.error('❌ Error upgrading membership:', error.message);
    throw error;
  }
}

// Run the upgrade
(async () => {
  try {
    await orchestrator.initializeAll();
    await upgradeUserMembership();
    console.log('\n✅ Upgrade complete!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Upgrade failed:', error.message);
    process.exit(1);
  }
})();
