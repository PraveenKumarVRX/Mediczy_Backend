import AuthService from '../../services/api-v1/AuthService.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

const authService = new AuthService();

/**
 * Authenticate user via OIDC (ABHA integration)
 */
export const authenticateOIDC = asyncHandler(async (req, res) => {
  const { code, redirect_uri } = req.body;
  
  const authResult = await authService.authenticateOIDC(req.tenantId, code, redirect_uri);
  res.json(authResult);
});

/**
 * Exchange external OIDC token for Mediqzy access token
 * Alias for authenticateOIDC to match route naming
 */
export const exchangeToken = authenticateOIDC;

/**
 * Refresh access token
 */
export const refreshToken = asyncHandler(async (req, res) => {
  const { refresh_token } = req.body;
  
  const tokens = await authService.refreshToken(refresh_token);
  res.json(tokens);
});

/**
 * Revoke refresh token (logout)
 */
export const revokeToken = asyncHandler(async (req, res) => {
  const { refresh_token } = req.body;
  
  const result = await authService.revokeToken(refresh_token);
  res.json(result);
});

/**
 * Validate access token
 */
export const validateToken = asyncHandler(async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const result = await authService.validateToken(token);
  res.json(result);
});

/**
 * Get current user info from token
 */
export const getCurrentUser = asyncHandler(async (req, res) => {
  // Assumes verifyToken middleware has already validated and attached user info
  const userId = req.userId || req.user?.id;
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const user = await authService.findById(userId, req.tenantId);
  res.json(authService.sanitize(user));
});
