import { sequelize as mariadb } from './server/db/mariadb.js';
import { connectToPostgresDB } from './server/db/postgres-sequelize.js';

async function migrateAppointments() {
  try {
    console.log('Connecting to databases...');
    await mariadb.authenticate();
    const pgSequelize = await connectToPostgresDB();
    
    console.log('\n🔄 Migrating appointments...');
    const appointments = await mariadb.query('SELECT * FROM appointments', { type: mariadb.QueryTypes.SELECT });
    
    console.log(`📊 Found ${appointments.length} appointments in MariaDB`);
    
    let migrated = 0;
    let errors = 0;
    
    for (const apt of appointments) {
      try {
        const appointmentDateTime = apt.appointmentDate && apt.appointmentTime ? 
          new Date(`${apt.appointmentDate}T${apt.appointmentTime}`) : null;
        
        const insertQuery = `
          INSERT INTO appointments (
            "appointmentId", "patientId", "doctorId", "appointmentDate", 
            "appointmentTime", "appointmentDateTime", type, duration, status,
            "patientDetails", "doctorDetails", "statusHistory", symptoms,
            "notes_json", "paymentDetails", "meetingDetails", reminders,
            "cancellationReason", "cancelledBy", "cancelledAt",
            "organization_id", "organization_type", "createdAt", "updatedAt"
          ) VALUES (
            :appointmentId, :patientId, :doctorId, :appointmentDate,
            :appointmentTime, :appointmentDateTime, :type, :duration, :status,
            :patientDetails, :doctorDetails, :statusHistory, :symptoms,
            :notes_json, :paymentDetails, :meetingDetails, :reminders,
            :cancellationReason, :cancelledBy, :cancelledAt,
            :organization_id, :organization_type, :createdAt, :updatedAt
          )
          ON CONFLICT ("appointmentId") DO NOTHING
        `;
        
        await pgSequelize.query(insertQuery, {
          replacements: {
            appointmentId: `APT-${apt.id}`,
            patientId: apt.userId,
            doctorId: apt.doctorId,
            appointmentDate: apt.appointmentDate,
            appointmentTime: apt.appointmentTime,
            appointmentDateTime,
            type: apt.consultationType || 'online',
            duration: apt.duration || 30,
            status: apt.status || 'scheduled',
            patientDetails: JSON.stringify({
              name: apt.patientName,
              email: apt.patientEmail,
              phone: apt.patientPhone
            }),
            doctorDetails: JSON.stringify({
              name: apt.doctorName,
              specialization: apt.specialization
            }),
            statusHistory: JSON.stringify([{
              status: apt.status,
              timestamp: apt.createdAt || new Date(),
              changedBy: 'migration',
              reason: 'Migrated from MariaDB'
            }]),
            symptoms: apt.symptoms ? `{${apt.symptoms.replace(/"/g, '\\"')}}` : '{}',
            notes_json: JSON.stringify({
              patient: apt.reason || '',
              notes: apt.notes || '',
              prescription: apt.prescription || ''
            }),
            paymentDetails: JSON.stringify({
              consultationFee: apt.consultationFee,
              paymentStatus: apt.paymentStatus,
              paymentMethod: apt.paymentMethod,
              transactionId: apt.transactionId
            }),
            meetingDetails: JSON.stringify({
              meetingLink: apt.meetingLink,
              meetingId: apt.meetingId,
              recordingUrl: apt.recordingUrl
            }),
            reminders: apt.reminderSent ? JSON.stringify([{
              sent: true,
              sentAt: apt.reminderSentAt
            }]) : JSON.stringify([]),
            cancellationReason: apt.cancellationReason,
            cancelledBy: apt.cancelledBy === 'patient' ? apt.userId : (apt.cancelledBy === 'doctor' ? apt.doctorId : null),
            cancelledAt: apt.cancelledAt,
            organization_id: null,
            organization_type: null,
            createdAt: apt.createdAt || new Date(),
            updatedAt: apt.updatedAt || new Date()
          }
        });
        
        migrated++;
        process.stdout.write(`\r✅ Migrated ${migrated}/${appointments.length} appointments`);
      } catch (error) {
        errors++;
        console.error(`\n❌ Error migrating appointment ${apt.id}:`, error.message);
      }
    }
    
    console.log(`\n\n📊 Migration Summary:`);
    console.log(`   Migrated: ${migrated}`);
    console.log(`   Errors: ${errors}`);
    console.log(`\n✅ Appointments migration complete!`);
    
    await mariadb.close();
    await pgSequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

migrateAppointments();
