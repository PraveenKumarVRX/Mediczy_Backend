#!/usr/bin/env node
/**
 * Lightweight API server for Communication Hub smoke tests.
 * Mounts only /api/team routes — avoids full app startup (Twilio, Kafka, Redis workers).
 */

import express from 'express';
import { loadSmokeEnv } from './lib/communication-hub-smoke-bootstrap.mjs';

loadSmokeEnv();
process.env.NODE_ENV = process.env.SMOKE_NODE_ENV || 'test';

const { default: teamRouter } = await import('../../routes/team.route.js');

const app = express();
app.use(express.json({ limit: '5mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', mode: 'communication-hub-smoke-api', timestamp: new Date().toISOString() });
});

app.use('/api/team', teamRouter);

const port = parseInt(process.env.PORT || '18998', 10);
const host = process.env.SMOKE_BIND_HOST || '127.0.0.1';

app.listen(port, host, () => {
  console.log(`Communication Hub smoke API listening on http://${host}:${port}`);
});
