import { DataTypes } from 'sequelize';
import { sequelize } from '../db/mariadb.js';

/**
 * Consent Management Model
 * Compliance: GDPR Article 7, DPDP Act §6, HIPAA Authorization
 * 
 * Purpose: Track explicit user consent for data processing activities
 * as required by privacy regulations.
 */
const Consent = sequelize.define('Consent', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // User information
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'User providing consent'
  },
  
  userType: {
    type: DataTypes.ENUM('user', 'doctor'),
    allowNull: false,
    defaultValue: 'user'
  },
  
  // Consent type and purpose
  consentType: {
    type: DataTypes.ENUM(
      'DATA_PROCESSING',        // General data processing (GDPR Art. 6(1)(a))
      'MARKETING',              // Marketing communications (GDPR Art. 6(1)(a))
      'THIRD_PARTY_SHARING',    // Sharing with third parties (HIPAA Authorization)
      'RESEARCH',               // Medical research (HIPAA Authorization)
      'EMERGENCY_CONTACT',      // Emergency contact access
      'TELEMEDICINE',           // Telehealth services
      'DATA_ANALYTICS',         // Analytics and improvement
      'CROSS_BORDER_TRANSFER',  // International data transfer (GDPR Art. 49)
      'AUTOMATED_DECISION',     // Automated decision-making (GDPR Art. 22)
      'SENSITIVE_DATA'          // Sensitive data processing (GDPR Art. 9)
    ),
    allowNull: false
  },
  
  // Purpose of data processing (GDPR Art. 5(1)(b) - Purpose Limitation)
  purpose: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Clear description of why data is being processed'
  },
  
  // Scope of consent
  dataCategories: {
    type: DataTypes.JSON,
    allowNull: false,
    comment: 'Categories of data covered by this consent',
    defaultValue: []
    // Example: ['health_records', 'vital_signs', 'prescriptions', 'lab_reports']
  },
  
  // Consent status
  status: {
    type: DataTypes.ENUM('ACTIVE', 'WITHDRAWN', 'EXPIRED', 'REVOKED'),
    allowNull: false,
    defaultValue: 'ACTIVE'
  },
  
  // Consent granted details
  grantedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  
  grantedVia: {
    type: DataTypes.ENUM('WEB', 'MOBILE', 'PAPER', 'VERBAL', 'IMPLICIT'),
    allowNull: false,
    defaultValue: 'WEB',
    comment: 'How consent was obtained'
  },
  
  ipAddress: {
    type: DataTypes.STRING(45),
    allowNull: true,
    comment: 'IP address when consent was granted'
  },
  
  userAgent: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Device/browser information'
  },
  
  // Consent expiration (GDPR: Consent should be time-limited)
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When consent expires (null = indefinite)'
  },
  
  // Withdrawal details
  withdrawnAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  withdrawalReason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  // HIPAA Authorization specific fields
  recipientName: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Name of entity receiving information (HIPAA)'
  },
  
  recipientType: {
    type: DataTypes.ENUM('DOCTOR', 'HOSPITAL', 'INSURANCE', 'RESEARCHER', 'OTHER'),
    allowNull: true
  },
  
  // Legal basis (GDPR Art. 6)
  legalBasis: {
    type: DataTypes.ENUM(
      'CONSENT',                // Art. 6(1)(a)
      'CONTRACT',               // Art. 6(1)(b)
      'LEGAL_OBLIGATION',       // Art. 6(1)(c)
      'VITAL_INTERESTS',        // Art. 6(1)(d)
      'PUBLIC_INTEREST',        // Art. 6(1)(e)
      'LEGITIMATE_INTERESTS'    // Art. 6(1)(f)
    ),
    allowNull: false,
    defaultValue: 'CONSENT'
  },
  
  // Version tracking (if consent text changes)
  consentVersion: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: '1.0',
    comment: 'Version of consent text user agreed to'
  },
  
  consentText: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Actual consent text shown to user (for record keeping)'
  },
  
  // Parent consent for minors (COPPA, GDPR Art. 8)
  isMinor: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  parentGuardianId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'ID of parent/guardian if user is minor'
  },
  
  // Granular consent preferences
  preferences: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {},
    comment: 'Granular consent preferences (e.g., email: true, sms: false)'
  },
  
  // Audit trail
  lastReviewedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When user last reviewed/confirmed consent'
  },
  
  reviewCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Number of times consent has been reviewed'
  },
  
  // Metadata
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Additional metadata for audit purposes'
  }
}, {
  tableName: 'consents',
  timestamps: true,
  indexes: [
    { fields: ['userId', 'userType'] },
    { fields: ['consentType'] },
    { fields: ['status'] },
    { fields: ['grantedAt'] },
    { fields: ['expiresAt'] }
  ]
});

/**
 * Check if user has active consent for a specific purpose
 */
Consent.hasActiveConsent = async function(userId, consentType, userType = 'user') {
  const consent = await Consent.findOne({
    where: {
      userId,
      userType,
      consentType,
      status: 'ACTIVE',
      [sequelize.Sequelize.Op.or]: [
        { expiresAt: null },
        { expiresAt: { [sequelize.Sequelize.Op.gt]: new Date() } }
      ]
    }
  });
  
  return !!consent;
};

/**
 * Grant consent
 */
Consent.grantConsent = async function(params) {
  const {
    userId,
    userType = 'user',
    consentType,
    purpose,
    dataCategories,
    grantedVia = 'WEB',
    req,
    expiresInDays = null,
    recipientName = null,
    recipientType = null,
    consentVersion = '1.0',
    consentText = null
  } = params;
  
  const expiresAt = expiresInDays 
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null;
  
  const consent = await Consent.create({
    userId,
    userType,
    consentType,
    purpose,
    dataCategories,
    grantedVia,
    ipAddress: req?.ip || req?.connection?.remoteAddress,
    userAgent: req?.headers['user-agent'],
    expiresAt,
    recipientName,
    recipientType,
    consentVersion,
    consentText,
    status: 'ACTIVE',
    grantedAt: new Date()
  });
  
  return consent;
};

/**
 * Withdraw consent (GDPR Art. 7(3), DPDP §7)
 */
Consent.withdrawConsent = async function(userId, consentType, reason, userType = 'user') {
  const consents = await Consent.findAll({
    where: {
      userId,
      userType,
      consentType,
      status: 'ACTIVE'
    }
  });
  
  const updates = consents.map(consent => 
    consent.update({
      status: 'WITHDRAWN',
      withdrawnAt: new Date(),
      withdrawalReason: reason
    })
  );
  
  await Promise.all(updates);
  return consents.length;
};

/**
 * Get all active consents for a user (for data portability)
 */
Consent.getUserConsents = async function(userId, userType = 'user') {
  return await Consent.findAll({
    where: { userId, userType },
    order: [['grantedAt', 'DESC']]
  });
};

export default Consent;
