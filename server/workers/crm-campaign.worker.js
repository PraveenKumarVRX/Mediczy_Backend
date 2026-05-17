import { Worker } from 'bullmq';
import { createRedisConnection } from '../config/redis-connection.js';
import { sendCampaignRecipient } from '../services/crm-campaign-dispatcher.service.js';

const connection = createRedisConnection();

export const crmCampaignWorker = new Worker(
  'crm-campaign-queue',
  async (job) => sendCampaignRecipient(job.data.recipientId, job.data.publicBaseUrl),
  { connection, concurrency: Number(process.env.CRM_CAMPAIGN_CONCURRENCY || 5) }
);

crmCampaignWorker.on('failed', (job, error) => {
  console.error('[CRMCampaignWorker] job failed:', job?.id, error.message);
});
