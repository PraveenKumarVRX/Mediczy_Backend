/**
 * Upgrade User Membership to Family Plan - Simplified
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';
import orchestrator from '../db/orchestrator.js';

// Define User model inline
const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false
  },
  membership_type: {
    type: DataTypes.STRING
  }
}, {
  tableName: 'users',
  timestamps: true
});

async function upgradeUserMembership() {
  try {
    console.log('🚀 Starting user membership upgrade...\n');

    // Initialize databases
    await orchestrator.initializeAll();

    // Find user
    console.log('📊 Checking current membership...');
    const user = await User.findOne({ 
      where: { email: 'user@mediczy.com' }
    });

    if (!user) {
      console.error('❌ User user@mediczy.com not found');
      process.exit(1);
    }

    console.log(`Current membership: ${user.membership_type || 'individual'}`);

    // Upgrade to family plan
    console.log('\n📈 Upgrading to family plan...');
    await user.update({
      membership_type: 'family'
    });

    console.log('✅ Membership upgraded successfully!');
    console.log(`New membership: family`);
    console.log('\n📝 Family plan allows adding up to 4 family members');
    console.log('\n✅ Upgrade complete!');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error upgrading membership:', error.message);
    console.error(error);
    process.exit(1);
  }
}

upgradeUserMembership();
