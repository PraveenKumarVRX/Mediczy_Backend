/**
 * Cloud Mother / Local AI Node Models Index
 * Export all models for the multi-tenant AI infrastructure
 */

import LocalAiNode from './localAiNode.model.postgres.js';
import AiRoutingRule from './aiRoutingRule.model.postgres.js';
import AiNodeSyncLog from './aiNodeSyncLog.model.postgres.js';
import AiNodeHeartbeat from './aiNodeHeartbeat.model.postgres.js';
import AiNodeApiKey from './aiNodeApiKey.model.postgres.js';

// Setup associations
LocalAiNode.hasMany(AiNodeHeartbeat, { foreignKey: 'node_id', as: 'heartbeats' });
AiNodeHeartbeat.belongsTo(LocalAiNode, { foreignKey: 'node_id', as: 'node' });

LocalAiNode.hasMany(AiNodeApiKey, { foreignKey: 'node_id', as: 'apiKeys' });
AiNodeApiKey.belongsTo(LocalAiNode, { foreignKey: 'node_id', as: 'node' });

LocalAiNode.hasMany(AiNodeSyncLog, { foreignKey: 'node_id', as: 'syncLogs' });
AiNodeSyncLog.belongsTo(LocalAiNode, { foreignKey: 'node_id', as: 'node' });

export {
  LocalAiNode,
  AiRoutingRule,
  AiNodeSyncLog,
  AiNodeHeartbeat,
  AiNodeApiKey
};

export default {
  LocalAiNode,
  AiRoutingRule,
  AiNodeSyncLog,
  AiNodeHeartbeat,
  AiNodeApiKey
};
