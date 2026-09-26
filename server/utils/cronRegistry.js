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
  { key: 'device_heartbeat',      name: 'Device Heartbeat Check',               schedule: 'Every 5 min',      category: 'device',     scheduleDesc: '*/5 * * * *' },
  { key: 'device_amc',            name: 'Device AMC/Subscription Check',         schedule: 'Every hour',       category: 'device',     scheduleDesc: '0 * * * *' },
  { key: 'device_maintenance',    name: 'Device Maintenance Schedule',           schedule: 'Daily 9 AM',       category: 'device',     scheduleDesc: '0 9 * * *' },
  { key: 'device_health_report',  name: 'Device Daily Health Report',            schedule: 'Daily 8 AM',       category: 'device',     scheduleDesc: '0 8 * * *' },
  // Appointments
  { key: 'appt_autocancel',       name: 'Appointment Auto-Cancel',               schedule: 'Daily midnight',   category: 'appointment', scheduleDesc: '0 0 * * *' },
  { key: 'appt_morning_cleanup',  name: 'Appointment Morning Cleanup',           schedule: 'Daily 6 AM',       category: 'appointment', scheduleDesc: '0 6 * * *' },
  { key: 'appt_reminder',         name: 'Appointment Reminders (24h/2h/15min)',  schedule: 'Every 30 min',     category: 'appointment', scheduleDesc: '*/30 * * * *' },
  { key: 'appt_notification',     name: 'Upcoming Appointment Notifications',    schedule: 'Every 1 min',      category: 'appointment', scheduleDesc: '* * * * *' },
  { key: 'followup_automation',   name: 'Follow-Up Appointment Automation',      schedule: 'Daily 10 AM',      category: 'appointment', scheduleDesc: '0 10 * * *' },
  // Webinars
  { key: 'webinar_reminder',      name: 'Webinar Reminders',                     schedule: 'Every 30 min',     category: 'webinar',    scheduleDesc: '*/30 * * * *' },
  // Membership
  { key: 'membership_sync',       name: 'Membership Sync & Deactivation',        schedule: 'Daily 2 AM',       category: 'membership', scheduleDesc: '0 2 * * *' },
  { key: 'membership_alerts',     name: 'Membership Expiry Alerts',              schedule: 'Daily 9 AM',       category: 'membership', scheduleDesc: '0 9 * * *' },
  // Billing
  { key: 'payment_reminders',     name: 'Payment Reminders',                     schedule: 'Daily 9 AM',       category: 'billing',    scheduleDesc: '0 9 * * *' },
  { key: 'tenant_billing',        name: 'Tenant Billing (Auto-Invoices)',         schedule: '1st of month',     category: 'billing',    scheduleDesc: '0 0 1 * *' },
  // Clinical
  { key: 'medication_morning',    name: 'Medication Reminder — Morning',         schedule: 'Daily 8 AM',       category: 'clinical',   scheduleDesc: '0 8 * * *' },
  { key: 'medication_afternoon',  name: 'Medication Reminder — Afternoon',       schedule: 'Daily 2 PM',       category: 'clinical',   scheduleDesc: '0 14 * * *' },
  { key: 'medication_evening',    name: 'Medication Reminder — Evening',         schedule: 'Daily 8 PM',       category: 'clinical',   scheduleDesc: '0 20 * * *' },
  { key: 'prescription_expiry',   name: 'Prescription Expiry Alerts',            schedule: 'Daily 9:30 AM',    category: 'clinical',   scheduleDesc: '30 9 * * *' },
  // WhatsApp Automation
  { key: 'whatsapp_report',       name: 'WhatsApp Health Report Dispatch',       schedule: 'On email receipt', category: 'whatsapp',   scheduleDesc: 'event-driven' },
  { key: 'whatsapp_appt_remind',  name: 'WhatsApp Appointment Reminders',        schedule: 'Every 30 min',     category: 'whatsapp',   scheduleDesc: '*/30 * * * *' },
  { key: 'whatsapp_med_remind',   name: 'WhatsApp Medication Reminders',         schedule: 'Daily 3×',         category: 'whatsapp',   scheduleDesc: '0 8,14,20 * * *' },
  // Analytics
  { key: 'doctor_performance',    name: 'Doctor Performance Reports',            schedule: 'Weekly Mon 9 AM',  category: 'analytics',  scheduleDesc: '0 9 * * 1' },
  // SaaS
  { key: 'auto_suspension',       name: 'Auto-Suspension (Unpaid Tenants)',      schedule: 'Daily 6 AM',       category: 'saas',       scheduleDesc: '0 6 * * *' },
  { key: 'tenant_billing_cron',   name: 'Tenant Monthly Invoicing',              schedule: '1st of month',     category: 'saas',       scheduleDesc: '0 0 1 * *' },
  { key: 'system_health',         name: 'System Health Monitor',                 schedule: 'Every 1 min',      category: 'system',     scheduleDesc: '* * * * *' },
  { key: 'email_sync',            name: 'Email Inbox Sync (IMAP)',               schedule: 'Every 5 min',      category: 'system',     scheduleDesc: '*/5 * * * *' },
  // AI
  { key: 'feedback_aggregator',   name: 'Feedback Aggregator (3 silos → unified)', schedule: 'Every 15 min',   category: 'ai',         scheduleDesc: '*/15 * * * *' },
  { key: 'sla_breach_checker',   name: 'SLA Breach Checker (ticket_sla)',         schedule: 'Every 5 min',    category: 'ai',         scheduleDesc: '*/5 * * * *'  },
  { key: 'feedback_router',     name: 'Feedback Router (quality → governance)',   schedule: 'Every 30 min',   category: 'ai',         scheduleDesc: '20 */1 * * *' },
  { key: 'closed_loop_notifier',name: 'Closed-Loop Notifier (post-resolution)',   schedule: 'Every 30 min',   category: 'ai',         scheduleDesc: '45 */1 * * *' },
  { key: 'prompt_optimizer',   name: 'Prompt Optimization Executor (shadow/canary)', schedule: 'Daily 02:00 IST', category: 'ai',        scheduleDesc: '30 20 * * *'  },
  { key: 'feedback_digest',   name: 'Feedback Weekly Digest Email',                schedule: 'Mon 08:00 IST',  category: 'ai',        scheduleDesc: '30 2 * * 1'   },
  { key: 'ai_health_risk',        name: 'AI Health Risk Score',                  schedule: 'Every 6 hours',    category: 'ai',         scheduleDesc: '0 */6 * * *' },
  { key: 'ai_smart_notif',        name: 'AI Smart Notifications',                schedule: 'Every 2 hours',    category: 'ai',         scheduleDesc: '15 */2 * * *' },
  { key: 'ai_clinical_insights',  name: 'AI Clinical Insights',                  schedule: 'Every 8 hours',    category: 'ai',         scheduleDesc: '0 */8 * * *' },
  { key: 'ai_self_learning',      name: 'AI Self-Learning Pipeline',             schedule: 'Every 4 hours',    category: 'ai',         scheduleDesc: '30 */4 * * *' },
  { key: 'ai_proactive_alerts',   name: 'AI Proactive Patient Alerts',           schedule: 'Every 4 hours',    category: 'ai',         scheduleDesc: '0 */4 * * *' },
  { key: 'ai_drift_monitor',      name: 'AI Model Drift Monitor (PSI)',          schedule: 'Weekly Sun 1 AM',  category: 'ai',         scheduleDesc: '0 1 * * 0' },
  { key: 'ai_demographic_parity', name: 'AI Demographic Parity Audit',           schedule: 'Weekly Mon 1 AM',  category: 'ai',         scheduleDesc: '0 1 * * 1' },
  // Lab
  { key: 'lab_critical_escalation', name: 'Lab Critical Alert Escalation',       schedule: 'Every 15 min',     category: 'clinical',   scheduleDesc: '*/15 * * * *' },
  // Compliance
  { key: 'data_retention_daily',  name: 'Data Retention — Daily',                schedule: 'Daily 2 AM',       category: 'compliance', scheduleDesc: '0 2 * * *' },
  { key: 'qms_phi_purge',         name: 'QMS Metadata PHI Purge (Aadhaar/address)', schedule: 'Daily 2 AM',    category: 'compliance', scheduleDesc: '0 2 * * *' },
  { key: 'data_retention_weekly', name: 'Data Retention — Weekly',               schedule: 'Weekly Sun 3 AM',  category: 'compliance', scheduleDesc: '0 3 * * 0' },
  { key: 'data_retention_monthly',name: 'Data Retention — Monthly',              schedule: '1st of month 4 AM',category: 'compliance', scheduleDesc: '0 4 1 * *' },
  // Pharmacy
  { key: 'drug_price_sync',       name: 'Drug Price Sync (NPPA/Jan Aushadhi)',   schedule: 'Daily 2:30 AM',    category: 'pharmacy',   scheduleDesc: '30 2 * * *' },
  // SCM
  { key: 'scm_par_reorder',       name: 'SCM PAR Auto-Reorder Scan',            schedule: 'Every 6 hours',    category: 'scm',        scheduleDesc: '45 */6 * * *' },
  // Parking
  { key: 'parking_overstay',       name: 'Parking Overstay Scan',                schedule: 'Every 10 min',     category: 'parking',    scheduleDesc: '*/10 * * * *' },
  { key: 'surveillance_purge',     name: 'Surveillance Frame-Log Purge',         schedule: 'Daily 3:20 AM',    category: 'security',   scheduleDesc: '20 3 * * *' },
  // Security
  { key: 'token_purge',           name: 'Expired Refresh Token Purge',           schedule: 'Daily 3:30 AM',    category: 'security',   scheduleDesc: '30 3 * * *' },
  // Infrastructure
  { key: 'audit_log_partition',   name: 'Audit Log Monthly Partition Creation',  schedule: '25th of month',    category: 'system',     scheduleDesc: '0 1 25 * *' },
  { key: 'audit_chain_verify',    name: 'Audit Chain Integrity Verification',    schedule: 'Daily 3 AM',       category: 'security',   scheduleDesc: '0 3 * * *' },
  { key: 'ai_his_score',          name: 'AI HIS Health Score Aggregation',       schedule: 'Every 6 hours',    category: 'ai',         scheduleDesc: '30 */6 * * *' },
  // Corporate QC
  { key: 'corp_employee_qc',      name: 'Corporate Employee QC Sweep',           schedule: 'Daily 3 AM IST',   category: 'corporate',  scheduleDesc: '0 3 * * *' },
  // Imaging storage
  { key: 'imaging_daily_minio_transfer', name: 'Imaging Daily S3 → MinIO/Wasabi Transfer', schedule: 'Daily 2:30 AM', category: 'imaging', scheduleDesc: '30 2 * * *' },
  { key: 'pacs_minio_archive', name: 'PACS S3 → On-Prem MinIO Archive', schedule: 'Daily midnight', category: 'imaging', scheduleDesc: '0 0 * * *' },
  // CRM Growth Engine
  { key: 'crm_segment_refresh',   name: 'CRM Segment Membership Refresh',        schedule: 'Every 15 min',     category: 'crm',        scheduleDesc: '*/15 * * * *' },
  { key: 'crm_automation_tick',   name: 'CRM Automation Trigger Sweep',          schedule: 'Every 5 min',      category: 'crm',        scheduleDesc: '*/5 * * * *' },
];

