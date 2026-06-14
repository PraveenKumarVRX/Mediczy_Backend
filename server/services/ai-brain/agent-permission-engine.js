/**
 * Agent Permission Engine
 * =======================
 * Layer 1 security: Identity resolution + RBAC/ABAC for the multi-agent AI system.
 *
 * Enforced BEFORE any agent executes. Agents are stateless workers — they never
 * decide permissions. The Brain always decides.
 *
 * Role hierarchy (ascending privilege):
 *   viewer → patient → external_api → nurse → analyst → doctor → hospital_admin → platform_admin
 *
 * Capability model:
 *   Fine-grained strings like 'invoke:clinical_agent', 'tools:exec_write', 'llm:high_reasoning'.
 *   Roles receive default capability sets. Individual users can get extra grants via DB.
 *
 * Enforcement layers:
 *   Layer 1: resolveIdentity()       — who is calling
 *   Layer 2: requireCapability()     — can they call this agent
 *   Layer 3: filterPermittedTools()  — can the agent use these tools for this user
 */

import pool from '../../db/pgPool.js';
import jwt from 'jsonwebtoken';

// ─── Roles ────────────────────────────────────────────────────────────────────

export const ROLES = {
  PLATFORM_ADMIN: 'platform_admin',
  HOSPITAL_ADMIN: 'hospital_admin',
  DOCTOR:         'doctor',
  NURSE:          'nurse',
  ANALYST:        'analyst',
  PATIENT:        'patient',
  EXTERNAL_API:   'external_api',
  VIEWER:         'viewer',
};

// ─── Capabilities ─────────────────────────────────────────────────────────────

export const CAPS = {
  // Which agents a role may invoke
  INVOKE_ADMIN_AGENT:     'invoke:admin_agent',
  INVOKE_ANALYST_AGENT:   'invoke:analyst_agent',
  INVOKE_WORKER_AGENT:    'invoke:worker_agent',
  INVOKE_RESEARCH_AGENT:  'invoke:research_agent',
  INVOKE_CLINICAL_AGENT:  'invoke:clinical_agent',
  INVOKE_INSURANCE_AGENT: 'invoke:insurance_agent',
  INVOKE_EMERGENCY_AGENT: 'invoke:emergency_agent',

  // LLM tier access
  LLM_HIGH_REASONING: 'llm:high_reasoning',   // iSHA BiMediX2 / GPT-4-class
  LLM_STANDARD:       'llm:standard',          // Groq Llama-70B
  LLM_BASIC:          'llm:basic',             // GPT-3.5 / local SLM

  // Data access
  READ_PATIENT_DATA:  'data:read_patient',
  WRITE_PATIENT_DATA: 'data:write_patient',
  READ_ANALYTICS:     'data:read_analytics',
  READ_FINANCIAL:     'data:read_financial',
  WRITE_FINANCIAL:    'data:write_financial',

  // Tool execution
  EXEC_READ_TOOLS:    'tools:exec_read',
  EXEC_WRITE_TOOLS:   'tools:exec_write',   // tools with isWrite=true
  EXEC_SYSTEM_TOOLS:  'tools:exec_system',  // admin-only system tools

  // System operations
  DEPLOY_AGENT:       'system:deploy_agent',
  VIEW_AUDIT_LOGS:    'system:view_audit',
  MANAGE_AGENTS:      'system:manage_agents',
  CONFIGURE_SYSTEM:   'system:configure',
};

// ─── Role → Default Capabilities ──────────────────────────────────────────────

