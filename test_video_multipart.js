import axios from 'axios';

const BASE_URL = 'http://localhost:8888';

async function test() {
  try {
    // Create a test token - using same format as working tests
    const testToken = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTksInJvbGUiOiJjb3Jwb3JhdGUiLCJvcmdhbml6YXRpb25faWQiOjcsInRlbmFudF9pZCI6Nywib3JnYW5pemF0aW9uX3R5cGUiOiJjb3Jwb3JhdGUifQ.test';
    
    // First, test the video config endpoint
    console.log('🎥 Testing video configuration with multi-participant support...\n');
    
    try {
      const configRes = await axios.get(`${BASE_URL}/api/video/config`);
      console.log('✅ Video Config (without auth):');
      console.log(JSON.stringify(configRes.data, null, 2));
    } catch (err) {
      if (err.response?.status === 401 || err.response?.data?.code === 'NO_TOKEN') {
        console.log('ℹ️  Config endpoint requires auth, testing with token...');
        const configRes = await axios.get(`${BASE_URL}/api/video/config`, {
          headers: { 'Authorization': testToken }
        });
        console.log('✅ Video Config:');
        const data = configRes.data;
        if (data.roomTypes) {
          console.log('\n📊 Room Type Capacity Summary:');
          Object.entries(data.roomTypes).forEach(([type, config]) => {
            console.log(`  - ${type}: ${config.maxParticipants} participants (${config.defaultName})`);
          });
        }
      } else {
        throw err;
      }
    }
    
    // Test generic room token generation
    console.log('\n\n🔑 Testing multi-participant room token generation...\n');
    
    const tokenRes = await axios.post(`${BASE_URL}/api/video/livekit/token`, {
      roomId: 'zoom-like-conference',
      displayName: 'Test User',
      userId: 19,
      userRole: 'corporate'
    });
    
    console.log('✅ Token Response Status:', tokenRes.status);
    if (tokenRes.data.roomCapacity) {
      console.log('✅ Room Capacity:');
      console.log(`   - Max participants: ${tokenRes.data.roomCapacity.max}`);
      console.log(`   - Room type: ${tokenRes.data.roomCapacity.type}`);
      console.log(`   - Description: ${tokenRes.data.roomCapacity.description}`);
      
      if (tokenRes.data.roomCapacity.max >= 100) {
        console.log('\n✨ SUCCESS: Multi-participant video support is now active!');
        console.log('   Generic video rooms support up to ' + tokenRes.data.roomCapacity.max + ' participants (Zoom-like)');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response?.data) {
      console.error('Response:', error.response.data);
    }
  }
}

test();
