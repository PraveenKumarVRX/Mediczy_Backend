import cron from 'node-cron';
import { Op } from 'sequelize';
import User from '../models/user.model.intelligent.js';
import Doctor from '../models/doctor.model.intelligent.js';
import AuditLog from '../models/auditLog.model.intelligent.js';
import Consent from '../models/consent.model.intelligent.js';

/**
 * Data Retention Scheduler
 * 
 * Compliance: GDPR Article 5(1)(e) - Storage Limitation
 *            DPDP Act §8 - Data Retention
 *            HIPAA §164.530(j) - Retention Requirements (6 years)
 * 
 * Automatically archives or deletes data according to retention policies.
 */

/**
 * Retention periods (in days)
 */
const RETENTION_PERIODS = {
  AUDIT_LOGS: 2190,        // 6 years (HIPAA requirement)
  DELETED_ACCOUNTS: 2190,  // 6 years (legal requirement)
  EXPIRED_CONSENTS: 730,   // 2 years after expiration
  INACTIVE_USERS: 1095,    // 3 years (configurable)
  SESSION_LOGS: 90,        // 90 days for login attempts
};

/**
 * Archive old audit logs
 * Keep logs for 6 years as required by HIPAA
 */
async function archiveOldAuditLogs() {
  try {
    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() - RETENTION_PERIODS.AUDIT_LOGS);
    
    // In production, move to cold storage instead of delete
    const oldLogs = await AuditLog.count({
      where: {
        timestamp: {
          [Op.lt]: retentionDate
        }
      }
    });
    
    if (oldLogs > 0) {
      console.log(`📦 Found ${oldLogs} audit logs eligible for archival`);
      
      // TODO: Export to S3/cold storage before deletion
      // await exportToArchive(oldLogs);
      
      // For now, just log - don't auto-delete audit logs
      console.log(`⚠️  Audit logs ready for manual archival (HIPAA compliance)`);
    } else {
      console.log('✅ No audit logs need archival');
    }
  } catch (error) {
    console.error('❌ Failed to archive audit logs:', error);
  }
}

/**
 * Expire old consents
 * Mark consents as expired if past their expiration date
 */
async function expireOldConsents() {
  try {
    const now = new Date();
    
    const expiredCount = await Consent.update(
      { status: 'EXPIRED' },
      {
        where: {
          status: 'ACTIVE',
          expiresAt: {
            [Op.lt]: now,
            [Op.ne]: null
          }
        }
      }
    );
    
    if (expiredCount[0] > 0) {
      console.log(`📅 Expired ${expiredCount[0]} old consents`);
    } else {
      console.log('✅ No consents to expire');
    }
  } catch (error) {
    console.error('❌ Failed to expire consents:', error);
  }
}

/**
 * Clean up expired consents (after retention period)
 */
async function cleanupExpiredConsents() {
  try {
    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() - RETENTION_PERIODS.EXPIRED_CONSENTS);
    
    const deletedCount = await Consent.destroy({
      where: {
        status: 'EXPIRED',
        updatedAt: {
          [Op.lt]: retentionDate
        }
      }
    });
    
    if (deletedCount > 0) {
      console.log(`🗑️  Deleted ${deletedCount} old expired consents (past retention period)`);
    } else {
      console.log('✅ No expired consents to clean up');
    }
  } catch (error) {
    console.error('❌ Failed to cleanup expired consents:', error);
  }
}

/**
 * Alert on inactive users (potential for deletion under GDPR)
 */
