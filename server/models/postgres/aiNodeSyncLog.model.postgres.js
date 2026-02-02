/**
 * AI Node Sync Log Model
 * Audit trail for sync operations between cloud and local nodes
 */

import { DataTypes, Model } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

export const SYNC_TYPES = {
  MODEL_UPDATE: 'MODEL_UPDATE',
  MODEL_DOWNLOAD: 'MODEL_DOWNLOAD',
  CONFIG_PUSH: 'CONFIG_PUSH',
  CONFIG_PULL: 'CONFIG_PULL',
  METRICS_PUSH: 'METRICS_PUSH',
  HEALTH_CHECK: 'HEALTH_CHECK',
  CERTIFICATE_RENEWAL: 'CERTIFICATE_RENEWAL',
  FULL_SYNC: 'FULL_SYNC',
  INCREMENTAL_SYNC: 'INCREMENTAL_SYNC',
  EMERGENCY_UPDATE: 'EMERGENCY_UPDATE'
};

export const SYNC_DIRECTIONS = {
  PUSH: 'PUSH',
  PULL: 'PULL',
  BIDIRECTIONAL: 'BIDIRECTIONAL'
};

export const SYNC_STATUSES = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  PARTIAL: 'PARTIAL',
  CANCELLED: 'CANCELLED'
};

class AiNodeSyncLog extends Model {
  /**
   * Start a new sync operation
   */
  static async startSync(nodeId, syncType, direction = 'PULL', details = {}, initiatedBy = 'SYSTEM') {
    return this.create({
      node_id: nodeId,
      sync_type: syncType,
      sync_direction: direction,
      status: 'IN_PROGRESS',
      details,
      started_at: new Date(),
      initiated_by: initiatedBy
    });
  }

  /**
   * Complete sync with success
   */
  async complete(additionalDetails = {}) {
    this.status = 'SUCCESS';
    this.completed_at = new Date();
    this.progress_percent = 100;
    this.details = { ...this.details, ...additionalDetails };
    return this.save();
  }

  /**
   * Fail sync with error
   */
  async fail(errorCode, errorMessage, shouldRetry = true) {
    this.status = 'FAILED';
    this.completed_at = new Date();
    this.error_code = errorCode;
    this.error_message = errorMessage;
    
    if (shouldRetry && this.retry_count < this.max_retries) {
      this.retry_count += 1;
    }
    
    return this.save();
  }

  /**
   * Update progress
   */
  async updateProgress(percent, bytesTransferred = null) {
    this.progress_percent = Math.min(percent, 100);
    if (bytesTransferred !== null) {
      this.bytes_transferred = bytesTransferred;
    }
    return this.save();
  }

  /**
   * Get recent sync history for a node
   */
  static async getHistory(nodeId, limit = 20) {
    return this.findAll({
      where: { node_id: nodeId },
      order: [['created_at', 'DESC']],
      limit
    });
  }

  /**
   * Get pending syncs for a node
   */
  static async getPending(nodeId) {
    return this.findAll({
      where: {
        node_id: nodeId,
        status: ['PENDING', 'IN_PROGRESS']
      },
      order: [['created_at', 'ASC']]
    });
  }
}

AiNodeSyncLog.init({
  log_id: {
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
  sync_type: {
    type: DataTypes.ENUM(...Object.values(SYNC_TYPES)),
    allowNull: false
  },
  sync_direction: {
    type: DataTypes.ENUM(...Object.values(SYNC_DIRECTIONS)),
    defaultValue: 'PULL'
  },
  status: {
    type: DataTypes.ENUM(...Object.values(SYNC_STATUSES)),
    defaultValue: 'PENDING'
  },
  details: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  progress_percent: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  bytes_transferred: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  error_code: {
    type: DataTypes.STRING(50)
  },
  error_message: {
    type: DataTypes.TEXT
  },
  retry_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  max_retries: {
    type: DataTypes.INTEGER,
    defaultValue: 3
  },
  scheduled_at: {
    type: DataTypes.DATE
  },
  started_at: {
    type: DataTypes.DATE
  },
  completed_at: {
    type: DataTypes.DATE
  },
  initiated_by: {
    type: DataTypes.STRING(50)
  },
  initiated_by_user_id: {
    type: DataTypes.INTEGER,
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  sequelize,
  modelName: 'AiNodeSyncLog',
  tableName: 'ai_node_sync_logs',
  underscored: true,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false, // No updated_at for logs
  indexes: [
    { fields: ['node_id'] },
    { fields: ['status'] },
    { fields: ['sync_type'] },
    { fields: ['created_at'] }
  ]
});

export default AiNodeSyncLog;
