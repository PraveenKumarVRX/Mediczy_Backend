/**
 * Module Copilot Service — maps hospital modules to AI agents + context
 */
import pool from '../db/pgPool.js';
import multiAgentOrchestrator from './ai-brain/multi-agent-orchestrator.js';

export const MODULE_COPILOTS = {
  admin:       { agent: 'admin',     label: 'Ops Copilot',        icon: '⚙️',  samd: false },
  billing:     { agent: 'insurance', label: 'Revenue Copilot',    icon: '💰',  samd: false },
  accounts:    { agent: 'insurance', label: 'Accounts Copilot',   icon: '📒',  samd: false },
  clinical:    { agent: 'clinical',  label: 'Clinical Copilot',   icon: '🩺',  samd: true },
  emr:         { agent: 'clinical',  label: 'Clinical Copilot',   icon: '🩺',  samd: true },
  adt:         { agent: 'worker',    label: 'Admit Copilot',      icon: '🛏️',  samd: false },
  nursing:     { agent: 'clinical',  label: 'Nurse Copilot',      icon: '💉',  samd: true },
  lab:         { agent: 'research',  label: 'Lab Copilot',        icon: '🔬',  samd: false },
  pharmacy:    { agent: 'research',  label: 'Pharma Copilot',     icon: '💊',  samd: false },
  insurance:   { agent: 'insurance', label: 'Claims Copilot',     icon: '🏥',  samd: false },
  ot:          { agent: 'clinical',  label: 'Theatre Copilot',    icon: '🏥',  samd: true },
  icu:         { agent: 'emergency', label: 'Critical Care Copilot', icon: '🚨', samd: true },
  er:          { agent: 'emergency', label: 'ER Copilot',         icon: '🚑',  samd: true },
  mrd:         { agent: 'analyst',   label: 'Records Copilot',    icon: '📁',  samd: false },
  quality:     { agent: 'analyst',   label: 'Compliance Copilot', icon: '✅',  samd: false },
  hr:          { agent: 'analyst',   label: 'People Copilot',     icon: '👥',  samd: false },
  scm:         { agent: 'worker',    label: 'Supply Copilot',     icon: '📦',  samd: false },
  security:    { agent: 'admin',     label: 'Security Copilot',   icon: '🔒',  samd: false },
  ambulance:   { agent: 'emergency', label: 'Dispatch Copilot',   icon: '🚑',  samd: false },
  dietary:     { agent: 'research',  label: 'Nutrition Copilot',  icon: '🥗',  samd: false },
  biomedical:  { agent: 'research',  label: 'Biomed Copilot',     icon: '🔧',  samd: false },
  consent:     { agent: 'research',  label: 'Consent Copilot',    icon: '📋',  samd: false },
  bloodbank:   { agent: 'clinical',  label: 'Blood Bank Copilot', icon: '🩸',  samd: false },
  cssd:        { agent: 'worker',    label: 'CSSD Copilot',       icon: '♨️',  samd: false },
  cfo:         { agent: 'analyst',   label: 'CFO Copilot',        icon: '📊',  samd: false },
  patient:     { agent: 'clinical',  label: 'Dr. iSHA',           icon: '💚',  samd: false },
  hospital:    { agent: 'clinical',  label: 'Hospital Copilot',   icon: '🏥',  samd: true },
};

