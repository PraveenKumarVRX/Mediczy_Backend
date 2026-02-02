/**
 * AI Node Heartbeat Model
 * Time-series health data from local AI nodes
 */

import { DataTypes, Model, Op } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

class AiNodeHeartbeat extends Model {
  /**
   * Get latest heartbeat for a node
   */
  static async getLatest(nodeId) {
    return this.findOne({
      where: { node_id: nodeId },
      order: [['received_at', 'DESC']]
    });
  }

  /**
   * Get heartbeat history for a node
   */
  static async getHistory(nodeId, hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    return this.findAll({
      where: {
        node_id: nodeId,
        received_at: { [Op.gt]: since }
      },
      order: [['received_at', 'DESC']]
    });
  }

  /**
   * Get aggregated metrics for a node
   */
  static async getAggregatedMetrics(nodeId, hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const heartbeats = await this.findAll({
      where: {
        node_id: nodeId,
        received_at: { [Op.gt]: since }
      },
      attributes: ['metrics', 'health_status'],
      raw: true
    });

    if (heartbeats.length === 0) {
      return null;
    }

    // Aggregate metrics
    const metrics = heartbeats.map(h => h.metrics).filter(Boolean);
    const statuses = heartbeats.map(h => h.health_status);

    const avgMetrics = {
      cpu_percent: this.average(metrics, 'cpu_percent'),
      memory_percent: this.average(metrics, 'memory_percent'),
      gpu_percent: this.average(metrics, 'gpu_percent'),
      disk_percent: this.average(metrics, 'disk_percent'),
      active_requests: this.average(metrics, 'active_requests')
    };

    const statusCounts = statuses.reduce((acc, s) => {
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

    const uptime = (statusCounts.HEALTHY || 0) / heartbeats.length * 100;

    return {
      period_hours: hours,
      heartbeat_count: heartbeats.length,
      average_metrics: avgMetrics,
      status_distribution: statusCounts,
      uptime_percent: uptime.toFixed(2)
    };
  }

  /**
   * Calculate average of a metric across heartbeats
   */
  static average(metrics, key) {
    const values = metrics.map(m => m[key]).filter(v => v !== undefined && v !== null);
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Clean up old heartbeats (retention policy)
   */
  static async cleanup(retentionDays = 30) {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    
    const deleted = await this.destroy({
      where: {
        received_at: { [Op.lt]: cutoff }
      }
    });

    return deleted;
  }
}

AiNodeHeartbeat.init({
  heartbeat_id: {
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
  received_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  round_trip_ms: {
    type: DataTypes.INTEGER
  },
  health_status: {
    type: DataTypes.ENUM('HEALTHY', 'DEGRADED', 'UNHEALTHY', 'CRITICAL'),
    defaultValue: 'HEALTHY'
  },
  metrics: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {}
  },
  alerts: {
    type: DataTypes.JSONB,
    defaultValue: []
  }
}, {
  sequelize,
  modelName: 'AiNodeHeartbeat',
  tableName: 'ai_node_heartbeats',
  underscored: true,
  timestamps: false, // received_at serves as timestamp
  indexes: [
    { fields: ['node_id'] },
    { fields: ['received_at'] },
    { fields: ['health_status'] }
  ]
});

export default AiNodeHeartbeat;
