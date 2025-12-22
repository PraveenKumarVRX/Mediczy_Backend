import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import { sequelize } from '../db/mariadb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function importDoctorsFromExcel() {
  try {
    console.log('📂 Reading Excel file...');
    const filePath = path.join(__dirname, '../db/Master Data/Doctors Data/teleconsulation doctors list.xlsx');
    
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`📊 Found ${jsonData.length} doctors in Excel file`);
    console.log('📋 Sample data:', JSON.stringify(jsonData[0], null, 2));
    
    // Show all column names
    const columns = Object.keys(jsonData[0] || {});
    console.log('📝 Columns found:', columns);
    
    let inserted = 0;
    let updated = 0;
    let errors = 0;

    for (const row of jsonData) {
      try {
        // Map Excel columns to database fields (based on actual columns found)
        const fullName = row['Full Name'] || row['Name'] || '';
        const nameParts = fullName.replace(/^Dr\.?\s*/i, '').trim().split(' ');
        const firstName = nameParts[0] || 'Doctor';
        const lastName = nameParts.slice(1).join(' ') || 'Unknown';
        
        // Map specialization to valid ENUM values
        const specializationMap = {
          'DNB obgyn': 'Gynecologist',
          'obgyn': 'Gynecologist',
          'gynecology': 'Gynecologist',
          'pediatrics': 'Pediatrician',
          'general medicine': 'General Practitioner',
          'cardiology': 'Cardiologist',
          'dermatology': 'Dermatologist',
          'orthopedics': 'Orthopedist',
          'psychiatry': 'Psychiatrist',
          'psychology': 'Psychologist',
          'ent': 'ENT Specialist',
          'dentist': 'Dentist',
          'dentistry': 'Dentist'
        };
        
        const specValue = (row['Others please specify'] || '').toLowerCase().trim();
        const specialization = specializationMap[specValue] || 'Other';
        
        const doctorData = {
          firstName,
          lastName,
          email: row['Contact Email ID'] || row['Email'] || `doctor${Date.now()}${Math.random()}@mediczy.com`,
          phone: String(row['Contact Phone Number'] || row['Phone'] || ''),
          gender: row['Gender'] || 'Other',
          age: parseInt(row['Age'] || 30),
          specialization,
          qualification: row['Others please specify'] || row['Qualification'] || 'MBBS',
          experience: parseInt(row['Experience'] || 5),
          consultationFee: parseFloat(row['Fee'] || 500),
          city: 'Bangalore',
          hospital: row['Clinic Name Address where the Doctor practicing'] || '',
          languages: 'English, Hindi, Kannada',
          consultationType: 'both',
          availability: 'available',
          rating: 4.5,
          verified: true,
          approved: true
        };

        // Check if doctor exists (by email or phoneNumber)
        const existing = await sequelize.query(
          'SELECT id FROM doctors WHERE email = ? OR phoneNumber = ?',
          {
            replacements: [doctorData.email, doctorData.phone],
            type: sequelize.QueryTypes.SELECT
          }
        );

        if (existing && existing.length > 0) {
          // Update existing doctor
          await sequelize.query(
            `UPDATE doctors SET 
              firstName = ?, lastName = ?, specialization = ?, 
              experience = ?, consultationFees = ?
             WHERE id = ?`,
            {
              replacements: [
                doctorData.firstName, doctorData.lastName, doctorData.specialization,
                doctorData.experience, doctorData.consultationFee, existing[0].id
              ]
            }
          );
          updated++;
        } else {
          // Insert new doctor with password hash
          const bcrypt = await import('bcrypt');
          const hashedPassword = await bcrypt.hash('Mediczy@123', 10);
          
          const now = new Date();
          await sequelize.query(
            `INSERT INTO doctors (
              firstName, lastName, email, phoneNumber, password, specialization,
              experience, consultationFees, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            {
              replacements: [
                doctorData.firstName, doctorData.lastName, doctorData.email, doctorData.phone,
                hashedPassword, doctorData.specialization, doctorData.experience,
                doctorData.consultationFee, now, now
              ]
            }
          );
          inserted++;
        }
      } catch (err) {
        console.error(`❌ Error processing row:`, err.message);
        errors++;
      }
    }

    console.log('\n✅ Import completed!');
    console.log(`   📥 Inserted: ${inserted} doctors`);
    console.log(`   🔄 Updated: ${updated} doctors`);
    console.log(`   ❌ Errors: ${errors}`);
    
    // Show total count
    const total = await sequelize.query(
      'SELECT COUNT(*) as count FROM doctors',
      { type: sequelize.QueryTypes.SELECT }
    );
    console.log(`   📊 Total doctors in database: ${total[0].count}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  }
}

importDoctorsFromExcel();