// Key lookup map
const TASK_KEYS = new Set(TASK_DEFINITIONS.map(t => t.key));

// ── In-memory state ───────────────────────────────────────────────────────────
const registry = new Map();

// Track currently-running tasks: key → { startedAt: ISO string }
const running = new Map();

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
 * Mark a task as currently executing (call at start of cron function)
 */
// A "running" flag older than this is treated as stale (a job that exited without calling tick/tickError), so a
// guard that actually blocks re-entry can never silently stop a job for good. Override: CRON_STALE_MINUTES.
const STALE_MS = (Number(process.env.CRON_STALE_MINUTES) || 30) * 60_000;

export function tickStart(key) {
  const existing = running.get(key);
  if (existing) {
    const age = Date.now() - Date.parse(existing.startedAt);
    if (Number.isFinite(age) && age < STALE_MS) return false;
    console.warn(`[cron] ${key}: previous run flag is ${Math.round(age / 60000)} min old — treating it as stale and starting`);
  }
  running.set(key, { startedAt: new Date().toISOString(), pid: process.pid });
  return true;
}

// ── Cross-process lease (audit OPS-01) ──────────────────────────────────────────────────────────
// Two PM2 processes (API server + worker) can both schedule the same job. The single-flight flag above is per
// process, so a DB lease decides which process runs a given tick. FAILS OPEN: if the lease store is unreachable the
// job still runs (as it did before the lease existed) — a lease problem must never stop a scheduled job.
const leases = new Map(); // key -> { owner, timer }
const LEASE_HEARTBEAT_MS = 30_000;

