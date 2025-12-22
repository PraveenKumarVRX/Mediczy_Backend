// Admin Authentication Script for Browser Console
// Copy and paste this into the browser console on any Mediczy page

console.log('🔐 Mediczy Admin Authentication Script');

async function authenticateAdmin() {
  try {
    console.log('🔄 Attempting admin login...');
    
    const response = await fetch('http://192.168.1.72:8000/api/admin/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'admin@mediczy.com',
        password: 'SecurePass123'
      })
    });

    const data = await response.json();
    
    if (response.ok && data.token) {
      // Store authentication data
      localStorage.setItem('adminToken', data.token);
      localStorage.setItem('adminData', JSON.stringify(data.admin));
      
      console.log('✅ Admin authentication successful!');
      console.log('📝 Token stored in localStorage');
      console.log('👤 Admin data:', data.admin);
      
      // Show token expiration
      const payload = JSON.parse(atob(data.token.split('.')[1]));
      const expDate = new Date(payload.exp * 1000);
      console.log('⏰ Token expires:', expDate.toLocaleString());
      
      return true;
    } else {
      console.error('❌ Login failed:', data.message);
      return false;
    }
  } catch (error) {
    console.error('💥 Login error:', error.message);
    return false;
  }
}

function checkAuthStatus() {
  const token = localStorage.getItem('adminToken');
  const adminData = localStorage.getItem('adminData');
  
  console.log('🔍 Checking authentication status...');
  console.log('📋 Has token:', !!token);
  console.log('📋 Has admin data:', !!adminData);
  
  if (token && adminData) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const isExpired = payload.exp < Math.floor(Date.now() / 1000);
      const expDate = new Date(payload.exp * 1000);
      
      console.log('⏰ Token expires:', expDate.toLocaleString());
      console.log('📊 Token expired:', isExpired);
      console.log('👤 User role:', payload.role);
      console.log('🔒 Is admin:', payload.isAdmin);
      
      if (!isExpired) {
        console.log('✅ Authentication is valid');
        return true;
      } else {
        console.log('⚠️ Token has expired');
        return false;
      }
    } catch (error) {
      console.log('❌ Invalid token format');
      return false;
    }
  } else {
    console.log('❌ Not authenticated');
    return false;
  }
}

function clearAuth() {
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminData');
  console.log('🗑️ Authentication cleared');
}

function goToActivityLog() {
  window.location.href = '/admin/activity-log';
}

// Auto-run check on script load
checkAuthStatus();

// Make functions available globally
window.authenticateAdmin = authenticateAdmin;
window.checkAuthStatus = checkAuthStatus;
window.clearAuth = clearAuth;
window.goToActivityLog = goToActivityLog;

console.log('📖 Available commands:');
console.log('   authenticateAdmin() - Login as admin');
console.log('   checkAuthStatus() - Check current auth status');
console.log('   clearAuth() - Clear authentication');
console.log('   goToActivityLog() - Navigate to activity log');
console.log('');
console.log('💡 Quick start: Run authenticateAdmin() then goToActivityLog()');