/**
 * AI Node API Key Model
 * Secure API key management for node authentication
 */

import { DataTypes, Model, Op } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';
import bcrypt from 'bcrypt';

class AiNodeApiKey extends Model {
  /**
   * Validate an API key
   */
  static async validateKey(rawKey) {
    // Extract prefix from key (format: mczn_XXXXXXXX...)
    if (!rawKey || !rawKey.startsWith('mczn_')) {
      return null;
    }

    const keyPart = rawKey.substring(5); // Remove 'mczn_' prefix
    const prefix = keyPart.substring(0, 8);

    // Find key by prefix
    const apiKey = await this.findOne({
      where: {
        key_prefix: prefix,
        status: 'ACTIVE',
        [Op.or]: [
          { expires_at: null },
          { expires_at: { [Op.gt]: new Date() } }
        ]
      }
    });

    if (!apiKey) {
      return null;
    }

    // Verify hash
    const isValid = await bcrypt.compare(keyPart, apiKey.key_hash);
    
    if (!isValid) {
      return null;
    }

    // Update usage tracking
    apiKey.last_used_at = new Date();
    apiKey.use_count += 1;
    await apiKey.save();

    return apiKey;
  }

  /**
   * Check if key has a specific scope
   */
  hasScope(scope) {
    return this.scopes?.includes(scope) || this.scopes?.includes('admin');
  }

  /**
   * Check rate limit
   */
  async checkRateLimit() {
    // In production, use Redis for distributed rate limiting
    // This is a simple in-memory check
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    
    // For now, just check use_count (simplified)
    // Real implementation would track per-minute requests
    return this.use_count < this.rate_limit_per_minute * 60; // Rough estimate
  }

  /**
   * Revoke key
   */
  async revoke(userId) {
    this.status = 'REVOKED';
    this.revoked_at = new Date();
    this.revoked_by = userId;
    return this.save();
  }

  /**
   * Get active keys for a node
   */
  static async getActiveKeys(nodeId) {
    return this.findAll({
      where: {
        node_id: nodeId,
        status: 'ACTIVE',
        [Op.or]: [
          { expires_at: null },
          { expires_at: { [Op.gt]: new Date() } }
        ]
      }
    });
  }

  /**
   * Clean up expired keys
   */
  static async cleanupExpired() {
    const updated = await this.update(
      { status: 'EXPIRED' },
      {
        where: {
          status: 'ACTIVE',
          expires_at: { [Op.lt]: new Date() }
        }
      }
    );
    return updated[0];
  }
}

AiNodeApiKey.init({
  key_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  node_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'local_ai_nodes',
      key: 'node_id'
    }
  },
  key_prefix: {
    type: DataTypes.STRING(8),
    allowNull: false
  },
  key_hash: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  key_name: {
    type: DataTypes.STRING(100)
  },
  scopes: {
    type: DataTypes.JSONB,
    defaultValue: ['heartbeat', 'sync', 'metrics']
  },
  rate_limit_per_minute: {
    type: DataTypes.INTEGER,
    defaultValue: 100
  },
  status: {
    type: DataTypes.ENUM('ACTIVE', 'REVOKED', 'EXPIRED'),
    defaultValue: 'ACTIVE'
  },
  expires_at: {
    type: DataTypes.DATE
  },
  last_used_at: {
    type: DataTypes.DATE
  },
  use_count: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  revoked_at: {
    type: DataTypes.DATE
  },
  revoked_by: {
    type: DataTypes.INTEGER,
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  sequelize,
  modelName: 'AiNodeApiKey',
  tableName: 'ai_node_api_keys',
  underscored: true,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { fields: ['node_id'] },
    { fields: ['key_prefix'] },
    { fields: ['status'] }
  ]
});

export default AiNodeApiKey;
