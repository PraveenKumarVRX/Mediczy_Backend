import './models/user.model.intelligent.js';
import userModel from './models/user.model.intelligent.js';
import bcrypt from 'bcrypt';

(async () => {
  try {
    console.log('Finding admin user...');
    
    // Find admin user
    let admin = await userModel.findOne({ where: { isAdmin: true } });
    
    if (admin) {
      console.log('✅ Found admin user:');
      console.log('📧 Email:', admin.email);
      console.log('🆔 ID:', admin._id || admin.id);
      console.log('👤 Name:', admin.firstName, admin.lastName);
      
      // Reset password to admin123
      console.log('🔄 Resetting password to: admin123');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await admin.update({ password: hashedPassword });
      
      console.log('✅ Password updated successfully!');
      console.log('📧 Login Email:', admin.email);
      console.log('🔑 Login Password: admin123');
    } else {
      console.log('❌ No admin user found');
    }
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();