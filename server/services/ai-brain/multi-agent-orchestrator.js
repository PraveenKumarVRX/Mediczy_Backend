/**
 * Multi-Agent Orchestrator
 * ========================
 * Enterprise-grade control plane for the role-based multi-agent AI system.
 *
 * Execution flow:
 *  1. resolveIdentity()      — who is calling (JWT/API key → role + capabilities)
 *  2. Permission gate        — can this identity invoke AI agents at all
 *  3. planTasks()            — classify intent → build task DAG
 *  4. routeAgents()          — assign tasks to agents based on intent + permissions
 *  5. executeGraph()         — run tasks (parallel where possible, sequential for deps)
 *  6. aggregateResults()     — merge multi-agent outputs into a single coherent answer
 *  7. auditLog()             — persist full run to ai_agent_runs table
 *
 * Design principles:
 *   ❌ Agents do NOT decide permissions
 *   ✅ Brain enforces permissions — agents only execute within their sandbox
 *   ✅ All runs are logged with full audit trail
 *   ✅ Fails open on non-critical errors (partial results > total failure)
 */

import pool from '../../db/pgPool.js';
import { maskPhi } from '../../utils/phi-masker.js';
import llmProvider from './llm-provider.js';
import ragPipeline from './rag-pipeline.js';
import { getToolDefinitions, execute as executeTool } from './tools/loader.js';
import {
  resolveIdentity,
  hasCapability,
  requireCapability,
  filterPermittedTools,
  getLLMTier,
  CAPS,
  ROLES,
} from './agent-permission-engine.js';
import {
  getAgent,
  getAllAgents,
  getAvailableAgents,
  validateAgentAccess,
  getAgentToolDefs,
} from './agent-registry.js';
import cognitiveRouter, { TIERS } from './cognitive-router.js';
import { recordTelemetry } from './evaluation-engine.js';

const MAX_AGENT_ITERATIONS = 8;
// Hard wall-clock limit for any agent run — prevents indefinite hangs on patient-facing requests
const AGENT_RUN_TIMEOUT_MS = parseInt(process.env.AGENT_RUN_TIMEOUT_MS || '30000', 10);

// ─── DB Setup ─────────────────────────────────────────────────────────────────

