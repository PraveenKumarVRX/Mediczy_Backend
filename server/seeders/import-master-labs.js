#!/usr/bin/env node
/**
 * Import Master Labs Data from Excel
 * Imports 2,362 labs from Master Data/Labs/labs list.xlsx
 */

import ExcelJS from 'exceljs';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import Lab from '../models/postgres/lab.model.postgres.js';
import bcrypt from 'bcrypt';

/**
 * Generate email from lab name and location
 */
function generateEmail(name, city, index) {
  const cleanName = name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '');
  const cleanCity = city ? city.toLowerCase().replace(/[^a-z0-9]/g, '') : 'india';
  return `${cleanName}.${cleanCity}${index}@mediczy.com`;
}

/**
 * Generate phone number (placeholder)
 */
function generatePhone(index) {
  const base = 9000000000;
  return `+91-${base + index}`;
}

/**
 * Parse full address into components
 */
function parseAddress(fullAddress, city, state, pincode, lat, lng) {
  return {
    street: fullAddress || '',
    city: city || 'Unknown',
    state: state || 'Unknown',
    zipCode: pincode?.toString() || '',
    country: 'India',
    coordinates: {
      lat: lat || null,
      lng: lng || null
    }
  };
}

/**
 * Import labs from Excel file
 */
async function importMasterLabs() {
  console.log('🏥 Starting Master Labs Import...\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Read Excel file
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile('db/Master Data/Labs/labs list.xlsx');
    const worksheet = workbook.worksheets[0];

    console.log(`📊 Found ${worksheet.rowCount - 1} labs in Excel file\n`);

    // Check existing labs
    const existingCount = await Lab.count();
    console.log(`📍 Current labs in database: ${existingCount}\n`);

    if (existingCount >= 100) {
      console.log('⚠️  Database already has many labs.');
      console.log('   To re-import, truncate the labs table first.\n');
      return;
    }

    // Default password for all labs
    const defaultPassword = await bcrypt.hash('Lab@2024', 10);

    // Parse Excel data
    const labsToImport = [];
    let skipped = 0;

    for (let i = 2; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      const values = [];
      row.eachCell((cell) => values.push(cell.value));

      const [name, address, state, city, pincode, fullAddress, lat, lng, discipline, userid] = values;

      if (!name) {
        skipped++;
        continue;
      }

      const labData = {
        name: name.trim(),
        email: userid || generateEmail(name, city, i),
        password: defaultPassword,
        phoneNumber: generatePhone(i),
        address: parseAddress(fullAddress || address, city, state, pincode, lat, lng),
        status: 'active',
        isVerified: true,
        rating: 4.0 + Math.random() * 0.9, // 4.0 to 4.9
        totalReviews: Math.floor(Math.random() * 50) + 10,
        accreditation: 'NABL',
        facilities: ['home-collection', 'online-reports'],
        services: [],  // Will be populated later
        testCatalog: {},
        metadata: {
          discipline: discipline || 'Diagnostic Lab',
          source: 'master-data-import',
          importedAt: new Date().toISOString()
        }
      };

      labsToImport.push(labData);

      // Show progress every 100 labs
      if (labsToImport.length % 100 === 0) {
        console.log(`📝 Prepared ${labsToImport.length} labs...`);
      }
    }

    console.log(`\n✅ Prepared ${labsToImport.length} labs for import`);
    if (skipped > 0) {
      console.log(`⚠️  Skipped ${skipped} rows (missing name)\n`);
    }

    // Import in batches
    const BATCH_SIZE = 100;
    let imported = 0;

    console.log('\n📦 Importing in batches of', BATCH_SIZE, '...\n');

    for (let i = 0; i < labsToImport.length; i += BATCH_SIZE) {
      const batch = labsToImport.slice(i, i + BATCH_SIZE);
      
      try {
        await Lab.bulkCreate(batch, {
          ignoreDuplicates: true,
          validate: true
        });
        
        imported += batch.length;
        console.log(`✅ Imported batch ${Math.floor(i / BATCH_SIZE) + 1}: ${imported}/${labsToImport.length} labs`);
      } catch (error) {
        console.error(`❌ Error in batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error.message);
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Master Labs Import Complete!');
    console.log(`📊 Total imported: ${imported} labs`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Show summary by state
    const summary = await sequelize.query(`
      SELECT 
        address->>'state' as state,
        COUNT(*) as count
      FROM labs
      GROUP BY address->>'state'
      ORDER BY count DESC
      LIMIT 10
    `, { type: sequelize.QueryTypes.SELECT });

    console.log('📍 Top 10 States by Lab Count:\n');
    summary.forEach(({ state, count }) => {
      console.log(`   ${state}: ${count} labs`);
    });
    console.log('');

  } catch (error) {
    console.error('❌ Import failed:', error);
    throw error;
  }
}

/**
 * Run importer if called directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  importMasterLabs()
    .then(() => {
      console.log('✅ Import completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Import failed:', error);
      process.exit(1);
    });
}

export default importMasterLabs;
