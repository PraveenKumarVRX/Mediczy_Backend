import dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';

// Simple script to test admin login and protected endpoints
async function run() {
  const base = process.env.TEST_BASE_URL || 'http://localhost:8000/api';
  const email = process.env.ADMIN_EMAIL || 'admin@mediczy.local';
  const password = process.env.ADMIN_PASSWORD || 'Admin@1234';
  console.log('\n=== Admin Login Flow Test ===');
  console.log('Base URL:', base);
  console.log('Email:', email);

  try {
    const loginRes = await axios.post(base + '/admin/login', { email, password });
    console.log('✔ Login status:', loginRes.status, loginRes.data.message);
    const token = loginRes.data.token;
    console.log('Token prefix:', token.slice(0, 20) + '...');

    // Validate profile
    const profileRes = await axios.get(base + '/admin/profile', {
      headers: { Authorization: 'Bearer ' + token }
    });
    console.log('✔ Profile:', profileRes.data.email || profileRes.data.id);

    // Dashboard stats
    const statsRes = await axios.get(base + '/admin/dashboard/stats', {
      headers: { Authorization: 'Bearer ' + token }
    });
    console.log('✔ Dashboard stats keys:', Object.keys(statsRes.data.stats));

    // List users
    const usersRes = await axios.get(base + '/admin/users?limit=2', {
      headers: { Authorization: 'Bearer ' + token }
    });
    console.log('✔ Users returned:', usersRes.data.data.length);

    // List doctors
    const doctorsRes = await axios.get(base + '/admin/doctors?limit=2', {
      headers: { Authorization: 'Bearer ' + token }
    });
    console.log('✔ Doctors returned:', doctorsRes.data.data.length);

    console.log('\nAll admin endpoints tested successfully.');
  } catch (e) {
    if (e.response) {
      console.error('✖ Request failed:', e.response.status, e.response.data);
    } else {
      console.error('✖ Error:', e.message);
    }
    process.exit(1);
  }
}

run();