/**
 * AI Brain Orchestrator
 * =====================
 * Core agentic loop implementing Thought → Action → Observation pattern.
 * 
 * Architecture:
 * 1. Load/create conversation
 * 2. Save user message
 * 3. Build system prompt with: user context, memory, conversation summary, RAG context
 * 4. Run agentic loop (max 8 iterations):
 *    - Call LLM with 15 tools
 *    - If tool_calls → execute each → feed results back → loop
 *    - If no tool_calls → final answer
 * 5. Save final assistant response
 * 6. Update user memory stats
 * 7. Return response + audit trail
 */

import pool from '../../db/pgPool.js';
import llmProvider from './llm-provider.js';
import { getActivePrompt } from '../prompt-optimization-executor.service.js';
import ragPipeline from './rag-pipeline.js';
import { getToolDefinitions, execute as executeTool } from './tools/loader.js';

const MAX_ITERATIONS = 8;
const MAX_CONVERSATION_MESSAGES = 20; // Keep last N messages for context

// ─── System Prompt Builder ──────────────────────────────────

async function buildSystemPrompt(userId, userType, conversationId) {
  const db = pool;
  const parts = [];

  // 1. Load prompt template (A/B + canary-aware: userId enables experiment routing)
  let systemText = await getActivePrompt('brain-system-prompt', userId).catch(() => null)
    ?? 'You are Dr. iSHA, an AI medical assistant for Mediczy healthcare platform.';

  // 2. User context
  let patientName = 'Unknown';
  try {
    const { rows: [patient] } = await db.query(
      `SELECT "firstName", "lastName" FROM patients WHERE id = $1`, [userId]
    );
    if (patient) patientName = `${patient.firstName || ''} ${patient.lastName || ''}`.trim();
  } catch { /* ignore if not a patient */ }

  // 3. User memory
  let memoryStr = 'No stored memory.';
  try {
    const { rows: [mem] } = await db.query(
      `SELECT facts, notes, preferences FROM ai_user_memory WHERE user_id = $1 AND user_type = $2`,
      [userId, userType]
    );
    if (mem) {
      const factsList = Object.entries(mem.facts || {}).map(([k, v]) => `- ${k}: ${v}`).join('\n');
      memoryStr = `Facts:\n${factsList || 'None'}\nNotes: ${mem.notes || 'None'}\nPreferences: ${JSON.stringify(mem.preferences || {})}`;
    }
  } catch { /* ignore */ }

  // 4. Conversation summary (from most recent messages)
  let convSummary = '';
  if (conversationId) {
    try {
      const { rows: [conv] } = await db.query(
        `SELECT summary FROM ai_brain_conversations WHERE id = $1`, [conversationId]
      );
      if (conv?.summary) convSummary = conv.summary;
    } catch { /* ignore */ }
  }

  // 5. Substitute template variables
  systemText = systemText
    .replace('{{current_date}}', new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))
    .replace('{{patient_name}}', patientName)
    .replace('{{patient_id}}', String(userId))
    .replace('{{user_memory}}', memoryStr)
    .replace('{{rag_context}}', '') // RAG injected per-message, not system-level
    .replace('{{conversation_summary}}', convSummary || 'New conversation');

  return systemText;
}

// ─── Conversation Management ────────────────────────────────

async function getOrCreateConversation(userId, userType, conversationId = null) {
  const db = pool;

  if (conversationId) {
    const { rows: [existing] } = await db.query(
      `SELECT * FROM ai_brain_conversations WHERE id = $1 AND user_id = $2`,
      [conversationId, userId]
    );
    if (existing) return existing;
  }

  // Create new conversation
  const { rows: [conv] } = await db.query(
    `INSERT INTO ai_brain_conversations (user_id, user_type, status)
     VALUES ($1, $2, 'active')
     RETURNING *`,
    [userId, userType]
  );

  return conv;
}

async function saveMessage(conversationId, role, content, extras = {}) {
  const db = pool;
  const { rows: [msg] } = await db.query(
    `INSERT INTO ai_brain_messages (conversation_id, role, content, tool_name, tool_input, tool_output, tokens, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, role, content, created_at`,
    [
      conversationId,
      role,
      content,
      extras.toolName || null,
      extras.toolInput ? JSON.stringify(extras.toolInput) : null,
      extras.toolOutput ? JSON.stringify(extras.toolOutput) : null,
      extras.tokens || 0,
      extras.metadata ? JSON.stringify(extras.metadata) : '{}'
    ]
  );
  return msg;
}

