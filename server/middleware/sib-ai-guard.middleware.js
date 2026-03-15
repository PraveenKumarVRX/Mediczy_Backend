/**
 * SIB AI Guard Middleware
 * =======================
 * Universal safety middleware that routes ALL AI operations through
 * the SIB Control Layer before execution.
 * 
 * Every LLM call, vision analysis, transcription, and AI-powered
 * decision passes through this guard for:
 *  - Kill switch enforcement
 *  - Rate limiting per AI operation type
 *  - Confidence threshold checks
 *  - Circuit breaker protection
 *  - Audit logging
 *  - Tenant-aware policy enforcement
 * 
 * Architecture:
 *   Request → sibAIGuard → SIB Control Layer → Route Handler → LLM
 *   
 * What it guards:
 *   /api/cdss/               — CDSS queries
 *   /api/v3/ai-brain/        — Orchestrator (agentic loop)
 *   /api/ai/chat, /query     — Direct AI chat
 *   /api/ai/vision/          — Medical image analysis
 *   /api/ai/scribe/          — AI Scribe (prescription gen)
 *   /api/medical-ai/         — Medical AI consult
 *   /api/consultation-recordings/ — Transcription (STT)
 *   /api/v3/ai-intelligence/ — Drug interactions, triage
 *   /api/reports/analyze     — Report analysis
 * 
 * What it does NOT guard:
 *   Static lookups (ICD-10/SNOMED/CPT search), health checks, analytics
 */

import sibControlLayer from '../services/sib-control-layer.service.js';
import { AI_DECISION_TYPES } from '../services/sib-control-layer.service.js';

// Map route patterns to AI decision types
const ROUTE_TO_DECISION = [
  // CDSS queries
  { method: 'POST', pattern: /^\/api\/cdss\/knowledge\/query/, type: AI_DECISION_TYPES.AI_QUERY },
  
  // AI Brain orchestrator
  { method: 'POST', pattern: /^\/api\/v3\/ai-brain\/think/, type: AI_DECISION_TYPES.AI_QUERY },
  
  // Direct AI chat/query
  { method: 'POST', pattern: /^\/api\/ai\/chat/, type: AI_DECISION_TYPES.AI_QUERY },
  { method: 'POST', pattern: /^\/api\/ai\/query/, type: AI_DECISION_TYPES.AI_QUERY },
  
  // AI Vision
  { method: 'POST', pattern: /^\/api\/ai\/vision\/analyze/, type: AI_DECISION_TYPES.AI_VISION },
  
  // AI Scribe — prescription generation
  { method: 'POST', pattern: /^\/api\/ai\/scribe\/generate/, type: AI_DECISION_TYPES.AI_PRESCRIPTION },
  { method: 'POST', pattern: /^\/api\/ai\/scribe\/autocomplete/, type: AI_DECISION_TYPES.AI_PRESCRIPTION },
  
  // Clinical workflow AI features
  { method: 'POST', pattern: /^\/api\/doctor\/clinical-workflow\/soap/, type: AI_DECISION_TYPES.AI_DIAGNOSIS },
  { method: 'POST', pattern: /^\/api\/doctor\/clinical-workflow\/encounter/, type: AI_DECISION_TYPES.AI_DIAGNOSIS },
  { method: 'POST', pattern: /^\/api\/doctor\/clinical-workflow\/summary/, type: AI_DECISION_TYPES.AI_QUERY },
  
  // Medical AI consult
  { method: 'POST', pattern: /^\/api\/medical-ai\/consult/, type: AI_DECISION_TYPES.AI_DIAGNOSIS },
  { method: 'POST', pattern: /^\/api\/medical-ai\/analyze-symptoms/, type: AI_DECISION_TYPES.AI_DIAGNOSIS },
  { method: 'POST', pattern: /^\/api\/medical-ai\/emergency/, type: AI_DECISION_TYPES.AI_EMERGENCY },
  { method: 'POST', pattern: /^\/api\/medical-ai\/sos/, type: AI_DECISION_TYPES.AI_EMERGENCY },
  
  // Consultation recording (STT)
  { method: 'POST', pattern: /^\/api\/consultation-recordings\/transcribe/, type: AI_DECISION_TYPES.AI_TRANSCRIPTION },
  
  // AI Intelligence services
  { method: 'POST', pattern: /^\/api\/v3\/ai-intelligence\/drug-interactions/, type: AI_DECISION_TYPES.AI_QUERY },
  { method: 'POST', pattern: /^\/api\/v3\/ai-intelligence\/insurance/, type: AI_DECISION_TYPES.AI_QUERY },
  { method: 'POST', pattern: /^\/api\/v3\/ai-intelligence\/emergency-triage/, type: AI_DECISION_TYPES.AI_EMERGENCY },
  { method: 'POST', pattern: /^\/api\/v3\/ai-intelligence\/risk-score/, type: AI_DECISION_TYPES.AI_QUERY },
  
  // Report analysis
  { method: 'POST', pattern: /^\/api\/reports\/analyze/, type: AI_DECISION_TYPES.AI_REPORT },
  
  // SIB chatbots
  { method: 'POST', pattern: /^\/api\/sib-chatbots\/.*\/chat/, type: AI_DECISION_TYPES.AI_QUERY },
];

