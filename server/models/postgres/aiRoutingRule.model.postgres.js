/**
 * AI Routing Rule Model
 * Rules for routing AI requests between local nodes and cloud
 * Part of Cloud Mother - Multi-Tenancy Architecture
 */

import { DataTypes, Model, Op } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

// Use case constants
export const AI_USE_CASES = {
  SCRIBE: 'SCRIBE',
  TRANSCRIPTION: 'TRANSCRIPTION',
  PRESCRIPTION: 'PRESCRIPTION',
  OPD_NOTES: 'OPD_NOTES',
  IPD_NOTES: 'IPD_NOTES',
  DISCHARGE_SUMMARY: 'DISCHARGE_SUMMARY',
  DIAGNOSIS_ASSIST: 'DIAGNOSIS_ASSIST',
  CHAT: 'CHAT',
  IMAGE_ANALYSIS: 'IMAGE_ANALYSIS',
  LAB_ANALYSIS: 'LAB_ANALYSIS',
  DRUG_INTERACTION: 'DRUG_INTERACTION',
  REFERRAL: 'REFERRAL',
  TRIAGE: 'TRIAGE',
  ALL: 'ALL'
};

export const TARGET_TYPES = {
  LOCAL_NODE: 'LOCAL_NODE',
  CLOUD: 'CLOUD',
  HYBRID: 'HYBRID',
  ROUND_ROBIN: 'ROUND_ROBIN'
};

export const FALLBACK_TARGETS = {
  CLOUD: 'CLOUD',
  LOCAL_NODE: 'LOCAL_NODE',
  QUEUE: 'QUEUE',
  REJECT: 'REJECT'
};

class AiRoutingRule extends Model {
  /**
   * Evaluate if this rule matches the given request context
   */
  matches(context) {
    if (!this.conditions || Object.keys(this.conditions).length === 0) {
      return true; // No conditions = always match
    }

    const conditions = this.conditions;

    // Check data sensitivity
    if (conditions.data_sensitivity && context.data_sensitivity) {
      if (!conditions.data_sensitivity.includes(context.data_sensitivity)) {
        return false;
      }
    }

    // Check languages
    if (conditions.languages && context.language) {
      if (!conditions.languages.includes(context.language)) {
        return false;
      }
    }

    // Check file size
    if (conditions.file_size_max_mb && context.file_size_mb) {
      if (context.file_size_mb > conditions.file_size_max_mb) {
        return false;
      }
    }

    // Check time of day
    if (conditions.time_of_day) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      if (currentTime < conditions.time_of_day.start || currentTime > conditions.time_of_day.end) {
        return false;
      }
    }

