const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

async function testPasswords() {
  // Get hash from DB
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    database: 'mediczy',
    socketPath: '/var/run/mysqld/mysqld.sock'
  });
  
  const [rows] = await connection.execute(
    'SELECT email, password FROM users WHERE email = ?',
    ['user@mediczy.com']
  );
  
  if (rows.length === 0) {
    console.log('User not found');
    await connection.end();
    return;
  }
  
  const user = rows[0];
  console.log('Testing password for:', user.email);
  console.log('Hash from DB:', user.password.substring(0, 30) + '...');
  
  const testPassword = 'User123';
  const isMatch = await bcrypt.compare(testPassword, user.password);
  
  console.log('\nTest password:', testPassword);
  console.log('Match result:', isMatch);
  
  if (!isMatch) {
    console.log('\n❌ Password does NOT match!');
    console.log('Generating correct hash for comparison...');
    const correctHash = await bcrypt.hash(testPassword, 10);
    console.log('New hash:', correctHash.substring(0, 30) + '...');
  } else {
    console.log('\n✅ Password matches!');
  }
  
  await connection.end();
}

testPasswords().catch(console.error);
