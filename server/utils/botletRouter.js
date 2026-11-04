import { sibFetch as fetch } from '../services/sib-client.js';
/**
 * Botlet Router - Dynamic routing engine for autonomous botlets
 * 
 * Routes incoming queries to appropriate botlets based on:
 * - Intent classification confidence
 * - Botlet capabilities and availability
 * - Load balancing and performance metrics
 * - Escalation rules and fallback paths
 */

import intentClassifier from '../utils/intentClassifier.js';
import { ExampleBotlets } from '../schemas/botlet.schema.js';

const SIB_API_URL = process.env.SIB_API_URL || 'http://localhost:8001';

/**
 * ROUTING PSEUDOCODE
 * 
 * Main Routing Flow:
 * ==================
 * 
 * function routeQuery(query, userContext, sessionId):
 *   // Step 1: Intent Classification (Hybrid)
 *   classification = await classifyIntent(query, userContext.language)
 *   
 *   if classification.confidence < GLOBAL_MIN_CONFIDENCE:
 *     return routeToFallback(query, 'low_confidence')
 *   
 *   // Step 2: Find eligible botlets
 *   eligibleBotlets = findEligibleBotlets(
 *     classification.primary.intent,
 *     classification.confidence
 *   )
 *   
 *   if eligibleBotlets.length == 0:
 *     return routeToFallback(query, 'no_eligible_botlet')
 *   
 *   // Step 3: Score and rank botlets
 *   rankedBotlets = scoreAndRankBotlets(
 *     eligibleBotlets,
 *     classification,
 *     userContext
 *   )
 *   
 *   // Step 4: Select best botlet
 *   selectedBotlet = selectBotlet(rankedBotlets)
 *   
 *   // Step 5: Check botlet availability
 *   if !checkBotletAvailability(selectedBotlet):
 *     selectedBotlet = getNextAvailableBotlet(rankedBotlets)
 *   
 *   // Step 6: Route to selected botlet
 *   response = await routeToBotlet(
 *     selectedBotlet,
 *     query,
 *     classification,
 *     userContext,
 *     sessionId
 *   )
 *   
 *   // Step 7: Evaluate response quality
 *   if shouldEscalate(response, classification):
 *     return handleEscalation(
 *       selectedBotlet,
 *       query,
 *       response,
 *       classification
 *     )
 *   
 *   return response
 * 
 * 
 * Confidence-Based Routing:
 * =========================
 * 
 * function findEligibleBotlets(intentName, confidence):
 *   eligibleBotlets = []
 *   
 *   for botlet in registeredBotlets:
 *     if botlet.status != 'active':
 *       continue
 *     
 *     for intentConfig in botlet.intents:
 *       if intentConfig.intentName == intentName:
 *         // Check confidence thresholds
 *         if confidence >= intentConfig.minConfidence:
 *           if intentConfig.maxConfidence:
 *             if confidence <= intentConfig.maxConfidence:
 *               eligibleBotlets.push(botlet)
 *           else:
 *             eligibleBotlets.push(botlet)
 *   
 *   return eligibleBotlets
 * 
 * 
 * Botlet Scoring Algorithm:
 * ==========================
 * 
 * function scoreAndRankBotlets(botlets, classification, userContext):
 *   scoredBotlets = []
 *   
 *   for botlet in botlets:
 *     score = 0
 *     
 *     // Factor 1: Intent priority match (40% weight)
 *     intentConfig = botlet.getIntentConfig(classification.primary.intent)
 *     priorityScore = (5 - intentConfig.priority) * 20  // 0-100
 *     score += priorityScore * 0.4
 *     
 *     // Factor 2: Confidence alignment (30% weight)
 *     confidenceDelta = abs(classification.confidence - botlet.confidenceThresholds.preferred)
 *     confidenceScore = max(0, 100 - confidenceDelta)
 *     score += confidenceScore * 0.3
 *     
 *     // Factor 3: Historical performance (20% weight)
 *     if botlet.metrics.totalInteractions > 0:
 *       successRate = botlet.metrics.successfulResolutions / botlet.metrics.totalInteractions
 *       performanceScore = successRate * 100
 *       score += performanceScore * 0.2
 *     
 *     // Factor 4: Current load (10% weight)
 *     loadFactor = botlet.currentSessions / botlet.rateLimits.maxConcurrentSessions
 *     loadScore = (1 - loadFactor) * 100
 *     score += loadScore * 0.1
 *     
 *     // Bonus: Capability match
 *     if requiresCapability(userContext, botlet):
 *       score += 10
 *     
 *     scoredBotlets.push({
 *       botlet: botlet,
 *       score: score,
 *       breakdown: {
 *         priority: priorityScore,
 *         confidence: confidenceScore,
 *         performance: performanceScore,
 *         load: loadScore
 *       }
 *     })
 *   
 *   // Sort by score descending
 *   return scoredBotlets.sort((a, b) => b.score - a.score)
 * 
 * 
 * Escalation Handling:
 * ====================
 * 
 * function handleEscalation(botlet, query, response, classification):
 *   // Check if escalation is enabled
 *   if !botlet.escalation.enabled:
 *     return response  // Return as-is
 *   
 *   // Determine escalation trigger
 *   trigger = determineEscalationTrigger(response, classification)
 *   
 *   if !trigger in botlet.escalation.triggers:
 *     return response  // No matching trigger
 *   
 *   // Find escalation path
 *   escalationPath = botlet.escalation.escalationPath
 *   
 *   for tier in escalationPath:
 *     if evaluateEscalationCondition(tier.condition, query, response):
 *       if tier.targetType == 'botlet':
 *         // Route to another botlet
 *         targetBotlet = getBotletById(tier.targetId)
 *         return routeToBotlet(targetBotlet, query, classification, userContext)
 *       
 *       else if tier.targetType == 'human_agent':
 *         // Escalate to human
 *         return createHumanEscalation(tier.targetId, query, response, classification)
 *       
 *       else if tier.targetType == 'emergency':
 *         // Emergency escalation
 *         return createEmergencyEscalation(query, response, classification)
 *   
 *   // No matching tier - return original response
 *   return response
 * 
 * 
 * Confidence Threshold Decision Tree:
 * ====================================
 * 
 * function shouldEscalate(response, classification):
 *   confidence = classification.confidence
 *   
 *   // Critical intents - stricter thresholds
 *   if classification.primary.intent in ['emergency', 'pregnancy', 'mental_health']:
 *     if confidence < 70:
 *       return true, 'low_confidence_critical'
 *   
 *   // Standard intents - moderate thresholds
 *   else if classification.primary.intent in ['appointment', 'doctor_search']:
 *     if confidence < 50:
 *       return true, 'low_confidence_standard'
 *   
 *   // General intents - relaxed thresholds
 *   else:
 *     if confidence < 40:
 *       return true, 'low_confidence_general'
 *   
 *   // Check response quality
 *   if response.error or response.timeout:
 *     return true, 'response_error'
 *   
 *   if response.complexity > COMPLEXITY_THRESHOLD:
 *     return true, 'complex_query'
 *   
 *   return false, null
 * 
 * 
 * Load Balancing:
 * ===============
 * 
 * function selectBotlet(rankedBotlets):
 *   // Round-robin with load awareness
 *   
 *   // Filter overloaded botlets
 *   availableBotlets = rankedBotlets.filter(b => 
 *     b.botlet.currentSessions < b.botlet.rateLimits.maxConcurrentSessions
 *   )
 *   
 *   if availableBotlets.length == 0:
 *     // All botlets at capacity - use least loaded
 *     return rankedBotlets.sort((a, b) => 
 *       a.botlet.currentSessions - b.botlet.currentSessions
 *     )[0].botlet
 *   
 *   // Select highest scoring available botlet
 *   return availableBotlets[0].botlet
 * 
 * 
 * Fallback Routing:
 * =================
 * 
 * function routeToFallback(query, reason):
 *   switch reason:
 *     case 'low_confidence':
 *       // Use general medical consultant with low autonomy
 *       return routeToBotlet(
 *         getBotletById('medical-consultant'),
 *         query,
 *         { confidence: 20, intent: 'general_info' },
 *         userContext
 *       )
 *     
 *     case 'no_eligible_botlet':
 *       // Create human escalation request
 *       return createHumanEscalation(
 *         'general-support',
 *         query,
 *         null,
 *         { reason: 'no_matching_botlet' }
 *       )
 *     
 *     case 'all_botlets_unavailable':
 *       // Queue for later processing
 *       return queueForLater(query, userContext)
 *     
 *     default:
 *       // Generic error response
 *       return createErrorResponse('routing_failed', reason)
 */

