// Import Polyclinics from Excel into clinics table as category 'polyclinic'
const fs = require('fs');
const XLSX = require('xlsx');
const mysql = require('mysql2/promise');

async function main() {
  const dbUser = process.env.DB_USER || 'mediczy';
  const dbPassword = process.env.DB_PASSWORD || 'Mediczy2024Secure';
  const dbName = process.env.DB_NAME || 'mediczy';
  const excelPath = '/root/Mediczy/server/db/Master Data/Clinics/Poly Clinics/clinics list.xlsx';

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

  let inserted = 0, skipped = 0, errors = 0, counter = 1;
  const norm = (v) => String(v || '').trim();
  const toCode = (s, def) => (norm(s).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0,6) || def);
  const safeEmail = (base, idx) => {
    let local = norm(base).toLowerCase();
    if (!local || !/^[^@]+@[^@]+$/.test(local)) local = `polyclinic${idx}@example.com`;
    const [l, d] = local.split('@');
    return `${l}_${idx}@${d}`;
  };

  for (const row of rows) {
    try {
      const name = norm(row.NAME || row.Name || row['Clinic Name'] || row['NEW ENTITY NAME']);
      const address = norm(row.Address || row.ADDRESS || row['Full Address']);
      const city = norm(row.City || row.CITY || row['CITY/TOWN']);
      const state = norm(row.State || row.STATE || row['State Name']);
      const pincode = norm(row.Pincode || row.PINCODE || row['Pin Code'] || row['PIN CODE']);
      const phone = norm(row.Phone || row.PHONE || row['Contact No'] || row['CONTACT']);
      const emailBase = norm(row.Email || row.EMAIL || row['E-mail'] || row['EMAIL ID']);
      const ownerName = norm(row['Owner Name'] || row['DOCTOR NAME'] || row['Contact Person'] || 'N/A');

      if (!name && !address && !city) { skipped++; counter++; continue; }

      const registrationNumber = `POLY_${Date.now()}_${counter}`;
      const google_place_id = `POLY_${toCode(city,'CITY')}_${toCode(state,'STATE')}_${Date.now()}_${counter}`;
      const email = safeEmail(emailBase || `${toCode(city,'CITY').toLowerCase()}@clinics.example.com`, counter);

      const sql = `
        INSERT INTO clinics
          (name, registrationNumber, email, phone, address, city, state, pincode, ownerName, google_place_id, category, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'polyclinic', NOW(), NOW())
      `;
      const vals = [name || 'Unknown Polyclinic', registrationNumber, email, phone || '', address || '', city || '', state || '', pincode || '', ownerName || 'N/A', google_place_id];
      await conn.execute(sql, vals);
      inserted++;
      if (inserted % 50 === 0) console.log(`Inserted polyclinics: ${inserted}`);
    } catch (e) {
      errors++;
      try {
        counter++;
        const name = norm(row.NAME || row.Name || row['Clinic Name'] || row['NEW ENTITY NAME']);
        const address = norm(row.Address || row.ADDRESS || row['Full Address']);
        const city = norm(row.City || row.CITY || row['CITY/TOWN']);
        const state = norm(row.State || row.STATE || row['State Name']);
        const pincode = norm(row.Pincode || row.PINCODE || row['Pin Code'] || row['PIN CODE']);
        const phone = norm(row.Phone || row.PHONE || row['Contact No'] || row['CONTACT']);
        const emailBase = norm(row.Email || row.EMAIL || row['E-mail'] || row['EMAIL ID']);
        const ownerName = norm(row['Owner Name'] || row['DOCTOR NAME'] || row['Contact Person'] || 'N/A');
        const registrationNumber = `POLY_${Date.now()}_${counter}`;
        const google_place_id = `POLY_${toCode(city,'CITY')}_${toCode(state,'STATE')}_${Date.now()}_${counter}`;
        const email = safeEmail(emailBase || `${toCode(city,'CITY').toLowerCase()}@clinics.example.com`, counter);
        const sql = `
          INSERT INTO clinics
            (name, registrationNumber, email, phone, address, city, state, pincode, ownerName, google_place_id, category, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'polyclinic', NOW(), NOW())
        `;
        const vals = [name || 'Unknown Polyclinic', registrationNumber, email, phone || '', address || '', city || '', state || '', pincode || '', ownerName || 'N/A', google_place_id];
        await conn.execute(sql, vals);
        inserted++;
      } catch (e2) {
        skipped++;
      }
    } finally {
      counter++;
    }
  }

  console.log('Polyclinics import finished:', { inserted, skipped, errors });
  await conn.end();
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
