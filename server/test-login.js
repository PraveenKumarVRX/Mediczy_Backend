import './models/user.model.mariadb.js';
import userModel from './models/user.model.mariadb.js';
import bcrypt from 'bcrypt';

(async () => {
  try {
    const email = 'admin@mediczy.local';
    const password = 'Admin@1234';
    
    console.log('🔍 Testing admin login process...');
    console.log('📧 Email:', email);
    console.log('🔑 Password:', password);
    
    // Step 1: Find user
    console.log('\\n1️⃣ Finding user...');
    const admin = await userModel.findOne({ where: { email, isAdmin: true } });
    
    if (!admin) {
      console.log('❌ No admin user found with that email');
      process.exit(1);
    }
    
    console.log('✅ Admin user found:');
    console.log('   ID:', admin.id);
    console.log('   Name:', admin.firstName, admin.lastName);
    console.log('   isAdmin:', admin.isAdmin);
    
    // Step 2: Check password
    console.log('\\n2️⃣ Checking password...');
    const valid = await bcrypt.compare(password, admin.password);
    console.log('✅ Password valid:', valid ? '✅ YES' : '❌ NO');
    
    if (!valid) {
      console.log('❌ Password mismatch');
      process.exit(1);
    }
    
    // Step 3: Generate token
    console.log('\\n3️⃣ Generating token...');
    try {
      const token = admin.generateAuthToken();
      console.log('✅ Token generated successfully');
      console.log('🎫 Token preview:', token.substring(0, 50) + '...');
      
      // Step 4: Simulate response
      const response = { 
        message: 'Admin login successful', 
        token, 
        admin: { id: admin.id, email: admin.email } 
      };
      console.log('\\n✅ Login should succeed with response:', JSON.stringify(response, null, 2));
      
    } catch (tokenError) {
      console.log('❌ Token generation failed:', tokenError.message);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
})();