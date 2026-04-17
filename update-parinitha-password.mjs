import User from './server/models/user.model.intelligent.js';

(async () => {
  try {
    const email = 'parinitha@mysmarthealth.in';
    
    const user = await User.findOne({ where: { email } });
    
    if (!user) {
      console.log('❌ User not found');
      process.exit(1);
    }
    
    await user.update({
      password: 'Mayden@321' // Will be hashed by beforeUpdate hook
    });
    
    console.log('✅ Password updated successfully!');
    console.log('Email:', email);
    console.log('New Password: Mayden@321');
    console.log('\nYou can now login at: https://app.mediqzy.com/team-login');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
