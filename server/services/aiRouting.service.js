/**
 * AI Routing Service
 * Routes AI requests to appropriate Local AI Node or Cloud fallback
 */

import LocalAiNode from '../models/postgres/localAiNode.model.postgres.js';
import AiRoutingRule from '../models/postgres/aiRoutingRule.model.postgres.js';
import AiNodeSyncLog from '../models/postgres/aiNodeSyncLog.model.postgres.js';
import axios from 'axios';

class AiRoutingService {
  constructor() {
    this.requestTimeout = 120000; // 120 seconds default
    this.retryAttempts = 2;
    this.fallbackToCloud = true;
  }

  /**
   * Route an AI request to the best available node
   */
  async routeRequest(requestContext) {
    const {
      hospitalId,
      requestType, // SCRIBE, TRANSCRIPTION, PRESCRIPTION, CHAT, IMAGE
      priority = 'NORMAL',
      payload,
      userId,
      metadata = {}
    } = requestContext;

    // Find the best node for this request
    const routingResult = await this._findBestNode(hospitalId, requestType, priority);

    if (!routingResult.node && !this.fallbackToCloud) {
      throw new Error('No available AI node for this request');
    }

    // Execute request
    let result;
    let usedNode = null;

    if (routingResult.node) {
      try {
        result = await this._executeOnNode(routingResult.node, requestType, payload, metadata);
        usedNode = routingResult.node;
      } catch (error) {
        console.error(`Local node request failed: ${error.message}`);
        
        // Fallback to cloud if enabled
        if (this.fallbackToCloud && routingResult.rule?.fallback_strategy !== 'FAIL') {
          result = await this._executeOnCloud(requestType, payload, metadata);
          usedNode = null; // Indicates cloud
        } else {
          throw error;
        }
      }
    } else {
      // No local node available, use cloud
      result = await this._executeOnCloud(requestType, payload, metadata);
    }

    // Log the routing decision
    await this._logRoutingDecision({
      hospitalId,
      requestType,
      priority,
      routedTo: usedNode ? usedNode.node_id : 'CLOUD',
      routingRule: routingResult.rule?.rule_id,
      success: true,
      responseTime: result.responseTime,
      userId
    });

    return {
      ...result,
      routedTo: usedNode ? {
        nodeId: usedNode.node_id,
        nodeCode: usedNode.node_code,
        type: 'LOCAL'
      } : {
        type: 'CLOUD'
      }
    };
  }

  /**
   * Find the best available node for a request
   */
  async _findBestNode(hospitalId, requestType, priority) {
    // Get routing rule
    const rule = await AiRoutingRule.getRule(hospitalId, requestType);

    // If rule says prefer cloud, skip local
    if (rule?.routing_strategy === 'PREFER_CLOUD') {
      return { node: null, rule };
    }

    // Get available nodes with the required capability
    const capabilityMap = {
      'SCRIBE': 'SCRIBE',
      'TRANSCRIPTION': 'TRANSCRIPTION',
      'PRESCRIPTION': 'PRESCRIPTION',
      'CHAT': 'CHAT',
      'IMAGE': 'IMAGE_ANALYSIS'
    };

    const requiredCapability = capabilityMap[requestType] || requestType;

    // Get best node for this tenant
    const node = await LocalAiNode.getBestNode(hospitalId, requiredCapability);

    return { node, rule };
  }

