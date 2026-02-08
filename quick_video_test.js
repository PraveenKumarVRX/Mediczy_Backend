import fetch from 'node-fetch';

const baseUrl = 'http://localhost:8888';

async function quickTest() {
  console.log('Testing multi-participant video support...\n');
  
  try {
    const res = await fetch(`${baseUrl}/api/video/livekit/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: 'multi-participant-room',
        displayName: 'Tester',
        userId: 19,
        userRole: 'corporate'
      })
    });
    
    const data = await res.json();
    console.log('Response Status:', res.status);
    console.log('Response Data:', JSON.stringify(data, null, 2));
    
    if (data.roomCapacity) {
      console.log('\n✅ Multi-Participant Support Confirmed:');
      console.log(`   Max Participants: ${data.roomCapacity.max}`);
      console.log(`   Type: ${data.roomCapacity.type}`);
      console.log(`   Description: ${data.roomCapacity.description}`);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

quickTest();