class BotletRouter {
  constructor() {
    this.registeredBotlets = new Map();
    this.activeSessionMap = new Map(); // sessionId -> botletId
    this.performanceMetrics = new Map();
    
    // Global configuration
    this.config = {
      globalMinConfidence: 20,
      maxRetries: 2,
      routingTimeout: 10000,
      loadBalancingEnabled: true,
      stickySessionsEnabled: true, // Keep user with same botlet when possible
      escalationEnabled: true
    };
    
    // Initialize with example botlets
    this.registerBotlets(ExampleBotlets);
  }

  /**
   * Register botlets from configuration
   */
  registerBotlets(botlets) {
    for (const [key, botlet] of Object.entries(botlets)) {
      this.registeredBotlets.set(botlet.id, {
        ...botlet,
        currentSessions: 0,
        lastUsed: null
      });
    }
  }

  /**
   * Main routing method
   */
  async route(query, userContext = {}, sessionId = null) {
    try {
      // Step 1: Classify intent (hybrid mode)
      const classification = await this.classifyIntent(query, userContext.language);
      
      console.log('[BotletRouter] Classification:', {
        intent: classification.primary?.name,
        confidence: classification.confidence,
        method: classification.method
      });

      // Check minimum confidence
      if (!classification.primary || classification.primary.confidence < this.config.globalMinConfidence) {
        return this.routeToFallback(query, 'low_confidence', classification);
      }

      // Step 2: Check for sticky session
      if (this.config.stickySessionsEnabled && sessionId && this.activeSessionMap.has(sessionId)) {
        const stuckBotletId = this.activeSessionMap.get(sessionId);
        const stuckBotlet = this.registeredBotlets.get(stuckBotletId);
        
        // Verify botlet still handles this intent
        if (this.botletHandlesIntent(stuckBotlet, classification.primary.name)) {
          console.log('[BotletRouter] Using sticky session:', stuckBotletId);
          return this.routeToBotlet(stuckBotlet, query, classification, userContext, sessionId);
        }
      }

      // Step 3: Find eligible botlets
      const eligibleBotlets = this.findEligibleBotlets(
        classification.primary.name,
        classification.primary.confidence
      );

      if (eligibleBotlets.length === 0) {
        return this.routeToFallback(query, 'no_eligible_botlet', classification);
      }

      // Step 4: Score and rank
      const rankedBotlets = this.scoreAndRankBotlets(
        eligibleBotlets,
        classification,
        userContext
      );

      console.log('[BotletRouter] Ranked botlets:', 
        rankedBotlets.slice(0, 3).map(b => ({
          id: b.botlet.id,
          score: b.score.toFixed(2)
        }))
      );

      // Step 5: Select best botlet
      const selectedBotlet = this.selectBotlet(rankedBotlets);

      // Step 6: Route to botlet
      const response = await this.routeToBotlet(
        selectedBotlet,
        query,
        classification,
        userContext,
        sessionId
      );

      // Step 7: Check if escalation needed
      if (this.shouldEscalate(response, classification, selectedBotlet)) {
        return this.handleEscalation(selectedBotlet, query, response, classification, userContext);
      }

      return response;

    } catch (error) {
      console.error('[BotletRouter] Routing error:', error);
      return this.createErrorResponse('routing_error', error.message);
    }
  }

