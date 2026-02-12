/**
 * Email Inbox Sync Worker
 * Periodically fetches emails from IMAP servers for team members
 */

import { Worker } from 'bullmq';
import { createRedisConnection } from '../config/redis-connection.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import inboundEmailService from '../services/inboundEmailService.js';

const QUEUE_NAME = 'email-inbox-sync';

class EmailInboxSyncWorker {
  constructor() {
    this.worker = null;
    this.isRunning = false;
  }

  async initialize() {
    try {
      const connection = createRedisConnection();

      // Create worker for email sync jobs
      this.worker = new Worker(
        QUEUE_NAME,
        async (job) => {
          return await this.processEmailSync(job);
        },
        {
          connection,
          concurrency: 3, // Process 3 team members concurrently
          limiter: {
            max: 10,
            duration: 60000, // Max 10 syncs per minute
          },
          settings: {
            backoffStrategy: (attemptsMade) => {
              // Exponential backoff: 1min, 2min, 4min, 8min, 15min
              return Math.min(Math.pow(2, attemptsMade) * 60000, 900000);
            },
          },
        }
      );

      // Event handlers
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
    const { teamMemberId, imapConfig } = job.data;

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

  async start() {
    if (this.isRunning) {
      console.log('Email sync worker is already running');
      return;
    }

    this.isRunning = true;
    console.log('✅ Email inbox sync worker started');
  }

  async stop() {
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
    try {
      // Query team members who have email sync enabled
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
          delay: 60000, // 1 minute
        },
      }
    );

    return job;
  }

  /**
   * Schedule periodic sync for all team members (every 5 minutes)
   */
  async schedulePeriodicSync() {
    const { Queue } = await import('bullmq');
    const connection = createRedisConnection();
    
    const queue = new Queue(QUEUE_NAME, { connection });

    // Add a repeatable job that runs every 5 minutes
    await queue.add(
      'periodic-sync-all',
      {},
      {
        repeat: {
          pattern: '*/5 * * * *', // Every 5 minutes
        },
        jobId: 'email-sync-periodic', // Ensure only one repeatable job exists
      }
    );

    console.log('✅ Periodic email sync scheduled (every 5 minutes)');
  }
}

// Create singleton instance
const emailSyncWorker = new EmailInboxSyncWorker();

export default emailSyncWorker;
export { emailSyncWorker, QUEUE_NAME };
