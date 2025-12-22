const XLSX = require("xlsx");
const path = require("path");
const mysql = require("mysql2/promise");

// Hospital import script
async function importHospitals() {
  let pool;
  try {
    console.log("Starting hospital import...");

    // Create database connection
    pool = await mysql.createPool({
      host: process.env.DB_HOST || "127.0.0.1",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "mediczy",
      waitForConnections: true,
      connectionLimit: 10,
    });
    console.log("Database connected");

    // Read both Excel files
    const hospitalListPath = path.join(
      __dirname,
      "../db/Master Data/Hospitals Data/Hospital list.xlsx"
    );
    const smartHealthPath = path.join(
      __dirname,
      "../db/Master Data/Hospitals Data/SmartHealth Hospital master list.xlsx"
    );

    const workbook1 = XLSX.readFile(hospitalListPath);
    const workbook2 = XLSX.readFile(smartHealthPath);

    // Get first sheet from each workbook
    const sheet1 = workbook1.Sheets[workbook1.SheetNames[0]];
    const sheet2 = workbook2.Sheets[workbook2.SheetNames[0]];

    // Convert to JSON
    const hospitals1 = XLSX.utils.sheet_to_json(sheet1);
    const hospitals2 = XLSX.utils.sheet_to_json(sheet2);

    console.log(`Found ${hospitals1.length} hospitals in Hospital list.xlsx`);
    console.log(`Found ${hospitals2.length} hospitals in SmartHealth Hospital master list.xlsx`);

    // Log sample data to understand structure
    if (hospitals1.length > 0) {
      console.log("\nSample from Hospital list.xlsx:");
      console.log(JSON.stringify(hospitals1[0], null, 2));
    }
    if (hospitals2.length > 0) {
      console.log("\nSample from SmartHealth Hospital master list.xlsx:");
      console.log(JSON.stringify(hospitals2[0], null, 2));
    }

    // Create hospitals table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hospitals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address TEXT,
        city VARCHAR(100),
        state VARCHAR(100),
        pincode VARCHAR(20),
        phone VARCHAR(50),
        mobile VARCHAR(50),
        email VARCHAR(100),
        entity_type VARCHAR(100),
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_city (city),
        INDEX idx_state (state),
        INDEX idx_pincode (pincode),
        INDEX idx_name (name)
      )
    `);
    console.log("\nHospitals table created/verified");

    // Combine both datasets
    const allHospitals = [...hospitals1, ...hospitals2];
    
    let inserted = 0;
    let errors = 0;

    for (const hospital of allHospitals) {
      try {
        // Map Excel columns to database columns (flexible mapping)
        const name =
          hospital["Entity Name"] ||
          hospital["Name"] ||
          hospital["Hospital Name"] ||
          hospital["hospital_name"] ||
          "";

        const address =
          hospital["Address"] ||
          hospital["address"] ||
          "";

        const city =
          hospital["City/Location"] ||
          hospital["City"] ||
          hospital["city"] ||
          "";

        const state =
          hospital["State"] ||
          hospital["state"] ||
          "";

        const pincode =
          hospital["Pincode"] ||
          hospital["pincode"] ||
          "";

        const phone =
          hospital["Phone"] ||
          hospital["Telephone"] ||
          hospital["phone"] ||
          "";

        const mobile =
          hospital["Mobile"] ||
          hospital["mobile"] ||
          "";

        const email =
          hospital["Email"] ||
          hospital["email"] ||
          "";

        const entityType =
          hospital["Entity Type"] ||
          hospital["entity_type"] ||
          "HOSPITAL";

        const active =
          hospital["Active"] === "Y/N" || 
          hospital["Active"] === "Y" ||
          hospital["Live"] === "Y/N" ||
          hospital["Live"] === "Y" ||
          true;

        // Skip if no hospital name
        if (!name || name.trim() === "" || name === "0") {
          continue;
        }

        // Insert into database
        await pool.query(
          `INSERT INTO hospitals 
          (name, address, city, state, pincode, phone, mobile, email, entity_type, active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            name.trim(),
            address ? address.toString().trim() : null,
            city ? city.toString().trim() : null,
            state ? state.toString().trim() : null,
            pincode ? pincode.toString().trim() : null,
            phone ? phone.toString().trim() : null,
            mobile ? mobile.toString().trim() : null,
            email ? email.toString().trim() : null,
            entityType ? entityType.toString().trim() : "HOSPITAL",
            active,
          ]
        );

        inserted++;
      } catch (error) {
        console.error(`Error inserting hospital: ${error.message}`);
        errors++;
      }
    }

    // Get total count
    const [result] = await pool.query("SELECT COUNT(*) as count FROM hospitals");
    const totalHospitals = result[0].count;

    console.log("\n=== Import Summary ===");
    console.log(`Successfully inserted: ${inserted}`);
    console.log(`Errors: ${errors}`);
    console.log(`Total hospitals in database: ${totalHospitals}`);

    if (pool) await pool.end();
    process.exit(0);
  } catch (error) {
    console.error("Import failed:", error);
    if (pool) await pool.end();
    process.exit(1);
  }
}

importHospitals();