async function leaseModule() {
  return import('../services/cron-lease.service.js');
}

function releaseLease(key) {
  const held = leases.get(key);
  if (!held) return;
  clearInterval(held.timer);
  leases.delete(key);
  leaseModule().then((m) => m.releaseCronLease(key, held.owner)).catch(() => {});
}

/**
 * Start a job if — and only if — no other run holds it, in this process or any other.
 * Returns true when the caller should run; false when it must skip. The lease is released automatically by
 * tick() / tickError() / tickEnd().
 */
export async function beginJob(key, { ttlSeconds } = {}) {
  if (!tickStart(key)) {
    console.warn(`[cron] skipping ${key}: already running in this process`);
    return false;
  }
  try {
    const m = await leaseModule();
    // tickStart succeeded, so no live run exists in this process: any lease entry left over is a stale predecessor
    // (a run that ended without tick/tickError). Clear it BEFORE acquiring so this process cannot block itself.
    const stale = leases.get(key);
    if (stale) { clearInterval(stale.timer); leases.delete(key); await m.releaseCronLease(key, stale.owner).catch(() => {}); }
    const lease = await m.acquireCronLease(key, { ttlSeconds });
    if (!lease.acquired) {
      running.delete(key);
      console.warn(`[cron] skipping ${key}: another process holds the lease`);
      return false;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
      // A run that never called tick()/tickError() must not hold the lease forever: stop extending it after the stale
      // window so it expires on its own (and the flag is likewise treated as stale by tickStart).
      if (Date.now() - startedAt > STALE_MS) { console.warn(`[cron] ${key}: no completion after ${STALE_MS / 60000} min — releasing its lease`); releaseLease(key); return; }
      m.heartbeatCronLease(key, lease.owner_id, { ttlSeconds }).catch(() => {});
    }, LEASE_HEARTBEAT_MS);
    timer.unref?.();
    leases.set(key, { owner: lease.owner_id, timer });
  } catch (e) {
    console.warn(`[cron] lease unavailable for ${key} (${e.message}) — running without the cross-process guard`);
  }
  return true;
}

