/**
 * HealthOS — Platform status across all phases
 */
import pool from '../../db/pgPool.js';
import { up as migratePhase1 } from '../../migrations/careos-phase1.migration.js';
import { up as migrateEcosystem } from '../../migrations/careos-ecosystem.migration.js';
import { up as migratePhases24 } from '../../migrations/healthos-phases-2-4.migration.js';

let ready = false;
async function ensureAll() {
  if (!ready) {
    await migratePhase1();
    await migrateEcosystem();
    await migratePhases24();
    ready = true;
  }
}

const STAGES = {
  1: {
    name: 'Land',
    goal: 'AI-native hospital platform + Care Workspace',
    modules: [
      { id: 'workspace', label: 'Living Patient Workspace', status: 'live' },
      { id: 'timeline', label: 'Clinical Timeline', status: 'live' },
      { id: 'care_team', label: 'Dynamic Care Teams', status: 'live' },
      { id: 'coordinator', label: 'AI Clinical Coordinator', status: 'live' },
      { id: 'pathway', label: 'Living Treatment Pathway', status: 'live' },
      { id: 'mdt', label: 'Instant Clinical Board', status: 'live' },
      { id: 'playback', label: 'Clinical Playback', status: 'live' },
      { id: 'video', label: 'One-touch Clinical Call', status: 'live' },
      { id: 'tasks', label: 'Task Management', status: 'live' },
      { id: 'family', label: 'Family Portal', status: 'live' },
      { id: 'memory', label: 'Hospital Memory', status: 'live' },
    ],
  },
  2: {
    name: 'Expand',
    goal: 'Connect labs, pharmacy, home care, wearables, passport',
    modules: [
      { id: 'labs', label: 'Lab Connector (FHIR → timeline)', status: 'live' },
      { id: 'pharmacy', label: 'Pharmacy Fulfillment', status: 'live' },
      { id: 'homecare', label: 'Care Home Visits', status: 'live' },
      { id: 'wearables', label: 'Wearables Monitoring', status: 'live' },
      { id: 'passport', label: 'Medical Passport', status: 'live' },
      { id: 'identity', label: 'Care Identity', status: 'live' },
      { id: 'graph', label: 'Care Graph', status: 'live' },
    ],
  },
  3: {
    name: 'Network',
    goal: 'Cross-organization and cross-border collaboration',
    modules: [
      { id: 'federation', label: 'Care Cloud Federation', status: 'live' },
      { id: 'referrals', label: 'Federated Referrals', status: 'live' },
      { id: 'documents', label: 'Document / Imaging Exchange', status: 'live' },
      { id: 'global_board', label: 'Global Clinical Board', status: 'live' },
      { id: 'translation', label: 'AI Clinical Translation', status: 'live' },
      { id: 'global_knowledge', label: 'Global Knowledge Network', status: 'live' },
      { id: 'network_signals', label: 'AI Hospital Network Signals', status: 'live' },
    ],
  },
  4: {
    name: 'Platform',
    goal: 'Open healthcare app ecosystem',
    modules: [
      { id: 'marketplace', label: 'Care Marketplace', status: 'live' },
      { id: 'developer', label: 'Developer APIs & Webhooks', status: 'live' },
      { id: 'research', label: 'Research & Trial Matching', status: 'live' },
      { id: 'population', label: 'Population Analytics', status: 'live' },
      { id: 'government', label: 'Care Government', status: 'live' },
      { id: 'emergency', label: 'Global Emergency Network', status: 'live' },
    ],
  },
};

export async function getPlatformStatus(organizationId) {
  await ensureAll();

  const counts = {};
  const tables = [
    'careos_clinical_events', 'healthos_lab_results', 'healthos_pharmacy_orders',
    'healthos_homecare_visits', 'healthos_wearable_readings', 'healthos_referrals',
    'healthos_marketplace_apps', 'healthos_network_signals',
  ];
  for (const t of tables) {
    try {
      const { rows } = await pool.query(`SELECT COUNT(*) AS cnt FROM ${t}`);
      counts[t] = Number(rows[0]?.cnt || 0);
    } catch {
      counts[t] = 0;
    }
  }

  const allModules = Object.values(STAGES).flatMap((s) => s.modules);
  const liveCount = allModules.filter((m) => m.status === 'live').length;

  return {
    brand: 'Mediqzy',
    product: 'HealthOS',
    brandLine: 'Mediqzy - HealthOS',
    implementation: 'complete',
    stages: STAGES,
    summary: {
      totalModules: allModules.length,
      liveModules: liveCount,
      currentStage: 4,
      tableCounts: counts,
    },
    organizationId,
    refreshedAt: new Date().toISOString(),
  };
}

export function getHealthOSCapabilities() {
  return {
    brand: 'Mediqzy',
    product: 'HealthOS',
    brandLine: 'Mediqzy - HealthOS',
    tagline: 'Mediqzy - HealthOS',
    implementation: 'all_phases',
    stages: [1, 2, 3, 4],
    pillars: [
      'care_workspace', 'care_ai', 'care_graph', 'care_identity', 'care_cloud',
      'care_video', 'care_monitoring', 'care_analytics', 'care_marketplace',
      'care_research', 'care_education', 'care_finance', 'care_command',
      'care_government', 'care_home',
    ],
  };
}

export default { getPlatformStatus, getHealthOSCapabilities };
