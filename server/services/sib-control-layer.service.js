/**
 * Synthetic Intelligence Brain (SIB) Control Layer
 * 
 * Architecture:
 * Kafka (sensors) → SIB Brain (reasoning) → BullMQ (motor system)
 * 
 * This layer provides:
 * - Safety guardrails (prevent VIKI-style runaway AI)
 * - Policy enforcement
 * - Human oversight & kill switch
 * - Decision logging & auditability
 * - Rate limiting & circuit breaking
 * - Explainable AI decisions
 * 
 * Design Principles:
 * ❌ Brain should NOT:
 *    - Directly control workers
 *    - Bypass Kafka
 *    - Execute jobs itself
 *    - Self-deploy or self-modify without guardrails
 * 
 * ✅ Brain SHOULD:
 *    - Be observable
 *    - Be stateless or softly stateful
 *    - Be auditable
 *    - Have hard limits
 *    - Produce explainable decisions
 */

import { EventEmitter } from 'events';
import { addJob } from '../config/queues.js';
import { publishEvent, KAFKA_TOPICS } from '../config/kafka.js';

// Decision types SIB can make
export const DECISION_TYPES = {
  SEND_NOTIFICATION: 'send_notification',
  SCHEDULE_APPOINTMENT: 'schedule_appointment',
  GENERATE_REPORT: 'generate_report',
  TRIGGER_ALERT: 'trigger_alert',
  UPDATE_RECOMMENDATION: 'update_recommendation',
  ESCALATE_EMERGENCY: 'escalate_emergency',
  ANALYZE_HEALTH_TREND: 'analyze_health_trend',
  OPTIMIZE_WORKFLOW: 'optimize_workflow'
};

// Safety policy rules
const SAFETY_POLICIES = {
  // Rate limits (max decisions per hour)
  RATE_LIMITS: {
    [DECISION_TYPES.SEND_NOTIFICATION]: 100,
    [DECISION_TYPES.TRIGGER_ALERT]: 50,
    [DECISION_TYPES.ESCALATE_EMERGENCY]: 20,
    [DECISION_TYPES.SCHEDULE_APPOINTMENT]: 200,
    [DECISION_TYPES.GENERATE_REPORT]: 50,
    [DECISION_TYPES.UPDATE_RECOMMENDATION]: 500,
    [DECISION_TYPES.ANALYZE_HEALTH_TREND]: 1000,
    [DECISION_TYPES.OPTIMIZE_WORKFLOW]: 10
  },
  
  // Decisions requiring human approval
  REQUIRE_HUMAN_APPROVAL: [
    DECISION_TYPES.ESCALATE_EMERGENCY,
    DECISION_TYPES.OPTIMIZE_WORKFLOW
  ],
  
  // Minimum confidence threshold (0-1)
  MIN_CONFIDENCE: {
    [DECISION_TYPES.SEND_NOTIFICATION]: 0.7,
    [DECISION_TYPES.TRIGGER_ALERT]: 0.8,
    [DECISION_TYPES.ESCALATE_EMERGENCY]: 0.95,
    [DECISION_TYPES.SCHEDULE_APPOINTMENT]: 0.85,
    [DECISION_TYPES.GENERATE_REPORT]: 0.6,
    [DECISION_TYPES.UPDATE_RECOMMENDATION]: 0.75,
    [DECISION_TYPES.ANALYZE_HEALTH_TREND]: 0.5,
    [DECISION_TYPES.OPTIMIZE_WORKFLOW]: 0.9
  }
};

class SIBControlLayer extends EventEmitter {
  constructor() {
    super();
    this.killSwitchActive = false;
    this.decisionLog = [];
    this.rateLimitCounters = {};
    this.humanOverrides = new Map();
    this.circuitBreakers = new Map();
    
    // Initialize rate limit counters
    Object.keys(DECISION_TYPES).forEach(type => {
      this.rateLimitCounters[DECISION_TYPES[type]] = {
        count: 0,
        resetTime: Date.now() + 3600000 // Reset every hour
      };
    });
    
    // Reset rate limits every hour
    setInterval(() => this.resetRateLimits(), 3600000);
    
    console.log('🧠 SIB Control Layer initialized with safety guardrails');
  }