let _dbReady = false;
async function ensureDb() {
  if (_dbReady) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_agent_runs (
        id              BIGSERIAL PRIMARY KEY,
        run_id          UUID NOT NULL DEFAULT gen_random_uuid(),
        user_id         INTEGER,
        org_id          INTEGER,
        role            VARCHAR(50),
        input_message   TEXT,
        task_plan       JSONB,
        agents_used     TEXT[],
        final_response  TEXT,
        status          VARCHAR(20) DEFAULT 'pending',
        error_message   TEXT,
        total_tokens    INTEGER DEFAULT 0,
        latency_ms      INTEGER,
        metadata        JSONB DEFAULT '{}',
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_runs_user
        ON ai_agent_runs(user_id, created_at DESC)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_api_keys (
        id          SERIAL PRIMARY KEY,
        key_hash    VARCHAR(128) UNIQUE NOT NULL,
        user_id     INTEGER,
        org_id      INTEGER,
        role        VARCHAR(50) DEFAULT 'external_api',
        description TEXT,
        extra_caps  TEXT[] DEFAULT '{}',
        is_active   BOOLEAN DEFAULT true,
        expires_at  TIMESTAMPTZ,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_user_agent_grants (
        id                  SERIAL PRIMARY KEY,
        user_id             INTEGER NOT NULL,
        extra_capabilities  TEXT[] DEFAULT '{}',
        granted_by          INTEGER,
        reason              TEXT,
        is_active           BOOLEAN DEFAULT true,
        expires_at          TIMESTAMPTZ,
        created_at          TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    _dbReady = true;
  } catch (err) {
    console.error('[MultiAgent] DB init error:', err.message);
  }
}

// ─── Intent Classifier + Task Planner ────────────────────────────────────────

/**
 * Classify request intent and build a task execution plan (DAG).
 *
 * Each task has:
 *   { id, agentId, description, dependsOn: [taskId], parallel: bool }
 *
 * Uses a 3-tier approach:
 *   1. Rule-based fast path (regex/keywords) — covers ~80% of requests
 *   2. LLM planner for complex multi-step requests
 *   3. Fallback: single clinical/worker agent
 */
async function planTasks(message, identity, conversationContext = []) {
  const msg = message.toLowerCase();

  // ── Cognitive tier classification (CPU-only, zero LLM calls) ─────────────
  const cogResult = await cognitiveRouter.classify(message, {
    userId:              identity.userId,
    conversationHistory: conversationContext,
  });
  console.log(`[MultiAgent] CognitiveTier=${cogResult.tier} provider=${cogResult.preferredProvider} category=${cogResult.category}`);

  // ── Emergency override — always highest priority ───────────────────────────
  if (_isEmergency(msg) && hasCapability(identity, CAPS.INVOKE_EMERGENCY_AGENT)) {
    return {
      intent: 'emergency',
      isMultiAgent: false,
      tasks: [{ id: 't1', agentId: 'emergency', description: message, dependsOn: [], priority: 100 }],
      cognitiveTier: TIERS.DEEP,   // emergency always uses highest-reasoning tier
      cognitiveDecisionId: cogResult.decisionId,
    };
  }

  // ── Rule-based single-agent routing ───────────────────────────────────────
  const singleAgent = _classifyToSingleAgent(msg, identity);
  if (singleAgent) {
    return {
      intent: singleAgent,
      isMultiAgent: false,
      cognitiveTier: cogResult.tier,
      cognitiveDecisionId: cogResult.decisionId,
      tasks: [{ id: 't1', agentId: singleAgent, description: message, dependsOn: [] }],
    };
  }

  // ── LLM-based multi-step planner ──────────────────────────────────────────
  try {
    const multiPlan = await _llmPlanTasks(message, identity, conversationContext);
    // Attach cognitive tier to LLM-planned multi-agent tasks too
    multiPlan.cognitiveTier      = multiPlan.cognitiveTier      || cogResult.tier;
    multiPlan.cognitiveDecisionId = multiPlan.cognitiveDecisionId || cogResult.decisionId;
    return multiPlan;
  } catch (err) {
    console.warn('[MultiAgent] LLM planner failed, fallback:', err.message);
    // Fallback: use most capable available agent
    const fallback = _getFallbackAgent(identity);
    return {
      intent: 'general',
      isMultiAgent: false,
      cognitiveTier: cogResult.tier,
      cognitiveDecisionId: cogResult.decisionId,
      tasks: [{ id: 't1', agentId: fallback, description: message, dependsOn: [] }],
    };
  }
}

function _isEmergency(msg) {
  return /\b(emergency|urgent|critical|chest pain|not breathing|unconscious|cardiac arrest|stroke|seizure|severe bleed|anaphylaxis|999|112|ambulance)\b/.test(msg);
}

function _classifyToSingleAgent(msg, identity) {
  const has = (cap) => hasCapability(identity, cap);

  if (/\b(system|config|audit log|deploy|reload prompt|agent metric|manage|admin)\b/.test(msg) && has(CAPS.INVOKE_ADMIN_AGENT))
    return 'admin';
  if (/\b(diagnosis|prescription|clinical|treatment|medicine|drug|symptom|patient|vitals|lab order|ecg|imaging|differential)\b/.test(msg) && has(CAPS.INVOKE_CLINICAL_AGENT))
    return 'clinical';
  if (/\b(insurance|claim|tpa|preauth|cashless|policy|premium|billing|invoice)\b/.test(msg) && has(CAPS.INVOKE_INSURANCE_AGENT))
    return 'insurance';
  if (/\b(book|schedule|appointment|reschedule|cancel|slot|reminder|follow.?up|visit)\b/.test(msg) && has(CAPS.INVOKE_WORKER_AGENT))
    return 'worker';
  if (/\b(guideline|research|literature|evidence|drug info|interaction check|protocol|standard of care)\b/.test(msg) && has(CAPS.INVOKE_RESEARCH_AGENT))
    return 'research';
  if (/\b(analytics|trend|report|population|statistics|dashboard|kpi|revenue|insight)\b/.test(msg) && has(CAPS.INVOKE_ANALYST_AGENT))
    return 'analyst';
  return null;
}

function _getFallbackAgent(identity) {
  const order = ['clinical', 'worker', 'research', 'analyst', 'admin'];
  for (const id of order) {
    const check = validateAgentAccess(id, identity);
    if (check.allowed) return id;
  }
  return null;
}

/**
 * LLM-based task planner — called only for complex multi-step requests.
 * Returns a structured task graph.
 */
async function _llmPlanTasks(message, identity, context) {
  const availableAgents = getAvailableAgents(identity.capabilities)
    .map(a => `${a.id}: ${a.description}`).join('\n');

  const plannerMessages = [
    {
      role: 'system',
      content: `You are a task planning AI. Decompose the user's request into a DAG of subtasks.
Each task should be assigned to one of these available agents:
${availableAgents}

Rules:
- Use ONLY agents listed above
- Tasks that can run in parallel should have no shared dependencies
- Each task must have a unique id (t1, t2, t3...)
- Maximum 5 tasks

Respond with ONLY valid JSON like:
{
  "intent": "brief description",
  "tasks": [
    {"id": "t1", "agentId": "clinical", "description": "specific task", "dependsOn": []},
    {"id": "t2", "agentId": "research", "description": "specific task", "dependsOn": []},
    {"id": "t3", "agentId": "worker",   "description": "specific task", "dependsOn": ["t1", "t2"]}
  ]
}`,
    },
    ...context.slice(-4),
    { role: 'user', content: message },
  ];

  const llmResult = await llmProvider.chat({
    messages: plannerMessages,
    responseFormat: { type: 'json_object' },
    maxTokens: 512,
    skipCache: true,
  });

  const plan = JSON.parse(llmResult.content);

  // Validate all tasks reference valid agents
  plan.tasks = (plan.tasks || []).filter(t => {
    const check = validateAgentAccess(t.agentId, identity);
    if (!check.allowed) {
      console.warn(`[MultiAgent] Planner assigned inaccessible agent '${t.agentId}': ${check.reason}`);
      return false;
    }
    return true;
  });

  if (plan.tasks.length === 0) {
    throw new Error('LLM planner produced no valid tasks');
  }

  plan.isMultiAgent = plan.tasks.length > 1;
  return plan;
}

// ─── Single Agent Runner ──────────────────────────────────────────────────────

/**
 * Execute a single agent task with full agentic loop + tool sandboxing.
 */
async function runAgent(task, identity, conversationMessages, ragContext = '', opts = {}) {
  const agent = getAgent(task.agentId);
  if (!agent) throw new Error(`Agent '${task.agentId}' not found`);

  const allToolDefs = getToolDefinitions();
  // Layer 2: agent allowlist  →  Layer 1: identity capability filter
  const agentTools    = getAgentToolDefs(task.agentId, allToolDefs);
  const permittedTools = filterPermittedTools(agentTools, identity);

  // Build system prompt for this specific agent
  const systemPrompt = _buildAgentSystemPrompt(agent, identity, ragContext);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationMessages.slice(-10),
    { role: 'user', content: task.description },
  ];

  // ── Cognitive tier overrides agent role-based tier when available ─────────
  // HAIS rule: cognitive router's per-query tier takes precedence over static
  // role-based tier, EXCEPT tools require STANDARD+ (SLM has no function calling).
  const hasCognitiveTier = !!opts.cognitiveTier;
  const hasTools = permittedTools.length > 0;
  let tierModel;
  let cognitiveTier;
  let cognitiveDecisionId = opts.cognitiveDecisionId;

  if (hasCognitiveTier && !hasTools) {
    // Route via cognitive tier (HAIS path)
    cognitiveTier = opts.cognitiveTier;
    tierModel = null;  // llm-provider.js reads cognitiveTier itself
    console.log(`[RunAgent:${task.agentId}] HAIS tier=${cognitiveTier}`);
  } else {
    // Fall back to role-based provider for agents with tools or no tier hint
    tierModel = _tierToProvider(agent.llmTier);
    cognitiveTier = null;
  }

  const agentStart = Date.now();
  let totalTokens = 0;
  let finalContent = null;
  const toolsExecuted = [];
  const seenCalls = new Set();

  // Agentic loop
  for (let i = 0; i < Math.min(agent.maxIterations, MAX_AGENT_ITERATIONS); i++) {
    const llmParams = {
      messages,
      tools: permittedTools.length > 0 ? permittedTools : null,
      toolChoice: 'auto',
      maxTokens: agent.maxTokens,
      skipCache: true,
      ...(tierModel ? { forceProvider: tierModel } : {}),
      ...(cognitiveTier ? { cognitiveTier, cognitiveDecisionId } : {}),
    };

    const result = await llmProvider.chat(llmParams);
    totalTokens += result.usage?.totalTokens || 0;

    // No tool calls → final answer
    if (!result.toolCalls || result.toolCalls.length === 0) {
      finalContent = result.content;
      break;
    }

    // Execute tool calls (with deduplication)
    for (const tc of result.toolCalls) {
      const sig = `${tc.function.name}::${tc.function.arguments}`;
      if (seenCalls.has(sig)) continue;
      seenCalls.add(sig);

      let toolArgs = {};
      try { toolArgs = JSON.parse(tc.function.arguments || '{}'); } catch { /* ignore */ }

      const toolResult = await executeTool(tc.function.name, toolArgs, {
        userId: identity.userId,
        userType: identity.role,
        agentId: task.agentId,
        hospitalId: opts.hospitalId,
        organizationId: opts.organizationId,
        tenantId: opts.hospitalId || opts.organizationId,
      });

      toolsExecuted.push({ name: tc.function.name, result: toolResult });

      messages.push({ role: 'assistant', content: null, tool_calls: [tc] });
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(toolResult),
      });
    }

    // Guard: iteration cap
    if (i === agent.maxIterations - 1) {
      finalContent = 'I reached the maximum reasoning steps. Here is my partial analysis based on available information.';
    }
  }

  return {
    agentId:     task.agentId,
    taskId:      task.id,
    content:     finalContent || 'No response generated',
    toolsUsed:   toolsExecuted.map(t => t.name),
    tokens:      totalTokens,
    latencyMs:   Date.now() - agentStart,
  };
}