  /**
   * Classify intent using hybrid classifier with state management
   */
  async classifyIntent(query, language = 'en', sessionId = null, userContext = {}) {
    const detectedLanguage = language || intentClassifier.detectLanguage(query);
    
    // Use enhanced classifier with state management
    return await intentClassifier.classifyHybrid(query, detectedLanguage, sessionId, userContext);
  }

  /**
   * Find botlets that can handle this intent at this confidence level
   */
  findEligibleBotlets(intentName, confidence) {
    const eligible = [];

    for (const [botletId, botlet] of this.registeredBotlets.entries()) {
      if (botlet.status !== 'active') continue;

      for (const intentConfig of botlet.intents) {
        if (intentConfig.intentName === intentName) {
          // Check confidence range
          if (confidence >= intentConfig.minConfidence) {
            if (intentConfig.maxConfidence) {
              if (confidence <= intentConfig.maxConfidence) {
                eligible.push(botlet);
              }
            } else {
              eligible.push(botlet);
            }
          }
        }
      }
    }

    return eligible;
  }

  /**
   * Score and rank botlets by suitability
   */
  scoreAndRankBotlets(botlets, classification, userContext) {
    const scored = botlets.map(botlet => {
      let score = 0;
      const breakdown = {};

      // Factor 1: Intent priority (40% weight)
      const intentConfig = botlet.intents.find(
        i => i.intentName === classification.primary.name
      );
      const priorityScore = (5 - (intentConfig?.priority || 5)) * 20;
      score += priorityScore * 0.4;
      breakdown.priority = priorityScore;

      // Factor 2: Confidence alignment (30% weight)
      const preferredConf = botlet.confidenceThresholds.preferred;
      const confidenceDelta = Math.abs(classification.primary.confidence - preferredConf);
      const confidenceScore = Math.max(0, 100 - confidenceDelta);
      score += confidenceScore * 0.3;
      breakdown.confidence = confidenceScore;

      // Factor 3: Performance (20% weight)
      let performanceScore = 50; // Default
      if (botlet.metrics?.totalInteractions > 0) {
        const successRate = botlet.metrics.successfulResolutions / botlet.metrics.totalInteractions;
        performanceScore = successRate * 100;
      }
      score += performanceScore * 0.2;
      breakdown.performance = performanceScore;

      // Factor 4: Load (10% weight)
      const loadFactor = botlet.currentSessions / (botlet.rateLimits?.maxConcurrentSessions || 100);
      const loadScore = (1 - loadFactor) * 100;
      score += loadScore * 0.1;
      breakdown.load = loadScore;

      return {
        botlet,
        score,
        breakdown
      };
    });

    return scored.sort((a, b) => b.score - a.score);
  }

