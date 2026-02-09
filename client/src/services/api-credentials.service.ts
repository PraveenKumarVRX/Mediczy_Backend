/**
 * API Credentials Provisioning Service
 * 
 * Handles generation and management of API credentials for aggregators/brokers
 * Integrates with super admin dashboard
 */

import api from '@/utils/api';

export interface ApiCredential {
  id: string;
  client_id: string;
  status: 'active' | 'expired' | 'rotated' | 'revoked';
  version: number;
  created_at: string;
  last_used_at?: string;
  rotation_required_at?: string;
  expires_at?: string;
  usage_count?: number;
  failed_attempts?: number;
}

export interface AggregatorWithCredentials {
  aggregator_id: number;
  broker_name: string;
  email: string;
  api_credentials?: ApiCredential[];
  api_credential_status?: 'pending' | 'generated' | 'active' | 'error';
  api_credential_error?: string;
}

class ApiCredentialsService {
  private token: string;

  constructor() {
    this.token = localStorage.getItem('adminToken') || '';
  }

  /**
   * Generate API credentials for an aggregator
   * @param aggregatorId - The aggregator ID
   * @param brokerName - The broker/aggregator name
   * @param description - Optional description
   * @returns Generated credentials with client_id and client_secret
   */
  async generateCredentialsForAggregator(
    aggregatorId: number,
    brokerName: string,
    description?: string
  ): Promise<{ client_id: string; client_secret: string; credential_id: string }> {
    try {
      const response = await api.post(
        '/api/admin/api-credentials/generate',
        {
          organization_id: aggregatorId, // Map aggregator to organization
          name: `${brokerName} - Mobile API Credential`,
          description: description || `API credential for aggregator: ${brokerName}`,
          integration_type: 'aggregator_api',
          scopes: ['aggregator:auth', 'partner:manage', 'network:view'],
          metadata: {
            aggregator_id: aggregatorId,
            aggregator_name: brokerName,
            created_for_type: 'aggregator_broker',
          },
        },
        {
          headers: { Authorization: `Bearer ${this.token}` },
        }
      );

      return {
        client_id: response.data.data.client_id,
        client_secret: response.data.data.client_secret,
        credential_id: response.data.data.id,
      };
    } catch (error: any) {
      console.error('Error generating API credentials:', error);
      throw new Error(
        error.response?.data?.message || 'Failed to generate API credentials'
      );
    }
  }

  /**
   * Get all API credentials (super admin only)
   */
  async getAllCredentials(): Promise<ApiCredential[]> {
    try {
      const response = await api.get(
        '/api/admin/api-credentials',
        {
          headers: { Authorization: `Bearer ${this.token}` },
        }
      );

      return response.data.data || [];
    } catch (error: any) {
      console.error('Error fetching API credentials:', error);
      throw new Error(
        error.response?.data?.message || 'Failed to fetch API credentials'
      );
    }
  }

  /**
   * Get API credentials for an aggregator
   */
  async getAggregatorCredentials(
    aggregatorId: number
  ): Promise<ApiCredential[]> {
    try {
      const response = await api.get(
        `/api/admin/api-credentials?organization_id=${aggregatorId}`,
        {
          headers: { Authorization: `Bearer ${this.token}` },
        }
      );

      return response.data.data || [];
    } catch (error: any) {
      console.error('Error fetching API credentials:', error);
      throw new Error(
        error.response?.data?.message || 'Failed to fetch API credentials'
      );
    }
  }

  /**
   * Rotate API credentials for an aggregator
   */
  async rotateCredentials(
    credentialId: string,
    gracePeriodDays?: number
  ): Promise<{ status: string; grace_period_ends_at: string }> {
    try {
      const response = await api.post(
        `/api/admin/api-credentials/${credentialId}/rotate`,
        {
          grace_period_days: gracePeriodDays || 7,
        },
        {
          headers: { Authorization: `Bearer ${this.token}` },
        }
      );

      return response.data.data;
    } catch (error: any) {
      console.error('Error rotating credentials:', error);
      throw new Error(
        error.response?.data?.message || 'Failed to rotate credentials'
      );
    }
  }

  /**
   * Revoke API credentials (emergency)
   */
  async revokeCredentials(
    credentialId: string,
    reason?: string
  ): Promise<{ status: string }> {
    try {
      const response = await api.post(
        `/api/admin/api-credentials/${credentialId}/revoke`,
        {
          reason: reason || 'Revoked by super admin',
        },
        {
          headers: { Authorization: `Bearer ${this.token}` },
        }
      );

      return response.data.data;
    } catch (error: any) {
      console.error('Error revoking credentials:', error);
      throw new Error(
        error.response?.data?.message || 'Failed to revoke credentials'
      );
    }
  }

  /**
   * Format client secret for secure display (never show full value)
   */
  static formatSecretForDisplay(secret: string): string {
    if (secret.length <= 10) return '••••••••';
    return `${secret.substring(0, 4)}••••••••${secret.substring(secret.length - 4)}`;
  }

  /**
   * Check if credential needs rotation
   */
  static needsRotation(credential: ApiCredential): boolean {
    if (!credential.rotation_required_at) return false;
    return new Date(credential.rotation_required_at) <= new Date();
  }

  /**
   * Check if credential is expired
   */
  static isExpired(credential: ApiCredential): boolean {
    if (!credential.expires_at) return false;
    return new Date(credential.expires_at) <= new Date();
  }

  /**
   * Get credential status badge color
   */
  static getStatusColor(
    status: 'active' | 'expired' | 'rotated' | 'revoked'
  ): string {
    const colors: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      expired: 'bg-red-100 text-red-800',
      rotated: 'bg-yellow-100 text-yellow-800',
      revoked: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  }
}

export default new ApiCredentialsService();
