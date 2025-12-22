import { connectToDb } from './db/mariadb.js';
import User from './models/user.model.intelligent.js';

async function updateUserPassword() {
  try {
    await connectToDb();
    console.log('🔧 UPDATING USER PASSWORD');
    console.log('==========================');
    
    const email = 'kumar@test.com';
    const newPassword = 'password123';
    
    // Find the user
    const user = await User.findOne({ where: { email } });
    
    if (!user) {
      console.log('❌ User not found');
      return;
    }
    
    console.log('✅ User found:', user.email);
    
    // Update password (this will trigger the beforeUpdate hook to hash it)
    await user.update({ password: newPassword });
    
    console.log('✅ Password updated successfully');
    
    // Verify the password works
    const updatedUser = await User.findOne({ where: { email } });
    const isMatch = await updatedUser.comparePassword(newPassword);
    console.log('✅ Password verification:', isMatch);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

updateUserPassword();