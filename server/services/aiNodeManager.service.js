/**
 * AI Node Manager Service
 * Central service for managing Local AI Nodes from Cloud Mother
 */

import LocalAiNode from '../models/postgres/localAiNode.model.postgres.js';
import AiNodeHeartbeat from '../models/postgres/aiNodeHeartbeat.model.postgres.js';
import AiNodeApiKey from '../models/postgres/aiNodeApiKey.model.postgres.js';
import AiNodeSyncLog from '../models/postgres/aiNodeSyncLog.model.postgres.js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

class AiNodeManagerService {
  /**
   * Register a new Local AI Node
   */
  async registerNode(nodeData) {
    const {
      hospitalId,
      hospitalName,
      nodeType = 'ON_PREMISE',
      endpoint,
      capabilities,
      models,
      config,
      metadata = {}
    } = nodeData;

    // Generate unique node code
    const nodeCode = `MCZ-${hospitalId}-${Date.now().toString(36).toUpperCase()}`;

    // Create node
    const node = await LocalAiNode.create({
      hospital_id: hospitalId,
      hospital_name: hospitalName,
      node_type: nodeType,
      node_code: nodeCode,
      endpoint_url: endpoint,
      capabilities: capabilities || ['SCRIBE', 'TRANSCRIPTION'],
      models_available: models || ['indic-gemma-2b', 'whisper-small'],
      config: {
        ...config,
        max_concurrent_requests: config?.max_concurrent_requests || 10,
        timeout_seconds: config?.timeout_seconds || 120
      },
      metadata: {
        ...metadata,
        registered_at: new Date().toISOString(),
        registered_by: nodeData.registeredBy
      },
      status: 'PENDING'
    });

    // Generate initial API key
    const apiKeyResult = await this.generateApiKey(node.node_id, {
      name: 'Initial Setup Key',
      scopes: ['heartbeat', 'sync', 'metrics', 'ai_request'],
      expiresInDays: 365
    });

    return {
      node,
      apiKey: apiKeyResult.rawKey,
      setupInstructions: this._getSetupInstructions(node, apiKeyResult.rawKey)
    };
  }

  /**
   * Generate API key for a node
   */
  async generateApiKey(nodeId, options = {}) {
    const {
      name = 'API Key',
      scopes = ['heartbeat', 'sync', 'metrics'],
      expiresInDays = 365
    } = options;

    // Generate a random key
    const keyPart = crypto.randomBytes(32).toString('base64url');
    const prefix = keyPart.substring(0, 8);
    const rawKey = `mczn_${keyPart}`;

    // Hash the key for storage
    const keyHash = await bcrypt.hash(keyPart, 12);

    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    // Create API key record
    const apiKey = await AiNodeApiKey.create({
      node_id: nodeId,
      key_prefix: prefix,
      key_hash: keyHash,
      key_name: name,
      scopes,
      expires_at: expiresAt
    });

    // Return both the raw key (one-time display) and record
    return {
      apiKey,
      rawKey, // This is shown only once!
      expiresAt
    };
  }

  /**
   * Process heartbeat from a node
   */
  async processHeartbeat(nodeId, heartbeatData) {
    const node = await LocalAiNode.findByPk(nodeId);
    
    if (!node) {
      throw new Error('Node not found');
    }

    const {
      status,
      metrics,
      activeRequests,
      queueLength,
      errorRate,
      avgResponseTime
    } = heartbeatData;

    // Record heartbeat
    await AiNodeHeartbeat.create({
      node_id: nodeId,
      status: status || 'HEALTHY',
      metrics: metrics || {},
      active_requests: activeRequests || 0,
      queue_length: queueLength || 0,
      error_rate: errorRate || 0,
      avg_response_time_ms: avgResponseTime || 0
    });

    // Update node status
    node.last_heartbeat = new Date();
    node.health_metrics = metrics || node.health_metrics;
    
    if (status === 'HEALTHY' && node.status !== 'ACTIVE') {
      node.status = 'ACTIVE';
    } else if (status === 'ERROR' || status === 'OVERLOADED') {
      node.status = 'DEGRADED';
    }

    await node.save();

    // Return any pending sync data or commands
    return {
      acknowledged: true,
      serverTime: new Date().toISOString(),
      commands: await this._getPendingCommands(nodeId),
      configUpdates: await this._getPendingConfigUpdates(nodeId)
    };
  }

  /**
   * Get node health dashboard data
   */
  async getNodeHealth(nodeId) {
    const node = await LocalAiNode.findByPk(nodeId);
    
    if (!node) {
      throw new Error('Node not found');
    }

    const [latestHeartbeat, metrics24h, recentSyncs] = await Promise.all([
      AiNodeHeartbeat.getLatest(nodeId),
      AiNodeHeartbeat.getAggregatedMetrics(nodeId, 24),
      AiNodeSyncLog.getSyncHistory(nodeId, 10)
    ]);

    return {
      node: {
        id: node.node_id,
        code: node.node_code,
        hospital: node.hospital_name,
        status: node.status,
        type: node.node_type,
        capabilities: node.capabilities,
        models: node.models_available,
        isOnline: node.isOnline()
      },
      health: {
        current: latestHeartbeat?.status || 'UNKNOWN',
        lastHeartbeat: node.last_heartbeat,
        metrics: latestHeartbeat?.metrics || {}
      },
      statistics: metrics24h,
      recentSyncs
    };
  }

