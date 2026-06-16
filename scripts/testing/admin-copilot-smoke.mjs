#!/usr/bin/env node
/**
 * Admin AI Copilot — sanity & smoke (phases 0–5)
 * Static checks + optional live API when BASE_URL is reachable.
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const BASE_URL = process.env.BASE_URL || 'https://mediqzy.com';

let passed = 0;
let failed = 0;
let warned = 0;

function pass(name) {
  passed += 1;
  console.log(`✓ ${name}`);
}

function fail(name, detail = '') {
  failed += 1;
  console.log(`✗ ${name}${detail ? `: ${detail}` : ''}`);
}

function warn(name, detail = '') {
  warned += 1;
  console.log(`⚠ ${name}${detail ? `: ${detail}` : ''}`);
}

function read(relPath) {
  return readFileSync(path.join(ROOT, relPath), 'utf8');
}

function fileExists(relPath, label) {
  if (existsSync(path.join(ROOT, relPath))) {
    pass(label);
    return true;
  }
  fail(label, `missing ${relPath}`);
  return false;
}

function includesAll(file, snippets, label) {
  const content = read(file);
  for (const snippet of snippets) {
    if (!content.includes(snippet)) {
      fail(`${label}: missing "${snippet}"`, file);
      return false;
    }
  }
  pass(label);
  return true;
}

function checkSyntax(relPath) {
  try {
    execSync(`node --check "${path.join(ROOT, relPath)}"`, { stdio: 'pipe' });
    pass(`syntax OK: ${relPath}`);
  } catch (error) {
    fail(`syntax: ${relPath}`, error.message?.split('\n')[0]);
  }
}

async function liveProbe() {
  const healthUrl = `${BASE_URL}/api/health`;
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      pass(`live health: ${healthUrl} → ${res.status}`);
      return true;
    }
    warn(`live health returned ${res.status}`, healthUrl);
  } catch (error) {
    warn(`live API unreachable at ${BASE_URL}`, error.message);
  }
  return false;
}

async function liveRoute(method, route, expectStatuses, label) {
  try {
    const res = await fetch(`${BASE_URL}${route}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'POST' ? JSON.stringify({ message: 'ping' }) : undefined,
      signal: AbortSignal.timeout(8000),
    });
    if (expectStatuses.includes(res.status)) {
      pass(`${label}: ${route} → ${res.status}`);
    } else {
      warn(`${label}: ${route} → ${res.status} (expected ${expectStatuses.join('|')})`);
    }
  } catch (error) {
    warn(`${label} skipped`, error.message);
  }
}

async function main() {
  console.log('\n=== Admin AI Copilot — Sanity & Smoke ===\n');
  console.log(`BASE_URL=${BASE_URL}\n`);

  // Phase 0 — files & nav
  fileExists('client/src/pages/admin/AdminCopilot.tsx', 'AdminCopilot page');
  fileExists('client/src/pages/admin/AdminClinicalCopilot.tsx', 'AdminClinicalCopilot page');
  fileExists('client/src/services/adminCopilot.ts', 'adminCopilot API client');
  fileExists('server/migrations/admin-copilot-pending-actions.migration.js', 'pending actions migration');

  includesAll('client/src/components/layout/AdminLayout.tsx', [
    "label: 'Admin Copilot'",
    "path: '/admin/copilot'",
    "label: 'Feedback Intelligence'",
  ], 'Phase 0 admin sidebar nav');

  includesAll('server/services/ai-model-governance.service.js', [
    "'admin-copilot':",
    'NOT SaMD',
  ], 'Phase 0 admin-copilot model card');

  includesAll('server/services/ai-brain/agent-permission-engine.js', [
    'medical_director',
    'EXEC_SYSTEM_TOOLS',
  ], 'Phase 0 permission engine');

  // Phase 1 — routes & UI
  includesAll('client/src/routes/index.tsx', [
    'path="/admin/copilot"',
    'path="/admin/copilot/clinical"',
    'path="/team/copilot"',
    'AdminCopilot',
    'AdminClinicalCopilot',
  ], 'Phase 1 routes');

  includesAll('client/src/pages/team/TeamDashboard.tsx', [
    '/team/copilot',
    'Admin Copilot',
  ], 'Phase 1 team dashboard quick action');

  includesAll('client/src/services/adminCopilot.ts', [
    '/v3/ai-brain/agents/process',
    '/v3/ai-brain/agents/copilot-config',
    'processMessageStream',
    'approveAction',
    'personaToForceAgent',
  ], 'Phase 1 API client');

  includesAll('client/src/pages/admin/AdminCopilot.tsx', [
    'personaToForceAgent',
    'processMessageStream',
    'approveAction',
    'Pending approval',
  ], 'Phase 1 AdminCopilot UI wiring');

  // Phase 2 — system tools
  fileExists('server/services/ai-brain/tools/system-tools.js', 'system-tools.js');
  includesAll('server/services/ai-brain/tools/system-tools.js', [
    "name: 'list_agents'",
    "name: 'get_system_status'",
    "name: 'get_audit_logs'",
    "name: 'get_agent_metrics'",
    "name: 'configure_agent'",
    "name: 'reload_prompts'",
  ], 'Phase 2 system tool definitions');

  includesAll('server/services/ai-brain/tools/loader.js', [
    'system-tools',
  ], 'Phase 2 tool loader import');

  includesAll('server/services/ai-brain/tools/index.js', [
    'isWrite',
    'isSystem',
    'pendingApproval',
  ], 'Phase 2 tool registry _meta + approval gate');

  // Phase 3 — SIB guard & audit
  includesAll('server/middleware/sib-ai-guard.middleware.js', [
    '/api\\/v3\\/ai-brain\\/agents\\/process/',
    '/api\\/v3\\/ai-brain\\/agents\\/process\\/stream/',
  ], 'Phase 3 SIB guard routes');

  includesAll('server/services/ai-brain/multi-agent-orchestrator.js', [
    'copilotType',
    'admin-ops',
    'onEvent',
  ], 'Phase 3 orchestrator audit + RAG');

  // Phase 5 — streaming & approvals
  fileExists('server/services/ai-copilot-pending-actions.service.js', 'pending actions service');

  includesAll('server/routes/ai-brain.route.js', [
    "router.get('/agents/copilot-config'",
    "router.post('/agents/process/stream'",
    "router.post('/agents/approve-action'",
    'ADMIN_COPILOT_ENABLED',
    'ADMIN_COPILOT_STREAMING',
    'ADMIN_COPILOT_WRITE_ACTIONS',
  ], 'Phase 5 API routes + feature flags');

  includesAll('server/services/ai-copilot-pending-actions.service.js', [
    'ai_copilot_pending_actions',
    'createPendingAction',
    'approvePendingAction',
  ], 'Phase 5 pending actions service');

  // Syntax
  const syntaxFiles = [
    'server/services/ai-brain/tools/system-tools.js',
    'server/services/ai-brain/tools/index.js',
    'server/services/ai-copilot-pending-actions.service.js',
    'server/migrations/admin-copilot-pending-actions.migration.js',
    'server/routes/ai-brain.route.js',
    'server/services/ai-brain/multi-agent-orchestrator.js',
    'server/services/ai-brain/agent-permission-engine.js',
  ];
  for (const file of syntaxFiles) {
    checkSyntax(file);
  }

  // Live API (prod or local)
  const live = await liveProbe();
  if (live) {
    await liveRoute('GET', '/api/v3/ai-brain/agents/copilot-config', [200, 401, 403], 'copilot-config (auth at router mount)');
    await liveRoute('POST', '/api/v3/ai-brain/agents/process', [401, 403, 503], 'agents/process auth guard');
    await liveRoute('POST', '/api/v3/ai-brain/agents/process/stream', [401, 403, 503], 'agents/stream auth guard');
    await liveRoute('POST', '/api/v3/ai-brain/agents/approve-action', [401, 403], 'approve-action auth guard');

    // If copilot-config is public/200, validate shape
    try {
      const res = await fetch(`${BASE_URL}/api/v3/ai-brain/agents/copilot-config`, {
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.enabled === 'boolean' && typeof data.streaming === 'boolean') {
          pass('copilot-config response shape valid');
        } else {
          warn('copilot-config missing expected fields', JSON.stringify(data).slice(0, 120));
        }
        if (data.enabled === false) {
          warn('ADMIN_COPILOT_ENABLED appears false on server');
        }
      } else if (res.status === 404) {
        warn('copilot-config → 404 (backend not deployed yet)');
      }
    } catch (error) {
      warn('copilot-config shape check skipped', error.message);
    }
  }

  // Prod frontend bundle (informational)
  try {
    const { readdirSync } = await import('fs');
    const assetsDir = path.join(ROOT, 'client/dist/assets');
    const copilotChunk = existsSync(assetsDir)
      ? readdirSync(assetsDir).find((f) => f.startsWith('AdminCopilot-'))
      : null;
    if (copilotChunk) pass(`local build includes AdminCopilot chunk: ${copilotChunk}`);

    const res = await fetch('https://app.mediqzy.com/', { signal: AbortSignal.timeout(8000) });
    const html = await res.text();
    const match = html.match(/index-[A-Za-z0-9_-]+\.js/);
    const localBundle = existsSync(path.join(ROOT, 'client/dist/index.html'))
      ? read('client/dist/index.html').match(/index-[A-Za-z0-9_-]+\.js/)?.[0]
      : null;
    if (match) {
      const prodBundle = match[0];
      if (localBundle && prodBundle === localBundle) {
        pass(`prod frontend bundle matches local build: ${prodBundle}`);
      } else {
        warn(
          `prod frontend on ${prodBundle}${localBundle ? ` (local build: ${localBundle})` : ''} — deploy needed for Admin Copilot UI`
        );
      }
    }
  } catch (error) {
    warn('prod frontend check skipped', error.message);
  }

  console.log('\n--- Summary ---');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Warnings: ${warned}`);

  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
