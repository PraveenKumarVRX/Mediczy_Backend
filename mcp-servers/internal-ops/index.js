#!/usr/bin/env node
/**
 * Mediczy internal-ops MCP server.
 *
 * Read-only operational visibility for engineering/on-call — PM2 process
 * status and logs, live service health checks, object-storage reachability,
 * and aggregate (non-PHI) DB stats. Every tool here answers exactly the
 * kind of question that got typed by hand into a terminal during real
 * incidents this session (the MinIO outage, the corporate-health-report
 * notification investigation, the DOB-parsing bug) — this makes those
 * checks callable by any MCP client instead of requiring shell access.
 *
 * Deliberately scoped to non-clinical, non-PHI, read-only tools. This is
 * NOT the clinical-data MCP server (that one has to route through the
 * SaMD quality-gate/interpretability layer and is a separate, later piece
 * of work) — nothing here returns a patient-identifiable row.
 *
 * Transport: stdio. Whoever can execute this process already has shell
 * access to this box (and therefore already has pm2/psql/curl access
 * directly) — this doesn't grant any new privilege, it just makes the
 * same read-only operations callable by an MCP client. It is NOT yet
 * safe to expose over a network without adding real authentication —
 * see README.md.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load the same .env files the main app loads (repo root and server/),
// so MINIO_PUBLIC_URL etc. are available without duplicating config.
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '..', '.env') });
dotenv.config({ path: join(__dirname, '..', '..', 'server', '.env') });

import { getPm2Status, getPm2Logs } from './lib/pm2.js';
import { getServiceHealth } from './lib/health.js';
import { checkObjectStorage } from './lib/storage.js';
import { getDbConnectionStats, getRisStudyStats, getCorporateHealthReportStats } from './lib/db.js';

const server = new McpServer({
  name: 'mediczy-internal-ops',
  version: '0.1.0',
});

function textResult(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function errorResult(err) {
  return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
}

server.registerTool(
  'get_pm2_status',
  {
    title: 'Get PM2 process status',
    description: 'Lists every PM2-managed process on this box with status, uptime, memory, CPU, restart count, and exec mode (fork/cluster). Use this first when investigating "is the app up" or "did something crash".',
    inputSchema: {},
  },
  async () => {
    try {
      return textResult(await getPm2Status());
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  'get_pm2_logs',
  {
    title: 'Get recent PM2 logs for one process',
    description: 'Returns the last N lines of stdout/stderr for a named PM2 process (e.g. "mediczy-server", "imaging-triage"). Use get_pm2_status first to see valid process names.',
    inputSchema: {
      name: z.string().describe('Exact PM2 process name, e.g. "mediczy-server"'),
      lines: z.number().int().min(1).max(500).optional().describe('Number of recent log lines to return (default 50, max 500)'),
    },
  },
  async ({ name, lines }) => {
    try {
      const logs = await getPm2Logs(name, lines);
      return { content: [{ type: 'text', text: logs || '(no log output)' }] };
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  'get_service_health',
  {
    title: 'Check live health endpoints',
    description: 'Hits the real /health endpoints for mediczy-server and imaging-triage over HTTP and reports status code, latency, and body. Use this to confirm a service is actually answering requests, not just that its PM2 process is "online" (a process can be online but wedged).',
    inputSchema: {},
  },
  async () => {
    try {
      return textResult(await getServiceHealth());
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  'check_object_storage',
  {
    title: 'Check MinIO/object-storage reachability',
    description: 'Fetches the configured MinIO public URL and reports whether it is reachable. Real precedent: this exact check caught a Cloudflare tunnel outage (error 1033) where DNS resolved fine but the origin never answered — a normal health check on the app server would not have caught it.',
    inputSchema: {},
  },
  async () => {
    try {
      return textResult(await checkObjectStorage());
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  'get_db_connection_stats',
  {
    title: 'Get Postgres connection pool stats',
    description: 'Returns active/idle/idle-in-transaction connection counts for the current database and the longest-running active query, from pg_stat_activity. Use this when the app feels slow and you suspect connection exhaustion or a stuck query.',
    inputSchema: {},
  },
  async () => {
    try {
      return textResult(await getDbConnectionStats());
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  'get_ris_study_stats',
  {
    title: 'Get RIS/imaging study aggregate stats',
    description: 'Aggregate (non-patient-identifiable) counts of RIS studies by modality and report status, plus studies ingested in the last 24 hours. Use this to sanity-check imaging ingest volume — never returns patient names or individual study rows.',
    inputSchema: {},
  },
  async () => {
    try {
      return textResult(await getRisStudyStats());
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  'get_corporate_health_report_stats',
  {
    title: 'Get corporate health-report upload/notification stats',
    description: 'Aggregate counts for corporate_health_reports — total uploads, how many actually triggered an email/WhatsApp notification, distinct corporates, most recent upload. Real precedent: this exact query caught that 30/37 real uploads never notified the employee at all.',
    inputSchema: {},
  },
  async () => {
    try {
      return textResult(await getCorporateHealthReportStats());
    } catch (err) {
      return errorResult(err);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