const MODULE_PROMPTS = {
  billing: 'You are the Revenue Copilot for hospital billing. Help with invoices, payments, ERA, AR aging. Use billing tools. Never auto-post payments without user confirmation.',
  accounts: 'You are the Accounts Copilot. Help with collections, GL exports, pending invoices, and cashier reconciliation.',
  adt: 'You are the Admit Copilot. Help with bed assignment, admission checklist, discharge clearance. Use ADT and clearance tools.',
  lab: 'You are the Lab Copilot. Help with pending orders, critical values, TAT. Read-only unless user confirms write.',
  pharmacy: 'You are the Pharma Copilot. Help with drug interactions, stock levels, and generic alternatives.',
  clinical: 'You are the Clinical Copilot. Support documentation, differential, coding suggestions. All clinical decisions require physician review.',
  emr: 'You are the Clinical Copilot for EMR. Summarize admissions, suggest plans, and help with ICD/CPT coding from notes.',
  nursing: 'You are the Nurse Copilot. Prioritize eMAR, vitals trends, and deterioration alerts. Escalate critical findings.',
  insurance: 'You are the Claims Copilot. Help with pre-auth, denials, ERA reconciliation, appeal letters. Use denial summary tools.',
  quality: 'You are the Compliance Copilot. Reference NABH/JCI standards. Use quality KPI tools.',
  icu: 'You are the Critical Care Copilot. Prioritize patient safety. Use early warning alert tools. Escalate critical NEWS2 scores.',
  er: 'You are the ER Copilot. Help with triage queue, ESI guidance, and red-flag symptoms. Prioritize patient safety.',
  mrd: 'You are the Records Copilot. Help with ICD coding, ROI requests, and record completeness.',
  hr: 'You are the People Copilot. Help with credential expiry, shift gaps, leave balances, and onboarding checklists.',
  scm: 'You are the Supply Copilot. Help with low stock, indent status, implant traceability, and procurement workflows.',
  security: 'You are the Security Copilot. Help with open incidents, visitor logs, and access violations. Never share PII in bulk.',
  ambulance: 'You are the Dispatch Copilot. Help with nearest unit assignment, ETA estimates, and pre-hospital triage.',
  dietary: 'You are the Nutrition Copilot. Help with renal/diabetic diet limits, allergy cross-checks, and kitchen forecasting.',
  biomedical: 'You are the Biomed Copilot. Help with PM schedules, breakdown triage, and calibration due dates.',
  consent: 'You are the Consent Copilot. Help draft procedure consents, simplify language, and flag missing signatures.',
  bloodbank: 'You are the Blood Bank Copilot. Help with stock by group, cross-match queue, and expiry alerts.',
  cssd: 'You are the CSSD Copilot. Help with sterilization cycles, instrument traceability, and OT set readiness.',
  cfo: 'You are the CFO Copilot. Help with cash position, AR vs targets, and claims settlement MTD.',
  admin: 'You are the Ops Copilot. Help with system status, audit logs, and governance items.',
  patient: 'You are Dr. iSHA, a patient-facing health assistant. Explain bills, visit prep, and medications in plain language.',
  hospital: 'You are the unified Hospital Copilot for all departments. Use Hospital OS tools for twins, approvals, handover, and command center insights. Human approval required for all orders and clinical documents.',
};

export function getModuleConfig(moduleId) {
  return MODULE_COPILOTS[moduleId] || MODULE_COPILOTS.clinical;
}

export function listModules() {
  return Object.entries(MODULE_COPILOTS).map(([id, cfg]) => ({ id, ...cfg }));
}

export async function chat({ moduleId, message, context = {}, conversationHistory = [], req }) {
  const cfg = getModuleConfig(moduleId);
  const hospitalId = req.hospitalId || req.user?.hospital_id || req.user?.tenant_id || req.user?.organization_id;
  const modulePrompt = MODULE_PROMPTS[moduleId] || `You are the ${cfg.label} for module "${moduleId}".`;
  const contextBlock = context && Object.keys(context).length
    ? `\n\nSCREEN CONTEXT:\n${JSON.stringify(context, null, 2)}`
    : '';

  const enrichedMessage = `[MODULE: ${moduleId}] [HOSPITAL: ${hospitalId || 'unknown'}]\n${modulePrompt}${contextBlock}\n\nUSER: ${message}`;

  const result = await multiAgentOrchestrator.process({
    message: enrichedMessage,
    req,
    contextMessages: conversationHistory,
    forceAgent: cfg.agent,
    metadata: { moduleId, hospitalId, copilot: true },
  });

  await logCopilotInteraction({
    hospitalId,
    userId: req.userId || req.user?.id,
    moduleId,
    agent: cfg.agent,
    message,
    response: result.response,
    latencyMs: result.latencyMs,
  }).catch(() => {});

  return {
    ...result,
    moduleId,
    copilotLabel: cfg.label,
    samd: cfg.samd,
  };
}

async function logCopilotInteraction({ hospitalId, userId, moduleId, agent, message, response, latencyMs }) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS module_copilot_log (
      id BIGSERIAL PRIMARY KEY,
      hospital_id INTEGER,
      user_id INTEGER,
      module_id VARCHAR(40) NOT NULL,
      agent_id VARCHAR(40),
      input_message TEXT,
      response TEXT,
      latency_ms INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  await pool.query(
    `INSERT INTO module_copilot_log (hospital_id, user_id, module_id, agent_id, input_message, response, latency_ms)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [hospitalId || null, userId || null, moduleId, agent, message, response?.slice(0, 8000), latencyMs || null]
  );
}

export default { chat, getModuleConfig, listModules, MODULE_COPILOTS };
