import './models/user.model.intelligent.js';
import userModel from './models/user.model.intelligent.js';
import bcrypt from 'bcrypt';

(async () => {
  try {
    const email = 'admin@mediczy.local';
    
    // Let's use a simple password first to test if the mechanism works
    const testPassword = 'admin123';
    
    console.log('🔄 Setting simple test password:', testPassword);
    
    // Find admin
    let admin = await userModel.findOne({ where: { email } });
    if (!admin) {
      console.log('Creating admin user...');
      admin = await userModel.create({
        firstName: 'Admin',
        lastName: 'User', 
        email: email,
        password: 'temp', // will be updated
        phoneNumber: '+1234567890',
        dateOfBirth: new Date('1990-01-01'),
        gender: 'Other',
        isAdmin: true,
        role: 'admin'
      });
    }
    
    // Hash and set password
    const hashedPassword = await bcrypt.hash(testPassword, 10);
    await admin.update({ password: hashedPassword });
    
    // Test immediately
    const fresh = await userModel.findOne({ where: { email } });
    const valid = await bcrypt.compare(testPassword, fresh.password);
    
    if (valid) {
      console.log('✅ TEST PASSWORD WORKS!');
      console.log('📧 Email:', email);
      console.log('🔑 Password:', testPassword);
      
      // Now set to your preferred password
      const finalPassword = 'Admin@1234';
      console.log('\\n🔄 Now setting to your password:', finalPassword);
      
      const finalHashed = await bcrypt.hash(finalPassword, 10);
      await fresh.update({ password: finalHashed });
      
      // Test final password
      const finalTest = await userModel.findOne({ where: { email } });
      const finalValid = await bcrypt.compare(finalPassword, finalTest.password);
      
      console.log('✅ Final password works:', finalValid);
      
      if (finalValid) {
        console.log('\\n🎯 FINAL CREDENTIALS:');
        console.log('📧 Email:', email);
        console.log('🔑 Password:', finalPassword);
        console.log('🌐 URL: http://192.168.1.72:4000/admin/login');
      }
      
    } else {
      console.log('❌ Even simple password failed - there may be a deeper issue');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();