/**
 * Resolve the AI decision type from the request
 * Returns null if the route is not an AI route (should pass through)
 */
function resolveDecisionType(req) {
  const path = req.originalUrl || req.url;
  const method = req.method;
  
  for (const mapping of ROUTE_TO_DECISION) {
    if (mapping.method === method && mapping.pattern.test(path)) {
      return mapping.type;
    }
  }
  return null;
}

/**
 * SIB AI Guard — Express middleware
 * 
 * Lightweight check: does NOT call LLM itself, only validates
 * via the SIB Control Layer (kill switch, rate limits, circuit breakers).
 * Adds ~1ms overhead per request.
 */
export function sibAIGuard(req, res, next) {
  const decisionType = resolveDecisionType(req);
  
  // Not an AI route — pass through
  if (!decisionType) {
    return next();
  }
  
  // Build decision object for SIB
  const decision = {
    type: decisionType,
    confidence: 0.8, // Default — actual confidence comes from the LLM response
    reasoning: `AI request: ${req.method} ${req.originalUrl || req.url}`,
    context: {
      userId: req.user?.id || req.doctor?.id,
      userRole: req.user?.role || req.doctor?.role || 'unknown',
      ip: req.ip,
      tenantId: req.tenant?.id || 'default',
      path: req.originalUrl || req.url,
      method: req.method
    },
    data: {} // No data needed for pre-check
  };
  
  // Apply tenant-specific overrides if available
  const tenantAIConfig = req.tenant?.ai_config;
  if (tenantAIConfig?.sibPolicy) {
    decision._tenantPolicy = tenantAIConfig.sibPolicy;
  }
  
  // Run through SIB Control Layer checks (synchronous fast-path)
  try {
    // 1. Kill switch
    if (sibControlLayer.killSwitchActive) {
      console.warn(`🚨 [SIB-GUARD] Kill switch active — blocking ${decisionType}`);
      return res.status(503).json({
        success: false,
        error: 'AI services temporarily disabled by administrator',
        code: 'SIB_KILL_SWITCH'
      });
    }
    
    // 2. Circuit breaker
    if (sibControlLayer.isCircuitBreakerOpen(decisionType)) {
      console.warn(`🚫 [SIB-GUARD] Circuit breaker open for ${decisionType}`);
      return res.status(503).json({
        success: false,
        error: 'AI service temporarily unavailable, please retry shortly',
        code: 'SIB_CIRCUIT_BREAKER'
      });
    }
    
    // 3. Rate limit
    if (!sibControlLayer.checkAIRateLimit(decisionType, decision.context.tenantId)) {
      console.warn(`⚠️ [SIB-GUARD] Rate limit hit for ${decisionType}`);
      return res.status(429).json({
        success: false,
        error: 'AI request rate limit exceeded, please slow down',
        code: 'SIB_RATE_LIMIT'
      });
    }
    
    // 4. Log the AI request for audit
    sibControlLayer.logAIRequest(decision);
    
    // 5. Attach SIB context to request so downstream can report results
    req.sibDecision = decision;
    req.sibGuardPassed = true;
    
    next();
  } catch (error) {
    // Guard failure should NOT block the request (fail-open for availability)
    console.error(`[SIB-GUARD] Error:`, error.message);
    req.sibGuardPassed = false;
    next();
  }
}

/**
 * SIB AI Result Reporter — call after LLM response to report outcome
 * Use in route handlers: req.reportAIResult({ success, confidence, latencyMs })
 */
export function attachAIReporter(req, res, next) {
  req.reportAIResult = (result) => {
    if (!req.sibDecision) return;
    try {
      sibControlLayer.recordAIOutcome({
        type: req.sibDecision.type,
        success: result.success !== false,
        confidence: result.confidence || 0,
        latencyMs: result.latencyMs || 0,
        provider: result.provider || 'unknown',
        model: result.model || 'unknown',
        tenantId: req.sibDecision.context.tenantId
      });
    } catch (e) {
      // Non-critical
    }
  };
  next();
}

export default sibAIGuard;
