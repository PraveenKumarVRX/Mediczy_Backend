#!/usr/bin/env node
import pool from '../db/pgPool.js';
import { processJourneyQueue } from '../services/hospital-crm-growth-processor.service.js';
import { scanRecoveryQueue } from '../services/hospital-crm-growth.service.js';

const tenantId = Number(process.env.CRM_DEFAULT_TENANT_ID);
if (!Number.isInteger(tenantId) || tenantId < 1) {
  throw new Error('CRM_DEFAULT_TENANT_ID must be a real positive tenant id');
}

try {
  const [journeys, recovery] = await Promise.all([
    processJourneyQueue(tenantId, null, Number(process.env.CRM_GROWTH_QUEUE_LIMIT) || 100),
    scanRecoveryQueue(tenantId, null),
  ]);
  console.log(JSON.stringify({ tenantId, journeys, recoveryCreated: recovery.length }));
} finally {
  await pool.end().catch(() => {});
}
