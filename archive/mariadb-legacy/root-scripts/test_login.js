import userModel from './models/user.model.mariadb.js';

(async () => {
  try {
    // Simulate the exact login process
    const email = 'test@mediczy.com';
    const password = 'newpassword123';
    
    console.log('Step 1: Finding user by email:', email);
    const user = await userModel.findOne({ where: { email } });
    if (!user) {
      console.log('User not found');
      return;
    }
    
    console.log('Step 2: User found with ID:', user.id);
    console.log('Step 3: Testing password comparison...');
    
    // Test the comparePassword method
    const isPasswordValid = await user.comparePassword(password);
    console.log('Password comparison result:', isPasswordValid);
    
    if (isPasswordValid) {
      console.log('Step 4: Generating token...');
      const token = user.generateAuthToken();
      console.log('Token generated:', token?.slice(0, 50) + '...');
    } else {
      console.log('Password invalid - checking password hash');
      console.log('Stored password hash:', user.password);
    }
    
  } catch (e) {
    console.error('Error:', e.message);
    console.error('Stack:', e.stack);
  }
  process.exit();
})();