// ─── Task Graph Executor ──────────────────────────────────────────────────────

/**
 * Execute a task DAG — runs independent tasks in parallel, respects dependsOn.
 */
async function executeGraph(plan, identity, conversationMessages, toolContext = {}) {
  // Get agentic RAG context for the overall query (shared across agents)
  let ragContext = '';
  try {
    const ragResult = await ragPipeline.agenticRetrieve(plan.tasks[0]?.description || '', {
      userId: identity.userId,
    });
    ragContext = ragResult.context;
  } catch { /* skip RAG on error */ }

  const completed = new Map();  // taskId → result
  const remaining = [...plan.tasks].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  // Execute in waves based on dependency resolution
  while (remaining.length > 0) {
    // Find tasks whose dependencies are all complete
    const ready = remaining.filter(t =>
      (t.dependsOn || []).every(dep => completed.has(dep))
    );

    if (ready.length === 0) {
      // Circular dependency guard
      console.warn('[MultiAgent] Unresolvable task dependencies, running remaining tasks anyway');
      ready.push(...remaining);
    }

    // Execute ready tasks in parallel
    const waveResults = await Promise.allSettled(
      ready.map(task => runAgent(task, identity, conversationMessages, ragContext, {
        cognitiveTier:      plan.cognitiveTier,
        cognitiveDecisionId: plan.cognitiveDecisionId,
        hospitalId: toolContext.hospitalId,
        organizationId: toolContext.organizationId,
      }))
    );

    for (let i = 0; i < ready.length; i++) {
      const task = ready[i];
      const outcome = waveResults[i];
      if (outcome.status === 'fulfilled') {
        completed.set(task.id, outcome.value);
      } else {
        console.error(`[MultiAgent] Task ${task.id} (${task.agentId}) failed:`, outcome.reason?.message);
        completed.set(task.id, {
          agentId: task.agentId, taskId: task.id,
          content: `[${task.agentId} agent encountered an error: ${outcome.reason?.message}]`,
          toolsUsed: [], tokens: 0, latencyMs: 0, error: true,
        });
      }
      remaining.splice(remaining.indexOf(task), 1);
    }
  }

  return Array.from(completed.values());
}