  /**
   * Get all nodes for a hospital/tenant
   */
  async getNodesForTenant(hospitalId) {
    const nodes = await LocalAiNode.findAll({
      where: { hospital_id: hospitalId },
      order: [['created_at', 'DESC']]
    });

    return Promise.all(nodes.map(async (node) => ({
      ...node.toJSON(),
      isOnline: node.isOnline(),
      healthStatus: node.getHealthStatus()
    })));
  }

  /**
   * Get all nodes across all tenants (admin view)
   */
  async getAllNodes(filters = {}) {
    const where = {};

    if (filters.status) where.status = filters.status;
    if (filters.type) where.node_type = filters.type;
    if (filters.hospitalId) where.hospital_id = filters.hospitalId;

    const nodes = await LocalAiNode.findAll({
      where,
      order: [['last_heartbeat', 'DESC NULLS LAST']]
    });

    return Promise.all(nodes.map(async (node) => ({
      ...node.toJSON(),
      isOnline: node.isOnline(),
      healthStatus: node.getHealthStatus()
    })));
  }

  /**
   * Update node configuration from Cloud Mother
   */
  async updateNodeConfig(nodeId, configUpdates, userId) {
    const node = await LocalAiNode.findByPk(nodeId);
    
    if (!node) {
      throw new Error('Node not found');
    }

    // Merge config updates
    node.config = {
      ...node.config,
      ...configUpdates,
      _updated_at: new Date().toISOString(),
      _updated_by: userId
    };

    await node.save();

    // Create sync log for config push
    await AiNodeSyncLog.startSync(nodeId, 'CONFIG_PUSH', {
      configKeys: Object.keys(configUpdates)
    });

    return node;
  }

  /**
   * Deactivate a node
   */
  async deactivateNode(nodeId, reason, userId) {
    const node = await LocalAiNode.findByPk(nodeId);
    
    if (!node) {
      throw new Error('Node not found');
    }

    node.status = 'SUSPENDED';
    node.metadata = {
      ...node.metadata,
      suspended_at: new Date().toISOString(),
      suspended_by: userId,
      suspension_reason: reason
    };

    // Revoke all active API keys
    await AiNodeApiKey.update(
      { status: 'REVOKED', revoked_by: userId, revoked_at: new Date() },
      { where: { node_id: nodeId, status: 'ACTIVE' } }
    );

    await node.save();
    return node;
  }

  /**
   * Reactivate a node
   */
  async reactivateNode(nodeId, userId) {
    const node = await LocalAiNode.findByPk(nodeId);
    
    if (!node) {
      throw new Error('Node not found');
    }

    node.status = 'PENDING'; // Will become ACTIVE after first heartbeat
    node.metadata = {
      ...node.metadata,
      reactivated_at: new Date().toISOString(),
      reactivated_by: userId
    };

    await node.save();

    // Generate new API key
    const apiKeyResult = await this.generateApiKey(nodeId, {
      name: 'Reactivation Key',
      scopes: ['heartbeat', 'sync', 'metrics', 'ai_request']
    });

    return {
      node,
      newApiKey: apiKeyResult.rawKey
    };
  }

  /**
   * Get pending commands for a node
   */
  async _getPendingCommands(nodeId) {
    // In a full implementation, this would check a commands queue
    // For now, return empty array
    return [];
  }

  /**
   * Get pending config updates for a node
   */
  async _getPendingConfigUpdates(nodeId) {
    // In a full implementation, this would check for pending config changes
    // For now, return null
    return null;
  }

  /**
   * Generate setup instructions for a new node
   */
  _getSetupInstructions(node, apiKey) {
    return {
      nodeCode: node.node_code,
      cloudMotherUrl: process.env.CLOUD_MOTHER_URL || 'https://api.mediczy.com',
      steps: [
        '1. Install the Local AI Node software on your server',
        '2. Configure the node with the following settings:',
        `   - Node Code: ${node.node_code}`,
        `   - API Key: ${apiKey}`,
        `   - Cloud Mother URL: ${process.env.CLOUD_MOTHER_URL || 'https://api.mediczy.com'}`,
        '3. Start the node service',
        '4. Verify connection in the Cloud Mother dashboard'
      ],
      configExample: {
        node_code: node.node_code,
        api_key: '${YOUR_API_KEY}',
        cloud_mother_url: process.env.CLOUD_MOTHER_URL || 'https://api.mediczy.com',
        heartbeat_interval_seconds: 30,
        models_path: '/opt/mediczy/models',
        log_level: 'info'
      }
    };
  }

  /**
   * Run maintenance tasks
   */
  async runMaintenance() {
    const results = {
      expiredKeys: 0,
      cleanedHeartbeats: 0,
      offlineNodes: []
    };

    // Clean up expired API keys
    results.expiredKeys = await AiNodeApiKey.cleanupExpired();

    // Clean up old heartbeats (keep 30 days)
    results.cleanedHeartbeats = await AiNodeHeartbeat.cleanup(30);

    // Find offline nodes
    const allNodes = await LocalAiNode.findAll({
      where: { status: 'ACTIVE' }
    });

    for (const node of allNodes) {
      if (!node.isOnline()) {
        results.offlineNodes.push({
          nodeId: node.node_id,
          nodeCode: node.node_code,
          hospital: node.hospital_name,
          lastHeartbeat: node.last_heartbeat
        });

        // Mark as degraded if offline for too long
        const offlineMinutes = node.last_heartbeat 
          ? (Date.now() - new Date(node.last_heartbeat).getTime()) / (1000 * 60)
          : Infinity;

        if (offlineMinutes > 30) {
          node.status = 'DEGRADED';
          await node.save();
        }
      }
    }

    return results;
  }
}

export default new AiNodeManagerService();
