#!/usr/bin/env node
/**
 * Targeted sanity/smoke for healthcare chatbot gap fixes (PR #9).
 * Static + optional live API when BASE_URL is reachable.
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const BASE_URL = process.env.BASE_URL || 'http://localhost:8888';

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

function fileExists(relPath, label) {
  if (existsSync(path.join(ROOT, relPath))) {
    pass(label);
    return true;
  }
  fail(label, `missing ${relPath}`);
  return false;
}

async function checkSyntax(relPath) {
  const { execSync } = await import('child_process');
  try {
    execSync(`node --check "${path.join(ROOT, relPath)}"`, { stdio: 'pipe' });
    pass(`syntax OK: ${relPath}`);
  } catch (error) {
    fail(`syntax: ${relPath}`, error.message?.split('\n')[0]);
  }
}

async function liveProbe() {
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      pass(`live health: ${BASE_URL}/health → ${res.status}`);
      return true;
    }
    warn(`live health returned ${res.status}`);
  } catch {
    warn(`live API unreachable at ${BASE_URL} — skipping HTTP smoke`);
  }
  return false;
}

async function main() {
  console.log('\n=== Healthcare Chatbot Gaps — Sanity & Smoke ===\n');

  // P0 notification templates
  includesAll('server/services/notification.service.js', [
    'medication_reminder:',
    'followup_reminder:',
    'followup_reminder_doctor:',
    'prescription_expiring_soon:',
    'prescription_expired:',
    'low_medication_adherence:',
  ], 'P0 notification templates');

  // P1 adherence + preferences backend
  fileExists('server/services/notification-preferences.service.js', 'notification-preferences service');
  includesAll('server/routes/prescription.route.js', [
    "router.get('/patient/adherence-summary'",
    "router.post('/:id/adherence'",
    'medicationReminderService.trackAdherence',
  ], 'P1 adherence API routes');
  includesAll('server/routes/notification.route.js', [
    "router.get('/preferences'",
    "router.put('/preferences'",
    'getNotificationPreferences',
    'saveNotificationPreferences',
  ], 'P1 notification preferences API');

  // P2 triage + wearables
  fileExists('server/services/patient-wearable-context.service.js', 'patient wearable context service');
  includesAll('server/routes/medical-ai.route.js', [
    'emergencyTriageService.triage',
    'getWearableContextForUser',
    "router.post('/instant-triage-call'",
  ], 'P2 governed ESI triage + video escalation route');

  // P2/P3 frontend wiring
  includesAll('client/src/components/layout/MainLayout.tsx', [
    'SupportChatWidget',
    'FloatingDrISHA',
    'isPatientUser',
  ], 'P1 patient chat widgets in MainLayout');
  includesAll('client/src/components/DrISHAChat.tsx', [
    'instant-triage-call',
    'Emergency video',
  ], 'P2 DrISHA video escalation');
  includesAll('client/src/pages/Medicine.tsx', [
    '/prescriptions/patient',
    '/prescriptions/patient/adherence-summary',
    '/adherence',
  ], 'P1 Medicine page API wiring');
  includesAll('client/src/pages/Appointments.tsx', [
    '/notifications/preferences',
    'Appointment Reminders',
  ], 'P3 appointment reminder preferences UI');
  includesAll('client/src/routes/index.tsx', [
    '/patient/device-integration',
    'DeviceIntegration',
  ], 'P3 device-integration route');

  // Follow-up fix
  includesAll('server/services/followup-automation.service.js', [
    'createFollowUpSuggestion',
    "actionUrl: '/appointments'",
  ], 'follow-up automation fixes');

  // Syntax checks on changed server files
  const syntaxFiles = [
    'server/services/notification.service.js',
    'server/services/notification-preferences.service.js',
    'server/services/patient-wearable-context.service.js',
    'server/services/followup-automation.service.js',
    'server/routes/prescription.route.js',
    'server/routes/notification.route.js',
    'server/routes/medical-ai.route.js',
  ];
  for (const file of syntaxFiles) {
    await checkSyntax(file);
  }

  const live = await liveProbe();
  if (live) {
    const routes = [
      '/api/notifications/preferences',
      '/api/prescriptions/patient/adherence-summary',
    ];
    for (const route of routes) {
      const res = await fetch(`${BASE_URL}${route}`);
      if ([401, 403].includes(res.status)) {
        pass(`live route protected: ${route} → ${res.status}`);
      } else if (res.ok) {
        pass(`live route: ${route} → ${res.status}`);
      } else {
        warn(`live route: ${route} → ${res.status}`);
      }
    }
  }

  includesAll('client/src/routes/index.tsx', [
    '/admin/copilot',
    'AdminCopilot',
    '/team/copilot',
  ], 'Admin Copilot routes');

  includesAll('client/src/services/adminCopilot.ts', [
    '/v3/ai-brain/agents/process',
    'approve-action',
    'processMessageStream',
  ], 'Admin Copilot API client');

  includesAll('server/services/ai-brain/tools/system-tools.js', [
    "name: 'list_agents'",
    "name: 'get_audit_logs'",
    "name: 'reload_prompts'",
  ], 'Phase 2 system tools');

  // Production frontend bundle check (informational)
  try {
    const res = await fetch('https://app.mediqzy.com/', { signal: AbortSignal.timeout(8000) });
    const html = await res.text();
    const match = html.match(/index-[A-Za-z0-9_-]+\.js/);
    if (match) {
      if (match[0].includes('BV8joC6A')) {
        pass(`prod frontend bundle deployed: ${match[0]}`);
      } else {
        warn(`prod frontend still on older bundle: ${match[0]} (expected index-BV8joC6A.js after deploy)`);
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
