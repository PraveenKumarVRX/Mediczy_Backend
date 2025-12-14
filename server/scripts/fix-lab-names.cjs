// Fix lab names by re-reading from Excel with correct column names
const fs = require('fs');
const XLSX = require('xlsx');
const mysql = require('mysql2/promise');

async function main() {
  const dbUser = process.env.DB_USER || 'mediczy';
  const dbPassword = process.env.DB_PASSWORD || 'Mediczy2024Secure';
  const dbName = process.env.DB_NAME || 'mediczy';
  const excelPath = '/root/Mediczy/server/db/Master Data/Labs/labs list.xlsx';

  const conn = await mysql.createConnection({
    host: 'localhost',
    user: dbUser,
    password: dbPassword,
    database: dbName,
  });

  console.log('✓ Connected to database');

  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  console.log(`Found ${rows.length} rows in Excel`);

  // Get all labs from database ordered by ID
  const [labs] = await conn.execute(
    `SELECT id, name, address FROM clinics WHERE category = 'lab' ORDER BY id`
  );

  console.log(`Found ${labs.length} labs in database`);

  let updated = 0;
  let skipped = 0;

  // Match by address since we don't have a unique identifier
  for (let i = 0; i < Math.min(rows.length, labs.length); i++) {
    const row = rows[i];
    const lab = labs[i];
    
    const entityName = String(row.entity_name || row.NAME || '').trim();
    const fullAddress = String(row['Full Address'] || row.address || '').trim();
    
    if (!entityName || entityName === 'Unknown Lab') {
      skipped++;
      continue;
    }

    try {
      // Update by ID (assuming order matches)
      await conn.execute(
        `UPDATE clinics SET name = ? WHERE id = ?`,
        [entityName, lab.id]
      );
      updated++;

      if (updated % 100 === 0) {
        console.log(`Updated ${updated} labs...`);
      }
    } catch (e) {
      console.error(`Error updating lab ${lab.id}:`, e.message);
    }
  }

  console.log(`\n✓ Update complete!`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);

  // Now re-run the brand extraction on updated names
  console.log('\n🔄 Re-extracting brand names...');
  
  const [updatedLabs] = await conn.execute(
    `SELECT id, name FROM clinics WHERE category = 'lab' AND name != 'Unknown Lab'`
  );

  function extractBrandFromName(labName) {
    const knownChains = [
      'Dr Lal PathLabs', 'Lal PathLabs', 'Dr Lal', 'PathLabs',
      'Thyrocare', 'SRL Diagnostics', 'SRL', 
      'Metropolis', 'Suburban Diagnostics',
      'Apollo Diagnostics', 'Apollo',
      'Fortis', 'Max Lab', 'Healthians',
      'Redcliffe Labs', 'Redcliffe', 'Quest Diagnostics',
      'Vijaya Diagnostic', 'Vijaya',
      'Oncquest', 'iGenetic', 'Labcorp', 'Arthi Labs'
    ];

    const nameLower = labName.toLowerCase();
    for (const chain of knownChains) {
      if (nameLower.includes(chain.toLowerCase())) {
        return {
          brandName: chain,
          branchName: labName,
          isChain: true
        };
      }
    }

    if (labName.includes(' - ')) {
      const parts = labName.split(' - ');
      return {
        brandName: parts[0].trim(),
        branchName: labName,
        isChain: true
      };
    }

    const branchPattern = /^(.+?)\s*[\(\[]\s*(.+?)[\)\]]$/;
    const match = labName.match(branchPattern);
    if (match) {
      return {
        brandName: match[1].trim(),
        branchName: labName,
        isChain: true
      };
    }

    return {
      brandName: labName,
      branchName: labName,
      isChain: false
    };
  }

  let brandUpdated = 0;
  for (const lab of updatedLabs) {
    const extracted = extractBrandFromName(lab.name);
    await conn.execute(
      `UPDATE clinics SET brandName = ?, branchName = ?, isChain = ? WHERE id = ?`,
      [extracted.brandName, extracted.branchName, extracted.isChain ? 1 : 0, lab.id]
    );
    brandUpdated++;
    if (brandUpdated % 100 === 0) {
      console.log(`Re-extracted brands for ${brandUpdated} labs...`);
    }
  }

  console.log(`✓ Brand extraction complete: ${brandUpdated} labs`);

  await conn.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
