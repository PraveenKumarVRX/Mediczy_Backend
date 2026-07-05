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

async function tableExists(name) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [name]
  );
  return rows.length > 0;
}

async function moduleStatus(tableName) {
  const exists = await tableExists(tableName);
  return exists ? 'live' : 'api';
}

const STAGE_DEFS = {
  1: {
    name: 'Land',
    goal: 'AI-native hospital platform + Care Workspace',
    modules: [
      { id: 'workspace', label: 'Living Patient Workspace', table: 'careos_clinical_events' },
      { id: 'timeline', label: 'Clinical Timeline', table: 'careos_clinical_events' },
      { id: 'care_team', label: 'Dynamic Care Teams', table: 'careos_team_members' },
      { id: 'coordinator', label: 'AI Clinical Coordinator', table: 'careos_coordinator_alerts' },
      { id: 'pathway', label: 'Living Treatment Pathway', table: 'careos_treatment_pathways' },
      { id: 'mdt', label: 'Instant Clinical Board', table: 'careos_mdt_sessions' },
      { id: 'playback', label: 'Clinical Playback', table: 'careos_clinical_events' },
      { id: 'video', label: 'One-touch Clinical Call', table: 'careos_mdt_sessions' },
      { id: 'tasks', label: 'Task Management', table: 'careos_tasks' },
      { id: 'family', label: 'Family Portal', table: 'careos_family_updates' },
      { id: 'memory', label: 'Hospital Memory', table: 'careos_hospital_cases' },
    ],
  },
  2: {
    name: 'Expand',
    goal: 'Connect labs, pharmacy, home care, wearables, passport',
    modules: [
      { id: 'labs', label: 'Lab Connector (FHIR → timeline)', table: 'healthos_lab_results' },
      { id: 'pharmacy', label: 'Pharmacy Fulfillment', table: 'healthos_pharmacy_orders' },
      { id: 'homecare', label: 'Care Home Visits', table: 'healthos_homecare_visits' },
      { id: 'wearables', label: 'Wearables Monitoring', table: 'healthos_wearable_readings' },
      { id: 'imaging', label: 'DICOMweb Imaging (HyperGrid)', table: 'hg_dicom_studies' },
      { id: 'passport', label: 'Medical Passport', table: 'careos_patient_passports' },
      { id: 'identity', label: 'Care Identity', table: 'careos_professional_identity' },
      { id: 'graph', label: 'Care Graph', table: 'careos_graph_nodes' },
    ],
  },
  3: {
    name: 'Network',
    goal: 'Cross-organization and cross-border collaboration',
    modules: [
      { id: 'federation', label: 'Care Cloud Federation', table: 'careos_network_orgs' },
      { id: 'federation_gateway', label: 'Multi-tenant Federation Gateway', table: 'careos_federation_trust' },
      { id: 'referrals', label: 'Federated Referrals', table: 'healthos_referrals' },
      { id: 'documents', label: 'Document / Imaging Exchange', table: 'healthos_document_exchanges' },
      { id: 'global_board', label: 'Global Clinical Board', table: 'careos_global_sessions' },
      { id: 'translation', label: 'AI Clinical Translation', table: 'careos_global_sessions' },
      { id: 'global_knowledge', label: 'Global Knowledge Network', table: 'healthos_global_cases' },
      { id: 'network_signals', label: 'AI Hospital Network Signals', table: 'healthos_network_signals' },
    ],
  },
  4: {
    name: 'Platform',
    goal: 'Open healthcare app ecosystem',
    modules: [
      { id: 'marketplace', label: 'Care Marketplace', table: 'healthos_marketplace_apps' },
      { id: 'developer', label: 'Developer APIs & Webhooks', table: 'healthos_api_keys' },
      { id: 'research', label: 'Research & Trial Matching', table: 'healthos_clinical_trials' },
      { id: 'population', label: 'Population Analytics', table: 'healthos_population_metrics' },
      { id: 'government', label: 'Care Government', table: 'healthos_government_reports' },
      { id: 'emergency', label: 'Global Emergency Network', table: 'healthos_emergency_resources' },
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

  const stages = {};
  for (const [n, def] of Object.entries(STAGE_DEFS)) {
    const modules = [];
    for (const m of def.modules) {
      const status = await moduleStatus(m.table);
      modules.push({ id: m.id, label: m.label, status });
    }
    stages[n] = { name: def.name, goal: def.goal, modules };
  }

  const allModules = Object.values(stages).flatMap((s) => s.modules);
  const liveCount = allModules.filter((m) => m.status === 'live').length;

  return {
    brand: 'Mediqzy',
    product: 'HealthOS',
    brandLine: 'Mediqzy - HealthOS',
    implementation: liveCount === allModules.length ? 'complete' : 'partial',
    stages,
    summary: {
      totalModules: allModules.length,
      liveModules: liveCount,
      currentStage: 4,
      tableCounts: counts,
      note: 'live = DB tables migrated; integrations may require external connectors',
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
      'care_research', 'care_command', 'care_government', 'care_home',
    ],
  };
}

export default { getPlatformStatus, getHealthOSCapabilities };
