/**
 * OAuth Clients Configuration
 * Stores registered OAuth applications (e.g., Rocket.Chat)
 * In production, store in database; for now, in-memory with defaults
 */

// OAuth clients registry
// In production: move to database table with encryption
export const oauthClients = {
  // Rocket.Chat OAuth Client
  rocketchat: {
    client_id: process.env.OAUTH_ROCKETCHAT_CLIENT_ID,
    client_secret: process.env.OAUTH_ROCKETCHAT_CLIENT_SECRET,
    redirect_uris: [
      'http://localhost:3100/_oauth/mediqzy',
      'https://rocket.mediqzy.com/_oauth/mediqzy',
      process.env.ROCKETCHAT_OAUTH_REDIRECT_URI || 'http://localhost:3100/_oauth/mediqzy'
    ],
    name: 'Rocket.Chat Omnichannel',
    description: 'SSO integration for Rocket.Chat',
    scope: ['openid', 'email', 'profile'],
    confidential: true,
    grant_types: ['authorization_code'],
    response_types: ['code'],
    enabled: true
  }
};

/**
 * Validate OAuth client credentials
 * @param {string} client_id - Client ID
 * @param {string} client_secret - Client secret (optional for public clients)
 * @returns {Object|null} Client config if valid, null otherwise
 */
export function validateOAuthClient(client_id, client_secret = null) {
  const client = Object.values(oauthClients).find(c => c.client_id === client_id);
  
  if (!client || !client.enabled) {
    console.warn(`❌ OAuth: Invalid or disabled client_id: ${client_id}`);
    return null;
  }

  // For confidential clients, require and validate secret
  if (client.confidential && client_secret !== client.client_secret) {
    console.warn(`❌ OAuth: Invalid client_secret for: ${client_id}`);
    return null;
  }

  return client;
}

/**
 * Validate redirect URI against registered URIs
 * @param {string} client_id - Client ID
 * @param {string} redirect_uri - Redirect URI to validate
 * @returns {boolean} True if valid
 */
export function validateRedirectUri(client_id, redirect_uri) {
  const client = oauthClients[Object.keys(oauthClients).find(key => 
    oauthClients[key].client_id === client_id
  )];

  if (!client) {
    return false;
  }

  const isValid = client.redirect_uris.some(uri => {
    // Exact match or allow http://localhost for development
    return uri === redirect_uri || 
           (process.env.NODE_ENV !== 'production' && uri.includes('localhost'));
  });

  if (!isValid) {
    console.warn(`❌ OAuth: Invalid redirect_uri for ${client_id}: ${redirect_uri}`);
  }

  return isValid;
}

/**
 * Get client scopes
 * @param {string} client_id - Client ID
 * @returns {Array} List of scopes
 */
export function getClientScopes(client_id) {
  const client = Object.values(oauthClients).find(c => c.client_id === client_id);
  return client?.scope || [];
}

export default oauthClients;
