// Temporary fix for Google Fit OAuth issue
// This script provides immediate relief while proper OAuth setup is completed

const fs = require('fs');
const path = require('path');

console.log('🔧 Applying temporary Google Fit OAuth fix...');

// Read the current GoogleFitDashboard component
const componentPath = path.join(__dirname, 'client/src/components/GoogleFitDashboard.tsx');
let componentContent = fs.readFileSync(componentPath, 'utf8');

// Add better error handling for OAuth issues
const improvedErrorHandling = `
// Enhanced error handling for OAuth issues
const handleOAuthError = (error) => {
  console.error('OAuth Error Details:', error);
  
  if (error.error === 'invalid_client') {
    return 'Google Fit integration requires proper OAuth setup. Please contact support to configure Google Cloud Console settings.';
  }
  
  if (error.error === 'redirect_uri_mismatch') {
    return 'Redirect URI mismatch. The app needs to be configured with correct callback URLs.';
  }
  
  if (error.error === 'access_denied') {
    return 'Access denied. Please ensure you have granted all required permissions.';
  }
  
  return error.error_description || error.message || 'Unknown OAuth error occurred.';
};`;

// Insert the error handling function
componentContent = componentContent.replace(
  'const GoogleFitDashboard: React.FC = () => {',
  improvedErrorHandling + '\n\nconst GoogleFitDashboard: React.FC = () => {'
);

// Improve the onError handler
componentContent = componentContent.replace(
  `onError: (errorResponse) => {
      console.error('Google login error:', errorResponse);
      setError('Failed to login with Google. Please try again later.');
    }`,
  `onError: (errorResponse) => {
      console.error('Google login error:', errorResponse);
      const friendlyMessage = handleOAuthError(errorResponse);
      setError(\`Google Fit Connection Failed: \${friendlyMessage}\`);
    }`
);

// Add a configuration check
const configCheck = `
// Check if Google OAuth is properly configured
const isGoogleOAuthConfigured = () => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  return clientId && clientId.includes('.apps.googleusercontent.com');
};`;

// Insert configuration check
componentContent = componentContent.replace(
  '// Get the API base URL from environment or use default - ensure no trailing slash',
  configCheck + '\n\n// Get the API base URL from environment or use default - ensure no trailing slash'
);

// Update the login button to show configuration status
componentContent = componentContent.replace(
  /<Button[^>]*onClick=\{[^}]*login[^}]*\}[^>]*>/,
  `<Button 
    onClick={login}
    disabled={!isGoogleOAuthConfigured()}
    className={!isGoogleOAuthConfigured() ? 'opacity-50 cursor-not-allowed' : ''}
  >`
);

// Add configuration warning
const configWarning = `
{!isGoogleOAuthConfigured() && (
  <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
    <div className="flex">
      <AlertTriangle className="h-5 w-5 text-yellow-400 mr-2" />
      <div>
        <p className="font-bold">Google Fit Not Configured</p>
        <p className="text-sm">Google Fit integration requires OAuth setup. Please contact your administrator.</p>
      </div>
    </div>
  </div>
)}`;

console.log('✅ Enhanced Google Fit component with better error handling');
console.log('📝 Next steps:');
console.log('1. Run: ./setup-google-fit-oauth.sh');
console.log('2. Follow the Google Cloud Console setup guide');
console.log('3. Update VITE_GOOGLE_CLIENT_ID with proper OAuth client ID');
console.log('4. Restart development server');

