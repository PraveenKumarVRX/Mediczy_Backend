import cron from 'node-cron';
import { Op, fn, col } from 'sequelize';
import User from '../models/user.model.intelligent.js';
import Doctor from '../models/doctor.model.intelligent.js';
import AuditLog from '../models/auditLog.model.intelligent.js';
import Consent from '../models/consent.model.intelligent.js';
import { tick, tickError } from '../utils/cronRegistry.js';

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
    const oldLogs = await AuditLog.countOlderThan({ before: retentionDate });
    
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
    // The consents table has no status column: expiry is enforced at read time
    // (consent model hasActiveConsent checks expiresAt), so nothing needs flipping.
    // This pass only reports granted consents that are past their expiry.
    const [row] = await Consent.findAll({
      attributes: [[fn('COUNT', col('id')), 'count']],
      where: {
        isGranted: true,
        revokedAt: null,
        expiresAt: { [Op.lt]: new Date(), [Op.ne]: null }
      },
      raw: true
    });
    const pastExpiry = Number(row?.count || 0);
    if (pastExpiry > 0) {
      console.log(`📅 ${pastExpiry} granted consents are past their expiry (treated as inactive at read time)`);
    } else {
      console.log('✅ No consents past expiry');
    }
  } catch (error) {
    console.error('❌ Failed to check expired consents:', error);
  }
}

/**
 * Clean up expired consents (after retention period)
 */
async function cleanupExpiredConsents() {
  try {
    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() - RETENTION_PERIODS.EXPIRED_CONSENTS);

    // Report-only: consent records are legal evidence, so nothing is auto-deleted here
    // (same approach as archiveOldAuditLogs). The wrapper has no destroy(), and a
    // retention purge needs an explicit, reviewed decision.
    const [row] = await Consent.findAll({
      attributes: [[fn('COUNT', col('id')), 'count']],
      where: { expiresAt: { [Op.lt]: retentionDate, [Op.ne]: null } },
      raw: true
    });
    const eligible = Number(row?.count || 0);
    if (eligible > 0) {
      console.log(`📦 ${eligible} consents expired more than ${RETENTION_PERIODS.EXPIRED_CONSENTS} days ago — eligible for reviewed purge (not auto-deleted)`);
    } else {
      console.log('✅ No expired consents past the retention period');
    }
  } catch (error) {
    console.error('❌ Failed to check expired consents for retention:', error);
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
        lastLoginAt: {
          [Op.lt]: inactivityDate
        },
        status: 'active'
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

    // AuditLog records are immutable by design (destroy() throws), so this reports
    // how many login/logout entries are past the retention window instead of deleting them.
    const eligible = await AuditLog.countOlderThan({
      before: retentionDate,
      actions: ['LOGIN', 'LOGOUT', 'LOGIN_FAILED']
    });

    if (eligible > 0) {
      console.log(`📦 ${eligible} session log entries are past the ${RETENTION_PERIODS.SESSION_LOGS}-day window (audit logs are immutable; not deleted)`);
    } else {
      console.log('✅ No session logs past the retention window');
    }
  } catch (error) {
    console.error('❌ Failed to check session logs:', error);
  }
}

/**
 * Generate compliance report
 */
async function generateComplianceReport() {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Count audit events in last 30 days. AuditLog is a raw-SQL wrapper, not a Sequelize model
    // (findAll ignores attributes/group), so it has a dedicated grouped-count method.
    const auditStats = await AuditLog.countByAction({ since: thirtyDaysAgo });

    // Count active consents by type (Consent is a real Sequelize model)
    const consentStats = await Consent.findAll({
      attributes: [
        'consentType',
        [fn('COUNT', col('id')), 'count']
      ],
      where: {
        isGranted: true,
        revokedAt: null,
        [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: now } }]
      },
      group: ['consentType']
    });

    console.log('\n📊 COMPLIANCE REPORT (Last 30 Days)');
    console.log('=====================================');
    console.log('\nAudit Events:');
    auditStats.forEach(stat => {
      console.log(`  ${stat.action}: ${stat.count}`);
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
    try {
      await expireOldConsents();
      await cleanupSessionLogs();
      await checkInactiveUsers();
      let qmsPhi = { purged: 0 };
      try {
        const { purgeQueueMetadataPhi } = await import('./qms-opd.service.js');
        qmsPhi = await purgeQueueMetadataPhi({ olderThanDays: 30, limit: 1000 });
        tick('qms_phi_purge', qmsPhi);
      } catch (e) {
        tickError('qms_phi_purge', e.message);
      }
      tick('data_retention_daily', { qmsPhiPurged: qmsPhi.purged || 0 });
    } catch (err) {
      tickError('data_retention_daily', err.message);
    }
  });
  
  // Run weekly on Sunday at 3 AM
  cron.schedule('0 3 * * 0', async () => {
    console.log('\n🔄 Running weekly data retention tasks...');
    try {
      await archiveOldAuditLogs();
      await cleanupExpiredConsents();
      await generateComplianceReport();
      tick('data_retention_weekly');
    } catch (err) {
      tickError('data_retention_weekly', err.message);
    }
  });
  
  // Run monthly on 1st at 4 AM
  cron.schedule('0 4 1 * *', async () => {
    console.log('\n🔄 Running monthly compliance report...');
    try {
      await generateComplianceReport();
      tick('data_retention_monthly');
    } catch (err) {
      tickError('data_retention_monthly', err.message);
    }
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
