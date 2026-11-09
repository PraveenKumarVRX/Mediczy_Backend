/**
 * Email Inbox Sync Worker
 * Periodically fetches emails from IMAP servers for team members
 */


const isTest = process.env.NODE_ENV === 'test';

let Worker, createRedisConnection, postgresSequelize, inboundEmailService, EmailSettings, TeamMember;
if (!isTest) {
  Worker = (await import('bullmq')).Worker;
  createRedisConnection = (await import('../config/redis-connection.js')).createRedisConnection;
  postgresSequelize = (await import('../db/postgres-sequelize.js')).postgresSequelize;
  inboundEmailService = (await import('../services/inboundEmailService.js')).default;
  EmailSettings = (await import('../models/emailSettings.model.js')).default;
  TeamMember = (await import('../models/postgres/team-member.model.postgres.js')).default;
}

const QUEUE_NAME = 'email-inbox-sync';


class EmailInboxSyncWorker {
  constructor() {
    this.worker = null;
    this.isRunning = false;
  }

  async initialize() {
    if (isTest) {
      this.worker = null;
      this.isRunning = false;
      return true;
    }
    try {
      const connection = createRedisConnection();
      this.worker = new Worker(
        QUEUE_NAME,
        async (job) => {
          return await this.processEmailSync(job);
        },
        {
          connection,
          concurrency: 3,
          limiter: {
            max: 10,
            duration: 60000,
          },
          settings: {
            backoffStrategy: (attemptsMade) => {
              return Math.min(Math.pow(2, attemptsMade) * 60000, 900000);
            },
          },
        }
      );
      this.worker.on('completed', (job, result) => {
        console.log(`✅ Email sync completed for team member ${job.data.teamMemberId}:`, result);
      });
      this.worker.on('failed', (job, error) => {
        console.error(`❌ Email sync failed for team member ${job?.data?.teamMemberId}:`, error.message);
      });
      this.worker.on('error', (error) => {
        console.error('❌ Email sync worker error:', error);
      });
      console.log('✅ Email inbox sync worker initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize email sync worker:', error);
      return false;
    }
  }

  async processEmailSync(job) {
    if (isTest) {
      return { success: true, teamMemberId: job?.data?.teamMemberId || null, emailsFetched: 0, timestamp: new Date().toISOString() };
    }
    const { teamMemberId, imapConfig } = job.data;

    // Handle periodic-sync-all job — sync every active email configuration
    if (!teamMemberId || job.name === 'periodic-sync-all') {
      return await this.syncAllActiveEmailSettings();
    }

    try {
      console.log(`📧 Syncing emails for team member ${teamMemberId}...`);

      // Fetch and process emails
      const result = await inboundEmailService.connectAndFetchEmails(
        teamMemberId,
        imapConfig
      );

      return {
        success: true,
        teamMemberId,
        emailsFetched: result?.emailCount || 0,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`Email sync error for team member ${teamMemberId}:`, error);
      
      // Don't retry if it's an authentication error
      if (error.message.includes('authentication') || error.message.includes('credentials')) {
        console.warn(`⚠️  Authentication failed for team member ${teamMemberId}, skipping retries`);
        return {
          success: false,
          teamMemberId,
          error: 'Authentication failed',
          skipRetry: true,
        };
      }

      throw error; // Retry for other errors
    }
  }