    // Check department
    if (conditions.department_codes && context.department_code) {
      if (!conditions.department_codes.includes(context.department_code)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get the best routing rule for a tenant and use case
   */
  static async getRule(tenantId, useCase, context = {}) {
    // Find all matching rules, ordered by priority
    const rules = await this.findAll({
      where: {
        [Op.or]: [
          { tenant_id: tenantId },
          { tenant_id: null } // Platform-wide rules
        ],
        [Op.or]: [
          { use_case: useCase },
          { use_case: 'ALL' }
        ],
        status: 'ACTIVE'
      },
      order: [
        // Tenant-specific rules first
        [sequelize.literal('CASE WHEN tenant_id IS NOT NULL THEN 0 ELSE 1 END'), 'ASC'],
        // Then by priority (lower = higher priority)
        ['priority', 'ASC']
      ]
    });

    // Find first matching rule
    for (const rule of rules) {
      if (rule.matches(context)) {
        return rule;
      }
    }

    // Return default if no match
    return null;
  }

  /**
   * Route a request based on rules
   */
  static async routeRequest(tenantId, useCase, context = {}) {
    const LocalAiNode = (await import('./localAiNode.model.postgres.js')).default;
    
    // Get matching rule
    const rule = await this.getRule(tenantId, useCase, context);
    
    if (!rule) {
      // No rule found, default to cloud
      return {
        target: 'CLOUD',
        node: null,
        rule: null,
        fallback: false
      };
    }

    // Handle different target types
    switch (rule.target_type) {
      case 'LOCAL_NODE': {
        const node = await LocalAiNode.getBestNode(
          tenantId,
          useCase.toLowerCase(),
          rule.local_node_id
        );

        if (node && node.isOnline()) {
          return {
            target: 'LOCAL_NODE',
            node,
            endpoint: node.endpoint_url,
            rule,
            fallback: false
          };
        }

        // Node not available, check fallback
        if (rule.fallback_enabled) {
          return {
            target: rule.fallback_target,
            node: null,
            endpoint: rule.cloud_endpoint,
            rule,
            fallback: true,
            fallback_reason: node ? 'NODE_OFFLINE' : 'NO_NODE_AVAILABLE'
          };
        }

        return {
          target: 'REJECT',
          node: null,
          rule,
          fallback: false,
          error: 'No local node available and fallback disabled'
        };
      }

      case 'CLOUD': {
        return {
          target: 'CLOUD',
          endpoint: rule.cloud_endpoint,
          node: null,
          rule,
          fallback: false
        };
      }

      case 'HYBRID': {
        // Try local first for simple/fast requests
        const node = await LocalAiNode.getBestNode(tenantId, useCase.toLowerCase());
        
        if (node && node.isOnline()) {
          // Check if request is "simple" based on context
          const isSimple = context.estimated_tokens < 500 || context.priority === 'low';
          
          if (isSimple) {
            return {
              target: 'LOCAL_NODE',
              node,
              endpoint: node.endpoint_url,
              rule,
              fallback: false,
              routing_reason: 'HYBRID_LOCAL_SIMPLE'
            };
          }
        }

        return {
          target: 'CLOUD',
          endpoint: rule.cloud_endpoint,
          node: null,
          rule,
          fallback: false,
          routing_reason: 'HYBRID_CLOUD_COMPLEX'
        };
      }

      case 'ROUND_ROBIN': {
        const nodes = await LocalAiNode.getAvailableForTenant(tenantId, useCase.toLowerCase());
        
        if (nodes.length === 0) {
          if (rule.fallback_enabled) {
            return {
              target: rule.fallback_target,
              node: null,
              rule,
              fallback: true
            };
          }
          return { target: 'REJECT', error: 'No nodes available' };
        }

        // Simple round-robin (in production, use Redis for distributed counter)
        const randomNode = nodes[Math.floor(Math.random() * nodes.length)];
        
        return {
          target: 'LOCAL_NODE',
          node: randomNode,
          endpoint: randomNode.endpoint_url,
          rule,
          fallback: false,
          routing_reason: 'ROUND_ROBIN'
        };
      }

      default:
        return { target: 'CLOUD', rule, fallback: false };
    }
  }
}

AiRoutingRule.init({
  rule_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true, // NULL = platform-wide rule
    references: {
      model: 'tenants',
      key: 'id'
    }
  },
  rule_name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  rule_code: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT
  },
  use_case: {
    type: DataTypes.ENUM(...Object.values(AI_USE_CASES)),
    allowNull: false
  },
  priority: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 100
  },
  conditions: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  target_type: {
    type: DataTypes.ENUM(...Object.values(TARGET_TYPES)),
    allowNull: false,
    defaultValue: 'LOCAL_NODE'
  },
  local_node_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'local_ai_nodes',
      key: 'node_id'
    }
  },
  cloud_endpoint: {
    type: DataTypes.STRING(255)
  },
  fallback_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  fallback_target: {
    type: DataTypes.ENUM(...Object.values(FALLBACK_TARGETS)),
    defaultValue: 'CLOUD'
  },
  fallback_timeout_seconds: {
    type: DataTypes.INTEGER,
    defaultValue: 30
  },
  load_balance_config: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  status: {
    type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'TESTING'),
    defaultValue: 'ACTIVE'
  }
}, {
  sequelize,
  modelName: 'AiRoutingRule',
  tableName: 'ai_routing_rules',
  underscored: true,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['tenant_id'] },
    { fields: ['use_case'] },
    { fields: ['status'] },
    { fields: ['priority'] },
    { 
      fields: ['tenant_id', 'use_case', 'priority'],
      unique: true,
      name: 'unique_tenant_usecase_priority'
    }
  ]
});

export default AiRoutingRule;
