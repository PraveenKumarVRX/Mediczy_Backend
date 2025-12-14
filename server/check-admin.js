import './models/user.model.intelligent.js';
import userModel from './models/user.model.intelligent.js';
import bcrypt from 'bcrypt';

(async () => {
  try {
    console.log('Finding all admin users...');
    
    // Find all admin users
    const admins = await userModel.findAll({ where: { isAdmin: true } });
    
    if (admins.length > 0) {
      console.log('✅ Found', admins.length, 'admin user(s):');
      for (const admin of admins) {
        console.log('---');
        console.log('📧 Email:', admin.email);
        console.log('🆔 ID:', admin._id || admin.id);
        console.log('👤 Name:', admin.firstName, admin.lastName);
        console.log('📞 Phone:', admin.phone);
        console.log('🔐 Role:', admin.role);
        
        // Try to verify with Admin@1234 password
        try {
          const isValid = await bcrypt.compare('Admin@1234', admin.password);
          console.log('🔑 Password Admin@1234 works:', isValid ? '✅ YES' : '❌ NO');
        } catch (e) {
          console.log('🔑 Password check error:', e.message);
        }
      }
      
      // Set password to Admin@1234 for the first admin
      const firstAdmin = admins[0];
      console.log('\\n🔄 Setting password to Admin@1234 for:', firstAdmin.email);
      const hashedPassword = await bcrypt.hash('Admin@1234', 10);
      await firstAdmin.update({ password: hashedPassword });
      console.log('✅ Password updated successfully!');
      
    } else {
      console.log('❌ No admin users found');
      
      // Create one
      console.log('🔄 Creating new admin user...');
      const hashedPassword = await bcrypt.hash('Admin@1234', 10);
      const admin = await userModel.create({
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@mediczy.local',
        password: hashedPassword,
        phone: '+1234567890',
        isAdmin: true,
        role: 'admin'
      });
      console.log('✅ Admin user created!');
      console.log('📧 Email:', admin.email);
      console.log('🔑 Password: Admin@1234');
    }
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
})();