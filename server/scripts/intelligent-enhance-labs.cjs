const mysql = require('mysql2/promise');
const axios = require('axios');

async function getPool() {
  return mysql.createPool({
    host: 'localhost',
    user: 'mediczy',
    password: 'Mediczy2024Secure',
    database: 'mediczy',
    waitForConnections: true,
    connectionLimit: 10,
  });
}

// Simple rule-based parsing with pattern matching
function intelligentParse(labData) {
  const name = labData.name || '';
  const areaName = labData.areaName || '';
  const address = labData.address || '';
  const city = labData.city || '';
  const state = labData.state || '';
  
  let brandName = name;
  let branchName = areaName;
  let parsedCity = city;
  let parsedState = state;
  
  // Fix: If areaName is same as brand name in uppercase, extract from address
  if (areaName && areaName.toUpperCase().includes(name.toUpperCase().substring(0, 10))) {
    // Extract area from address (usually right before city)
    const addressParts = address.split(/[,\s]+/);
    for (let i = 0; i < addressParts.length; i++) {
      const part = addressParts[i];
      if (part.length > 3 && !part.match(/^\d+$/) && !part.match(/Road|Street|Avenue|Plot|No\./i)) {
        if (i < addressParts.length - 3) { // Not city or state
          branchName = part;
          break;
        }
      }
    }
  }
  
  // Fix cities that are actually areas/roads
  if (city.includes('Road') || city.includes('Nagar') || city.includes('New')) {
    // Try to find real city in address
    const cities = ['Chennai', 'Mumbai', 'Delhi', 'Bangalore', 'Bengaluru', 'Hyderabad', 
                    'Pune', 'Kolkata', 'Ahmedabad', 'Surat', 'Jaipur', 'Lucknow',
                    'Kanpur', 'Nagpur', 'Indore', 'Thane', 'Bhopal', 'Visakhapatnam',
                    'Pimpri', 'Patna', 'Vadodara', 'Ghaziabad', 'Ludhiana', 'Agra',
                    'Nashik', 'Faridabad', 'Meerut', 'Rajkot', 'Kalyan', 'Vasai'];
    
    for (const realCity of cities) {
      if (address.toUpperCase().includes(realCity.toUpperCase())) {
        parsedCity = realCity;
        break;
      }
    }
  }
  
  // Capitalize properly
  if (branchName) {
    branchName = branchName.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  }
  
  if (parsedCity) {
    parsedCity = parsedCity.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  }
  
  if (parsedState && parsedState !== 'Delhi') {
    parsedState = parsedState.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  }
  
  return {
    brandName: brandName,
    branchName: branchName,
    city: parsedCity,
    state: parsedState,
    pincode: labData.pincode || '',
    services: labData.services || 'Pathology, Radiology, Clinical Chemistry'
  };
}

async function main() {
  const pool = await getPool();
  
  console.log('🤖 Starting Intelligent Data Enhancement...\n');
  
  try {
    // Fetch labs with poor data quality
    const [labs] = await pool.query(
      `SELECT id, name, areaName, address, city, state, pincode, services
       FROM clinics 
       WHERE category = 'lab'
       AND (
         name = areaName 
         OR city LIKE '%Road%' 
         OR city LIKE '%Nagar%'
         OR city LIKE '%New%'
         OR areaName LIKE 'ARTHI%'
         OR areaName LIKE 'REDCLIFFE%'
         OR areaName LIKE 'DR LAL%'
         OR areaName LIKE 'THYROCARE%'
       )
       ORDER BY id 
       LIMIT 200`
    );
    
    console.log(`Found ${labs.length} labs to enhance\n`);
    
    if (labs.length === 0) {
      console.log('✅ All labs already have good data quality!');
      await pool.end();
      return;
    }
    
    let updated = 0;

    for (let i = 0; i < labs.length; i++) {
      const lab = labs[i];
      
      if (i % 10 === 0) {
        console.log(`\n[${i + 1}/${labs.length}] Processing...`);
      }
      
      try {
        const parsed = intelligentParse(lab);
        
        // Only update if we made improvements
        const needsUpdate = 
          parsed.branchName !== lab.areaName ||
          parsed.city !== lab.city ||
          parsed.state !== lab.state;
        
        if (needsUpdate) {
          await pool.query(
            `UPDATE clinics SET 
              areaName = ?,
              city = ?,
              state = ?,
              updatedAt = NOW()
            WHERE id = ?`,
            [
              parsed.branchName,
              parsed.city,
              parsed.state,
              lab.id
            ]
          );
          
          if (updated < 10) {
            console.log(`  ✨ ${lab.name}`);
            console.log(`     Branch: ${lab.areaName} → ${parsed.branchName}`);
            console.log(`     Location: ${lab.city}, ${lab.state} → ${parsed.city}, ${parsed.state}`);
          }
          
          updated++;
        }
        
      } catch (error) {
        console.error(`  ❌ Error processing lab ${lab.id}:`, error.message);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Enhancement Summary:');
    console.log('='.repeat(60));
    console.log(`Total labs checked: ${labs.length}`);
    console.log(`✅ Enhanced: ${updated}`);
    console.log(`Already good: ${labs.length - updated}`);
    console.log('='.repeat(60));
    
    // Show sample results
    const [samples] = await pool.query(
      `SELECT name, areaName, city, state 
       FROM clinics 
       WHERE category = 'lab' AND city NOT LIKE '%Road%' AND city NOT LIKE '%Nagar%'
       ORDER BY RAND()
       LIMIT 5`
    );
    
    console.log('\n✨ Sample enhanced labs:');
    samples.forEach((lab, idx) => {
      console.log(`${idx + 1}. ${lab.name} - ${lab.areaName}`);
      console.log(`   📍 ${lab.city}, ${lab.state}`);
    });

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await pool.end();
  }
}

main();
