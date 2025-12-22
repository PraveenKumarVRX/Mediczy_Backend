const bcrypt = require('bcrypt');

const password = 'SecurePass123';
const saltRounds = 12;

bcrypt.hash(password, saltRounds, (err, hash) => {
  if (err) {
    console.error('Error generating hash:', err);
  } else {
    console.log('ADMIN_PASSWORD_HASH=' + hash);
    console.log('\nAdd this line to your .env file:');
    console.log('ADMIN_PASSWORD_HASH=' + hash);
  }
  process.exit(0);
});