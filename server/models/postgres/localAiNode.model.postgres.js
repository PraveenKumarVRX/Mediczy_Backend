/**
 * Local AI Node Model
 * Registry of local AI compute nodes deployed at hospital sites
 * Part of Cloud Mother - Multi-Tenancy Architecture
 */

import { DataTypes, Model, Op } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

class LocalAiNode extends Model {
  /**
   * Check if node is online (heartbeat within threshold)
   */
  isOnline(thresholdSeconds = 120) {
    if (!this.last_heartbeat_at) return false;
    const threshold = new Date(Date.now() - thresholdSeconds * 1000);
    return new Date(this.last_heartbeat_at) > threshold;
  }

  /**
   * Get health status based on heartbeat
   */
  getHealthStatus() {
    if (!this.last_heartbeat_at) return 'OFFLINE';
    
    const now = Date.now();
    const lastHeartbeat = new Date(this.last_heartbeat_at).getTime();
    const diffMinutes = (now - lastHeartbeat) / 60000;
    
    if (diffMinutes < 2) return 'HEALTHY';
    if (diffMinutes < 5) return 'DEGRADED';
    return 'OFFLINE';
  }

  /**
   * Check if node has a specific capability
   */
  hasCapability(capability) {
    return this.capabilities?.includes(capability);
  }

  /**
   * Get available nodes for a tenant
   */
  static async getAvailableForTenant(tenantId, capability = null) {
    const whereClause = {
      tenant_id: tenantId,
      status: 'ACTIVE',
      last_heartbeat_at: {
        [Op.gt]: new Date(Date.now() - 5 * 60 * 1000) // Last 5 minutes
      }
    };

    if (capability) {
      whereClause.capabilities = {
        [Op.contains]: [capability]
      };
    }

    return this.findAll({
      where: whereClause,
      order: [['last_heartbeat_at', 'DESC']]
    });
  }

  /**
   * Get the best available node for a request
   */
  static async getBestNode(tenantId, capability, preferredNodeId = null) {
    // Try preferred node first
    if (preferredNodeId) {
      const preferred = await this.findOne({
        where: {
          node_id: preferredNodeId,
          tenant_id: tenantId,
          status: 'ACTIVE'
        }
      });
      
      if (preferred?.isOnline() && preferred.hasCapability(capability)) {
        return preferred;
      }
    }

    // Get all available nodes
    const nodes = await this.getAvailableForTenant(tenantId, capability);
    
    if (nodes.length === 0) return null;

    // Simple load balancing: pick the one with lowest active requests
    // In production, consider more sophisticated algorithms
    return nodes.reduce((best, node) => {
      const bestRequests = best.health_metrics?.active_requests || 0;
      const nodeRequests = node.health_metrics?.active_requests || 0;
      return nodeRequests < bestRequests ? node : best;
    }, nodes[0]);
  }

  /**
   * Record heartbeat from node
   */
  async recordHeartbeat(metrics, alerts = []) {
    this.last_heartbeat_at = new Date();
    this.health_metrics = metrics;
    
    // Update status based on metrics
    if (metrics.cpu_percent > 90 || metrics.memory_percent > 90) {
      this.status = 'DEGRADED';
    } else if (this.status === 'DEGRADED') {
      this.status = 'ACTIVE';
    }

    await this.save();

    // Record heartbeat in history table
    const { AiNodeHeartbeat } = await import('./aiNodeHeartbeat.model.postgres.js');
    await AiNodeHeartbeat.create({
      node_id: this.node_id,
      health_status: this.getHealthStatus(),
      metrics,
      alerts
    });

    return this;
  }

  /**
   * Generate a new API key for this node
   */
  async generateApiKey(keyName = 'Default Key', scopes = ['heartbeat', 'sync', 'metrics']) {
    const crypto = await import('crypto');
    const bcrypt = await import('bcrypt');
    
    // Generate random key
    const rawKey = crypto.randomBytes(32).toString('hex');
    const keyPrefix = rawKey.substring(0, 8);
    const keyHash = await bcrypt.hash(rawKey, 10);

    // Store in api_keys table
    const { AiNodeApiKey } = await import('./aiNodeApiKey.model.postgres.js');
    await AiNodeApiKey.create({
      node_id: this.node_id,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      key_name: keyName,
      scopes
    });

    // Update node's api_key_prefix
    this.api_key_prefix = keyPrefix;
    await this.save();

    // Return raw key (only time it's visible)
    return {
      key: `mczn_${rawKey}`, // Mediczy Node key prefix
      prefix: keyPrefix,
      scopes
    };
  }
}

LocalAiNode.init({
  node_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'tenants',
      key: 'id'
    }
  },
  entity_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  node_code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  node_name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  node_type: {
    type: DataTypes.ENUM('ON_PREMISE', 'EDGE', 'HYBRID', 'MOBILE'),
    defaultValue: 'ON_PREMISE'
  },
  hardware_specs: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  gpu_info: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  endpoint_url: {
    type: DataTypes.STRING(255)
  },
  internal_ip: {
    type: DataTypes.STRING(45)
  },
  external_ip: {
    type: DataTypes.STRING(45)
  },
  vpn_endpoint: {
    type: DataTypes.STRING(255)
  },
  api_key_hash: {
    type: DataTypes.STRING(255)
  },
  api_key_prefix: {
    type: DataTypes.STRING(8)
  },
  client_cert_fingerprint: {
    type: DataTypes.STRING(64)
  },
  installed_models: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  capabilities: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  supported_languages: {
    type: DataTypes.JSONB,
    defaultValue: ['en', 'hi']
  },
  status: {
    type: DataTypes.ENUM('PROVISIONING', 'ACTIVE', 'OFFLINE', 'MAINTENANCE', 'DEGRADED', 'DECOMMISSIONED'),
    defaultValue: 'PROVISIONING'
  },
  last_heartbeat_at: {
    type: DataTypes.DATE
  },
  heartbeat_interval_seconds: {
    type: DataTypes.INTEGER,
    defaultValue: 60
  },
  health_metrics: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  sync_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  sync_interval_minutes: {
    type: DataTypes.INTEGER,
    defaultValue: 60
  },
  last_sync_at: {
    type: DataTypes.DATE
  },
  sync_status: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  config: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  location: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  notes: {
    type: DataTypes.TEXT
  },
  tags: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  provisioned_at: {
    type: DataTypes.DATE
  },
  activated_at: {
    type: DataTypes.DATE
  },
  decommissioned_at: {
    type: DataTypes.DATE
  }
}, {
  sequelize,
  modelName: 'LocalAiNode',
  tableName: 'local_ai_nodes',
  underscored: true,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['tenant_id'] },
    { fields: ['status'] },
    { fields: ['node_type'] },
    { fields: ['last_heartbeat_at'] }
  ]
});

export default LocalAiNode;