async function getConversationMessages(conversationId, limit = MAX_CONVERSATION_MESSAGES) {
  const db = pool;
  const { rows } = await db.query(
    `SELECT role, content, tool_name, tool_input, tool_output
     FROM ai_brain_messages
     WHERE conversation_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [conversationId, limit]
  );

  // Convert to OpenAI message format (reverse to chronological)
  return rows.reverse().map(m => {
    if (m.role === 'tool_call') {
      return {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: `call_${m.tool_name}`,
          type: 'function',
          function: { name: m.tool_name, arguments: JSON.stringify(m.tool_input || {}) }
        }]
      };
    }
    if (m.role === 'tool_result') {
      return {
        role: 'tool',
        tool_call_id: `call_${m.tool_name}`,
        content: JSON.stringify(m.tool_output || {})
      };
    }
    return { role: m.role === 'system' ? 'system' : m.role, content: m.content };
  });
}

// ─── Main Think Method ──────────────────────────────────────

/**
 * Main brain thinking method — agentic loop.
 *
 * @param {Object} params
 * @param {string} params.message - User's message
 * @param {number} params.userId
 * @param {string} [params.userType] - 'patient' | 'doctor' | 'admin'
 * @param {number} [params.conversationId] - Existing conversation to continue
 * @returns {Object} { response, conversationId, toolsUsed, tokensUsed, iterations, latencyMs }
 */
async function think({ message, userId, userType = 'patient', conversationId = null, onToolCall = null, onToolResult = null, onIteration = null }) {
  const startTime = Date.now();
  const db = pool;

  // 1. Get or create conversation
  const conversation = await getOrCreateConversation(userId, userType, conversationId);
  const convId = conversation.id;

  // 2. Save user message
  await saveMessage(convId, 'user', message);

  // 3. Build system prompt
  const systemPrompt = await buildSystemPrompt(userId, userType, convId);

  // 4. Agentic RAG: decide which sources to hit based on query intent
  let ragContext = '';
  let ragPlan = 'skipped';
  try {
    const ragResult = await ragPipeline.agenticRetrieve(message, {
      userId,
      conversationId: convId,
    });
    ragContext = ragResult.context;
    ragPlan = ragResult.plan;
    if (ragResult.retrieved > 0) {
      console.log(`[Brain] Agentic RAG: plan=${ragPlan}, retrieved=${ragResult.retrieved}, sources=${ragResult.sources.join(',')}`);
    }
  } catch (ragErr) {
    console.error('[Brain] Agentic RAG error:', ragErr.message);
  }

  // 5. Build messages array
  const historyMessages = await getConversationMessages(convId);
  const messages = [
    { role: 'system', content: systemPrompt + (ragContext ? `\n\n${ragContext}` : '') },
    ...historyMessages.filter(m => m.role !== 'system') // exclude old system messages
  ];

  // Ensure latest user message is included
  if (!messages.some(m => m.role === 'user' && m.content === message)) {
    messages.push({ role: 'user', content: message });
  }

  // 6. Agentic loop
  const tools = getToolDefinitions();
  const toolsUsed = [];
  let totalTokens = 0;
  let iterations = 0;
  let finalResponse = null;

  const seenToolCalls = new Set();
  let lastProvider = null;
  let lastModel = null;
  let lastCascade = [];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    iterations++;

    // Stream: notify iteration start
    if (onIteration) {
      try { onIteration(iterations); } catch (cbErr) { console.error('[Brain] onIteration callback error:', cbErr.message); }
    }

    const llmResult = await llmProvider.chat({
      messages,
      tools: tools.length > 0 ? tools : null,
      toolChoice: 'auto',
      conversationId: convId,
      skipCache: true,  // agentic loops must not be served from cache
    });

    totalTokens += llmResult.usage.totalTokens;
    lastProvider = llmResult.provider;
    lastModel = llmResult.model;
    lastCascade = llmResult.cascade || [];

    // If no tool calls → final answer
    if (!llmResult.toolCalls || llmResult.toolCalls.length === 0) {
      finalResponse = llmResult.content;
      break;
    }

    // Deduplicate: skip tool calls we've already seen with identical args
    const newToolCalls = llmResult.toolCalls.filter(tc => {
      const sig = `${tc.function.name}::${tc.function.arguments}`;
      if (seenToolCalls.has(sig)) return false;
      seenToolCalls.add(sig);
      return true;
    });

    // If ALL tool calls are duplicates, force final answer
    if (newToolCalls.length === 0) {
      finalResponse = llmResult.content || 'Based on the information I gathered, here is my response.';
      break;
    }

    // Process tool calls
    const assistantMsg = {
      role: 'assistant',
      content: llmResult.content || null,
      tool_calls: newToolCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.function.name, arguments: tc.function.arguments }
      }))
    };
    messages.push(assistantMsg);

    // Execute each tool
    for (const toolCall of newToolCalls) {
      const toolName = toolCall.function.name;
      let toolArgs = {};

      try {
        toolArgs = JSON.parse(toolCall.function.arguments || '{}');
      } catch {
        toolArgs = {};
      }

      // Stream: notify tool call start
      if (onToolCall) {
        try { onToolCall(toolName, toolArgs); } catch (cbErr) { console.error('[Brain] onToolCall callback error:', cbErr.message); }
      }

      const context = { userId, userType, conversationId: convId };
      const toolResult = await executeTool(toolName, toolArgs, context);

      const toolOutputSummary = typeof toolResult === 'string' ? toolResult.substring(0, 500) : JSON.stringify(toolResult).substring(0, 500);

      toolsUsed.push({
        name: toolName,
        input: toolArgs,
        output: toolOutputSummary
      });

      // Stream: notify tool result
      if (onToolResult) {
        try { onToolResult(toolName, toolOutputSummary); } catch (cbErr) { console.error('[Brain] onToolResult callback error:', cbErr.message); }
      }

      // Save tool call + result messages
      await saveMessage(convId, 'tool_call', null, {
        toolName,
        toolInput: toolArgs,
        metadata: { iteration: i + 1 }
      });

      await saveMessage(convId, 'tool_result', null, {
        toolName,
        toolOutput: toolResult,
        metadata: { iteration: i + 1 }
      });

      // Add to messages for next LLM call
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult)
      });
    }
  }

  // 7. If no final response after all iterations, force one
  if (!finalResponse) {
    const fallbackResult = await llmProvider.chat({
      messages: [
        ...messages,
        { role: 'user', content: 'Please provide your final answer based on all the information gathered above.' }
      ],
      tools: null, // No tools — force text response
      conversationId: convId
    });
    finalResponse = fallbackResult.content || "I've gathered the information but couldn't formulate a complete response. Please try rephrasing your question.";
    totalTokens += fallbackResult.usage.totalTokens;
  }

  // 8. Save assistant response
  await saveMessage(convId, 'assistant', finalResponse, { tokens: totalTokens });

  // 9. Update conversation stats
  await db.query(
    `UPDATE ai_brain_conversations SET
       message_count = message_count + 2,
       tool_call_count = tool_call_count + $1,
       token_count = token_count + $2,
       title = COALESCE(title, $3),
       updated_at = NOW()
     WHERE id = $4`,
    [
      toolsUsed.length,
      totalTokens,
      message.substring(0, 100), // Use first message as title
      convId
    ]
  );

  // 10. Update user memory stats
  await db.query(
    `INSERT INTO ai_user_memory (user_id, user_type, stats, last_interaction, updated_at)
     VALUES ($1, $2, '{"total_conversations": 1, "total_messages": 1, "total_tool_calls": 0}'::jsonb, NOW(), NOW())
     ON CONFLICT (user_id, user_type) DO UPDATE SET
       stats = jsonb_set(
         jsonb_set(
           ai_user_memory.stats,
           '{total_messages}',
           to_jsonb(COALESCE((ai_user_memory.stats->>'total_messages')::int, 0) + 1)
         ),
         '{total_tool_calls}',
         to_jsonb(COALESCE((ai_user_memory.stats->>'total_tool_calls')::int, 0) + $3)
       ),
       last_interaction = NOW(),
       updated_at = NOW()`,
    [userId, userType, toolsUsed.length]
  );

  const latencyMs = Date.now() - startTime;

  return {
    response: finalResponse,
    conversationId: convId,
    toolsUsed,
    iterations,
    tokensUsed: totalTokens,
    latencyMs,
    model: lastModel || 'unknown',
    provider: lastProvider || 'unknown',
    cascade: lastCascade
  };
}

// ─── Conversation API helpers ───────────────────────────────

async function listConversations(userId, userType = 'patient', limit = 20) {
  const db = pool;
  const { rows } = await db.query(
    `SELECT id, title, summary, message_count, tool_call_count, token_count, status, created_at, updated_at
     FROM ai_brain_conversations
     WHERE user_id = $1 AND user_type = $2 AND status != 'deleted'
     ORDER BY updated_at DESC
     LIMIT $3`,
    [userId, userType, limit]
  );
  return rows;
}

async function getConversation(conversationId, userId) {
  const db = pool;
  const { rows: [conv] } = await db.query(
    `SELECT * FROM ai_brain_conversations WHERE id = $1 AND user_id = $2`,
    [conversationId, userId]
  );
  if (!conv) return null;

  const { rows: messages } = await db.query(
    `SELECT id, role, content, tool_name, tool_input, tool_output, tokens, created_at
     FROM ai_brain_messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC`,
    [conversationId]
  );

  return { ...conv, messages };
}

async function deleteConversation(conversationId, userId) {
  const db = pool;
  const { rowCount } = await db.query(
    `UPDATE ai_brain_conversations SET status = 'deleted', updated_at = NOW()
     WHERE id = $1 AND user_id = $2`,
    [conversationId, userId]
  );
  return rowCount > 0;
}

async function getUserMemory(userId, userType = 'patient') {
  const db = pool;
  const { rows: [mem] } = await db.query(
    `SELECT * FROM ai_user_memory WHERE user_id = $1 AND user_type = $2`,
    [userId, userType]
  );
  return mem || { facts: {}, notes: '', preferences: {}, stats: {} };
}

async function getToolHistory(userId, limit = 50) {
  const db = pool;
  const { rows } = await db.query(
    `SELECT id, tool_name, tool_category, input_params, output_data, status, error_message, latency_ms, is_write, created_at
     FROM ai_tool_executions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

export default {
  think,
  listConversations,
  getConversation,
  deleteConversation,
  getUserMemory,
  getToolHistory
};
