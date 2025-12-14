import { connectToDb } from '../db/mariadb.js';

let intelligentDB = null;

async function getDB() {
  if (!intelligentDB) {
    intelligentDB = await connectToDb();
  }
  return intelligentDB;
}

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
    const db = await getDB();
    if (typeof db.Consent?.grantConsent === 'function') {
      return await db.Consent.grantConsent(consentData);
    }

    const {
      userId,
      userType = 'user',
      consentType,
      purpose,
      dataCategories = [],
      grantedVia = 'WEB',
      req,
      expiresInDays = null,
      recipientName = null,
      recipientType = null,
      consentVersion = '1.0',
      consentText = null,
    } = consentData;

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    return await db.Consent.create({
      userId,
      userType,
      consentType,
      purpose,
      dataCategories,
      grantedVia,
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.headers?.['user-agent'],
      expiresAt,
      recipientName,
      recipientType,
      consentVersion,
      consentText,
      status: 'ACTIVE',
      grantedAt: new Date(),
    });
  },

  hasActiveConsent: async (userId, consentType, userType = 'user') => {
    const db = await getDB();
    if (typeof db.Consent?.hasActiveConsent === 'function') {
      return await db.Consent.hasActiveConsent(userId, consentType, userType);
    }

    const consents = await db.Consent.findAll({
      where: { userId, userType, consentType, status: 'ACTIVE' },
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

  withdrawConsent: async (userId, consentType, reason, userType = 'user') => {
    const db = await getDB();
    if (typeof db.Consent?.withdrawConsent === 'function') {
      return await db.Consent.withdrawConsent(userId, consentType, reason, userType);
    }

    const consents = await db.Consent.findAll({
      where: { userId, userType, consentType, status: 'ACTIVE' },
    });

    await Promise.all((consents || []).map(async (consent) => {
      if (typeof consent.update === 'function') {
        await consent.update({
          status: 'WITHDRAWN',
          withdrawnAt: new Date(),
          withdrawalReason: reason,
        });
      } else {
        await db.Consent.update({
          status: 'WITHDRAWN',
          withdrawnAt: new Date(),
          withdrawalReason: reason,
        }, {
          where: { id: consent.id },
        });
      }
    }));

    return consents?.length || 0;
  },

  getUserConsents: async (userId, userType = 'user') => {
    const db = await getDB();
    const consents = await db.Consent.findAll({
      where: { userId, userType },
      order: [['grantedAt', 'DESC']],
    });
    return consents?.map?.(toPlainConsent) || consents;
  }
};

export default Consent;