  /**
   * Select best available botlet
   */
  selectBotlet(rankedBotlets) {
    // Filter out overloaded botlets
    const available = rankedBotlets.filter(b =>
      b.botlet.currentSessions < (b.botlet.rateLimits?.maxConcurrentSessions || 100)
    );

    if (available.length === 0) {
      // All at capacity - use least loaded
      return rankedBotlets.sort((a, b) =>
        a.botlet.currentSessions - b.botlet.currentSessions
      )[0].botlet;
    }

    return available[0].botlet;
  }

  /**
   * Route query to specific botlet by calling the SIB FastAPI.
   * Maps botlet type → SIB request_type and dispatches the request.
   */
  async routeToBotlet(botlet, query, classification, userContext, sessionId) {
    console.log(`[BotletRouter] Routing to botlet: ${botlet.id} (${botlet.type})`);

    if (sessionId && this.config.stickySessionsEnabled) {
      this.activeSessionMap.set(sessionId, botlet.id);
    }

    botlet.currentSessions++;

    try {
      // Map botlet type → SIB request_type
      const typeMap = {
        triage:      'triage',
        scheduler:   'task',
        consultant:  'chat',
        insurance:   'insurance',
        risk:        'risk',
        summarizer:  'summarize',
        search:      'web_search',
        ehr:         'ehr_upload',
        notify:      'notify',
      };
      const requestType = typeMap[botlet.type] || 'chat';

      const payload = {
        request_type: requestType,
        data: {
          message:    query,
          query:      query,
          patient_id: userContext.patientId || userContext.userId,
          user_id:    userContext.userId,
          intent:     classification.primary?.name,
          context:    userContext,
        },
      };

      const res = await fetch(`${SIB_API_URL}/process`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
        signal:  AbortSignal.timeout(this.config.routingTimeout),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`SIB returned ${res.status}: ${errText.slice(0, 200)}`);
      }

      const sibResponse = await res.json();

      this.updateMetrics(botlet.id, true);

      return {
        success:    true,
        botletId:   botlet.id,
        botletName: botlet.name,
        intent:     classification.primary?.name,
        confidence: classification.primary?.confidence,
        answer:     sibResponse.answer || sibResponse.chat_answer,
        data:       sibResponse,
        timestamp:  new Date().toISOString(),
      };

    } catch (error) {
      console.error(`[BotletRouter] Botlet ${botlet.id} error:`, error.message);
      this.updateMetrics(botlet.id, false);
      throw error;

    } finally {
      botlet.currentSessions--;
    }
  }

  /**
   * Check if escalation is needed
   */
  shouldEscalate(response, classification, botlet) {
    if (!this.config.escalationEnabled || !botlet.escalation?.enabled) {
      return false;
    }

    const confidence = classification.primary.confidence;
    const intent = classification.primary.name;

    // Critical intents - strict thresholds
    if (['emergency', 'pregnancy', 'mental_health'].includes(intent)) {
      if (confidence < 70) return true;
    }

    // Standard intents
    else if (['appointment', 'doctor_search'].includes(intent)) {
      if (confidence < 50) return true;
    }

    // General intents
    else {
      if (confidence < 40) return true;
    }

    // Check response quality
    if (response.error || response.timeout) {
      return true;
    }

    return false;
  }

  /**
   * Handle escalation
   */
  async handleEscalation(botlet, query, response, classification, userContext) {
    console.log(`[BotletRouter] Escalating from ${botlet.id}`);

    if (!botlet.escalation?.escalationPath || botlet.escalation.escalationPath.length === 0) {
      return response; // No escalation path defined
    }

    // Find matching escalation tier
    for (const tier of botlet.escalation.escalationPath) {
      if (tier.targetType === 'botlet') {
        const targetBotlet = this.registeredBotlets.get(tier.targetId);
        if (targetBotlet) {
          return this.routeToBotlet(targetBotlet, query, classification, userContext);
        }
      } else if (tier.targetType === 'human_agent') {
        return this.createHumanEscalation(tier.targetId, query, response, classification);
      } else if (tier.targetType === 'emergency') {
        return this.createEmergencyEscalation(query, response, classification);
      }
    }

    return response;
  }

  /**
   * Route to fallback
   */
  routeToFallback(query, reason, classification) {
    console.log(`[BotletRouter] Fallback routing: ${reason}`);

    return {
      success: false,
      fallback: true,
      reason: reason,
      query: query,
      classification: classification,
      message: 'Your query has been queued for manual review',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Helper: Check if botlet handles intent
   */
  botletHandlesIntent(botlet, intentName) {
    return botlet.intents.some(i => i.intentName === intentName);
  }

  /**
   * Helper: Update performance metrics
   */
  updateMetrics(botletId, success) {
    const botlet = this.registeredBotlets.get(botletId);
    if (!botlet.metrics) {
      botlet.metrics = {
        totalInteractions: 0,
        successfulResolutions: 0,
        escalations: 0
      };
    }

    botlet.metrics.totalInteractions++;
    if (success) {
      botlet.metrics.successfulResolutions++;
    }
  }

  /**
   * Create human escalation
   */
  createHumanEscalation(targetId, query, response, classification) {
    return {
      success: true,
      escalated: true,
      escalationType: 'human_agent',
      targetId: targetId,
      query: query,
      classification: classification,
      previousResponse: response,
      message: 'Your query has been escalated to a human agent',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create emergency escalation
   */
  createEmergencyEscalation(query, response, classification) {
    return {
      success: true,
      escalated: true,
      escalationType: 'emergency',
      priority: 'critical',
      query: query,
      classification: classification,
      message: 'Emergency services have been alerted',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create error response
   */
  createErrorResponse(errorType, errorMessage) {
    return {
      success: false,
      error: true,
      errorType: errorType,
      message: errorMessage,
      timestamp: new Date().toISOString()
    };
  }
}

export default BotletRouter;
