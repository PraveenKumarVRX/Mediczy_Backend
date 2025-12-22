import bcrypt from 'bcrypt';

const storedHash = '$2b$10$E0epJZZijLqtn/EyBYwEPuXXhrB5kXgNsiNELOr1Yj9q5wk7yYBv2';

(async () => {
  try {
    // Try different passwords that might have been used
    const testPasswords = ['test123', 'password123', 'mediczy123', 'admin123', 'newpassword123', '123456', 'test'];
    
    console.log('Testing passwords against stored hash:', storedHash);
    
    for (const pwd of testPasswords) {
      const match = await bcrypt.compare(pwd, storedHash);
      console.log(`Password '${pwd}': ${match}`);
      if (match) {
        console.log('*** MATCH FOUND! ***');
        break;
      }
    }
    
    // Create a new hash for 'test123' and compare
    console.log('\nCreating new hash for "test123":');
    const newHash = await bcrypt.hash('test123', 10);
    console.log('New hash:', newHash);
    const testNew = await bcrypt.compare('test123', newHash);
    console.log('New hash validation:', testNew);
    
  } catch (e) {
    console.error('Error:', e.message);
  }
})();