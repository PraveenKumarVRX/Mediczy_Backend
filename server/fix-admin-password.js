import './models/user.model.intelligent.js';
import userModel from './models/user.model.intelligent.js';
import bcrypt from 'bcrypt';

(async () => {
  try {
    const email = 'admin@mediczy.local';
    const newPassword = 'Admin@1234';
    
    console.log('🔄 Setting admin password to exactly:', newPassword);
    
    // Find the admin user
    const admin = await userModel.findOne({ where: { email, isAdmin: true } });
    
    if (!admin) {
      console.log('❌ Admin user not found');
      process.exit(1);
    }
    
    // Hash the exact password you provided
    console.log('🔐 Hashing password...');
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    console.log('✅ Password hashed');
    
    // Update the admin user
    await admin.update({ password: hashedPassword });
    console.log('✅ Admin password updated');
    
    // Verify it works
    console.log('🧪 Testing password...');
    const updatedAdmin = await userModel.findOne({ where: { email, isAdmin: true } });
    const isValid = await bcrypt.compare(newPassword, updatedAdmin.password);
    
    if (isValid) {
      console.log('✅ Password verification successful!');
      console.log('📧 Admin Email:', email);
      console.log('🔑 Admin Password:', newPassword);
      
      // Test token generation
      const token = updatedAdmin.generateAuthToken();
      console.log('🎫 Token generated successfully');
      
      console.log('\\n🎯 READY TO TEST:');
      console.log('URL: http://192.168.1.72:4000/admin/login');
      console.log('Email:', email);
      console.log('Password:', newPassword);
      
    } else {
      console.log('❌ Password verification failed');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();