async function checkInactiveUsers() {
  try {
    const inactivityDate = new Date();
    inactivityDate.setDate(inactivityDate.getDate() - RETENTION_PERIODS.INACTIVE_USERS);
    
    const inactiveUsers = await User.count({
      where: {
        lastLogin: {
          [Op.lt]: inactivityDate
        },
        isActive: true,
        deletedAt: null
      }
    });
    
    if (inactiveUsers > 0) {
      console.log(`⚠️  Found ${inactiveUsers} inactive users (no login in ${RETENTION_PERIODS.INACTIVE_USERS} days)`);
      console.log(`   Consider sending reactivation email or data retention notice`);
      
      // TODO: Send email to inactive users about potential data deletion
    } else {
      console.log('✅ No long-term inactive users');
    }
  } catch (error) {
    console.error('❌ Failed to check inactive users:', error);
  }
}

/**
 * Clean up old session/login attempt logs
 */
async function cleanupSessionLogs() {
  try {
    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() - RETENTION_PERIODS.SESSION_LOGS);
    
    const deletedCount = await AuditLog.destroy({
      where: {
        action: {
          [Op.in]: ['LOGIN', 'LOGOUT', 'LOGIN_FAILED']
        },
        isPHI: false,
        timestamp: {
          [Op.lt]: retentionDate
        }
      }
    });
    
    if (deletedCount > 0) {
      console.log(`🗑️  Deleted ${deletedCount} old session logs`);
    } else {
      console.log('✅ No old session logs to clean up');
    }
  } catch (error) {
    console.error('❌ Failed to cleanup session logs:', error);
  }
}

/**
 * Generate compliance report
 */
async function generateComplianceReport() {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Count audit events in last 30 days
    const auditStats = await AuditLog.findAll({
      attributes: [
        'action',
        [AuditLog.sequelize.fn('COUNT', AuditLog.sequelize.col('id')), 'count']
      ],
      where: {
        timestamp: {
          [Op.gte]: thirtyDaysAgo
        }
      },
      group: ['action']
    });
    
    // Count active consents by type
    const consentStats = await Consent.findAll({
      attributes: [
        'consentType',
        [Consent.sequelize.fn('COUNT', Consent.sequelize.col('id')), 'count']
      ],
      where: {
        status: 'ACTIVE'
      },
      group: ['consentType']
    });
    
    console.log('\n📊 COMPLIANCE REPORT (Last 30 Days)');
    console.log('=====================================');
    console.log('\nAudit Events:');
    auditStats.forEach(stat => {
      console.log(`  ${stat.action}: ${stat.dataValues.count}`);
    });
    
    console.log('\nActive Consents:');
    consentStats.forEach(stat => {
      console.log(`  ${stat.consentType}: ${stat.dataValues.count}`);
    });
    
    console.log('\n=====================================\n');
  } catch (error) {
    console.error('❌ Failed to generate compliance report:', error);
  }
}

/**
 * Initialize all scheduled jobs
 */
export function initializeDataRetentionScheduler() {
  console.log('🕐 Initializing data retention scheduler...');
  
  // Run daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('\n🔄 Running daily data retention tasks...');
    await expireOldConsents();
    await cleanupSessionLogs();
    await checkInactiveUsers();
  });
  
  // Run weekly on Sunday at 3 AM
  cron.schedule('0 3 * * 0', async () => {
    console.log('\n🔄 Running weekly data retention tasks...');
    await archiveOldAuditLogs();
    await cleanupExpiredConsents();
    await generateComplianceReport();
  });
  
  // Run monthly on 1st at 4 AM
  cron.schedule('0 4 1 * *', async () => {
    console.log('\n🔄 Running monthly compliance report...');
    await generateComplianceReport();
  });
  
  console.log('✅ Data retention scheduler initialized');
  console.log('  - Daily: Expire consents, cleanup sessions, check inactive users (2 AM)');
  console.log('  - Weekly: Archive audit logs, compliance report (Sunday 3 AM)');
  console.log('  - Monthly: Full compliance report (1st of month, 4 AM)');
}

export default {
  initializeDataRetentionScheduler,
  archiveOldAuditLogs,
  expireOldConsents,
  cleanupExpiredConsents,
  checkInactiveUsers,
  cleanupSessionLogs,
  generateComplianceReport
};
