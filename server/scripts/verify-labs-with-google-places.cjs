const mysql = require('mysql2/promise');
const axios = require('axios');

// Google Places API configuration
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || 'YOUR_GOOGLE_API_KEY';
const PLACES_API_URL = 'https://maps.googleapis.com/maps/api/place';

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

// Search for place using Google Places Text Search API
async function searchPlace(labName, address, city, state) {
  try {
    const query = `${labName} ${city || ''} ${state || ''}`.trim();
    const response = await axios.get(`${PLACES_API_URL}/textsearch/json`, {
      params: {
        query,
        key: GOOGLE_API_KEY,
        type: 'health|hospital|laboratory'
      }
    });

    if (response.data.status === 'OK' && response.data.results.length > 0) {
      return response.data.results[0];
    }
    return null;
  } catch (error) {
    console.error(`Error searching place for ${labName}:`, error.message);
    return null;
  }
}

// Get place details using Place Details API
async function getPlaceDetails(placeId) {
  try {
    const response = await axios.get(`${PLACES_API_URL}/details/json`, {
      params: {
        place_id: placeId,
        key: GOOGLE_API_KEY,
        fields: 'name,formatted_address,address_components,geometry,formatted_phone_number,website,rating,user_ratings_total,types,business_status'
      }
    });

    if (response.data.status === 'OK') {
      return response.data.result;
    }
    return null;
  } catch (error) {
    console.error(`Error getting place details for ${placeId}:`, error.message);
    return null;
  }
}

// Extract structured address from Google address components
function extractAddressComponents(addressComponents) {
  const components = {
    street: '',
    area: '',
    city: '',
    state: '',
    pincode: '',
    country: ''
  };

  if (!addressComponents) return components;

  addressComponents.forEach(component => {
    const types = component.types;
    
    if (types.includes('street_number') || types.includes('route')) {
      components.street += component.long_name + ' ';
    }
    if (types.includes('sublocality') || types.includes('sublocality_level_1')) {
      components.area = component.long_name;
    }
    if (types.includes('locality')) {
      components.city = component.long_name;
    }
    if (types.includes('administrative_area_level_1')) {
      components.state = component.long_name;
    }
    if (types.includes('postal_code')) {
      components.pincode = component.long_name;
    }
    if (types.includes('country')) {
      components.country = component.long_name;
    }
  });

  components.street = components.street.trim();
  return components;
}

// Parse lab name to extract brand and branch
function parseLabName(name, areaName) {
  // Common patterns: "Brand - Branch", "Brand (Branch)", "Brand, Branch"
  const patterns = [
    /^(.+?)\s*[-–—]\s*(.+)$/,  // Hyphen separator
    /^(.+?)\s*\((.+?)\)$/,      // Parentheses
    /^(.+?),\s*(.+)$/           // Comma separator
  ];

  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) {
      return {
        brandName: match[1].trim(),
        branchName: match[2].trim()
      };
    }
  }

  // If no pattern matches, use name as brand and areaName as branch
  return {
    brandName: name,
    branchName: areaName || ''
  };
}

