/**
 * Agent Registry
 * ==============
 * Defines every specialized agent in the multi-agent system.
 *
 * Each agent is a stateless, sandboxed worker with:
 *   - A defined role + persona
 *   - An ALLOWLIST of tool names (Layer 2 sandboxing)
 *   - Required capability (who can invoke it)
 *   - LLM tier + token limits
 *   - Max agentic iterations
 *   - A system-prompt suffix that narrows the agent's scope
 *
 * Tool access enforced at 3 levels:
 *   1. Agent allowedTools list (this file)
 *   2. Identity capability check (agent-permission-engine.js)
 *   3. Tool isWrite/isSystem flags (tools/index.js)
 */

import { CAPS } from './agent-permission-engine.js';

// ─── Tool Allowlists ──────────────────────────────────────────────────────────
// Grouped by domain. Tool names must exactly match what's registered in tools/index.js

const T = {
  // Patient data
  PATIENT_READ:  ['get_patient_profile', 'get_vitals', 'get_medical_history',
                  'get_allergies', 'get_chronic_conditions', 'get_current_medications'],
  PATIENT_WRITE: ['update_patient_notes', 'add_clinical_note', 'update_vitals', 'update_medications'],

  // Appointments
  APPT:          ['book_appointment', 'reschedule_appointment', 'cancel_appointment',
                  'get_available_slots', 'get_appointments', 'send_appointment_reminder'],

  // Labs
  LAB_READ:      ['get_lab_results', 'get_test_history', 'get_radiology_reports'],
  LAB_WRITE:     ['order_lab_test'],

  // Wellness / chronic
  WELLNESS:      ['get_health_score', 'get_wellness_metrics', 'get_medication_schedule',
                  'get_diet_plan', 'get_exercise_plan'],

  // Memory
  MEMORY:        ['get_user_memory', 'update_user_memory'],

  // RAG / knowledge
  RAG:           ['search_knowledge_base', 'get_clinical_guideline',
                  'search_drug_info', 'search_medical_literature'],

  // Intelligence / reasoning
  INTEL:         ['check_drug_interactions', 'emergency_triage', 'get_health_risk_score',
                  'get_clinical_insights', 'get_smart_notifications',
                  'analyze_symptoms', 'generate_differential', 'risk_assessment'],

  // Financial / insurance
  FINANCE:       ['get_invoice', 'get_payment_status', 'get_insurance_status',
                  'process_claim', 'check_preauth', 'get_tpa_details', 'insurance_query'],

  // System / admin (isSystem=true in registry)
  SYSTEM:        ['list_agents', 'get_system_status', 'get_audit_logs',
                  'configure_agent', 'reload_prompts', 'get_agent_metrics'],
};

// ─── Agent Definitions ────────────────────────────────────────────────────────

