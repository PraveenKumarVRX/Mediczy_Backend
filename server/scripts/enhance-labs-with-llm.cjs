const mysql = require('mysql2/promise');
const axios = require('axios');

// LLM API configuration (supports multiple providers)
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'ollama'; // ollama, openai, anthropic
const LLM_API_URL = process.env.LLM_API_URL || 'http://localhost:11434';
const LLM_MODEL = process.env.LLM_MODEL || 'flan-t5'; // flan-t5, llama2, gpt-3.5-turbo
const LLM_API_KEY = process.env.LLM_API_KEY || '';

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

// Call LLM to parse address and extract structured information
async function parseLaboratoryDataWithLLM(labData) {
  const prompt = `You are a data extraction expert. Parse the following laboratory information and return ONLY a valid JSON object with these exact fields: brandName, branchName, city, state, pincode, services.

Laboratory Data:
Name: ${labData.name}
Area/Branch: ${labData.areaName || 'N/A'}
Address: ${labData.address}

Instructions:
1. Extract the laboratory brand/chain name (e.g., "Redcliffe Labs", "Dr Lal PathLabs")
2. Extract the specific branch/area name (e.g., "Vadapalani", "Kilpauk")
3. Identify the city from the address
4. Identify the state from the address
5. Extract the 6-digit pincode if present
6. Infer likely services (common ones: Pathology, Radiology, Clinical Chemistry, Biochemistry, Microbiology)

Return ONLY valid JSON, no explanations:
{
  "brandName": "extracted brand name",
  "branchName": "extracted branch name",
  "city": "extracted city",
  "state": "extracted state",
  "pincode": "extracted pincode",
  "services": ["service1", "service2"]
}`;

  try {
    let response;
    
    if (LLM_PROVIDER === 'ollama') {
      // Ollama API
      response = await axios.post(`${LLM_API_URL}/api/generate`, {
        model: LLM_MODEL,
        prompt: prompt,
        stream: false,
        format: 'json'
      });
      
      const rawResponse = response.data.response;
      return JSON.parse(rawResponse);
      
    } else if (LLM_PROVIDER === 'openai') {
      // OpenAI API
      response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: 'You are a data extraction expert. Return only valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      }, {
        headers: {
          'Authorization': `Bearer ${LLM_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      const content = response.data.choices[0].message.content;
      return JSON.parse(content);
      
    } else if (LLM_PROVIDER === 'anthropic') {
      // Anthropic Claude API
      response = await axios.post('https://api.anthropic.com/v1/messages', {
        model: LLM_MODEL,
        max_tokens: 1024,
        messages: [
          { role: 'user', content: prompt }
        ]
      }, {
        headers: {
          'x-api-key': LLM_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        }
      });
      
      const content = response.data.content[0].text;
      return JSON.parse(content);
    }
    
  } catch (error) {
    console.error('LLM parsing error:', error.message);
    
    // Fallback to basic parsing
    return {
      brandName: labData.name,
      branchName: labData.areaName || '',
      city: labData.city || '',
      state: labData.state || '',
      pincode: labData.pincode || '',
      services: ['Pathology', 'Radiology']
    };
  }
}

// Validate and clean extracted data
function validateExtractedData(extracted, original) {
  return {
    brandName: extracted.brandName || original.name,
    branchName: extracted.branchName || original.areaName || '',
    city: extracted.city || original.city || '',
    state: extracted.state || original.state || '',
    pincode: (extracted.pincode || original.pincode || '').replace(/\D/g, '').substring(0, 6),
    services: Array.isArray(extracted.services) ? extracted.services.join(', ') : (original.services || '')
  };
}

async function main() {
  const pool = await getPool();
  
  console.log('🤖 Starting LLM-powered lab data enhancement...\n');
  console.log(`Provider: ${LLM_PROVIDER}`);
  console.log(`Model: ${LLM_MODEL}`);
  console.log(`API URL: ${LLM_API_URL}\n`);
  
  try {
    // Test LLM connection first
    console.log('Testing LLM connection...');
    try {
      if (LLM_PROVIDER === 'ollama') {
        await axios.get(`${LLM_API_URL}/api/tags`);
        console.log('✅ LLM service is running\n');
      }
    } catch (error) {
      console.warn('⚠️  Warning: Cannot connect to LLM service');
      console.warn('Continuing with basic parsing fallback\n');
    }
    
    // Fetch labs with incomplete or unclear data
    const [labs] = await pool.query(
      `SELECT id, name, areaName, address, city, state, pincode, services
       FROM clinics 
       WHERE category = 'lab'
       AND (city = '' OR city IS NULL OR state = '' OR state IS NULL)
       ORDER BY id 
       LIMIT 50`
    );
    
    if (labs.length === 0) {
      console.log('✅ All labs have complete data!');
      await pool.end();
      return;
    }
    
    console.log(`Found ${labs.length} labs needing enhancement\n`);
    
    let processed = 0;
    let updated = 0;
    let failed = 0;

    for (let i = 0; i < labs.length; i++) {
      const lab = labs[i];
      console.log(`\n[${i + 1}/${labs.length}] Processing: ${lab.name}`);
      console.log(`  Current: ${lab.city || '(no city)'}, ${lab.state || '(no state)'}`);
      
      try {
        // Use LLM to parse and extract data
        const extracted = await parseLaboratoryDataWithLLM(lab);
        const validated = validateExtractedData(extracted, lab);
        
        console.log(`  ✨ Enhanced:`);
        console.log(`     Brand: ${validated.brandName}`);
        console.log(`     Branch: ${validated.branchName}`);
        console.log(`     Location: ${validated.city}, ${validated.state} ${validated.pincode}`);
        console.log(`     Services: ${validated.services}`);
        
        // Update database
        await pool.query(
          `UPDATE clinics SET 
            name = ?,
            areaName = ?,
            city = ?,
            state = ?,
            pincode = ?,
            services = ?,
            updatedAt = NOW()
          WHERE id = ?`,
          [
            validated.brandName,
            validated.branchName,
            validated.city,
            validated.state,
            validated.pincode,
            validated.services,
            lab.id
          ]
        );
        
        updated++;
        
        // Rate limiting for API calls
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`  ❌ Failed:`, error.message);
        failed++;
      }
      
      processed++;
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Enhancement Summary:');
    console.log('='.repeat(60));
    console.log(`Total processed: ${processed}`);
    console.log(`✅ Updated: ${updated}`);
    console.log(`❌ Failed: ${failed}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await pool.end();
  }
}

main();