  /**
   * KILL SWITCH - Emergency stop all AI decisions
   */
  activateKillSwitch(reason, activatedBy) {
    this.killSwitchActive = true;
    const event = {
      type: 'KILL_SWITCH_ACTIVATED',
      reason,
      activatedBy,
      timestamp: new Date().toISOString()
    };
    
    this.logDecision(event);
    this.emit('killSwitch', event);
    
    console.error('🚨 KILL SWITCH ACTIVATED:', reason, 'by', activatedBy);
    
    // Publish to Kafka for monitoring
    publishEvent(KAFKA_TOPICS.SYSTEM_EVENTS, {
      event: 'SIB_KILL_SWITCH',
      ...event
    }).catch(err => console.error('Failed to publish kill switch event:', err));
  }

  /**
   * Deactivate kill switch (requires human authorization)
   */
  deactivateKillSwitch(authorizedBy, authToken) {
    // TODO: Implement proper authorization check
    if (!authToken || authToken !== process.env.SIB_ADMIN_TOKEN) {
      throw new Error('Unauthorized: Kill switch deactivation requires admin token');
    }
    
    this.killSwitchActive = false;
    const event = {
      type: 'KILL_SWITCH_DEACTIVATED',
      authorizedBy,
      timestamp: new Date().toISOString()
    };
    
    this.logDecision(event);
    this.emit('killSwitchDeactivated', event);
    
    console.log('✅ Kill switch deactivated by', authorizedBy);
  }