// Rate limiting helper
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const pool = await getPool();
  
  // Check if API key is configured
  if (GOOGLE_API_KEY === 'YOUR_GOOGLE_API_KEY') {
    console.error('❌ Error: Google Places API key not configured!');
    console.error('Please set GOOGLE_PLACES_API_KEY environment variable');
    console.error('Get your API key from: https://console.cloud.google.com/apis/credentials');
    process.exit(1);
  }

  try {
    console.log('🔍 Starting Google Places verification for labs...\n');
    
    // Fetch labs that need verification
    const [labs] = await pool.query(
      `SELECT id, name, areaName, address, city, state, pincode, phone, email, google_place_id 
       FROM clinics 
       WHERE category = 'lab' 
       ORDER BY id 
       LIMIT 100`
    );
    
    console.log(`Found ${labs.length} labs to verify\n`);
    
    let verified = 0;
    let updated = 0;
    let notFound = 0;
    let errors = 0;

    for (let i = 0; i < labs.length; i++) {
      const lab = labs[i];
      console.log(`\n[${i + 1}/${labs.length}] Processing: ${lab.name}`);
      
      try {
        // Search for the place
        const searchResult = await searchPlace(lab.name, lab.address, lab.city, lab.state);
        
        if (!searchResult) {
          console.log('  ⚠️  Not found in Google Places');
          notFound++;
          await sleep(200); // Rate limiting
          continue;
        }

        console.log(`  ✓ Found: ${searchResult.name}`);
        console.log(`  📍 Address: ${searchResult.formatted_address}`);
        
        // Get detailed information
        const placeDetails = await getPlaceDetails(searchResult.place_id);
        
        if (placeDetails) {
          const addressComponents = extractAddressComponents(placeDetails.address_components);
          const { brandName, branchName } = parseLabName(placeDetails.name, lab.areaName);
          
          // Prepare update data
          const updateData = {
            name: brandName,
            areaName: branchName || addressComponents.area || addressComponents.city,
            address: placeDetails.formatted_address || lab.address,
            city: addressComponents.city || lab.city,
            state: addressComponents.state || lab.state,
            pincode: addressComponents.pincode || lab.pincode,
            phone: placeDetails.formatted_phone_number || lab.phone,
            google_place_id: placeDetails.place_id || searchResult.place_id,
            latitude: placeDetails.geometry?.location?.lat || null,
            longitude: placeDetails.geometry?.location?.lng || null,
            rating: placeDetails.rating || null,
            total_reviews: placeDetails.user_ratings_total || null,
            website: placeDetails.website || null,
            business_status: placeDetails.business_status || 'OPERATIONAL'
          };

          // Update database
          await pool.query(
            `UPDATE clinics SET 
              name = ?,
              areaName = ?,
              address = ?,
              city = ?,
              state = ?,
              pincode = ?,
              phone = ?,
              google_place_id = ?,
              updatedAt = NOW()
            WHERE id = ?`,
            [
              updateData.name,
              updateData.areaName,
              updateData.address,
              updateData.city,
              updateData.state,
              updateData.pincode,
              updateData.phone,
              updateData.google_place_id,
              lab.id
            ]
          );

          console.log('  ✅ Updated successfully');
          console.log(`     Brand: ${updateData.name}`);
          console.log(`     Branch: ${updateData.areaName}`);
          console.log(`     City: ${updateData.city}, ${updateData.state} ${updateData.pincode}`);
          if (placeDetails.rating) {
            console.log(`     Rating: ${placeDetails.rating}⭐ (${placeDetails.user_ratings_total} reviews)`);
          }
          
          updated++;
        }
        
        verified++;
        
        // Rate limiting - Google Places API has limits
        await sleep(500); // 2 requests per second max
        
      } catch (error) {
        console.error(`  ❌ Error processing lab ${lab.id}:`, error.message);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Verification Summary:');
    console.log('='.repeat(60));
    console.log(`Total labs processed: ${labs.length}`);
    console.log(`✅ Verified: ${verified}`);
    console.log(`📝 Updated: ${updated}`);
    console.log(`⚠️  Not found: ${notFound}`);
    console.log(`❌ Errors: ${errors}`);
    console.log('='.repeat(60));

    // Show sample of updated labs
    const [sampleUpdated] = await pool.query(
      `SELECT id, name, areaName, city, state, pincode, google_place_id 
       FROM clinics 
       WHERE category = 'lab' AND google_place_id LIKE 'ChIJ%'
       LIMIT 5`
    );

    if (sampleUpdated.length > 0) {
      console.log('\n✨ Sample of verified labs:');
      sampleUpdated.forEach((lab, idx) => {
        console.log(`${idx + 1}. ${lab.name} - ${lab.areaName}`);
        console.log(`   📍 ${lab.city}, ${lab.state} ${lab.pincode}`);
        console.log(`   🆔 Google Place ID: ${lab.google_place_id.substring(0, 20)}...`);
      });
    }

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await pool.end();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Script interrupted by user');
  process.exit(0);
});

main();
