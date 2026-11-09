import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import Consent from '../models/consent.model.intelligent.js';
import User from '../models/user.model.intelligent.js';
import Doctor from '../models/doctor.model.intelligent.js';
import AuditLog from '../models/auditLog.model.intelligent.js';
import {
  auditConsent,
  auditDataExport,
  auditDataDeletion
} from '../middleware/audit.middleware.js';
import { revokeAppleToken } from '../services/apple-signin.service.js';
import { getAppleRefreshToken, markAppleTokenRevoked } from '../services/apple-token-store.service.js';

const router = express.Router();

/** metadata is jsonb but arrives as a string on some driver paths. */
const readUserMetadata = (user) => {
  let meta = user?.metadata;
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta); } catch { meta = {}; }
  }
  return meta && typeof meta === 'object' ? meta : {};
};

/**
 * GDPR & DPDP Privacy Compliance Routes
 * 
 * Provides endpoints for:
 * - Right to Access (Data Portability) - GDPR Art. 20, DPDP §11
 * - Right to Erasure (Right to be Forgotten) - GDPR Art. 17, DPDP §12
 * - Consent Management - GDPR Art. 7, DPDP §6
 * - Audit Log Access - GDPR Art. 15, DPDP §11
 */

// ==================== CONSENT MANAGEMENT ====================

/**
 * Get all user consents
 * GET /api/privacy/consents
 */
router.get('/consents', authUser, async (req, res) => {
  try {
    const consents = await Consent.getUserConsents(req.user.id, req.user.role);
    
    res.json({
      success: true,
      consents: consents.map(c => ({
        id: c.id,
        type: c.consentType,
        purpose: c.purpose,
        status: c.status,
        grantedAt: c.grantedAt,
        expiresAt: c.expiresAt,
        withdrawnAt: c.withdrawnAt,
        dataCategories: c.dataCategories
      }))
    });
  } catch (error) {
    console.error('Error fetching consents:', error);
    res.status(500).json({ error: 'Failed to fetch consents' });
  }
});

/**
 * Grant consent
 * POST /api/privacy/consents
 */
router.post('/consents', authUser, async (req, res) => {
  try {
    const {
      consentType,
      purpose,
      dataCategories,
      expiresInDays
    } = req.body;
    
    // Validation
    if (!consentType || !purpose || !dataCategories) {
      return res.status(400).json({
        error: 'Missing required fields: consentType, purpose, dataCategories'
      });
    }
    
    const consent = await Consent.grantConsent({
      userId: req.user.id,
      userType: req.user.role,
      consentType,
      purpose,
      dataCategories,
      grantedVia: 'WEB',
      req,
      expiresInDays,
      consentVersion: '1.0'
    });
    
    // Audit the consent
    await auditConsent(req, req.user.id, consentType, 'grant');
    
    res.status(201).json({
      success: true,
      message: 'Consent granted successfully',
      consent: {
        id: consent.id,
        type: consent.consentType,
        status: consent.status,
        grantedAt: consent.grantedAt
      }
    });
  } catch (error) {
    console.error('Error granting consent:', error);
    res.status(500).json({ error: 'Failed to grant consent' });
  }
});

/**
 * Withdraw consent
 * DELETE /api/privacy/consents/:consentType
 */
router.delete('/consents/:consentType', authUser, async (req, res) => {
  try {
    const { consentType } = req.params;
    const { reason } = req.body;
    
    const count = await Consent.withdrawConsent(
      req.user.id,
      consentType,
      reason || 'User requested withdrawal',
      req.user.role
    );
    
    // Audit the withdrawal
    await auditConsent(req, req.user.id, consentType, 'withdraw');
    
    res.json({
      success: true,
      message: `Consent withdrawn successfully`,
      withdrawnCount: count
    });
  } catch (error) {
    console.error('Error withdrawing consent:', error);
    res.status(500).json({ error: 'Failed to withdraw consent' });
  }
});

// ==================== RIGHT TO ACCESS (DATA PORTABILITY) ====================

/**
 * Export all user data
 * GET /api/privacy/export
 * 
 * Compliance: GDPR Article 20 (Right to Data Portability)
 *            DPDP Act §11 (Right to Access)
 */
