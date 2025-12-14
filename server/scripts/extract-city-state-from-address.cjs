const mysql = require('mysql2/promise');

async function getPool() {
  return mysql.createPool({
    host: 'localhost',
    user: process.env.DB_USER || 'mediczy',
    password: process.env.DB_PASSWORD || 'Mediczy2024Secure',
    database: process.env.DB_NAME || 'mediczy',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });
}

// Function to extract city, state, pincode from address
function extractLocationFromAddress(address) {
  if (!address) return { city: '', state: '', pincode: '' };
  
  // Common patterns in Indian addresses:
  // "Address CITY STATE PINCODE"
  // "Address, CITY STATE PINCODE"
  // Look for pincode (6 digits)
  const pincodeMatch = address.match(/\b(\d{6})\b/);
  const pincode = pincodeMatch ? pincodeMatch[1] : '';
  
  // State names (common ones)
  const states = [
    'TAMILNADU', 'TAMIL NADU', 'KARNATAKA', 'KERALA', 'MAHARASHTRA', 
    'DELHI', 'UTTAR PRADESH', 'GUJARAT', 'RAJASTHAN', 'ANDHRA PRADESH',
    'TELANGANA', 'WEST BENGAL', 'PUNJAB', 'HARYANA', 'MADHYA PRADESH',
    'BIHAR', 'ODISHA', 'ASSAM', 'JHARKHAND', 'CHHATTISGARH', 
    'GOA', 'HIMACHAL PRADESH', 'UTTARAKHAND', 'JAMMU AND KASHMIR',
    'PUDUCHERRY', 'CHANDIGARH', 'MANIPUR', 'MEGHALAYA', 'TRIPURA',
    'MIZORAM', 'NAGALAND', 'ARUNACHAL PRADESH', 'SIKKIM', 'LADAKH'
  ];
  
  let state = '';
  for (const s of states) {
    if (address.toUpperCase().includes(s)) {
      state = s.split(' ').map(word => 
        word.charAt(0) + word.slice(1).toLowerCase()
      ).join(' ');
      break;
    }
  }
  
  // Extract city - typically appears before state or before pincode
  let city = '';
  if (state) {
    const stateIndex = address.toUpperCase().indexOf(state.toUpperCase());
    const beforeState = address.substring(0, stateIndex).trim();
    // Get last word/words before state
    const parts = beforeState.split(/[,\s]+/).filter(Boolean);
    city = parts[parts.length - 1] || '';
  } else if (pincode) {
    const pincodeIndex = address.indexOf(pincode);
    const beforePincode = address.substring(0, pincodeIndex).trim();
    const parts = beforePincode.split(/[,\s]+/).filter(Boolean);
    // Get last 1-2 words before pincode (likely city name)
    city = parts.slice(-2).join(' ');
  }
  
  // Clean up city name
  city = city.replace(/^,+|,+$/g, '').trim();
  
  return { city, state, pincode };
}

async function main() {
  const pool = await getPool();
  
  try {
    console.log('Fetching labs from clinics table...');
    const [labs] = await pool.query(
      'SELECT id, name, address FROM clinics WHERE category = ? AND (city IS NULL OR city = "")',
      ['lab']
    );
    
    console.log(`Found ${labs.length} labs with missing city/state/pincode`);
    
    let updated = 0;
    let failed = 0;
    
    for (const lab of labs) {
      const { city, state, pincode } = extractLocationFromAddress(lab.address);
      
      try {
        await pool.query(
          'UPDATE clinics SET city = ?, state = ?, pincode = ? WHERE id = ?',
          [city || '', state || '', pincode || '', lab.id]
        );
        
        updated++;
        
        if (updated % 100 === 0) {
          console.log(`Processed ${updated}/${labs.length} labs...`);
        }
        
        // Log first 5 for verification
        if (updated <= 5) {
          console.log(`\nLab ${lab.id}: ${lab.name}`);
          console.log(`  Address: ${lab.address}`);
          console.log(`  Extracted - City: "${city}", State: "${state}", Pincode: "${pincode}"`);
        }
      } catch (err) {
        console.error(`Failed to update lab ${lab.id}:`, err.message);
        failed++;
      }
    }
    
    console.log('\n✅ Extraction complete!');
    console.log(`Successfully updated: ${updated} labs`);
    console.log(`Failed: ${failed} labs`);
    
    // Verify results
    const [verification] = await pool.query(
      'SELECT COUNT(*) as count, city, state FROM clinics WHERE category = ? GROUP BY city, state ORDER BY count DESC LIMIT 10',
      ['lab']
    );
    
    console.log('\nTop 10 city-state combinations:');
    verification.forEach(row => {
      console.log(`  ${row.city || '(empty)'}, ${row.state || '(empty)'}: ${row.count} labs`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

main();
