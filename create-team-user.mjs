import User from './server/models/user.model.intelligent.js';

(async () => {
  try {
    const email = 'parinitha@mysmarthealth.in';
    
    let user = await User.findOne({ where: { email } });
    
    if (user) {
      console.log('✅ User already exists, updating to team role...');
      await user.update({
        role: 'team',
        membershipType: 'team',
        password: 'Welcome@2026', // Will be hashed by beforeUpdate hook
        metadata: {
          department: 'Operations',
          designation: 'Team Lead',
          isTeam: true,
          canLogin: true,
        }
      });
      console.log('Updated user:', { id: user.id, email: user.email, role: user.role });
    } else {
      console.log('Creating new team user...');
      user = await User.create({
        firstName: 'Parinitha',
        lastName: 'MySmartHealth',
        email: 'parinitha@mysmarthealth.in',
        password: 'Welcome@2026', // Will be hashed by beforeCreate hook
        phoneNumber: '+919876543210',
        dateOfBirth: '1990-01-01',
        gender: 'Female',
        role: 'team',
        membershipType: 'team',
        status: 'active',
        isVerified: true,
        emailVerified: true,
        isAdmin: false,
        metadata: {
          department: 'Operations',
          designation: 'Team Lead',
          isTeam: true,
          canLogin: true,
        }
      });
      console.log('✅ Created team user:', { id: user.id, email: user.email, role: user.role });
    }
    
    console.log('\n📋 Login credentials:');
    console.log('Email:', email);
    console.log('Password: Welcome@2026');
    console.log('Role: team');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
})();
