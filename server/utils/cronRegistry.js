/**
 * Cron Job Registry
 * Tracks live execution state of all automation tasks.
 * Persisted to disk every 60s so state survives restarts.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_FILE = path.join(__dirname, '../../cron-registry.json');
const MAX_RECENT = 30; // keep last 30 executions per task

// ── Task definitions ─────────────────────────────────────────────────────────
export const TASK_DEFINITIONS = [
  // Device
  { key: 'device_heartbeat',    name: 'Device Heartbeat Check',          schedule: 'Every 5 min',   category: 'device',     scheduleDesc: '*/5 * * * *' },
  { key: 'device_amc',          name: 'Device AMC/Subscription Check',   schedule: 'Every hour',    category: 'device',     scheduleDesc: '0 * * * *' },
  { key: 'device_maintenance',  name: 'Device Maintenance Schedule',     schedule: 'Daily 9 AM',    category: 'device',     scheduleDesc: '0 9 * * *' },
  { key: 'device_health_report',name: 'Device Daily Health Report',      schedule: 'Daily 8 AM',    category: 'device',     scheduleDesc: '0 8 * * *' },
  // Appointments
  { key: 'appt_autocancel',     name: 'Appointment Auto-Cancel',         schedule: 'Daily midnight', category: 'appointment', scheduleDesc: '0 0 * * *' },
  { key: 'appt_morning_cleanup',name: 'Appointment Morning Cleanup',     schedule: 'Daily 6 AM',    category: 'appointment', scheduleDesc: '0 6 * * *' },
  { key: 'appt_reminder',       name: 'Appointment Reminders (24h/2h/15min)', schedule: 'Every 30 min', category: 'appointment', scheduleDesc: '*/30 * * * *' },
  { key: 'followup_automation', name: 'Follow-Up Appointment Automation',schedule: 'Daily 10 AM',   category: 'appointment', scheduleDesc: '0 10 * * *' },
  // Webinars
  { key: 'webinar_reminder',    name: 'Webinar Reminders',               schedule: 'Every 30 min',  category: 'webinar',    scheduleDesc: '*/30 * * * *' },
  // Membership
  { key: 'membership_sync',     name: 'Membership Sync & Deactivation',  schedule: 'Daily 2 AM',    category: 'membership', scheduleDesc: '0 2 * * *' },
  { key: 'membership_alerts',   name: 'Membership Expiry Alerts',        schedule: 'Daily 9 AM',    category: 'membership', scheduleDesc: '0 9 * * *' },
  // Billing
  { key: 'payment_reminders',   name: 'Payment Reminders',               schedule: 'Daily 9 AM',    category: 'billing',    scheduleDesc: '0 9 * * *' },
  { key: 'tenant_billing',      name: 'Tenant Billing (Auto-Invoices)',   schedule: '1st of month',  category: 'billing',    scheduleDesc: '0 0 1 * *' },
  // Clinical
  { key: 'medication_morning',  name: 'Medication Reminder — Morning',   schedule: 'Daily 8 AM',    category: 'clinical',   scheduleDesc: '0 8 * * *' },
  { key: 'medication_afternoon',name: 'Medication Reminder — Afternoon', schedule: 'Daily 2 PM',    category: 'clinical',   scheduleDesc: '0 14 * * *' },
  { key: 'medication_evening',  name: 'Medication Reminder — Evening',   schedule: 'Daily 8 PM',    category: 'clinical',   scheduleDesc: '0 20 * * *' },
  { key: 'prescription_expiry', name: 'Prescription Expiry Alerts',      schedule: 'Daily 9:30 AM', category: 'clinical',   scheduleDesc: '30 9 * * *' },
  // Analytics
  { key: 'doctor_performance',  name: 'Doctor Performance Reports',      schedule: 'Weekly Mon 9 AM', category: 'analytics', scheduleDesc: '0 9 * * 1' },
  // SaaS
  { key: 'auto_suspension',     name: 'Auto-Suspension (Unpaid Tenants)',schedule: 'Every 30 min',  category: 'saas',       scheduleDesc: '*/30 * * * *' },
  { key: 'system_health',       name: 'System Health Monitor',           schedule: 'Every 1 min',   category: 'system',     scheduleDesc: '* * * * *' },
  // AI
  { key: 'ai_health_risk',      name: 'AI Health Risk Score',            schedule: 'Every 6 hours', category: 'ai',         scheduleDesc: '0 */6 * * *' },
  { key: 'ai_smart_notif',      name: 'AI Smart Notifications',          schedule: 'Every 2 hours', category: 'ai',         scheduleDesc: '15 */2 * * *' },
  { key: 'ai_clinical_insights',name: 'AI Clinical Insights',            schedule: 'Every 8 hours', category: 'ai',         scheduleDesc: '0 */8 * * *' },
  { key: 'ai_self_learning',    name: 'AI Self-Learning Pipeline',       schedule: 'Every 4 hours', category: 'ai',         scheduleDesc: '30 */4 * * *' },
  // Compliance
  { key: 'data_retention_daily',name: 'Data Retention — Daily',          schedule: 'Daily 2 AM',    category: 'compliance', scheduleDesc: '0 2 * * *' },
  { key: 'data_retention_weekly',name: 'Data Retention — Weekly',        schedule: 'Weekly Sun 3 AM', category: 'compliance', scheduleDesc: '0 3 * * 0' },
  { key: 'data_retention_monthly',name: 'Data Retention — Monthly',      schedule: '1st of month 4 AM', category: 'compliance', scheduleDesc: '0 4 1 * *' },
];

