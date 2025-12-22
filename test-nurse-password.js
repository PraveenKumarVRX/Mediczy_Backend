import pg from 'pg';
import bcrypt from 'bcrypt';

const client = new pg.Client({
  host: 'localhost',
  port: 5432,
  database: 'mediczy_ai',
  user: 'mediczy_helper',
  password: 'Mediczy2024Helper'
});

client.connect().then(async () => {
  const result = await client.query('SELECT email, password FROM nurses WHERE email = $1', ['nurse@mediczy.com']);
  const nurse = result.rows[0];
  
  console.log('Nurse found:', !!nurse);
  if (nurse) {
    console.log('Email:', nurse.email);
    console.log('Has password:', !!nurse.password);
    
    if (nurse.password) {
      const match = await bcrypt.compare('Nurse123', nurse.password);
      console.log('Password "Nurse123" matches:', match);
    }
  }
  
  client.end();
}).catch(err => {
  console.error('Error:', err.message);
  client.end();
});