const ROLE_CAPABILITIES = {
  [ROLES.PLATFORM_ADMIN]: Object.values(CAPS),

  [ROLES.HOSPITAL_ADMIN]: [
    CAPS.INVOKE_ADMIN_AGENT, CAPS.INVOKE_ANALYST_AGENT, CAPS.INVOKE_WORKER_AGENT,
    CAPS.INVOKE_RESEARCH_AGENT, CAPS.INVOKE_CLINICAL_AGENT,
    CAPS.INVOKE_INSURANCE_AGENT, CAPS.INVOKE_EMERGENCY_AGENT,
    CAPS.LLM_HIGH_REASONING, CAPS.LLM_STANDARD, CAPS.LLM_BASIC,
    CAPS.READ_PATIENT_DATA, CAPS.WRITE_PATIENT_DATA,
    CAPS.READ_ANALYTICS, CAPS.READ_FINANCIAL, CAPS.WRITE_FINANCIAL,
    CAPS.EXEC_READ_TOOLS, CAPS.EXEC_WRITE_TOOLS,
    CAPS.VIEW_AUDIT_LOGS, CAPS.MANAGE_AGENTS,
  ],

  [ROLES.DOCTOR]: [
    CAPS.INVOKE_CLINICAL_AGENT, CAPS.INVOKE_RESEARCH_AGENT,
    CAPS.INVOKE_WORKER_AGENT, CAPS.INVOKE_EMERGENCY_AGENT,
    CAPS.LLM_HIGH_REASONING, CAPS.LLM_STANDARD,
    CAPS.READ_PATIENT_DATA, CAPS.WRITE_PATIENT_DATA,
    CAPS.EXEC_READ_TOOLS, CAPS.EXEC_WRITE_TOOLS,
  ],

  [ROLES.NURSE]: [
    CAPS.INVOKE_CLINICAL_AGENT, CAPS.INVOKE_WORKER_AGENT, CAPS.INVOKE_EMERGENCY_AGENT,
    CAPS.LLM_STANDARD,
    CAPS.READ_PATIENT_DATA, CAPS.WRITE_PATIENT_DATA,
    CAPS.EXEC_READ_TOOLS, CAPS.EXEC_WRITE_TOOLS,
  ],

  [ROLES.ANALYST]: [
    CAPS.INVOKE_ANALYST_AGENT, CAPS.INVOKE_RESEARCH_AGENT,
    CAPS.LLM_STANDARD, CAPS.LLM_BASIC,
    CAPS.READ_PATIENT_DATA, CAPS.READ_ANALYTICS, CAPS.READ_FINANCIAL,
    CAPS.EXEC_READ_TOOLS,
    CAPS.VIEW_AUDIT_LOGS,
  ],

  [ROLES.PATIENT]: [
    CAPS.INVOKE_WORKER_AGENT, CAPS.INVOKE_RESEARCH_AGENT,
    CAPS.LLM_BASIC,
    CAPS.READ_PATIENT_DATA,  // own data only — DB RLS enforces this
    CAPS.EXEC_READ_TOOLS,
  ],

  [ROLES.EXTERNAL_API]: [
    CAPS.INVOKE_WORKER_AGENT,
    CAPS.LLM_BASIC,
    CAPS.EXEC_READ_TOOLS,
  ],

  [ROLES.VIEWER]: [
    CAPS.LLM_BASIC,
    CAPS.EXEC_READ_TOOLS,
  ],
};

// ─── Token budgets per role per request ───────────────────────────────────────

const TOKEN_BUDGETS = {
  [ROLES.PLATFORM_ADMIN]: 16000,
  [ROLES.HOSPITAL_ADMIN]: 12000,
  [ROLES.DOCTOR]:          8000,
  [ROLES.NURSE]:           4000,
  [ROLES.ANALYST]:         6000,
  [ROLES.PATIENT]:         2000,
  [ROLES.EXTERNAL_API]:    2000,
  [ROLES.VIEWER]:          1000,
};

// ─── Identity Resolution ──────────────────────────────────────────────────────

/**
 * Resolve caller identity from JWT or API key.
 * Always returns a safe identity object — never throws.
 * Unresolvable → VIEWER role (read-only, no agent invocation).
 */
export async function resolveIdentity(req) {
  const base = {
    userId: null,
    orgId: null,
    tenantId: null,
    sessionId: null,
    role: ROLES.VIEWER,
    capabilities: [...ROLE_CAPABILITIES[ROLES.VIEWER]],
    tokenBudget: TOKEN_BUDGETS[ROLES.VIEWER],
    source: 'anonymous',
    rawRole: null,
  };

  try {
    // ── API key (external integrations) ───────────────────────────────────
    const apiKey = req.headers?.['x-api-key'] || req.headers?.['x-mediczy-key'];
    if (apiKey) {
      const keyId = await _resolveApiKey(apiKey);
      if (keyId) return { ...base, ...keyId, source: 'api_key' };
    }

    // ── Bearer JWT ────────────────────────────────────────────────────────
    const auth = req.headers?.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

    // Also accept pre-parsed req.user (set by upstream auth middleware)
    const preUser = req.user;
    const decoded = token
      ? jwt.verify(token, process.env.JWT_SECRET)
      : preUser
      ? preUser
      : null;

    if (!decoded) return base;

    const userId   = decoded.id || decoded.userId || decoded.sub;
    const orgId    = decoded.orgId || decoded.hospitalId || decoded.tenantId;
    const rawRole  = decoded.role || decoded.userType || decoded.userRole || 'patient';
    const role     = _mapToAgentRole(rawRole);
    const caps     = [...(ROLE_CAPABILITIES[role] || ROLE_CAPABILITIES[ROLES.VIEWER])];

    // Load extra DB-granted capabilities
    const extras = await _loadExtraCapabilities(userId);
    const finalCaps = extras.length ? [...new Set([...caps, ...extras])] : caps;

    return {
      userId,
      orgId,
      tenantId: decoded.tenantId || orgId,
      sessionId: decoded.sessionId || req.headers?.['x-session-id'] || null,
      role,
      rawRole,
      capabilities: finalCaps,
      tokenBudget: TOKEN_BUDGETS[role] || TOKEN_BUDGETS[ROLES.VIEWER],
      source: token ? 'jwt' : 'req_user',
    };
  } catch (err) {
    console.warn('[PermEngine] Identity resolution failed:', err.message);
    return base;
  }
}