  /**
   * Sync all active email settings (triggered by periodic-sync-all job)
   */
  async syncAllActiveEmailSettings() {
    if (isTest) {
      return { success: true, synced: 0, totalNew: 0, failed: 0 };
    }
    const providerImapDefaults = {
      'zoho-pro': { host: 'imappro.zoho.in', port: 993, tls: true },
      'zoho':     { host: 'imap.zoho.in',    port: 993, tls: true },
      'gmail':    { host: 'imap.gmail.com',  port: 993, tls: true },
      'outlook':  { host: 'outlook.office365.com', port: 993, tls: true },
      'custom':   { host: 'imap.zoho.in',    port: 993, tls: true },
    };

    let totalNew = 0;
    let synced = 0;
    let failed = 0;

    try {
      // syncEnabled is the switch the UI exposes; selecting on isActive alone
      // meant turning sync off in the UI changed nothing and the mailbox was
      // still polled every tick. Both flags now have to agree.
      const allSettings = await EmailSettings.findAll({
        where: { isActive: true, syncEnabled: true },
        paranoid: true,
      });

      for (const setting of allSettings) {
        const username = setting.imapUsername || setting.email;
        const password = setting.imapPassword;
        // Record a visible reason instead of silently skipping unconfigured mailboxes.
        if (!username || !password) {
          try { await setting.update({ lastSyncAt: new Date(), lastSyncStatus: 'skipped: IMAP username/password not set' }); } catch { /* status is best-effort */ }
          continue;
        }

        // Resolve teamMemberId from userId
        let tmbId = null;
        try {
          const tm = await TeamMember.findOne({ where: { userId: setting.userId }, attributes: ['id'] });
          tmbId = tm?.id || setting.userId;
        } catch {
          tmbId = setting.userId;
        }

        const defaults = providerImapDefaults[setting.provider] || providerImapDefaults.custom;
        const imapConfig = {
          email: setting.email,
          username,
          password,
          host: setting.imapHost || defaults.host,
          port: setting.imapPort || defaults.port,
          tls: setting.imapSecure !== false ? true : defaults.tls,
        };

        try {
          const result = await inboundEmailService.scheduledSync(tmbId, imapConfig, 30);
          totalNew += result?.newEmails || 0;
          synced++;
          console.log(`✅ Periodic sync OK for team ${tmbId}: ${result?.newEmails || 0} new emails`);
          try { await setting.update({ lastSyncAt: new Date(), lastSyncStatus: `ok: ${result?.newEmails || 0} new` }); } catch { /* status is best-effort */ }
        } catch (err) {
          failed++;
          console.error(`❌ Periodic sync failed for team ${tmbId}:`, err.message);
          // Persist the failure reason so it is visible, not silent. The column was
          // VARCHAR(50), which cut Zoho's "You are yet to enable IMAP for <mailbox>"
          // down to "error: IMAP error: You are yet to enable IMAP for " -- the
          // operator saw a sentence with the actionable half removed. Widened to 255
          // by 20261109000300-email-sync-status-width.migration.js.
          try { await setting.update({ lastSyncAt: new Date(), lastSyncStatus: `error: ${String(err.message || 'unknown')}`.slice(0, 255) }); } catch { /* status is best-effort */ }
        }
      }
    } catch (err) {
      console.error('❌ syncAllActiveEmailSettings error:', err.message);
    }

    console.log(`📧 Periodic sync complete: ${synced} accounts synced, ${totalNew} new emails, ${failed} failed`);
    return { success: true, synced, totalNew, failed };
  }

  async start() {
    if (isTest) {
      this.isRunning = true;
      return;
    }
    if (this.isRunning) {
      console.log('Email sync worker is already running');
      return;
    }
    this.isRunning = true;
    console.log('✅ Email inbox sync worker started');
  }

  async stop() {
    if (isTest) {
      this.isRunning = false;
      return;
    }
    if (this.worker) {
      await this.worker.close();
      this.isRunning = false;
      console.log('Email inbox sync worker stopped');
    }
  }

  /**
   * Get team members with email configuration
   */
  async getTeamMembersWithEmail() {
    if (isTest) {
      return [];
    }
    try {
      const query = `
        SELECT 
          id,
          email,
          email_sync_enabled,
          imap_host,
          imap_port,
          imap_user,
          imap_password,
          imap_tls
        FROM team_members
        WHERE email_sync_enabled = true
          AND imap_host IS NOT NULL
          AND imap_user IS NOT NULL
          AND imap_password IS NOT NULL
          AND is_active = true
      `;
      const [results] = await postgresSequelize.query(query);
      return results;
    } catch (error) {
      console.error('Error fetching team members with email:', error);
      return [];
    }
  }

  /**
   * Manually trigger sync for a specific team member
   */
  async triggerSync(teamMemberId, imapConfig) {
    if (isTest) {
      return { id: 'mock-job', teamMemberId, imapConfig };
    }
    if (!this.worker) {
      throw new Error('Email sync worker not initialized');
    }
    const { Queue } = await import('bullmq');
    const connection = createRedisConnection();
    const queue = new Queue(QUEUE_NAME, { connection });
    const job = await queue.add(
      'sync-email',
      { teamMemberId, imapConfig },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 60000,
        },
      }
    );
    return job;
  }

  /**
   * Schedule periodic sync for all team members (every 5 minutes)
   */
  async schedulePeriodicSync() {
    if (isTest) {
      return;
    }
    const { Queue } = await import('bullmq');
    const connection = createRedisConnection();
    const queue = new Queue(QUEUE_NAME, { connection });
    await queue.add(
      'periodic-sync-all',
      {},
      {
        repeat: {
          pattern: '*/5 * * * *',
        },
        jobId: 'email-sync-periodic',
      }
    );
    console.log('✅ Periodic email sync scheduled (every 5 minutes)');
  }
}

// Create singleton instance
const emailSyncWorker = new EmailInboxSyncWorker();

export default emailSyncWorker;
export { emailSyncWorker, QUEUE_NAME };
