import Consent from '../models/consent.model.intelligent.js';

/**
 * Consent Middleware
 * 
 * Compliance: GDPR Article 7, DPDP Act §6, HIPAA Authorization
 * 
 * Ensures users have granted consent before processing their data
 * for specific purposes.
 */

/**
 * Require consent for specific data processing activities
 * 
 * @param {string} consentType - Type of consent required
 * @param {boolean} strict - If true, block request if consent missing (default: warn only)
 */
export const requireConsent = (consentType, strict = false) => {
  return async (req, res, next) => {
    try {
      // Skip for system/admin actions
      if (req.user?.role === 'admin' || req.user?.role === 'system') {
        return next();
      }
      
      const userId = req.user?.id;
      const userType = req.user?.role || 'user';
      
      if (!userId) {
        // If user not authenticated, let auth middleware handle it
        return next();
      }
      
      // Check if user has active consent
      const hasConsent = await Consent.hasActiveConsent(userId, consentType, userType);
      
      if (!hasConsent) {
        if (strict) {
          return res.status(403).json({
            error: 'Consent required',
            message: `You must provide consent for ${consentType} before accessing this resource`,
            consentType,
            action: 'Please visit your privacy settings to grant consent'
          });
        } else {
          // Warn but allow (for backwards compatibility or essential services)
          console.warn(`⚠️ User ${userId} accessing ${req.path} without ${consentType} consent`);
        }
      }
      
      // Attach consent info to request for audit logging
      req.hasConsent = hasConsent;
      req.consentType = consentType;
      
      next();
    } catch (error) {
      console.error('Consent check failed:', error);
      // Don't block the request on consent check failure
      next();
    }
  };
};

/**
 * Check for marketing consent
 */
export const requireMarketingConsent = requireConsent('MARKETING', true);

/**
 * Check for third-party sharing consent
 */
export const requireSharingConsent = requireConsent('THIRD_PARTY_SHARING', true);

/**
 * Check for research consent
 */
export const requireResearchConsent = requireConsent('RESEARCH', true);

/**
 * Check for automated decision-making consent (GDPR Art. 22)
 */
export const requireAutomatedDecisionConsent = requireConsent('AUTOMATED_DECISION', true);

/**
 * Validate consent on data export
 */
export const validateDataExportConsent = async (req, res, next) => {
  try {
    // User can always export their own data (GDPR right to access)
    if (req.user?.id === parseInt(req.params.userId)) {
      return next();
    }
    
    // For others (e.g., doctors, family), check consent
    const hasConsent = await Consent.hasActiveConsent(
      req.params.userId, 
      'THIRD_PARTY_SHARING',
      'user'
    );
    
    if (!hasConsent) {
      return res.status(403).json({
        error: 'Consent required',
        message: 'The user has not granted consent for data sharing'
      });
    }
    
    next();
  } catch (error) {
    console.error('Data export consent validation failed:', error);
    res.status(500).json({ error: 'Consent validation failed' });
  }
};

export default {
  requireConsent,
  requireMarketingConsent,
  requireSharingConsent,
  requireResearchConsent,
  requireAutomatedDecisionConsent,
  validateDataExportConsent
};