function _mapToAgentRole(rawRole) {
  if (!rawRole) return ROLES.PATIENT;
  const r = String(rawRole).toLowerCase();
  if (r.includes('platform') || r === 'superadmin' || r === 'super_admin') return ROLES.PLATFORM_ADMIN;
  if (r.includes('hospital_admin') || r === 'admin' || r === 'manager') return ROLES.HOSPITAL_ADMIN;
  if (r === 'medical_director' || r === 'medicaldirector') return ROLES.HOSPITAL_ADMIN;
  if (r === 'doctor' || r === 'physician' || r.startsWith('dr')) return ROLES.DOCTOR;
  if (r === 'nurse' || r === 'staff' || r === 'paramedic') return ROLES.NURSE;
  if (r === 'analyst' || r === 'data_analyst') return ROLES.ANALYST;
  if (r === 'external_api' || r === 'api_client') return ROLES.EXTERNAL_API;
  return ROLES.PATIENT;
}

async function _resolveApiKey(apiKey) {
  try {
    const { rows } = await pool.query(
      `SELECT user_id, role, org_id, extra_caps
         FROM ai_api_keys
        WHERE key_hash = encode(sha256($1::bytea), 'hex')
          AND is_active = true
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1`,
      [apiKey]
    );
    if (!rows[0]) return null;
    const row  = rows[0];
    const role = row.role || ROLES.EXTERNAL_API;
    return {
      userId:      row.user_id,
      orgId:       row.org_id,
      role,
      capabilities: [
        ...(ROLE_CAPABILITIES[role] || []),
        ...(row.extra_caps || []),
      ],
      tokenBudget: TOKEN_BUDGETS[role] || TOKEN_BUDGETS[ROLES.EXTERNAL_API],
    };
  } catch {
    return null;
  }
}

async function _loadExtraCapabilities(userId) {
  if (!userId) return [];
  try {
    const { rows } = await pool.query(
      `SELECT extra_capabilities
         FROM ai_user_agent_grants
        WHERE user_id = $1
          AND is_active = true
          AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId]
    );
    return rows.flatMap(r => r.extra_capabilities || []);
  } catch {
    return [];
  }
}

// ─── Permission Checks ────────────────────────────────────────────────────────

export function hasCapability(identity, cap) {
  return identity.capabilities?.includes(cap) ?? false;
}

/**
 * Throws a 403 PermissionDenied error if capability is missing.
 */
export function requireCapability(identity, cap) {
  if (!hasCapability(identity, cap)) {
    const err = new Error(
      `Permission denied — requires '${cap}' (role: ${identity.role})`
    );
    err.code   = 'PERMISSION_DENIED';
    err.status = 403;
    throw err;
  }
}

/**
 * Filter tool definitions to only what this identity may execute.
 * Respects isWrite and isSystem flags on tool definitions.
 */
export function filterPermittedTools(toolDefs, identity) {
  return toolDefs.filter(td => {
    const meta = td._meta || {};  // tool metadata injected by registry
    if (meta.isSystem && !hasCapability(identity, CAPS.EXEC_SYSTEM_TOOLS)) return false;
    if (meta.isWrite  && !hasCapability(identity, CAPS.EXEC_WRITE_TOOLS))  return false;
    return hasCapability(identity, CAPS.EXEC_READ_TOOLS);
  });
}

/**
 * Return the LLM provider preference for this identity.
 * 'high' → iSHA / GPT-4-class, 'standard' → Groq, 'basic' → GPT-3.5 / local
 */
export function getLLMTier(identity) {
  if (hasCapability(identity, CAPS.LLM_HIGH_REASONING)) return 'high';
  if (hasCapability(identity, CAPS.LLM_STANDARD))       return 'standard';
  return 'basic';
}

export { ROLE_CAPABILITIES, TOKEN_BUDGETS };
