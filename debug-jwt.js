const jwt = require('jsonwebtoken');

const JWT_SECRET = 'MediczYJWTK3yS3cur3AndStr0ng2024!';
const testToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJ0ZXN0QG1lZGljenkuY29tIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3NjI5NDEwMTYsImV4cCI6MTc2MzU0NTgxNn0.yTA71s3qLhTZ8XtRAHztQMn_E8_2KE9aepoFdF3y_DM';

console.log('Testing JWT verification...');
console.log('JWT_SECRET:', JWT_SECRET);
console.log('Token:', testToken);

try {
  const decoded = jwt.verify(testToken, JWT_SECRET);
  console.log('✅ SUCCESS: Token verified:', decoded);
} catch (error) {
  console.log('❌ ERROR: Token verification failed:', error.message);
  
  // Try with SECRET_TOKEN instead
  const SECRET_TOKEN = 'MediczYS3cur3T0k3nF0rJWTAuth2024!';
  try {
    console.log('\nTrying with SECRET_TOKEN...');
    const decoded = jwt.verify(testToken, SECRET_TOKEN);
    console.log('✅ SUCCESS with SECRET_TOKEN: Token verified:', decoded);
  } catch (error2) {
    console.log('❌ ERROR with SECRET_TOKEN too:', error2.message);
  }
}