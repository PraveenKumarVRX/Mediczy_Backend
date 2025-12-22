import { Prescription } from './server/models/index.js';
import { Doctor } from './server/models/index.js';

console.log('Fixing existing prescriptions...');

try {
  // Update prescriptions with null doctorName
  const prescriptions = await Prescription.findAll({
    where: { doctorName: null }
  });
  
  console.log(`Found ${prescriptions.length} prescriptions to update`);
  
  for (const rx of prescriptions) {
    const doctor = await Doctor.findByPk(rx.doctorId);
    if (doctor) {
      await rx.update({
        doctorName: `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim() || 'Doctor',
        doctorQualifications: Array.isArray(doctor.qualifications) 
          ? doctor.qualifications.join(', ') 
          : (doctor.qualifications || 'MBBS'),
        specialty: doctor.specialization || 'General Medicine'
      }, { validate: false });
      console.log(`Updated prescription ${rx.id}`);
    }
  }
  
  console.log('✅ All prescriptions updated');
  process.exit(0);
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
