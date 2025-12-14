const mysql = require("mysql2/promise");

async function cleanHospitals() {
  let pool;
  try {
    console.log("Starting hospital data cleanup...");

    pool = await mysql.createPool({
      host: process.env.DB_HOST || "127.0.0.1",
      user: process.env.DB_USER || "mediczy",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "mediczy",
      waitForConnections: true,
      connectionLimit: 10,
    });

    // 1. Add google_place_id column if not exists
    console.log("\n1. Adding google_place_id column...");
    await pool.query(`
      ALTER TABLE hospitals 
      ADD COLUMN IF NOT EXISTS google_place_id VARCHAR(255) UNIQUE,
      ADD INDEX IF NOT EXISTS idx_google_place_id (google_place_id)
    `);

    // 2. Get count before cleanup
    const [beforeCount] = await pool.query("SELECT COUNT(*) as count FROM hospitals");
    console.log(`\n2. Total hospitals before cleanup: ${beforeCount[0].count}`);

    // 3. Find and display duplicates
    console.log("\n3. Finding duplicates...");
    const [duplicates] = await pool.query(`
      SELECT name, city, state, COUNT(*) as count
      FROM hospitals
      GROUP BY name, city, state
      HAVING count > 1
      ORDER BY count DESC
      LIMIT 20
    `);
    console.log(`Found ${duplicates.length} duplicate groups (showing top 20):`);
    duplicates.forEach(d => {
      console.log(`  - ${d.name} in ${d.city}, ${d.state}: ${d.count} duplicates`);
    });

    // 4. Remove duplicates, keeping the one with most complete data
    console.log("\n4. Removing duplicates...");
    await pool.query(`
      DELETE h1 FROM hospitals h1
      INNER JOIN hospitals h2 
      WHERE h1.id < h2.id
      AND h1.name = h2.name
      AND COALESCE(h1.city, '') = COALESCE(h2.city, '')
      AND COALESCE(h1.state, '') = COALESCE(h2.state, '')
    `);

    // 5. Remove entries with invalid names
    console.log("\n5. Removing invalid entries...");
    const [invalidResult] = await pool.query(`
      DELETE FROM hospitals 
      WHERE name = '' 
      OR name = '0' 
      OR name IS NULL
      OR LENGTH(TRIM(name)) < 3
    `);
    console.log(`Removed ${invalidResult.affectedRows} invalid entries`);

    // 6. Clean up data
    console.log("\n6. Cleaning up data...");
    await pool.query(`
      UPDATE hospitals
      SET 
        name = TRIM(name),
        address = TRIM(COALESCE(address, '')),
        city = TRIM(COALESCE(city, '')),
        state = TRIM(COALESCE(state, '')),
        email = LOWER(TRIM(COALESCE(email, ''))),
        phone = TRIM(COALESCE(phone, '')),
        mobile = TRIM(COALESCE(mobile, ''))
      WHERE id > 0
    `);

    // 7. Generate unique identifiers for Google Places mapping
    console.log("\n7. Generating unique place identifiers...");
    
    // First, create a function to generate place ID from hospital data
    const [hospitals] = await pool.query(`
      SELECT id, name, city, state, pincode 
      FROM hospitals 
      WHERE google_place_id IS NULL
      ORDER BY id
    `);

    console.log(`Generating place IDs for ${hospitals.length} hospitals...`);
    
    let updated = 0;
    for (const hospital of hospitals) {
      // Generate a unique identifier based on hospital data
      // Format: HOSP_CITYCODE_STATECODE_UNIQUEID
      const cityCode = (hospital.city || 'UNK').substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
      const stateCode = (hospital.state || 'XX').substring(0, 2).toUpperCase().replace(/[^A-Z]/g, 'X');
      const uniqueId = hospital.id.toString().padStart(6, '0');
      const placeId = `HOSP_${cityCode}_${stateCode}_${uniqueId}`;
      
      await pool.query(
        'UPDATE hospitals SET google_place_id = ? WHERE id = ?',
        [placeId, hospital.id]
      );
      updated++;
      
      if (updated % 1000 === 0) {
        console.log(`  Progress: ${updated}/${hospitals.length}`);
      }
    }
    console.log(`Generated ${updated} unique place IDs`);

    // 8. Get final statistics
    const [afterCount] = await pool.query("SELECT COUNT(*) as count FROM hospitals");
    const [withEmail] = await pool.query("SELECT COUNT(*) as count FROM hospitals WHERE email IS NOT NULL AND email != ''");
    const [withPhone] = await pool.query("SELECT COUNT(*) as count FROM hospitals WHERE phone IS NOT NULL AND phone != ''");
    const [withPlaceId] = await pool.query("SELECT COUNT(*) as count FROM hospitals WHERE google_place_id IS NOT NULL");
    const [byState] = await pool.query(`
      SELECT state, COUNT(*) as count 
      FROM hospitals 
      WHERE state IS NOT NULL AND state != ''
      GROUP BY state 
      ORDER BY count DESC 
      LIMIT 10
    `);

    console.log("\n=== Cleanup Summary ===");
    console.log(`Hospitals before: ${beforeCount[0].count}`);
    console.log(`Hospitals after: ${afterCount[0].count}`);
    console.log(`Removed: ${beforeCount[0].count - afterCount[0].count}`);
    console.log(`\nData Quality:`);
    console.log(`  - With email: ${withEmail[0].count}`);
    console.log(`  - With phone: ${withPhone[0].count}`);
    console.log(`  - With Google Place ID: ${withPlaceId[0].count}`);
    console.log(`\nTop 10 States:`);
    byState.forEach(s => {
      console.log(`  - ${s.state}: ${s.count} hospitals`);
    });

    // 9. Create sample query for verification
    console.log("\n=== Sample Records ===");
    const [samples] = await pool.query(`
      SELECT id, name, city, state, google_place_id 
      FROM hospitals 
      ORDER BY id 
      LIMIT 5
    `);
    console.table(samples);

    await pool.end();
    console.log("\n✅ Cleanup completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Cleanup failed:", error);
    if (pool) await pool.end();
    process.exit(1);
  }
}

cleanHospitals();