// ─── Result Aggregator ────────────────────────────────────────────────────────

/**
 * Merge multi-agent outputs into one final response.
 * For single-agent runs, returns the result directly.
 */
async function aggregateResults(agentResults, originalMessage, identity) {
  if (agentResults.length === 1) {
    return agentResults[0].content;
  }

  // Build aggregation prompt
  const agentOutputs = agentResults
    .filter(r => !r.error)
    .map(r => `=== ${r.agentId.toUpperCase()} AGENT ===\n${r.content}`)
    .join('\n\n');

  if (!agentOutputs) return 'All agents encountered errors processing this request.';

  const messages = [
    {
      role: 'system',
      content: `You are a synthesis AI. You receive outputs from ${agentResults.length} specialized agents.
Combine them into a single coherent, well-structured response.
- Do NOT repeat information
- Preserve critical clinical warnings
- Use clear headings if needed
- Keep the tone professional and appropriate for a healthcare platform`,
    },
    {
      role: 'user',
      content: `Original request: "${originalMessage}"\n\nAgent outputs:\n${agentOutputs}\n\nProvide a unified response:`,
    },
  ];

  const tierModel = _tierToProvider(getLLMTier(identity) === 'high' ? 'high' : 'standard');
  const synth = await llmProvider.chat({
    messages,
    maxTokens: 2048,
    skipCache: true,
    ...(tierModel ? { forceProvider: tierModel } : {}),
  });

  return synth.content;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Process a user request through the multi-agent system.
 *
 * @param {Object} options
 * @param {string}  options.message           - User's input message
 * @param {Object}  options.req               - Express request (for identity resolution)
 * @param {number}  [options.conversationId]  - Optional existing conversation ID
 * @param {Array}   [options.contextMessages] - Prior conversation messages
 * @param {string}  [options.forceAgent]      - Force a specific agent (bypasses planner, still checks permissions)
 * @returns {{ response, agentsUsed, taskPlan, totalTokens, latencyMs, identity }}
 */
export async function processRequest({ message, req, conversationId, contextMessages = [], forceAgent }) {
  await ensureDb();
  const runStart = Date.now();

  // 1. Resolve identity
  const identity = await resolveIdentity(req);

  // 2. Permission gate — must be able to execute at least one agent
  const available = getAvailableAgents(identity.capabilities);
  if (available.length === 0) {
    const err = new Error('No agents available for your role. Please authenticate with a valid account.');
    err.status = 403;
    throw err;
  }

  // 3. Plan tasks
  let plan;
  if (forceAgent) {
    const check = validateAgentAccess(forceAgent, identity);
    if (!check.allowed) {
      const err = new Error(check.reason);
      err.status = 403;
      throw err;
    }
    // Still classify for self-optimization tracking even with forceAgent
    const cog = await cognitiveRouter.classify(message, { userId: identity.userId }).catch(() => ({}));
    plan = {
      intent: forceAgent,
      isMultiAgent: false,
      tasks: [{ id: 't1', agentId: forceAgent, description: message, dependsOn: [] }],
      cognitiveTier: cog.tier,
      cognitiveDecisionId: cog.decisionId,
    };
  } else {
    plan = await planTasks(message, identity, contextMessages);
  }

  console.log(`[MultiAgent] Plan: intent=${plan.intent}, tasks=${plan.tasks.length}, agents=${plan.tasks.map(t => t.agentId).join(',')} (role=${identity.role})`);

  // 4. Execute task graph — enforce hard wall-clock timeout
  const timeoutError = new Error(`Agent run exceeded ${AGENT_RUN_TIMEOUT_MS}ms limit`);
  timeoutError.code = 'AGENT_TIMEOUT';
  timeoutError.status = 504;

  const hospitalId = req.hospitalId || req.user?.hospital_id || req.user?.tenant_id || req.user?.organization_id;
  const toolContext = { hospitalId, organizationId: hospitalId };

  const agentResults = await Promise.race([
    executeGraph(plan, identity, contextMessages, toolContext),
    new Promise((_, rej) => setTimeout(() => rej(timeoutError), AGENT_RUN_TIMEOUT_MS)),
  ]);
  const totalTokens = agentResults.reduce((s, r) => s + (r.tokens || 0), 0);

  // 5. Aggregate
  const finalResponse = await aggregateResults(agentResults, message, identity);

  const latencyMs = Date.now() - runStart;

  // 6. Audit log
  _auditLog({
    userId:        identity.userId,
    orgId:         identity.orgId,
    role:          identity.role,
    inputMessage:  message,
    taskPlan:      plan,
    agentsUsed:    [...new Set(agentResults.map(r => r.agentId))],
    finalResponse,
    status:        'success',
    totalTokens,
    latencyMs,
    conversationId,
  }).catch(err => console.error('[MultiAgent] Audit log error:', err.message));

  // 7. Evaluation telemetry (feeds self-optimizing weight updates)
  recordTelemetry({
    sessionId:          conversationId?.toString(),
    userId:             identity.userId,
    role:               identity.role,
    features:           plan.features || {},   // from cognitiveRouter.classify() → classify() returns features
    routeUsed:          plan.isMultiAgent ? 'dag' : 'agent',
    cognitiveTier:      plan.cognitiveTier,
    providerUsed:       agentResults[0]?.provider || 'agent',
    agentsUsed:         [...new Set(agentResults.map(r => r.agentId))],
    tokensUsed:         totalTokens,
    latencyMs,
    result:             { response: finalResponse, latencyMs },
    cognitiveDecisionId: plan.cognitiveDecisionId,
  }).catch(() => {});

  return {
    response:    finalResponse,
    agentsUsed:  agentResults.map(r => ({ id: r.agentId, tokens: r.tokens, tools: r.toolsUsed, latencyMs: r.latencyMs })),
    taskPlan:    plan,
    totalTokens,
    latencyMs,
    identity: { role: identity.role, source: identity.source },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _buildAgentSystemPrompt(agent, identity, ragContext) {
  const date = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  let prompt = `You are Mediczy's ${agent.name}.
Date: ${date}
User role: ${identity.role}
${agent.systemPromptSuffix}`;

  if (ragContext) {
    prompt += `\n\n${ragContext}`;
  }
  return prompt;
}

/** Map LLM tier string to provider name.
 * 'high' returns null so tool-using agents use the full cascade (iSHA→Groq→OpenAI)
 * instead of being locked to iSHA alone when iSHA is unavailable.
 */
function _tierToProvider(tier) {
  // Always return null to enable full cascade (iSHA→Groq→OpenAI).
  // Individual providers being down won't block agents anymore.
  return null;
}

async function _auditLog(data) {
  // Mask PHI before persisting audit record
  const safePlan = maskPhi(data.taskPlan);

  await pool.query(
    `INSERT INTO ai_agent_runs
       (user_id, org_id, role, input_message, task_plan, agents_used,
        final_response, status, error_message, total_tokens, latency_ms, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      data.userId,
      data.orgId,
      data.role,
      data.inputMessage?.substring(0, 2000),
      JSON.stringify(safePlan),
      data.agentsUsed,
      data.finalResponse?.substring(0, 5000),
      data.status,
      data.errorMessage || null,
      data.totalTokens,
      data.latencyMs,
      JSON.stringify({ conversationId: data.conversationId }),
    ]
  );
}

// ─── Admin / Introspection API ────────────────────────────────────────────────

/** List all agents the caller can invoke */
export function listAvailableAgents(identity) {
  return getAvailableAgents(identity.capabilities).map(a => ({
    id:          a.id,
    name:        a.name,
    icon:        a.icon,
    description: a.description,
    llmTier:     a.llmTier,
    maxTokens:   a.maxTokens,
    toolCount:   a.allowedTools.length,
  }));
}

/** Get run history for a user */
export async function getRunHistory(userId, limit = 20) {
  const { rows } = await pool.query(
    `SELECT run_id, role, input_message, agents_used, status, total_tokens, latency_ms, created_at
       FROM ai_agent_runs
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

export { processRequest as process };

export default { process: processRequest, listAvailableAgents, getRunHistory };
