// Enhance labs data with AI-extracted brand names and structured information
const mysql = require('mysql2/promise');
const axios = require('axios');

async function extractBrandFromName(labName) {
  // Common lab chains in India
  const knownChains = [
    'Dr Lal PathLabs', 'Lal PathLabs', 'Dr Lal', 'PathLabs',
    'Thyrocare', 'SRL Diagnostics', 'SRL', 
    'Metropolis', 'Suburban Diagnostics',
    'Apollo Diagnostics', 'Apollo',
    'Fortis', 'Max Lab', 'Healthians',
    'Redcliffe Labs', 'Quest Diagnostics',
    'Vijaya Diagnostic', 'Vijaya',
    'Oncquest', 'iGenetic', 'Labcorp'
  ];

  // Check if lab name contains any known chain
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

  // Try to extract brand pattern (e.g., "Brand Name - Location")
  if (labName.includes(' - ')) {
    const parts = labName.split(' - ');
    return {
      brandName: parts[0].trim(),
      branchName: labName,
      isChain: true
    };
  }

  // Check for common patterns like "Lab Name (Branch)"
  const branchPattern = /^(.+?)\s*[\(\[]\s*(.+?)[\)\]]$/;
  const match = labName.match(branchPattern);
  if (match) {
    return {
      brandName: match[1].trim(),
      branchName: labName,
      isChain: true
    };
  }

  // Single independent lab
  return {
    brandName: labName,
    branchName: labName,
    isChain: false
  };
}

async function main() {
  const dbUser = process.env.DB_USER || 'mediczy';
  const dbPassword = process.env.DB_PASSWORD || 'Mediczy2024Secure';
  const dbName = process.env.DB_NAME || 'mediczy';

  const conn = await mysql.createConnection({
    host: 'localhost',
    user: dbUser,
    password: dbPassword,
    database: dbName,
    multipleStatements: true,
  });

  console.log('✓ Connected to database');

  // Check if brandName and branchName columns exist, if not add them
  try {
    await conn.execute(`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS brandName VARCHAR(255) DEFAULT NULL`);
    await conn.execute(`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS branchName VARCHAR(255) DEFAULT NULL`);
    await conn.execute(`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS isChain BOOLEAN DEFAULT FALSE`);
    console.log('✓ Ensured brandName, branchName, and isChain columns exist');
  } catch (e) {
    // Columns might already exist
    console.log('Note: Columns may already exist:', e.message);
  }

  // Fetch all labs
  const [labs] = await conn.execute(
    `SELECT id, name, address, city, state FROM clinics WHERE category = 'lab'`
  );

  console.log(`Found ${labs.length} labs to process`);

  let processed = 0;
  let updated = 0;

  for (const lab of labs) {
    try {
      const extracted = extractBrandFromName(lab.name || 'Unknown Lab');
      
      await conn.execute(
        `UPDATE clinics 
         SET brandName = ?, branchName = ?, isChain = ?
         WHERE id = ?`,
        [extracted.brandName || null, extracted.branchName || null, extracted.isChain ? 1 : 0, lab.id]
      );

      updated++;
      processed++;

      if (processed % 100 === 0) {
        console.log(`Processed ${processed}/${labs.length} labs...`);
      }
    } catch (e) {
      console.error(`Error processing lab ${lab.id}:`, e.message);
      processed++;
    }
  }

  console.log(`\n✓ Processing complete!`);
  console.log(`  Total processed: ${processed}`);
  console.log(`  Successfully updated: ${updated}`);

  // Show some statistics
  const [chains] = await conn.execute(
    `SELECT brandName, COUNT(*) as count 
     FROM clinics 
     WHERE category = 'lab' AND isChain = TRUE 
     GROUP BY brandName 
     ORDER BY count DESC 
     LIMIT 10`
  );

  console.log('\nTop 10 Lab Chains:');
  chains.forEach((chain, idx) => {
    console.log(`  ${idx + 1}. ${chain.brandName}: ${chain.count} branches`);
  });

  await conn.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