  /**
   * Execute request on a local AI node
   */
  async _executeOnNode(node, requestType, payload, metadata) {
    const startTime = Date.now();

    // Build endpoint URL based on request type
    const endpointMap = {
      'SCRIBE': '/api/scribe/process',
      'TRANSCRIPTION': '/api/transcribe',
      'PRESCRIPTION': '/api/prescription/generate',
      'CHAT': '/api/chat',
      'IMAGE': '/api/image/analyze'
    };

    const endpoint = endpointMap[requestType] || '/api/process';
    const url = `${node.endpoint_url}${endpoint}`;

    const timeout = node.config?.timeout_seconds 
      ? node.config.timeout_seconds * 1000 
      : this.requestTimeout;

    try {
      const response = await axios.post(url, {
        ...payload,
        _metadata: {
          ...metadata,
          requestedAt: new Date().toISOString(),
          nodeCode: node.node_code
        }
      }, {
        timeout,
        headers: {
          'Content-Type': 'application/json',
          'X-Node-Code': node.node_code,
          'X-Request-Type': requestType
        }
      });

      const responseTime = Date.now() - startTime;

      return {
        success: true,
        data: response.data,
        responseTime,
        processedBy: 'LOCAL_NODE'
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Log the error
      console.error(`Node ${node.node_code} request failed:`, {
        error: error.message,
        requestType,
        responseTime
      });

      throw new Error(`Local node request failed: ${error.message}`);
    }
  }

  /**
   * Execute request on cloud (fallback)
   */
  async _executeOnCloud(requestType, payload, metadata) {
    const startTime = Date.now();

    // Route to existing cloud AI services
    const cloudEndpointMap = {
      'SCRIBE': '/api/offline-scribe/process',
      'TRANSCRIPTION': '/api/offline-scribe/transcribe',
      'PRESCRIPTION': '/api/ai/prescription',
      'CHAT': '/api/ai/chat',
      'IMAGE': '/api/ai/image'
    };

    const endpoint = cloudEndpointMap[requestType];
    
    if (!endpoint) {
      throw new Error(`Unknown request type: ${requestType}`);
    }

    // For cloud fallback, we call our own API internally
    // In production, this would call the appropriate cloud service
    const cloudBaseUrl = process.env.CLOUD_AI_URL || 'http://localhost:8006';
    
    try {
      const response = await axios.post(`${cloudBaseUrl}${endpoint}`, {
        ...payload,
        _metadata: {
          ...metadata,
          requestedAt: new Date().toISOString(),
          routedVia: 'CLOUD_FALLBACK'
        }
      }, {
        timeout: this.requestTimeout,
        headers: {
          'Content-Type': 'application/json',
          'X-Cloud-Fallback': 'true'
        }
      });

      const responseTime = Date.now() - startTime;

      return {
        success: true,
        data: response.data,
        responseTime,
        processedBy: 'CLOUD'
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      throw new Error(`Cloud fallback failed: ${error.message}`);
    }
  }

  /**
   * Log routing decision for analytics
   */
  async _logRoutingDecision(decision) {
    // This could be stored in a separate analytics table
    // For now, log to console and metrics
    console.log('AI Routing Decision:', {
      timestamp: new Date().toISOString(),
      ...decision
    });

    // TODO: Store in analytics table
  }

  /**
   * Check if a local node is available for a hospital
   */
  async hasLocalNode(hospitalId, capability = null) {
    const node = await LocalAiNode.getBestNode(hospitalId, capability);
    return !!node;
  }

  /**
   * Get routing statistics for a hospital
   */
  async getRoutingStats(hospitalId, days = 7) {
    // Get all nodes for the hospital
    const nodes = await LocalAiNode.findAll({
      where: { hospital_id: hospitalId }
    });

    const stats = {
      hospitalId,
      period: `${days} days`,
      nodes: nodes.map(n => ({
        nodeId: n.node_id,
        nodeCode: n.node_code,
        status: n.status,
        isOnline: n.isOnline()
      })),
      // TODO: Add actual routing statistics from analytics
      summary: {
        totalRequests: 0,
        localProcessed: 0,
        cloudFallback: 0,
        averageResponseTime: 0
      }
    };

    return stats;
  }

  /**
   * Preload routing rules for performance
   */
  async preloadRules(hospitalIds = []) {
    // Preload rules into cache
    // This would use Redis in production
    const rules = await AiRoutingRule.findAll({
      where: hospitalIds.length > 0 
        ? { hospital_id: hospitalIds }
        : {}
    });

    console.log(`Preloaded ${rules.length} routing rules`);
    return rules.length;
  }
}

export default new AiRoutingService();
