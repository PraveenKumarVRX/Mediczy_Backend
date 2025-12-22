import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const jwtSecret = process.env.JWT_SECRET;

// Create a test doctor token
const doctorPayload = {
  id: 1,
  role: 'doctor',
  email: 'doctor@test.com'
};

const token = jwt.sign(doctorPayload, jwtSecret, { expiresIn: '1h' });

console.log('🔐 Testing Doctor Appointment Settings...\n');
console.log('Token created for doctor ID:', doctorPayload.id);

try {
  const response = await fetch('http://localhost:8000/api/doctor-settings/appointment-config', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const data = await response.json();
  
  console.log('\n📋 Response Status:', response.status);
  console.log('\n📊 Configuration Data:');
  console.log(JSON.stringify(data, null, 2));
  
  if (data.config?.weeklySchedule) {
    console.log('\n✅ Weekly Schedule Found:');
    Object.entries(data.config.weeklySchedule).forEach(([day, schedule]) => {
      console.log(`\n${day.toUpperCase()}:`);
      console.log(`  Day Off: ${schedule.isOff}`);
      if (!schedule.isOff) {
        if (schedule.online?.enabled) {
          console.log(`  Online: ${schedule.online.startTime} - ${schedule.online.endTime}`);
        }
        if (schedule.inPerson?.enabled) {
          console.log(`  In-Person: ${schedule.inPerson.startTime} - ${schedule.inPerson.endTime}`);
        }
      }
    });
  } else {
    console.log('\n⚠️  No weeklySchedule data found!');
  }
  
} catch (error) {
  console.error('❌ Error:', error.message);
}
