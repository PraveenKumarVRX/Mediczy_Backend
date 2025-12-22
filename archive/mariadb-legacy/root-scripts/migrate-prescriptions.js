import { sequelize as mariadb } from './server/db/mariadb.js';
import { connectToPostgresDB } from './server/db/postgres-sequelize.js';

async function migratePrescriptions() {
  try {
    console.log('Connecting to databases...');
    await mariadb.authenticate();
    const pgSequelize = await connectToPostgresDB();
    
    console.log('\n🔄 Migrating prescriptions...');
    const prescriptions = await mariadb.query('SELECT * FROM prescriptions', { 
      type: mariadb.QueryTypes.SELECT 
    });
    
    console.log(`📊 Found ${prescriptions.length} prescriptions in MariaDB`);
    
    let migrated = 0;
    let errors = 0;
    
    for (const rx of prescriptions) {
      try {
        // Parse medications if string
        let medications = [];
        if (rx.medications && typeof rx.medications === 'string') {
          try {
            medications = JSON.parse(rx.medications);
          } catch (e) {
            medications = rx.medications.split('\\n').filter(Boolean).map(med => ({
              name: med.trim(),
              dosage: '',
              frequency: '',
              duration: ''
            }));
          }
        }
        
        // Parse vitals if string
        let vitals = {};
        if (rx.vitals && typeof rx.vitals === 'string') {
          try {
            vitals = JSON.parse(rx.vitals);
          } catch (e) {
            console.warn(`Failed to parse vitals for prescription ${rx.id}`);
          }
        }
        
        const insertQuery = `
          INSERT INTO prescriptions (
            "prescriptionId", "appointmentId", "patientId", "doctorId", 
            "clinicId", "patientName", age, gender, "phoneNumber",
            diagnosis, advice, "chiefComplaints", medications, vitals,
            "patientDetails", "clinicDetails", "diagnosisCodes", 
            "diagnosisDetails", "adviceList", "labTests", "followUp",
            referrals, allergies, "chronicConditions", "additionalNotes",
            status, "validUntil", "dispensedAt", "dispensedBy",
            "dispensingDetails", metadata, "organization_id", "organization_type",
            "createdAt", "updatedAt"
          ) VALUES (
            :prescriptionId, :appointmentId, :patientId, :doctorId,
            :clinicId, :patientName, :age, :gender, :phoneNumber,
            :diagnosis, :advice, :chiefComplaints, :medications, :vitals,
            :patientDetails, :clinicDetails, :diagnosisCodes,
            :diagnosisDetails, :adviceList, :labTests, :followUp,
            :referrals, :allergies, :chronicConditions, :additionalNotes,
            :status, :validUntil, :dispensedAt, :dispensedBy,
            :dispensingDetails, :metadata, :organization_id, :organization_type,
            :createdAt, :updatedAt
          )
          ON CONFLICT ("prescriptionId") DO NOTHING
        `;
        
        await pgSequelize.query(insertQuery, {
          replacements: {
            prescriptionId: rx.prescriptionId || rx.prescriptionNumber || `RX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            appointmentId: rx.appointmentId,
            patientId: rx.patientId,
            doctorId: rx.doctorId,
            clinicId: null,
            patientName: rx.patientName,
            age: rx.patientAge,
            gender: rx.patientGender,
            phoneNumber: rx.patientPhone,
            diagnosis: rx.diagnosis,
            advice: rx.instructions || rx.notes,
            chiefComplaints: rx.chiefComplaints ? `{${rx.chiefComplaints.split(',').map(c => c.trim()).filter(Boolean).join(',')}}` : '{}',
            medications: JSON.stringify(medications),
            vitals: JSON.stringify(vitals),
            patientDetails: JSON.stringify({
              name: rx.patientName,
              age: rx.patientAge,
              gender: rx.patientGender,
              phone: rx.patientPhone
            }),
            clinicDetails: JSON.stringify({
              name: rx.clinicName,
              address: rx.clinicAddress,
              phone: rx.clinicPhone,
              email: rx.clinicEmail,
              doctorName: rx.doctorName,
              doctorQualifications: rx.doctorQualifications,
              doctorRegNo: rx.doctorRegNo
            }),
            diagnosisCodes: '{}',
            diagnosisDetails: JSON.stringify({
              diagnosis: rx.diagnosis,
              chiefComplaints: rx.chiefComplaints
            }),
            adviceList: (() => {
              if (!rx.instructions) return '{}';
              try {
                const parsed = typeof rx.instructions === 'string' && rx.instructions.startsWith('[') 
                  ? JSON.parse(rx.instructions) 
                  : rx.instructions.split('\\n').filter(Boolean);
                return `{${parsed.map(a => `"${String(a).replace(/"/g, '\\\\"')}"`).join(',')}}`;
              } catch (e) {
                return '{}';
              }
            })(),
            labTests: rx.labTests ? (typeof rx.labTests === 'string' ? rx.labTests : JSON.stringify(rx.labTests)) : JSON.stringify([]),
            followUp: JSON.stringify({
              date: rx.followUpDate,
              notes: rx.followUpNotes
            }),
            referrals: rx.referralNotes ? JSON.stringify([{notes: rx.referralNotes}]) : JSON.stringify([]),
            allergies: '{}',
            chronicConditions: '{}',
            additionalNotes: JSON.stringify({
              notes: rx.notes,
              followUpNotes: rx.followUpNotes,
              referralNotes: rx.referralNotes
            }),
            status: rx.status || 'issued',
            validUntil: rx.expiresAt,
            dispensedAt: rx.dispensedAt,
            dispensedBy: rx.dispensedBy ? parseInt(rx.dispensedBy) || null : null,
            dispensingDetails: JSON.stringify({
              dispensedBy: rx.dispensedBy,
              dispensingNotes: rx.dispensingNotes,
              pdfUrl: rx.pdfUrl,
              digitalSignature: rx.digitalSignature,
              signedAt: rx.signedAt
            }),
            metadata: JSON.stringify({}),
            organization_id: null,
            organization_type: null,
            createdAt: rx.createdAt || new Date(),
            updatedAt: rx.updatedAt || new Date()
          }
        });
        
        migrated++;
        process.stdout.write(`\\r✅ Migrated ${migrated}/${prescriptions.length} prescriptions`);
      } catch (error) {
        errors++;
        console.error(`\\n❌ Error migrating prescription ${rx.id}:`, error.message);
      }
    }
    
    console.log(`\\n\\n📊 Migration Summary:`);
    console.log(`   Migrated: ${migrated}`);
    console.log(`   Errors: ${errors}`);
    console.log(`\\n✅ Prescriptions migration complete!`);
    
    await mariadb.close();
    await pgSequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('\\n❌ Fatal error:', error);
    process.exit(1);
  }
}

migratePrescriptions();
