import './models/user.model.intelligent.js';
import userModel from './models/user.model.intelligent.js';
import bcrypt from 'bcrypt';

(async () => {
  try {
    console.log('Checking for admin user...');
    
    // Check if admin user exists
    let admin = await userModel.findOne({ where: { isAdmin: true } });
    
    if (!admin) {
      console.log('No admin user found. Creating default admin...');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      admin = await userModel.create({
        firstName: 'Admin',
        lastName: 'User', 
        email: 'admin@mediczy.com',
        password: hashedPassword,
        phone: '+1234567890',
        isAdmin: true,
        role: 'admin'
      });
      console.log('✅ Admin user created successfully!');
      console.log('📧 Email: admin@mediczy.com');
      console.log('🔑 Password: admin123');
    } else {
      console.log('✅ Admin user already exists:');
      console.log('📧 Email:', admin.email);
      console.log('🆔 ID:', admin._id || admin.id);
    }
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();