router.get('/export', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.role;
    
    // Gather all user data
    let userData;
    
    if (userType === 'doctor') {
      userData = await Doctor.findByPk(userId);
    } else {
      userData = await User.findByPk(userId);
    }
    
    if (!userData) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get related data
    let consents = [];
    try { consents = (await Consent.getUserConsents(userId, userType)) || []; }
    catch (e) { console.warn('[privacy/export] consents unavailable:', e.message); }
    // getUserAuditTrail is not implemented on the AuditLog model — guard so export never 500s on it.
    let auditLogs = [];
    try { if (typeof AuditLog.getUserAuditTrail === 'function') auditLogs = (await AuditLog.getUserAuditTrail(userId, userType)) || []; }
    catch (e) { console.warn('[privacy/export] audit trail unavailable:', e.message); }
    
    // TODO: Add more related data (appointments, health records, etc.)
    // This would need to be customized based on your data model
    
    // Remove sensitive fields
    const exportData = {
      exportDate: new Date().toISOString(),
      exportFormat: 'JSON',
      dataSubject: {
        id: userData.id,
        email: userData.email,
        name: userData.name || userData.fullName,
        phone: userData.phone,
        dateOfBirth: userData.dateOfBirth,
        gender: userData.gender,
        createdAt: userData.createdAt,
        updatedAt: userData.updatedAt
      },
      consents: consents.map(c => ({
        type: c.consentType,
        purpose: c.purpose,
        status: c.status,
        grantedAt: c.grantedAt,
        expiresAt: c.expiresAt
      })),
      auditTrail: auditLogs.map(log => ({
        action: log.action,
        timestamp: log.timestamp,
        resourceType: log.resourceType,
        ipAddress: log.ipAddress
      })),
      // Add more data categories here
    };
    
    // Audit the export (best-effort; never fail the export over its own audit write).
    try { await auditDataExport(req, userId); } catch (e) { console.warn('[privacy/export] audit write failed:', e.message); }
    
    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="mediczy-data-export-${userId}-${Date.now()}.json"`);
    
    res.json(exportData);
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// ==================== RIGHT TO ERASURE (RIGHT TO BE FORGOTTEN) ====================

/**
 * Delete user account and all associated data
 * DELETE /api/privacy/delete-account
 * 
 * Compliance: GDPR Article 17 (Right to Erasure)
 *            DPDP Act §12 (Right to Erasure and Correction)
 * 
 * IMPORTANT: This is a soft delete by default to maintain audit trails
 * as required by HIPAA (6-year retention) and other regulations.
 */
router.delete('/delete-account', authUser, async (req, res) => {
  try {
    const { password, confirmation } = req.body;
    
    // Require explicit confirmation
    if (confirmation !== 'DELETE MY ACCOUNT') {
      return res.status(400).json({
        error: 'Invalid confirmation',
        message: 'Please type "DELETE MY ACCOUNT" to confirm'
      });
    }
    
    const userId = req.user.id;
    const userType = req.user.role;
    
    // Verify password
    let user;
    if (userType === 'doctor') {
      user = await Doctor.findByPk(userId);
    } else {
      user = await User.findByPk(userId);
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Re-authenticate with the password — but only if the account HAS one.
    //
    // An account created through Sign in with Apple (or Google/Facebook) never
    // gets a password, and comparePassword() returns false for a null hash. So
    // requiring one here meant a social-only user was answered "Invalid
    // password" for a password they were never issued, and could not delete
    // their account at all — the very thing App Store guideline 5.1.1(v)
    // requires be possible in-app, and a rejection risk for the iOS build.
    //
    // They are already authenticated: authUser verified their JWT, and the
    // "DELETE MY ACCOUNT" confirmation above is the deliberate-intent step.
    // Password holders still have to prove it, so this weakens nothing.
    const hasPassword = Boolean(user.password);
    if (hasPassword) {
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid password' });
      }
    }

    // SOFT DELETE: Anonymize data instead of hard delete
    // This maintains audit trails and complies with HIPAA retention requirements
    
    const anonymizedEmail = `deleted_${userId}_${Date.now()}@anonymized.mediczy.com`;
    const anonymizedPhone = `DELETED_${userId}`;
    
    await user.update({
      email: anonymizedEmail,
      phone: anonymizedPhone,
      name: 'DELETED USER',
      fullName: 'DELETED USER',
      dateOfBirth: null,
      address: 'DELETED',
      isActive: false,
      deletedAt: new Date(),
      deletionReason: 'User requested account deletion (GDPR/DPDP)',
      // Keep minimal data for audit/legal compliance
    });
    
    // Withdraw all consents
    const consentTypes = [
      'DATA_PROCESSING', 'MARKETING', 'THIRD_PARTY_SHARING',
      'RESEARCH', 'TELEMEDICINE', 'DATA_ANALYTICS'
    ];
    
    for (const consentType of consentTypes) {
      await Consent.withdrawConsent(
        userId,
        consentType,
        'Account deletion - GDPR/DPDP right to erasure',
        userType
      );
    }
    
    // Revoke the Sign in with Apple grant — App Store guideline 5.1.1(v)
    // requires that deleting the account also ends Apple's authorisation, not
    // just ours. Best-effort by design: revokeAppleToken() answers
    // {revoked:false, reason} instead of throwing, and the outcome is recorded
    // rather than retried, so an unreachable Apple (or a missing Sign in with
    // Apple key) can never block a user's right to erasure.
    let appleRevocation = null;
    try {
      const appleId = readUserMetadata(user).appleId;
      if (appleId) {
        const appleRefreshToken = await getAppleRefreshToken(userId);
        appleRevocation = await revokeAppleToken({ token: appleRefreshToken });
        await markAppleTokenRevoked(userId, appleRevocation);
        if (!appleRevocation.revoked) {
          console.warn(`[privacy] Apple grant not revoked for deleted user ${userId}: ${appleRevocation.reason}`);
        }
      }
    } catch (appleError) {
      console.error('[privacy] Apple revocation step failed:', appleError.message);
      appleRevocation = { revoked: false, reason: 'revocation_step_failed' };
    }

    // Audit the deletion
    await auditDataDeletion(req, userId);

    // TODO: Anonymize related data (appointments, health records, etc.)
    // Keep only what's legally required for audit trails

    res.json({
      success: true,
      message: 'Account deleted successfully',
      note: 'Some data may be retained for legal compliance (HIPAA 6-year retention)',
      // Additive, and only present for an Apple-linked account. The deletion
      // itself has already succeeded either way — this reports whether Apple's
      // side was also ended, which is what 5.1.1(v) asks us to attempt.
      ...(appleRevocation ? { appleRevocation } : {})
    });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// ==================== AUDIT LOG ACCESS ====================

/**
 * Get user's audit trail
 * GET /api/privacy/audit-logs
 * 
 * Compliance: GDPR Article 15 (Right to Access)
 *            HIPAA §164.528 (Right to Accounting of Disclosures)
 */
router.get('/audit-logs', authUser, async (req, res) => {
  try {
    const { startDate, endDate, limit = 100 } = req.query;
    
    const where = {
      userId: req.user.id,
      userType: req.user.role
    };
    
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp['>'] = new Date(startDate);
      if (endDate) where.timestamp['<'] = new Date(endDate);
    }
    
    const logs = await AuditLog.findAll({
      where,
      order: [['timestamp', 'DESC']],
      limit: Math.min(parseInt(limit), 1000), // Max 1000 records
      attributes: [
        'action', 'resourceType', 'timestamp', 
        'ipAddress', 'status', 'isPHI', 'isPII'
      ]
    });
    
    res.json({
      success: true,
      count: logs.length,
      logs: logs.map(log => ({
        action: log.action,
        resourceType: log.resourceType,
        timestamp: log.timestamp,
        ipAddress: log.ipAddress,
        status: log.status,
        involvedPHI: log.isPHI,
        involvedPII: log.isPII
      }))
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// ==================== BREACH NOTIFICATION ====================

/**
 * Report a suspected data breach
 * POST /api/privacy/report-breach
 * 
 * Compliance: HIPAA §164.404, GDPR Article 33, DPDP Act §6
 * 
 * Users can report suspected unauthorized access to their data
 */
router.post('/report-breach', authUser, async (req, res) => {
  try {
    const { description, suspectedDate, affectedData } = req.body;
    
    // Log the breach report
    await AuditLog.create({
      userId: req.user.id,
      userType: req.user.role,
      userEmail: req.user.email,
      action: 'BREACH_REPORTED',
      resourceType: 'User',
      resourceId: req.user.id,
      status: 'SUCCESS',
      isPHI: true,
      isPII: true,
      purpose: 'User-reported suspected data breach',
      metadata: {
        description,
        suspectedDate,
        affectedData,
        reportedAt: new Date()
      },
      timestamp: new Date()
    });
    
    // TODO: Trigger alert to security team
    console.error(`🚨 BREACH REPORTED by user ${req.user.id}: ${description}`);
    
    res.json({
      success: true,
      message: 'Breach report received. Our security team will investigate.',
      referenceId: `BR-${req.user.id}-${Date.now()}`
    });
  } catch (error) {
    console.error('Error reporting breach:', error);
    res.status(500).json({ error: 'Failed to report breach' });
  }
});

export default router;
