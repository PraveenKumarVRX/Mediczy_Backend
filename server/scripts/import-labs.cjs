// Import Labs from Excel into clinics table as category 'lab'
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const mysql = require('mysql2/promise');

async function main() {
  const dbUser = process.env.DB_USER || 'mediczy';
  const dbPassword = process.env.DB_PASSWORD || 'Mediczy2024Secure';
  const dbName = process.env.DB_NAME || 'mediczy';
  const excelPath = '/root/Mediczy/server/db/Master Data/Labs/labs list.xlsx';

  if (!fs.existsSync(excelPath)) {
    console.error('Excel file not found at', excelPath);
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: 'localhost',
    user: dbUser,
    password: dbPassword,
    database: dbName,
    multipleStatements: true,
  });

  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  let counter = 1;

  // Helper: normalize strings
  const norm = (v) => String(v || '').trim();
  const toCityCode = (city) => norm(city).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'CITY';
  const toStateCode = (state) => norm(state).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'STATE';
  const safeEmail = (base, idx) => {
    let local = norm(base).toLowerCase();
    if (!local || !/^[^@]+@[^@]+$/.test(local)) local = `lab${idx}@example.com`;
    const [l, d] = local.split('@');
    return `${l}_${idx}@${d}`;
  };

  console.log(`Total rows in sheet '${sheetName}':`, rows.length);

  for (const row of rows) {
    try {
      // Flexible column mapping
      const name = norm(row.NAME || row.Name || row['Lab Name'] || row['LAB NAME'] || row['NEW ENTITY NAME'] || row['Clinic Name']);
      const address = norm(row.Address || row.ADDRESS || row['Full Address'] || row['ADDRESS']);
      const city = norm(row.City || row.CITY || row['CITY/TOWN'] || row['Town/City']);
      const state = norm(row.State || row.STATE || row['State Name']);
      const pincode = norm(row.Pincode || row.PINCODE || row['Pin Code'] || row['PIN CODE'] || row['Zip']);
      const phone = norm(row.Phone || row.PHONE || row['Contact No'] || row['CONTACT']);
      const emailBase = norm(row.Email || row.EMAIL || row['E-mail'] || row['EMAIL ID']);
      const ownerName = norm(row['Owner Name'] || row['DOCTOR NAME'] || row['Contact Person'] || 'N/A');

      if (!name && !address && !city) {
        skipped++;
        counter++;
        continue;
      }

      const registrationNumber = `LAB_${Date.now()}_${counter}`;
      const google_place_id = `LAB_${toCityCode(city)}_${toStateCode(state)}_${Date.now()}_${counter}`;
      const email = safeEmail(emailBase || `${toCityCode(city).toLowerCase()}@labs.example.com`, counter);

      const values = [
        name || 'Unknown Lab',
        registrationNumber,
        email,
        phone || '',
        address || '',
        city || '',
        state || '',
        pincode || '',
        ownerName || 'N/A',
        google_place_id,
        'lab',
      ];

      const sql = `
        INSERT INTO clinics
          (name, registrationNumber, email, phone, address, city, state, pincode, ownerName, google_place_id, category, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `;

      await conn.execute(sql, values);
      inserted++;
      if (inserted % 50 === 0) console.log(`Inserted labs: ${inserted}`);
    } catch (e) {
      // Likely duplicate email/registrationNumber — bump counter and continue
      errors++;
      // Try once more with incremented counter for uniqueness
      try {
        counter++;
        const name = norm(row.NAME || row.Name || row['Lab Name'] || row['LAB NAME'] || row['NEW ENTITY NAME'] || row['Clinic Name']);
        const address = norm(row.Address || row.ADDRESS || row['Full Address'] || row['ADDRESS']);
        const city = norm(row.City || row.CITY || row['CITY/TOWN'] || row['Town/City']);
        const state = norm(row.State || row.STATE || row['State Name']);
        const pincode = norm(row.Pincode || row.PINCODE || row['Pin Code'] || row['PIN CODE'] || row['Zip']);
        const phone = norm(row.Phone || row.PHONE || row['Contact No'] || row['CONTACT']);
        const emailBase = norm(row.Email || row.EMAIL || row['E-mail'] || row['EMAIL ID']);
        const ownerName = norm(row['Owner Name'] || row['DOCTOR NAME'] || row['Contact Person'] || 'N/A');

        const registrationNumber = `LAB_${Date.now()}_${counter}`;
        const google_place_id = `LAB_${toCityCode(city)}_${toStateCode(state)}_${Date.now()}_${counter}`;
        const email = safeEmail(emailBase || `${toCityCode(city).toLowerCase()}@labs.example.com`, counter);

        const values = [
          name || 'Unknown Lab',
          registrationNumber,
          email,
          phone || '',
          address || '',
          city || '',
          state || '',
          pincode || '',
          ownerName || 'N/A',
          google_place_id,
          'lab',
        ];

        const sql = `
          INSERT INTO clinics
            (name, registrationNumber, email, phone, address, city, state, pincode, ownerName, google_place_id, category, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `;
        await conn.execute(sql, values);
        inserted++;
      } catch (e2) {
        skipped++;
      }
    } finally {
      counter++;
    }
  }

  console.log('Import finished:', { inserted, skipped, errors });
  await conn.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
