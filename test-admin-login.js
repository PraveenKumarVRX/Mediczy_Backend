import pg from 'pg';
import bcrypt from 'bcrypt';

const client = new pg.Client({
  host: 'localhost',
  port: 5432,
  database: 'mediczy_ai',
  user: 'mediczy_helper',
  password: 'Mediczy2024Helper'
});

async function testAdminLogin() {
  try {
    await client.connect();
    console.log('✅ Connected to database');
    
    const result = await client.query(
      'SELECT * FROM users WHERE email = $1 AND "isAdmin" = true LIMIT 1',
      ['admin@mediqzy.com']
    );
    
    const user = result.rows[0];
    console.log('User found:', !!user);
    
    if (user) {
      console.log('User details:', {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        isAdmin: user.isAdmin
      });
      
      const isPasswordValid = await bcrypt.compare('SecurePass123', user.password);
      console.log('Password valid:', isPasswordValid);
      
      if (!isPasswordValid) {
        console.log('❌ Password mismatch!');
      } else {
        console.log('✅ Password matches!');
      }
    } else {
      console.log('❌ No admin user found');
    }
    
    await client.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    await client.end();
    process.exit(1);
  }
}

testAdminLogin();
