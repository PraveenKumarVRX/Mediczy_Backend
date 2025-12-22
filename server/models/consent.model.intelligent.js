import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes, Op } from 'sequelize';

// Define Consent model - NOW USING POSTGRESQL
const ConsentModel = sequelize.define('Consent', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  consentType: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  consentText: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  isGranted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  grantedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  revokedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  ipAddress: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  userAgent: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'consents',
  timestamps: true
});

const toPlainConsent = (record) => {
  if (!record) return null;
  if (typeof record.toJSON === 'function') {
    return record.toJSON();
  }
  if (typeof record.get === 'function') {
    return record.get({ plain: true });
  }
  return record;
};

const Consent = {
  grantConsent: async (consentData) => {
    const {
      userId,
      consentType,
      consentText = null,
      req,
      expiresInDays = null,
    } = consentData;

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    return await ConsentModel.create({
      userId,
      consentType,
      consentText,
      isGranted: true,
      grantedAt: new Date(),
      expiresAt,
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.headers?.['user-agent'],
      metadata: consentData.metadata || {}
    });
  },

  hasActiveConsent: async (userId, consentType) => {
    const consents = await ConsentModel.findAll({
      where: { 
        userId, 
        consentType, 
        isGranted: true,
        revokedAt: null
      },
    });

    const now = Date.now();
    return (consents || []).some((consent) => {
      const record = toPlainConsent(consent);
      if (!record) return false;
      if (!record.expiresAt) return true;
      const expiresAt = new Date(record.expiresAt).getTime();
      return Number.isFinite(expiresAt) && expiresAt > now;
    });
  },

  withdrawConsent: async (userId, consentType, reason = null) => {
    const [updatedCount] = await ConsentModel.update(
      { 
        isGranted: false,
        revokedAt: new Date(),
        metadata: { withdrawalReason: reason || '' }
      },
      { 
        where: { 
          userId, 
          consentType, 
          isGranted: true,
          revokedAt: null
        } 
      }
    );
    return updatedCount;
  },

  getUserConsents: async (userId) => {
    const consents = await ConsentModel.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']]
    });
    return consents?.map?.(toPlainConsent) || consents;
  },

  findOne: async (options) => {
    return await ConsentModel.findOne(options);
  },

  findAll: async (options) => {
    return await ConsentModel.findAll(options);
  },

  create: async (data) => {
    return await ConsentModel.create(data);
  },

  update: async (values, options) => {
    return await ConsentModel.update(values, options);
  }
};

export default Consent;