  /**
   * Process SIB decision with safety checks
   * 
   * @param {Object} decision - Brain's decision
   * @param {string} decision.type - Decision type
   * @param {Object} decision.data - Decision data
   * @param {number} decision.confidence - Confidence score (0-1)
   * @param {string} decision.reasoning - Explanation of decision
   * @param {Object} decision.context - Context that led to decision
   * @returns {Object} - Execution result
   */
  async processDecision(decision) {
    const startTime = Date.now();
    
    try {
      // 1. Kill switch check
      if (this.killSwitchActive) {
        throw new Error('Kill switch active - all AI decisions blocked');
      }
      
      // 2. Validate decision structure
      this.validateDecision(decision);
      
      // 3. Check circuit breaker
      if (this.isCircuitBreakerOpen(decision.type)) {
        throw new Error(`Circuit breaker open for ${decision.type}`);
      }
      
      // 4. Rate limit check
      if (!this.checkRateLimit(decision.type)) {
        throw new Error(`Rate limit exceeded for ${decision.type}`);
      }
      
      // 5. Confidence threshold check
      if (!this.meetsConfidenceThreshold(decision)) {
        throw new Error(`Confidence ${decision.confidence} below threshold for ${decision.type}`);
      }
      
      // 6. Policy enforcement
      if (!this.passesPolicy(decision)) {
        throw new Error(`Decision violates safety policy: ${decision.type}`);
      }
      
      // 7. Human approval check
      if (this.requiresHumanApproval(decision.type)) {
        return await this.requestHumanApproval(decision);
      }
      
      // 8. Log decision (for auditability)
      this.logDecision({
        ...decision,
        status: 'approved',
        timestamp: new Date().toISOString()
      });
      
      // 9. Execute via BullMQ (motor system)
      const result = await this.executeDecision(decision);
      
      // 10. Publish decision to Kafka (observability)
      await this.publishDecisionEvent(decision, result);
      
      // 11. Update metrics
      this.updateMetrics(decision, result, Date.now() - startTime);
      
      return {
        success: true,
        decision,
        result,
        executionTime: Date.now() - startTime
      };
      
    } catch (error) {
      // Log failure
      this.logDecision({
        ...decision,
        status: 'rejected',
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      // Trip circuit breaker if too many failures
      this.recordFailure(decision.type);
      
      console.error(`❌ SIB decision rejected:`, error.message);
      
      return {
        success: false,
        decision,
        error: error.message,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Validate decision structure
   */
  validateDecision(decision) {
    if (!decision.type) {
      throw new Error('Decision type is required');
    }
    
    if (!Object.values(DECISION_TYPES).includes(decision.type)) {
      throw new Error(`Unknown decision type: ${decision.type}`);
    }
    
    if (typeof decision.confidence !== 'number' || decision.confidence < 0 || decision.confidence > 1) {
      throw new Error('Confidence must be a number between 0 and 1');
    }
    
    if (!decision.reasoning) {
      throw new Error('Decision must include reasoning (explainability required)');
    }
    
    if (!decision.context) {
      throw new Error('Decision must include context');
    }
  }

  /**
   * Check rate limits
   */
  checkRateLimit(decisionType) {
    const counter = this.rateLimitCounters[decisionType];
    const limit = SAFETY_POLICIES.RATE_LIMITS[decisionType];
    
    // Reset if needed
    if (Date.now() > counter.resetTime) {
      counter.count = 0;
      counter.resetTime = Date.now() + 3600000;
    }
    
    if (counter.count >= limit) {
      console.warn(`⚠️  Rate limit exceeded for ${decisionType}: ${counter.count}/${limit}`);
      return false;
    }
    
    counter.count++;
    return true;
  }

  /**
   * Check confidence threshold
   */
  meetsConfidenceThreshold(decision) {
    const minConfidence = SAFETY_POLICIES.MIN_CONFIDENCE[decision.type];
    return decision.confidence >= minConfidence;
  }

  /**
   * Check if decision requires human approval
   */
  requiresHumanApproval(decisionType) {
    return SAFETY_POLICIES.REQUIRE_HUMAN_APPROVAL.includes(decisionType);
  }

  /**
   * Request human approval (placeholder - implement with real approval system)
   */
  async requestHumanApproval(decision) {
    console.log('👤 Human approval required for:', decision.type);
    
    // Emit event for approval UI
    this.emit('humanApprovalRequired', decision);
    
    // Store pending decision
    const approvalId = `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.humanOverrides.set(approvalId, {
      decision,
      status: 'pending',
      requestedAt: new Date().toISOString()
    });
    
    return {
      success: false,
      pending: true,
      approvalId,
      message: 'Decision requires human approval'
    };
  }

  /**
   * Approve pending decision (called by human operator)
   */
  async approveDecision(approvalId, approvedBy, comments) {
    const pending = this.humanOverrides.get(approvalId);
    if (!pending) {
      throw new Error('Approval ID not found');
    }
    
    pending.status = 'approved';
    pending.approvedBy = approvedBy;
    pending.comments = comments;
    pending.approvedAt = new Date().toISOString();
    
    console.log(`✅ Decision approved by ${approvedBy}:`, pending.decision.type);
    
    // Execute approved decision
    return await this.executeDecision(pending.decision);
  }

  /**
   * Reject pending decision
   */
  rejectDecision(approvalId, rejectedBy, reason) {
    const pending = this.humanOverrides.get(approvalId);
    if (!pending) {
      throw new Error('Approval ID not found');
    }
    
    pending.status = 'rejected';
    pending.rejectedBy = rejectedBy;
    pending.reason = reason;
    pending.rejectedAt = new Date().toISOString();
    
    console.log(`❌ Decision rejected by ${rejectedBy}:`, pending.decision.type);
    this.humanOverrides.delete(approvalId);
  }

  /**
   * Execute decision via BullMQ (motor system)
   */
  async executeDecision(decision) {
    const { type, data } = decision;
    
    try {
      let queueName, jobName;
      
      // Map decision to appropriate BullMQ queue
      switch (type) {
        case DECISION_TYPES.SEND_NOTIFICATION:
          queueName = 'notifications';
          jobName = 'send-notification';
          break;
          
        case DECISION_TYPES.SCHEDULE_APPOINTMENT:
          queueName = 'notifications';
          jobName = 'schedule-appointment-reminder';
          break;
          
        case DECISION_TYPES.GENERATE_REPORT:
          queueName = 'reports';
          jobName = 'generate-health-report';
          break;
          
        case DECISION_TYPES.TRIGGER_ALERT:
          queueName = 'notifications';
          jobName = 'send-alert';
          break;
          
        case DECISION_TYPES.ESCALATE_EMERGENCY:
          queueName = 'notifications';
          jobName = 'emergency-escalation';
          break;
          
        case DECISION_TYPES.ANALYZE_HEALTH_TREND:
          queueName = 'analytics';
          jobName = 'analyze-trend';
          break;
          
        default:
          throw new Error(`No queue mapping for decision type: ${type}`);
      }
      
      // Add job to BullMQ with decision context
      const job = await addJob(queueName, jobName, {
        ...data,
        sibDecision: {
          type,
          confidence: decision.confidence,
          reasoning: decision.reasoning
        }
      });
      
      console.log(`🎯 Decision executed via BullMQ: ${type} (Job ${job.id})`);
      
      return {
        jobId: job.id,
        queue: queueName,
        jobName
      };
      
    } catch (error) {
      console.error(`Failed to execute decision ${type}:`, error);
      throw error;
    }
  }

  /**
   * Policy enforcement (override point for custom rules)
   */
  passesPolicy(decision) {
    // Add custom policy rules here
    // Example: Block notifications between 10 PM - 7 AM
    if (decision.type === DECISION_TYPES.SEND_NOTIFICATION) {
      const hour = new Date().getHours();
      if (hour >= 22 || hour < 7) {
        console.warn('⚠️  Policy violation: No notifications during quiet hours (10PM-7AM)');
        return false;
      }
    }
    
    return true;
  }

  /**
   * Circuit breaker pattern
   */
  isCircuitBreakerOpen(decisionType) {
    const breaker = this.circuitBreakers.get(decisionType);
    if (!breaker) return false;
    
    // Reset if cooldown period passed
    if (Date.now() > breaker.resetTime) {
      this.circuitBreakers.delete(decisionType);
      return false;
    }
    
    return breaker.open;
  }

  recordFailure(decisionType) {
    const breaker = this.circuitBreakers.get(decisionType) || {
      failures: 0,
      open: false
    };
    
    breaker.failures++;
    
    // Trip breaker after 5 failures
    if (breaker.failures >= 5) {
      breaker.open = true;
      breaker.resetTime = Date.now() + 60000; // 1 minute cooldown
      console.error(`🚫 Circuit breaker tripped for ${decisionType}`);
    }
    
    this.circuitBreakers.set(decisionType, breaker);
  }

  /**
   * Log decision for audit trail
   */
  logDecision(decision) {
    this.decisionLog.push({
      ...decision,
      timestamp: decision.timestamp || new Date().toISOString()
    });
    
    // Keep last 1000 decisions in memory
    if (this.decisionLog.length > 1000) {
      this.decisionLog.shift();
    }
    
    // TODO: Persist to database for long-term audit
  }

  /**
   * Publish decision event to Kafka (observability)
   */
  async publishDecisionEvent(decision, result) {
    try {
      await publishEvent(KAFKA_TOPICS.SYSTEM_EVENTS, {
        event: 'SIB_DECISION',
        decision: {
          type: decision.type,
          confidence: decision.confidence,
          reasoning: decision.reasoning
        },
        result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to publish decision event to Kafka:', error.message);
    }
  }

  /**
   * Update metrics
   */
  updateMetrics(decision, result, executionTime) {
    // Emit metrics for Prometheus
    this.emit('metrics', {
      type: decision.type,
      confidence: decision.confidence,
      executionTime,
      success: result.jobId ? true : false
    });
  }

  /**
   * Reset rate limits
   */
  resetRateLimits() {
    Object.keys(this.rateLimitCounters).forEach(type => {
      this.rateLimitCounters[type].count = 0;
      this.rateLimitCounters[type].resetTime = Date.now() + 3600000;
    });
    console.log('🔄 Rate limits reset');
  }

  /**
   * Get decision audit log
   */
  getAuditLog(filters = {}) {
    let log = [...this.decisionLog];
    
    if (filters.type) {
      log = log.filter(d => d.type === filters.type);
    }
    
    if (filters.status) {
      log = log.filter(d => d.status === filters.status);
    }
    
    if (filters.since) {
      log = log.filter(d => new Date(d.timestamp) >= new Date(filters.since));
    }
    
    return log;
  }

  /**
   * Get system health status
   */
  getHealthStatus() {
    return {
      killSwitchActive: this.killSwitchActive,
      decisionCount: this.decisionLog.length,
      rateLimits: this.rateLimitCounters,
      circuitBreakers: Array.from(this.circuitBreakers.entries()),
      pendingApprovals: Array.from(this.humanOverrides.entries()).filter(([, v]) => v.status === 'pending').length
    };
  }
}

// Singleton instance
const sibControlLayer = new SIBControlLayer();

export default sibControlLayer;
