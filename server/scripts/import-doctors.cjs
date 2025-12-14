// Import Doctors from Excel into doctors table
const fs = require('fs');
const XLSX = require('xlsx');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function main() {
  const dbUser = process.env.DB_USER || 'mediczy';
  const dbPassword = process.env.DB_PASSWORD || 'Mediczy2024Secure';
  const dbName = process.env.DB_NAME || 'mediczy';
  const excelPath = '/root/Mediczy/server/db/Master Data/Doctors Data/Doctors List 624.xlsx';

  if (!fs.existsSync(excelPath)) {
    console.error('Excel file not found at', excelPath);
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: 'localhost',
    user: dbUser,
    password: dbPassword,
    database: dbName,
  });

  const wb = XLSX.readFile(excelPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  console.log(`Total rows in Excel: ${rows.length}`);
  console.log('Sample row:', rows[0]);

  let inserted = 0, skipped = 0, errors = 0, counter = 1;
  const norm = (v) => String(v || '').trim();
  const defaultPassword = await bcrypt.hash('Doctor@123', 10);

  // Specialization mapping
  const specializationMap = {
    'general practitioner': 'General Practitioner',
    'cardiologist': 'Cardiologist',
    'dermatologist': 'Dermatologist',
    'pediatrician': 'Pediatrician',
    'orthopedist': 'Orthopedist',
    'neurologist': 'Neurologist',
    'psychiatrist': 'Psychiatrist',
    'psychologist': 'Psychologist',
    'gynecologist': 'Gynecologist',
    'ent specialist': 'ENT Specialist',
    'ophthalmologist': 'Ophthalmologist',
    'dentist': 'Dentist',
    'general surgeon': 'General Surgeon',
    'other': 'Other'
  };

  const mapSpecialization = (spec) => {
    const normalized = norm(spec).toLowerCase();
    return specializationMap[normalized] || 'Other';
  };

  const safeEmail = (base, idx) => {
    let email = norm(base).toLowerCase();
    if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
      email = `doctor${idx}@mediczy.com`;
    }
    return email;
  };

  for (const row of rows) {
    try {
      const firstName = norm(row['First Name'] || row['FIRST NAME'] || row['Name'] || row['NAME'] || 'Doctor');
      const lastName = norm(row['Last Name'] || row['LAST NAME'] || row['Surname'] || row['SURNAME'] || counter);
      const emailBase = norm(row['Email'] || row['EMAIL'] || row['E-mail']);
      const phone = norm(row['Phone'] || row['PHONE'] || row['Mobile'] || row['MOBILE'] || row['Contact']);
      const specialization = norm(row['Specialization'] || row['SPECIALIZATION'] || row['Specialty'] || row['SPECIALTY'] || 'Other');
      const qualification = norm(row['Qualification'] || row['QUALIFICATION'] || row['Degree'] || 'MBBS');
      const experience = parseInt(row['Experience'] || row['EXPERIENCE'] || row['Exp'] || '5') || 5;
      const registrationNumber = norm(row['Registration Number'] || row['REGISTRATION NUMBER'] || row['Reg No'] || `DOC${Date.now()}_${counter}`);
      const city = norm(row['City'] || row['CITY'] || row['Location'] || '');
      const state = norm(row['State'] || row['STATE'] || '');
      const address = norm(row['Address'] || row['ADDRESS'] || row['Clinic Address'] || '');

      if (!firstName && !phone) { skipped++; counter++; continue; }

      const email = safeEmail(emailBase || `${firstName.toLowerCase().replace(/\s+/g, '')}${counter}@mediczy.com`, counter);
      const mappedSpec = mapSpecialization(specialization);
      const clinicAddress = address || (city && state ? `${city}, ${state}` : null);

      const sql = `
        INSERT INTO doctors
          (prefix, firstName, lastName, email, password, phoneNumber, specialization, qualification, experience, registrationNumber, clinicAddress, consultationFees, isVerified, createdAt, updatedAt)
        VALUES ('Dr', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 500.00, 0, NOW(), NOW())
      `;
      const vals = [firstName, lastName, email, defaultPassword, phone || '0000000000', mappedSpec, qualification, experience, registrationNumber, clinicAddress];

      await conn.execute(sql, vals);
      inserted++;
      if (inserted % 50 === 0) console.log(`Inserted doctors: ${inserted}`);
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        skipped++;
      } else {
        errors++;
        console.error(`Error at row ${counter}:`, e.message);
      }
    } finally {
      counter++;
    }
  }

  console.log('Doctors import finished:', { inserted, skipped, errors });

  // Show summary stats
  const [total] = await conn.query('SELECT COUNT(*) as c FROM doctors');
  const [bySpec] = await conn.query(`
    SELECT specialization, COUNT(*) as c 
    FROM doctors 
    GROUP BY specialization 
    ORDER BY c DESC 
    LIMIT 10
  `);

  console.log(`\nTotal doctors in database: ${total[0].c}`);
  console.log('\nTop specializations:');
  bySpec.forEach(s => console.log(`  - ${s.specialization}: ${s.c}`));

  await conn.end();
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