// Key lookup map
const TASK_KEYS = new Set(TASK_DEFINITIONS.map(t => t.key));

// ── In-memory state ───────────────────────────────────────────────────────────
const registry = new Map();

// ── Persistence ───────────────────────────────────────────────────────────────
function loadFromDisk() {
  try {
    if (existsSync(REGISTRY_FILE)) {
      const data = JSON.parse(readFileSync(REGISTRY_FILE, 'utf8'));
      Object.entries(data).forEach(([key, val]) => registry.set(key, val));
      console.log(`📂 Cron registry loaded from disk (${Object.keys(data).length} tasks)`);
    }
  } catch (e) {
    console.warn('⚠️  Could not load cron registry from disk:', e.message);
  }
}

function saveToDisk() {
  try {
    const obj = {};
    registry.forEach((val, key) => { obj[key] = val; });
    writeFileSync(REGISTRY_FILE, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.warn('⚠️  Could not save cron registry to disk:', e.message);
  }
}

loadFromDisk();
setInterval(saveToDisk, 60_000).unref(); // persist every minute, don't block shutdown

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Record a successful cron execution
 * @param {string} key - task key from TASK_DEFINITIONS
 * @param {object} details - optional metadata { processed, sent, skipped, ... }
 */
export function tick(key, details = {}) {
  if (!TASK_KEYS.has(key)) {
    console.warn(`⚠️  cronRegistry.tick: unknown key "${key}"`);
  }
  const existing = registry.get(key) || { runCount: 0, errorCount: 0, recentLogs: [] };
  const entry = {
    lastRun: new Date().toISOString(),
    lastStatus: 'success',
    runCount: (existing.runCount || 0) + 1,
    errorCount: existing.errorCount || 0,
    lastError: null,
    lastDetails: details,
    recentLogs: [
      ...(existing.recentLogs || []).slice(-(MAX_RECENT - 1)),
      { ts: new Date().toISOString(), status: 'success', details },
    ],
  };
  registry.set(key, entry);
}

/**
 * Record a failed cron execution
 * @param {string} key - task key
 * @param {string} errorMessage - error description
 * @param {object} details - optional metadata
 */
export function tickError(key, errorMessage, details = {}) {
  if (!TASK_KEYS.has(key)) {
    console.warn(`⚠️  cronRegistry.tickError: unknown key "${key}"`);
  }
  const existing = registry.get(key) || { runCount: 0, errorCount: 0, recentLogs: [] };
  const entry = {
    lastRun: new Date().toISOString(),
    lastStatus: 'error',
    runCount: (existing.runCount || 0) + 1,
    errorCount: (existing.errorCount || 0) + 1,
    lastError: errorMessage,
    lastDetails: details,
    recentLogs: [
      ...(existing.recentLogs || []).slice(-(MAX_RECENT - 1)),
      { ts: new Date().toISOString(), status: 'error', errorMessage, details },
    ],
  };
  registry.set(key, entry);
}

/**
 * Wrap an async cron function with automatic tick/tickError
 * @param {string} key - task key
 * @param {function} fn - async cron function, should return details object
 */
export async function withCron(key, fn) {
  try {
    const details = await fn();
    tick(key, details || {});
  } catch (err) {
    tickError(key, err.message);
    throw err;
  }
}

/**
 * Get the full status of all registered tasks (for the API)
 */
export function getStatus() {
  return TASK_DEFINITIONS.map(def => {
    const state = registry.get(def.key) || {};
    return {
      ...def,
      lastRun: state.lastRun || null,
      lastStatus: state.lastStatus || 'never',
      runCount: state.runCount || 0,
      errorCount: state.errorCount || 0,
      lastError: state.lastError || null,
      lastDetails: state.lastDetails || {},
      recentLogs: state.recentLogs || [],
    };
  });
}

/**
 * Get recent logs for a single task key
 */
export function getTaskLogs(key) {
  const state = registry.get(key) || {};
  return state.recentLogs || [];
}

export default { tick, tickError, withCron, getStatus, getTaskLogs };