export const AGENTS = {

  // ── Admin Agent ─────────────────────────────────────────────────────────────
  admin: {
    id: 'admin',
    name: 'Admin Agent',
    icon: '⚙️',
    description: 'Privileged system operator. Full access to configuration, audit logs, and all tools. Hospital/platform admins only.',
    requiredCapability: CAPS.INVOKE_ADMIN_AGENT,
    llmTier: 'high',
    maxTokens: 8192,
    maxIterations: 10,
    priority: 10,  // higher = run first in parallel groups
    allowedTools: [
      ...T.PATIENT_READ, ...T.PATIENT_WRITE,
      ...T.APPT,
      ...T.LAB_READ, ...T.LAB_WRITE,
      ...T.WELLNESS, ...T.MEMORY, ...T.RAG,
      ...T.INTEL, ...T.FINANCE, ...T.SYSTEM,
    ],
    systemPromptSuffix: `
AGENT ROLE: Admin Agent — full privileged system access.
PERMISSIONS: read + write all records, system configuration, audit logs.
ALWAYS: log destructive or irreversible actions before executing them.
ALWAYS: confirm with the user before modifying system configuration.`,
  },

  // ── Clinical Agent ───────────────────────────────────────────────────────────
  clinical: {
    id: 'clinical',
    name: 'Clinical Agent',
    icon: '🩺',
    description: 'Medical AI assistant for doctors and nurses. Clinical decision support, prescriptions, differential diagnosis, documentation.',
    requiredCapability: CAPS.INVOKE_CLINICAL_AGENT,
    llmTier: 'high',
    maxTokens: 6144,
    maxIterations: 8,
    priority: 9,
    allowedTools: [
      ...T.PATIENT_READ, ...T.PATIENT_WRITE,
      ...T.LAB_READ, ...T.LAB_WRITE,
      ...T.WELLNESS, ...T.MEMORY, ...T.RAG,
      ...T.INTEL, ...T.APPT,
    ],
    systemPromptSuffix: `
AGENT ROLE: Clinical Agent — specialist medical AI assistant.
PERMISSIONS: patient records (read/write), lab orders, clinical decision support.
CANNOT: modify financial data, change system config.
ALWAYS: cite evidence. Recommend clinical oversight for all decisions.
ALWAYS: flag critical values (BP > 180/120, SpO2 < 92%, glucose < 60 or > 400).`,
  },

  // ── Analyst Agent ────────────────────────────────────────────────────────────
  analyst: {
    id: 'analyst',
    name: 'Analyst Agent',
    icon: '📊',
    description: 'Data intelligence. Read-only analytics, population health trends, financial reports. No write operations.',
    requiredCapability: CAPS.INVOKE_ANALYST_AGENT,
    llmTier: 'standard',
    maxTokens: 4096,
    maxIterations: 6,
    priority: 6,
    allowedTools: [
      ...T.PATIENT_READ, ...T.LAB_READ,
      ...T.WELLNESS, ...T.RAG, ...T.INTEL, ...T.FINANCE,
    ],
    systemPromptSuffix: `
AGENT ROLE: Analyst Agent — data intelligence, READ-ONLY.
PERMISSIONS: read patient data, analytics, financial reports, knowledge base.
CANNOT: write or modify any record.
ALWAYS: include sample size, confidence intervals, and data quality caveats in analysis.`,
  },

  // ── Worker Agent ─────────────────────────────────────────────────────────────
  worker: {
    id: 'worker',
    name: 'Worker Agent',
    icon: '⚙️',
    description: 'Task execution: appointment scheduling, reminders, follow-up workflows. No clinical decision-making.',
    requiredCapability: CAPS.INVOKE_WORKER_AGENT,
    llmTier: 'standard',
    maxTokens: 2048,
    maxIterations: 5,
    priority: 5,
    allowedTools: [
      ...T.APPT, ...T.WELLNESS, ...T.MEMORY,
    ],
    systemPromptSuffix: `
AGENT ROLE: Worker Agent — task execution specialist.
PERMISSIONS: book/reschedule/cancel appointments, schedules, reminders.
CANNOT: access clinical records, make diagnostic decisions, modify medical data.
Be efficient. Confirm task completion with a brief summary.`,
  },

  // ── Research Agent ───────────────────────────────────────────────────────────
  research: {
    id: 'research',
    name: 'Research Agent',
    icon: '🔬',
    description: 'Medical knowledge retrieval and synthesis. Searches clinical guidelines, drug info, literature. No patient record access.',
    requiredCapability: CAPS.INVOKE_RESEARCH_AGENT,
    llmTier: 'standard',
    maxTokens: 4096,
    maxIterations: 5,
    priority: 5,
    allowedTools: [
      ...T.RAG, ...T.INTEL, ...T.LAB_READ,
    ],
    systemPromptSuffix: `
AGENT ROLE: Research Agent — medical knowledge specialist.
PERMISSIONS: clinical guidelines, drug information, medical literature, lab reference ranges.
CANNOT: access individual patient records or write any data.
ALWAYS: cite sources. Rate evidence quality (Grade A/B/C or LOE 1/2/3).`,
  },

  // ── Insurance Agent ──────────────────────────────────────────────────────────
  insurance: {
    id: 'insurance',
    name: 'Insurance Agent',
    icon: '🏥',
    description: 'Healthcare finance and TPA operations: pre-auth, claims, eligibility, billing.',
    requiredCapability: CAPS.INVOKE_INSURANCE_AGENT,
    llmTier: 'standard',
    maxTokens: 3000,
    maxIterations: 6,
    priority: 7,
    allowedTools: [
      ...T.FINANCE, ...T.PATIENT_READ, ...T.LAB_READ,
    ],
    systemPromptSuffix: `
AGENT ROLE: Insurance Agent — healthcare finance specialist.
PERMISSIONS: insurance status, claims processing, pre-auth, eligibility.
CANNOT: modify clinical data, make medical decisions.
ALWAYS: verify policy coverage before approving claims. Flag exclusions explicitly.`,
  },

  // ── Emergency Agent ──────────────────────────────────────────────────────────
  emergency: {
    id: 'emergency',
    name: 'Emergency Agent',
    icon: '🚨',
    description: 'Critical care triage. Highest priority, fastest response. ESI-5 triage classification.',
    requiredCapability: CAPS.INVOKE_EMERGENCY_AGENT,
    llmTier: 'high',
    maxTokens: 2048,
    maxIterations: 4,  // fewer iterations → faster
    priority: 100,    // always runs first
    allowedTools: [
      ...T.PATIENT_READ, ...T.PATIENT_WRITE,
      ...T.INTEL, ...T.APPT,
    ],
    systemPromptSuffix: `
AGENT ROLE: Emergency Agent — critical care AI triage coordinator.
PRIORITY: Patient safety above ALL else. Act first, document later.
TRIAGE CODES: RED (immediate/life-threatening), ORANGE (urgent <30min),
              YELLOW (less urgent <2h), GREEN (non-urgent), BLUE (expectant).
ALWAYS: give clear safety instructions. ALWAYS: escalate RED/ORANGE immediately.`,
  },
};

// ─── Registry API ─────────────────────────────────────────────────────────────

export function getAgent(agentId) {
  return AGENTS[agentId] || null;
}

export function getAllAgents() {
  return Object.values(AGENTS);
}

/** Return agents the given capability set can invoke */
export function getAvailableAgents(capabilities) {
  return Object.values(AGENTS).filter(a => capabilities.includes(a.requiredCapability));
}

/** Check whether identity can invoke a specific agent */
export function validateAgentAccess(agentId, identity) {
  const agent = AGENTS[agentId];
  if (!agent) {
    return { allowed: false, reason: `Agent '${agentId}' does not exist` };
  }
  if (!identity.capabilities.includes(agent.requiredCapability)) {
    return {
      allowed: false,
      reason: `Role '${identity.role}' cannot invoke agent '${agentId}' (requires: ${agent.requiredCapability})`,
    };
  }
  return { allowed: true };
}

/**
 * Filter tool definitions to only those allowed for a specific agent.
 * This is Layer 2 sandboxing — even if identity has broad tool access,
 * the agent's own allowlist further restricts what it can call.
 */
export function getAgentToolDefs(agentId, allToolDefs) {
  const agent = AGENTS[agentId];
  if (!agent) return [];
  const allowed = new Set(agent.allowedTools);
  return allToolDefs.filter(td => allowed.has(td.function?.name));
}
