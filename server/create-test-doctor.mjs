import pkg from 'pg';
const { Client } = pkg;
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'mediczy_ai',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD
});

console.log('📋 Creating/updating test doctor account...\n');

try {
  await client.connect();
  
  // Check if doctor exists
  const checkResult = await client.query(
    'SELECT id, email, "firstName", "lastName" FROM doctors WHERE email = $1',
    ['testdoctor@mediczy.com']
  );
  
  if (checkResult.rows.length > 0) {
    const doctor = checkResult.rows[0];
    console.log('✅ Doctor already exists:');
    console.log(`   ID: ${doctor.id}`);
    console.log(`   Email: ${doctor.email}`);
    console.log(`   Name: ${doctor.firstName} ${doctor.lastName}`);
    
    // Check weeklySchedule
    const scheduleResult = await client.query(
      'SELECT "weeklySchedule", "offDays", "slotDuration" FROM doctors WHERE id = $1',
      [doctor.id]
    );
    
    console.log('\n📊 Current Schedule Data:');
    console.log(`   weeklySchedule: ${scheduleResult.rows[0].weeklySchedule ? 'SET' : 'NULL'}`);
    console.log(`   offDays: ${scheduleResult.rows[0].offDays || 'NULL'}`);
    console.log(`   slotDuration: ${scheduleResult.rows[0].slotDuration || 'NULL'}`);
    
    if (scheduleResult.rows[0].weeklySchedule) {
      const schedule = typeof scheduleResult.rows[0].weeklySchedule === 'string' 
        ? JSON.parse(scheduleResult.rows[0].weeklySchedule)
        : scheduleResult.rows[0].weeklySchedule;
        
      console.log('\n📅 Weekly Schedule:');
      Object.entries(schedule).forEach(([day, config]) => {
        console.log(`\n${day.toUpperCase()}:`);
        console.log(`  isOff: ${config.isOff}`);
        if (!config.isOff && config.online) {
          console.log(`  Online: ${config.online.enabled ? config.online.startTime + ' - ' + config.online.endTime : 'disabled'}`);
        }
        if (!config.isOff && config.inPerson) {
          console.log(`  In-Person: ${config.inPerson.enabled ? config.inPerson.startTime + ' - ' + config.inPerson.endTime : 'disabled'}`);
        }
      });
    }
    
  } else {
    // Create new doctor
    const hashedPassword = await bcrypt.hash('Doctor123!', 10);
    
    const defaultSchedule = {
      monday: { isOff: false, online: { enabled: true, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' } },
      tuesday: { isOff: false, online: { enabled: true, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' } },
      wednesday: { isOff: false, online: { enabled: true, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' } },
      thursday: { isOff: false, online: { enabled: true, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' } },
      friday: { isOff: false, online: { enabled: true, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' } },
      saturday: { isOff: false, online: { enabled: true, startTime: '10:00', endTime: '14:00' }, inPerson: { enabled: false, startTime: '14:00', endTime: '18:00' } },
      sunday: { isOff: true, online: { enabled: false, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: false, startTime: '14:00', endTime: '18:00' } }
    };
    
    const insertResult = await client.query(`
      INSERT INTO doctors (email, password, "firstName", "lastName", specialty, "phoneNumber", "weeklySchedule", "offDays", "slotDuration", "onlineConsultationEnabled", "inPersonConsultationEnabled", "onlineConsultationFee", "inPersonConsultationFee")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id, email, "firstName", "lastName"
    `, [
      'testdoctor@mediczy.com',
      hashedPassword,
      'Test',
      'Doctor',
      'General Physician',
      '+919999999999',
      JSON.stringify(defaultSchedule),
      JSON.stringify(['sunday']),
      15,
      true,
      true,
      500,
      700
    ]);
    
    console.log('✅ Doctor created:');
    console.log(`   ID: ${insertResult.rows[0].id}`);
    console.log(`   Email: ${insertResult.rows[0].email}`);
    console.log(`   Password: Doctor123!`);
  }
  
  await client.end();
  
} catch (error) {
  console.error('❌ Error:', error.message);
  try { await client.end(); } catch {}
}
