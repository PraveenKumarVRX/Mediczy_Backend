#!/usr/bin/env node
import pool from '../db/pgPool.js';
import { up as foundationUp } from '../migrations/20260908000000-hospital-crm-foundation.migration.js';
import { up as domainsUp } from "../migrations/20260908000001-hospital-crm-worldclass-domains.migration.js";
import { up as growthUp } from '../migrations/20260908000002-hospital-crm-growth-automation.migration.js';
import { up as specialtyDigitalUp } from "../migrations/20260909000000-hospital-crm-specialty-diagnostic-digital.migration.js";
import { up as communicationHubUp } from '../migrations/20260909000002-hospital-crm-communication-hub.migration.js';

const client = await pool.connect();
try {
  await client.query('BEGIN');
} catch (error) {
  client.release();
  await pool.end().catch(() => {});
  throw error;
}
try {
  await foundationUp(client);
  await domainsUp(client);
  await growthUp(client);
  await specialtyDigitalUp(client);
  await communicationHubUp(client);
  await client.query('COMMIT');
  console.log('Hospital CRM migrations completed');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`Hospital CRM migrations failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end().catch(() => {});
}
