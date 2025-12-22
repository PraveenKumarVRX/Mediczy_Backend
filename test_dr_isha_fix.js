// Simple test script to debug Dr. iSHA frontend issues
console.log("🏥 Dr. iSHA Debug Script");

// Check token in localStorage
const token = localStorage.getItem('token');
console.log("🔑 Token in localStorage:", token ? `${token.substring(0, 50)}...` : 'NOT FOUND');

// Check if token is expired
if (token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const now = Date.now() / 1000;
    console.log("⏰ Token expires:", new Date(payload.exp * 1000));
    console.log("🕐 Current time:", new Date());
    console.log("✅ Token valid:", payload.exp > now ? 'YES' : 'EXPIRED');
  } catch (e) {
    console.log("❌ Token decode error:", e.message);
  }
}

// Clear token and prompt re-login
function clearTokenAndReload() {
  console.log("🗑️ Clearing localStorage token...");
  localStorage.removeItem('token');
  localStorage.removeItem('authToken');
  localStorage.removeItem('user');
  console.log("🔄 Please refresh page and login again");
  window.location.reload();
}

// Test API connectivity
async function testDrIshaAPI() {
  const token = localStorage.getItem('token');
  if (!token) {
    console.log("❌ No token found. Please login first.");
    return;
  }

  try {
    console.log("🧪 Testing Dr. iSHA API...");
    const response = await fetch('/api/dr-isha/health', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    console.log("🏥 Dr. iSHA Health:", data);
    
    if (response.ok && data.status === 'healthy') {
      console.log("✅ Dr. iSHA service is working!");
      
      // Test a simple consultation
      const consultResponse = await fetch('/api/dr-isha/consult', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: "Hello Dr. iSHA, are you working?",
          language: "en"
        })
      });
      
      const consultData = await consultResponse.json();
      console.log("💬 Dr. iSHA Consultation Test:", consultData);
    }
    
  } catch (error) {
    console.error("❌ API Test Error:", error);
  }
}

// Export functions for manual testing
window.clearTokenAndReload = clearTokenAndReload;
window.testDrIshaAPI = testDrIshaAPI;

console.log("🛠️ Available commands:");
console.log("  - clearTokenAndReload() : Clear stored tokens and reload");
console.log("  - testDrIshaAPI() : Test Dr. iSHA API connectivity");