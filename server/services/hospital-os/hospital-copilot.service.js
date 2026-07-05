/**
 * Hospital OS — unified Hospital Copilot (single assistant for entire hospital)
 */
import multiAgentOrchestrator from '../ai-brain/multi-agent-orchestrator.js';
import { getPatientWorkspace, toPatientSummary } from '../clinical-workspace.service.js';
import { getAIRecommendations } from './command-center-ai.service.js';
import { getCapabilitiesMeta } from './hospital-os.constants.js';
import pool from '../../db/pgPool.js';

const HOSPITAL_COPILOT_PROMPT = `You are the Mediczy Hospital Copilot — one AI assistant for the entire hospital.
You help clinicians, nurses, and administrators with:
- Clinical questions grounded in hospital-approved guidelines (always note physician review required)
- Instant patient chart summaries and lab trends
- Discharge summaries and referral letter DRAFTS (approval required)
- Cross-department task coordination
- Operational insights from the command center

AUTONOMY TIERS:
- T0: Read-only information — answer directly
- T1: Drafts (orders, notes, letters) — create draft and tell user to check Approval Inbox
- T3: Diagnosis/prescribing/discharge — suggest only; never finalize

Use available tools. Be concise, safe, and cite when data is missing.`;

const INTENT_AGENT_MAP = [
  { pattern: /billing|invoice|revenue|claim|denial|insurance|preauth/i, agent: 'insurance' },
  { pattern: /triage|emergency|esi|critical|icu|deteriorat/i, agent: 'emergency' },
  { pattern: /quality|nabh|jci|compliance|audit/i, agent: 'analyst' },
  { pattern: /schedule|appointment|admit|discharge|bed/i, agent: 'worker' },
  { pattern: /research|guideline|drug|literature|cdss/i, agent: 'research' },
  { pattern: /admin|system|governance|config/i, agent: 'admin' },
];

function resolveAgent(message, role) {
  if (role === 'admin' || role === 'super_admin') return 'admin';
  for (const { pattern, agent } of INTENT_AGENT_MAP) {
    if (pattern.test(message)) return agent;
  }
  return 'clinical';
}

export async function hospitalCopilotChat({
  message,
  context = {},
  conversationHistory = [],
  req,
}) {
  const organizationId = context.organizationId || req.user?.organization_id || req.user?.tenant_id || 1;
  const hospitalId = req.hospitalId || organizationId;
  const role = req.user?.role || 'doctor';
  const agent = context.forceAgent || resolveAgent(message, role);

  let enrichedContext = { ...context, organizationId, hospitalId, role };

  if (context.patientId) {
    try {
      const ws = await getPatientWorkspace(context.patientId, organizationId);
      enrichedContext.patientSummary = toPatientSummary(ws);
    } catch {
      enrichedContext.patientSummary = null;
    }
  }

  if (context.includeCommandCenter || /occupancy|command center|capacity|waiting/i.test(message)) {
    try {
      enrichedContext.commandCenter = await getAIRecommendations(organizationId);
    } catch {
      enrichedContext.commandCenter = null;
    }
  }

  const enrichedMessage = `${HOSPITAL_COPILOT_PROMPT}

CONTEXT:
${JSON.stringify(enrichedContext, null, 2)}

USER (${role}): ${message}`;

  const result = await multiAgentOrchestrator.process({
    message: enrichedMessage,
    req,
    contextMessages: conversationHistory,
    forceAgent: agent,
    metadata: { source: 'hospital-copilot', hospitalId, organizationId, agent },
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hospital_copilot_log (
      id BIGSERIAL PRIMARY KEY,
      hospital_id INTEGER,
      user_id INTEGER,
      agent_id VARCHAR(40),
      input_message TEXT,
      response TEXT,
      latency_ms INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});

  await pool.query(
    `INSERT INTO hospital_copilot_log (hospital_id, user_id, agent_id, input_message, response, latency_ms)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [hospitalId, req.user?.id, agent, message, result.response, result.latencyMs]
  ).catch(() => {});

  return {
    ...result,
    copilot: 'hospital-unified',
    agent,
    samd: agent === 'clinical' || agent === 'emergency',
    autonomyTier: /order|prescrib|discharge/i.test(message) ? 'T1' : 'T0',
  };
}

export function getCapabilities() {
  return getCapabilitiesMeta();
}

export default { hospitalCopilotChat, getCapabilities };