/**
 * Clear the running state (called automatically by tick/tickError)
 */
export function tickEnd(key) {
  running.delete(key);
  releaseLease(key);
}

/**
 * Record a successful cron execution
 * @param {string} key - task key from TASK_DEFINITIONS
 * @param {object} details - optional metadata { processed, sent, skipped, ... }
 */
export function tick(key, details = {}) {
  if (!TASK_KEYS.has(key)) {
    console.warn(`⚠️  cronRegistry.tick: unknown key "${key}"`);
  }
  running.delete(key); // clear running state
  releaseLease(key);
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
  running.delete(key); // clear running state
  releaseLease(key);
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
  const inProcess = running.has(key);
  if (!(await beginJob(key))) return { skipped: true, reason: inProcess ? 'already_running' : 'lease_held' };
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
    const runState = running.get(def.key) || null;
    return {
      ...def,
      lastRun: state.lastRun || null,
      lastStatus: state.lastStatus || 'never',
      runCount: state.runCount || 0,
      errorCount: state.errorCount || 0,
      lastError: state.lastError || null,
      lastDetails: state.lastDetails || {},
      recentLogs: state.recentLogs || [],
      isRunning: !!runState,
      runningStartedAt: runState ? runState.startedAt : null,
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

export default { tick, tickStart, tickEnd, tickError, withCron, getStatus, getTaskLogs };
