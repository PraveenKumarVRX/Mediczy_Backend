const XLSX = require("xlsx");
const path = require("path");
const mysql = require("mysql2/promise");

async function importDentalClinics() {
  let pool;
  try {
    console.log("Starting dental clinics import...");

    pool = await mysql.createPool({
      host: process.env.DB_HOST || "127.0.0.1",
      user: process.env.DB_USER || "mediczy",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "mediczy",
      waitForConnections: true,
      connectionLimit: 10,
    });
    console.log("Database connected");

    // Read Excel file
    const excelPath = path.join(
      __dirname,
      "../db/Master Data/Clinics/Dental Clinics/Clove dental 2.xlsx"
    );

    const workbook = XLSX.readFile(excelPath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const clinics = XLSX.utils.sheet_to_json(sheet);

    console.log(`Found ${clinics.length} dental clinics in Excel file`);

    if (clinics.length > 0) {
      console.log("\nSample data:");
      console.log(JSON.stringify(clinics[0], null, 2));
    }

    // Add columns without creating indexes (table already has many indexes)
    try {
      await pool.query(`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS google_place_id VARCHAR(255) UNIQUE`);
    } catch (e) { /* Column may already exist */ }
    
    try {
      await pool.query(`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'general'`);
    } catch (e) { /* Column may already exist */ }
    
    try {
      await pool.query(`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`);
    } catch (e) { /* Column may already exist */ }
    
    console.log("Clinics table schema updated");

    let inserted = 0;
    let errors = 0;
    let skipped = 0;
    let counter = 1;

    for (const clinic of clinics) {
      try {
        // Map Excel columns (case-sensitive from sample)
        // Use NEW ENTITY NAME as it's unique per location
        const name =
          clinic["NEW ENTITY NAME"] ||
          clinic["CLINIC NAME"] ||
          clinic["Clinic Name"] ||
          clinic["Name"] ||
          "";

        const address =
          clinic["ADDRESS"] ||
          clinic["Address"] ||
          "";

        const city =
          clinic["CITY"] ||
          clinic["City"] ||
          "";

        const state =
          clinic["STATE"] ||
          clinic["State"] ||
          "";

        const pincode =
          clinic["PIN CODE"] ||
          clinic["Pincode"] ||
          clinic["Pin Code"] ||
          "";

        const phone =
          clinic["PHONE"] ||
          clinic["Phone"] ||
          clinic["Contact"] ||
          "";

        const email =
          clinic["EMAIL"] ||
          clinic["Email"] ||
          "";

        // Skip if no clinic name
        if (!name || name.trim() === "" || name === "0") {
          skipped++;
          continue;
        }

        // Generate unique registration number for dental clinics
        const timestamp = Date.now();
        const registrationNumber = `DENTAL_CLOVE_${timestamp}_${counter.toString().padStart(4, '0')}`;

        // Generate Google Place ID
        const cityStr = String(city || 'UNK');
        const stateStr = String(state || 'XX');
        const cityCode = cityStr.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
        const stateCode = stateStr.substring(0, 2).toUpperCase().replace(/[^A-Z]/g, 'X');
        const placeId = `DENTAL_${cityCode}_${stateCode}_${timestamp}_${counter.toString().padStart(4, '0')}`;

        // Get doctor name for owner field
        const ownerName = clinic["DOCTOR NAME"] || clinic["Doctor Name"] || "Dental Clinic Owner";
        
        // Make email unique by adding counter
        const baseEmail = email ? email.toString().trim() : '';
        const emailParts = baseEmail.split('@');
        const uniqueEmail = baseEmail 
          ? `${emailParts[0]}_${counter}@${emailParts[1] || 'clove.local'}`
          : `dental_${registrationNumber}@clove.local`;

        // Insert into database
        await pool.query(
          `INSERT INTO clinics 
          (name, registrationNumber, clinicType, category, email, phone, address, 
           city, state, pincode, google_place_id, is_active, specializations, ownerName, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            name.trim(),
            registrationNumber,
            'specialty', // Dental is a specialty clinic
            'dental',
            uniqueEmail,
            phone ? phone.toString().trim() : 'N/A',
            address ? address.toString().trim() : '',
            city ? city.toString().trim() : '',
            state ? String(state || '').trim() : '',
            pincode ? String(pincode || '').trim() : '',
            placeId,
            true,
            'Dental Care,Orthodontics,Oral Surgery',
            String(ownerName).trim()
          ]
        );

        inserted++;
        
        if (inserted % 50 === 0) {
          console.log(`Progress: ${inserted} clinics inserted...`);
        }
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
          skipped++;
        } else {
          console.error(`Error inserting clinic: ${error.message}`);
          errors++;
        }
      }
      counter++; // Always increment counter
    }

    // Get statistics
    const [totalClinics] = await pool.query(
      "SELECT COUNT(*) as count FROM clinics"
    );
    const [dentalClinics] = await pool.query(
      "SELECT COUNT(*) as count FROM clinics WHERE category = 'dental'"
    );
    const [byCity] = await pool.query(`
      SELECT city, COUNT(*) as count 
      FROM clinics 
      WHERE category = 'dental' AND city IS NOT NULL AND city != ''
      GROUP BY city 
      ORDER BY count DESC 
      LIMIT 10
    `);

    console.log("\n=== Import Summary ===");
    console.log(`Successfully inserted: ${inserted}`);
    console.log(`Skipped (duplicates/invalid): ${skipped}`);
    console.log(`Errors: ${errors}`);
    console.log(`Total clinics in database: ${totalClinics[0].count}`);
    console.log(`Total dental clinics: ${dentalClinics[0].count}`);
    
    console.log("\nTop 10 Cities with Dental Clinics:");
    byCity.forEach(c => {
      console.log(`  - ${c.city}: ${c.count} clinics`);
    });

    // Sample records
    console.log("\n=== Sample Dental Clinics ===");
    const [samples] = await pool.query(`
      SELECT id, name, city, state, google_place_id 
      FROM clinics 
      WHERE category = 'dental'
      ORDER BY id DESC
      LIMIT 5
    `);
    console.table(samples);

    await pool.end();
    console.log("\n✅ Dental clinics import completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Import failed:", error);
    if (pool) await pool.end();
    process.exit(1);
  }
}

importDentalClinics();
