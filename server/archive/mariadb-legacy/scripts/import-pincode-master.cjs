const fs = require('fs');
const path = require('path');
const axios = require('axios');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'mediczy',
  password: process.env.DB_PASSWORD || 'Mediczy2024Secure',
  database: process.env.DB_NAME || 'mediczy',
  multipleStatements: true
};

// Sanand0 URL
const PINCODE_CSV_URL = 'https://raw.githubusercontent.com/sanand0/pincode/master/data/IN.csv';
const DOWNLOAD_PATH = path.join(__dirname, '../db/masters/pincodes.csv');

async function downloadCSV() {
  console.log(`Downloading pincode data from ${PINCODE_CSV_URL}...`);
  const response = await axios({
    method: 'get',
    url: PINCODE_CSV_URL,
    responseType: 'stream'
  });

  const writer = fs.createWriteStream(DOWNLOAD_PATH);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

async function importPincodes() {
  let connection;
  try {
    // 1. Download CSV
    if (!fs.existsSync(DOWNLOAD_PATH)) {
      await downloadCSV();
      console.log('Download complete.');
    } else {
      console.log('CSV file already exists, skipping download.');
    }

    // 2. Connect to DB
    connection = await mysql.createConnection(DB_CONFIG);
    console.log('Connected to database.');

    // 3. Create Table with correct collation
    await connection.execute(`
      DROP TABLE IF EXISTS pincode_masters;
    `);
    await connection.execute(`
      CREATE TABLE pincode_masters (
        id INT AUTO_INCREMENT PRIMARY KEY,
        pincode VARCHAR(10) NOT NULL,
        place_name VARCHAR(255),
        state VARCHAR(100),
        district VARCHAR(100),
        taluk VARCHAR(100),
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        accuracy INT,
        INDEX idx_pincode (pincode)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
    `);
    console.log('Table pincode_masters created (utf8mb4_general_ci).');

    // 4. Read and Parse CSV
    const fileContent = fs.readFileSync(DOWNLOAD_PATH, 'utf8');
    const lines = fileContent.split('\n');
    
    console.log(`Found ${lines.length} lines in CSV.`);

    // 5. Insert Data
    const batchSize = 1000;
    let batch = [];
    let count = 0;

    for (let line of lines) {
      if (!line.trim()) continue;
      
      // CSV format: key, place_name, state, lat, long, accuracy
      // Example: IN/110001,Connaught Place,Delhi,28.6333,77.2167,4
      
      const parts = line.split(',');
      if (parts.length < 3) continue;

      const key = parts[0]; // IN/110001
      const place_name = parts[1];
      const state = parts[2];
      const lat = parts[3] ? parseFloat(parts[3]) : null;
      const long = parts[4] ? parseFloat(parts[4]) : null;
      const accuracy = parts[5] ? parseInt(parts[5]) : null;

      const pincode = key.replace('IN/', '');

      if (!pincode || pincode.length !== 6) continue;

      batch.push([pincode, place_name, state, null, null, lat, long, accuracy]);

      if (batch.length >= batchSize) {
        await insertBatch(connection, batch);
        count += batch.length;
        process.stdout.write(`\rImported ${count} records...`);
        batch = [];
      }
    }

    if (batch.length > 0) {
      await insertBatch(connection, batch);
      count += batch.length;
    }

    console.log(`\nImport complete. Total ${count} records.`);

    // 6. Map Labs to Pincode Areas
    console.log('Mapping labs to pincode areas...');
    
    // Update clinics
    // We use a subquery to pick one place_name
    const [updateResult] = await connection.execute(`
      UPDATE clinics c
      JOIN (
        SELECT pincode, MAX(place_name) as place_name 
        FROM pincode_masters 
        GROUP BY pincode 
      ) p ON c.pincode = p.pincode
      SET c.areaName = p.place_name
      WHERE (c.areaName IS NULL OR c.areaName = '')
    `);

    console.log(`Updated ${updateResult.changedRows} clinics with area names from pincode master.`);

    // Verify
    const [rows] = await connection.execute(`
      SELECT COUNT(*) as total, 
             COUNT(areaName) as with_area 
      FROM clinics
    `);
    console.log('Verification:', rows[0]);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (connection) await connection.end();
  }
}

async function insertBatch(connection, batch) {
  if (batch.length === 0) return;
  const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
  const flatValues = batch.flat();
  await connection.execute(
    `INSERT INTO pincode_masters (pincode, place_name, state, district, taluk, latitude, longitude, accuracy) VALUES ${placeholders}`,
    flatValues
  );
}

importPincodes();
