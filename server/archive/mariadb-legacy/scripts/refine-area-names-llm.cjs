const mysql = require('mysql2/promise');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// LLM API configuration
const LLM_PROVIDER = 'ollama';
const LLM_API_URL = 'http://localhost:11434';
const LLM_MODEL = 'llama3.2:1b'; // Using the model we know is installed

async function getPool() {
  return mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'mediczy',
    password: process.env.DB_PASSWORD || 'Mediczy2024Secure',
    database: process.env.DB_NAME || 'mediczy',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });
}

async function getPincodeAreas(pool, pincode) {
  if (!pincode || pincode.length !== 6) return [];
  const [rows] = await pool.query(
    'SELECT place_name FROM pincode_masters WHERE pincode = ?',
    [pincode]
  );
  return rows.map(r => r.place_name);
}

async function parseAreaWithLLM(labData, validAreas) {
  const validAreasStr = validAreas.length > 0 
    ? `Valid areas for pincode ${labData.pincode}: ${validAreas.join(', ')}`
    : `No master data for pincode ${labData.pincode}`;

  const prompt = `You are an address parser. 
Task: Extract the specific "Area Name" or "Locality" from the address.
Address: "${labData.address}"
${validAreasStr}

Instructions:
1. If the address contains one of the valid areas, return that area name.
2. If not, extract the most specific locality/neighborhood from the address string.
3. Do NOT return the city or state as the area name.
4. Return ONLY the area name as a JSON string {"areaName": "..."}.

Example:
Address: "123, 1st Main, Indiranagar, Bangalore"
Valid areas: "Indiranagar", "Jeevan Bima Nagar"
Result: {"areaName": "Indiranagar"}
`;

  try {
    const response = await axios.post(`${LLM_API_URL}/api/generate`, {
      model: LLM_MODEL,
      prompt: prompt,
      stream: false,
      format: 'json'
    });
    
    const rawResponse = response.data.response;
    return JSON.parse(rawResponse);
  } catch (error) {
    console.error('LLM parsing error:', error.message);
    return null;
  }
}

async function main() {
  const pool = await getPool();
  
  console.log('🤖 Starting LLM-powered Area Name Refinement...\n');
  
  try {
    // Test LLM connection
    try {
      await axios.get(`${LLM_API_URL}/api/tags`);
      console.log('✅ LLM service is running\n');
    } catch (error) {
      console.error('❌ Cannot connect to LLM service. Is Ollama running?');
      process.exit(1);
    }
    
    // Fetch labs. We want to process ALL labs to fix bad data like "Feet", "Main", etc.
    // But let's do it in batches.
    const [labs] = await pool.query(
      `SELECT id, name, address, pincode, areaName
       FROM clinics 
       WHERE category = 'lab'
       ORDER BY id`
    );
    
    console.log(`Found ${labs.length} labs to process.\n`);
    
    let updatedCount = 0;
    let skippedCount = 0;

    // Process in chunks to avoid overwhelming everything
    for (let i = 0; i < labs.length; i++) {
      const lab = labs[i];
      
      // Skip if address is too short to be useful
      if (!lab.address || lab.address.length < 10) {
        skippedCount++;
        continue;
      }

      // Get valid areas for this pincode
      const validAreas = await getPincodeAreas(pool, lab.pincode);
      
      process.stdout.write(`[${i + 1}/${labs.length}] Processing ID ${lab.id}... `);

      // Call LLM
      const result = await parseAreaWithLLM(lab, validAreas);
      
      if (result && result.areaName) {
        let newArea = result.areaName.trim();
        
        // Basic cleanup
        if (newArea.toLowerCase() === 'null' || newArea.toLowerCase() === 'n/a') {
            newArea = '';
        }

        // If the LLM returned something different from what we have, update it
        // Or if what we have is suspicious (short, numeric, etc)
        const isSuspicious = !lab.areaName || lab.areaName.length < 3 || /^\d/.test(lab.areaName) || ['feet', 'road', 'main', 'block', 'street'].includes(lab.areaName.toLowerCase());
        
        if (newArea && (newArea !== lab.areaName || isSuspicious)) {
             await pool.query(
              'UPDATE clinics SET areaName = ? WHERE id = ?',
              [newArea, lab.id]
            );
            console.log(`UPDATED: "${lab.areaName}" -> "${newArea}"`);
            updatedCount++;
        } else {
            console.log(`KEPT: "${lab.areaName}"`);
            skippedCount++;
        }
      } else {
        console.log('FAILED (LLM error)');
        skippedCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`Total processed: ${labs.length}`);
    console.log(`✅ Updated: ${updatedCount}`);
    console.log(`⏭️  Skipped/Kept: ${skippedCount}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await pool.end();
  }
}

main();
