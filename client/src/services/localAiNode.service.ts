/**
 * Local AI Node Service
 * API client for Cloud Mother local AI node management
 */

import api from '@/utils/api';

export interface LocalAiNode {
  node_id: string;
  hospital_id: number;
  hospital_name: string;
  node_code: string;
  node_type: 'ON_PREMISE' | 'EDGE' | 'HYBRID' | 'MOBILE';
  endpoint_url: string;
  capabilities: string[];
  models_available: string[];
  config: Record<string, any>;
  health_metrics: {
    cpu_usage?: number;
    memory_usage?: number;
    gpu_usage?: number;
    avg_latency_ms?: number;
    requests_today?: number;
    errors_today?: number;
  };
  status: 'PENDING' | 'ACTIVE' | 'DEGRADED' | 'OFFLINE' | 'SUSPENDED' | 'MAINTENANCE';
  last_heartbeat: string | null;
  isOnline: boolean;
  healthStatus: string;
  created_at: string;
  updated_at: string;
}

export interface NodeHealthData {
  node: {
    id: string;
    code: string;
    hospital: string;
    status: string;
    type: string;
    capabilities: string[];
    models: string[];
    isOnline: boolean;
  };
  health: {
    current: string;
    lastHeartbeat: string | null;
    metrics: Record<string, any>;
  };
  statistics: {
    avgResponseTime?: number;
    totalRequests?: number;
    errorRate?: number;
  };
  recentSyncs: any[];
}

export interface RegisterNodeRequest {
  hospitalId: number;
  hospitalName: string;
  nodeType?: 'ON_PREMISE' | 'EDGE' | 'HYBRID' | 'MOBILE';
  endpoint: string;
  capabilities?: string[];
  models?: string[];
  config?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface RegisterNodeResponse {
  node: {
    nodeId: string;
    nodeCode: string;
    status: string;
  };
  apiKey: string;
  setupInstructions: {
    nodeCode: string;
    cloudMotherUrl: string;
    steps: string[];
    configExample: Record<string, any>;
  };
}

export interface RoutingStats {
  hospitalId: number;
  period: string;
  nodes: {
    nodeId: string;
    nodeCode: string;
    status: string;
    isOnline: boolean;
  }[];
  summary: {
    totalRequests: number;
    localProcessed: number;
    cloudFallback: number;
    averageResponseTime: number;
  };
}

class LocalAiNodeService {
  private baseUrl = '/api/ai-nodes';

  /**
   * Register a new local AI node
   */
  async registerNode(data: RegisterNodeRequest): Promise<RegisterNodeResponse> {
    const response = await api.post(`${this.baseUrl}/register`, data);
    return response.data.data;
  }

  /**
   * Get all nodes for current hospital
   */
  async getNodes(hospitalId?: number): Promise<LocalAiNode[]> {
    const params = hospitalId ? { hospitalId } : {};
    const response = await api.get(this.baseUrl, { params });
    return response.data.data.nodes;
  }

  /**
   * Get node health details
   */
  async getNodeHealth(nodeId: string): Promise<NodeHealthData> {
    const response = await api.get(`${this.baseUrl}/${nodeId}/health`);
    return response.data.data;
  }

  /**
   * Update node configuration
   */
  async updateNodeConfig(nodeId: string, config: Record<string, any>): Promise<void> {
    await api.patch(`${this.baseUrl}/${nodeId}/config`, config);
  }

  /**
   * Deactivate a node
   */
  async deactivateNode(nodeId: string, reason: string): Promise<void> {
    await api.post(`${this.baseUrl}/${nodeId}/deactivate`, { reason });
  }

  /**
   * Reactivate a node
   */
  async reactivateNode(nodeId: string): Promise<{ newApiKey: string }> {
    const response = await api.post(`${this.baseUrl}/${nodeId}/reactivate`);
    return {
      newApiKey: response.data.data.newApiKey
    };
  }

  /**
   * Generate new API key for a node
   */
  async generateApiKey(nodeId: string, options?: {
    name?: string;
    scopes?: string[];
    expiresInDays?: number;
  }): Promise<{ keyId: string; apiKey: string; expiresAt: string }> {
    const response = await api.post(`${this.baseUrl}/${nodeId}/api-keys`, options);
    return response.data.data;
  }

  /**
   * Get routing statistics
   */
  async getRoutingStats(hospitalId?: number, days?: number): Promise<RoutingStats> {
    const params: Record<string, any> = {};
    if (hospitalId) params.hospitalId = hospitalId;
    if (days) params.days = days;
    
    const response = await api.get(`${this.baseUrl}/stats/routing`, { params });
    return response.data.data;
  }

  /**
   * Check if local node is available
   */
  async checkAvailability(hospitalId?: number, capability?: string): Promise<boolean> {
    const params: Record<string, any> = {};
    if (hospitalId) params.hospitalId = hospitalId;
    if (capability) params.capability = capability;
    
    const response = await api.get(`${this.baseUrl}/check-availability`, { params });
    return response.data.data.hasLocalNode;
  }

  /**
   * Route an AI request through local node
   */
  async routeRequest(
    requestType: 'SCRIBE' | 'TRANSCRIPTION' | 'PRESCRIPTION' | 'CHAT' | 'IMAGE',
    payload: any,
    priority?: 'LOW' | 'NORMAL' | 'HIGH'
  ): Promise<{
    success: boolean;
    data: any;
    responseTime: number;
    processedBy: 'LOCAL_NODE' | 'CLOUD';
    routedTo: {
      nodeId?: string;
      nodeCode?: string;
      type: 'LOCAL' | 'CLOUD';
    };
  }> {
    const response = await api.post(`${this.baseUrl}/route`, {
      requestType,
      payload,
      priority
    });
    return response.data.data;
  }

  /**
   * Run maintenance (admin only)
   */
  async runMaintenance(): Promise<{
    expiredKeys: number;
    cleanedHeartbeats: number;
    offlineNodes: any[];
  }> {
    const response = await api.post(`${this.baseUrl}/maintenance`);
    return response.data.data;
  }
}

export const localAiNodeService = new LocalAiNodeService();
export default localAiNodeService;
