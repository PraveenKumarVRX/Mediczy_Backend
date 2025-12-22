import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import tpaAggregator from '../services/tpa-aggregator.service';

describe('TPA Aggregator Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Provider Management', () => {
    test('should get provider instance by name', () => {
      const provider = tpaAggregator.getProvider('Heritage');
      expect(provider).toBeDefined();
    });

    test('should get provider instance by alternate name', () => {
      const provider1 = tpaAggregator.getProvider('Care Health');
      const provider2 = tpaAggregator.getProvider('Religare');
      expect(provider1).toBe(provider2);
    });

    test('should throw error for non-existent provider', () => {
      expect(() => tpaAggregator.getProvider('NonExistent')).toThrow();
    });

    test('should list all available providers', () => {
      const providers = tpaAggregator.getAvailableProviders();
      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBeGreaterThan(0);
    });
  });

  describe('Unified Operations', () => {
    test('should execute enrollment operation', async () => {
      const mockEnrollment = {
        memberDetails: { policyNumber: 'TEST123', memberId: 'M456' }
      };

      jest.spyOn(tpaAggregator.providers.heritage, 'getEnrollmentDetails')
        .mockResolvedValue(mockEnrollment);

      const result = await tpaAggregator.getEnrollmentDetails('heritage', {
        policyNumber: 'TEST123'
      });

      expect(result).toEqual(mockEnrollment);
    });

    test('should execute claims operation', async () => {
      const mockClaims = {
        claims: [{ claimNumber: 'C001', status: 'approved' }]
      };

      jest.spyOn(tpaAggregator.providers.care, 'getClaimsList')
        .mockResolvedValue(mockClaims);

      const result = await tpaAggregator.getClaimsList('care', {
        policyNumber: 'POL123'
      });

      expect(result.claims).toHaveLength(1);
    });

    test('should execute ecard operation', async () => {
      const mockECard = {
        cardUrl: 'https://example.com/ecard.pdf'
      };

      jest.spyOn(tpaAggregator.providers.fgi, 'getECard')
        .mockResolvedValue(mockECard);

      const result = await tpaAggregator.getECard('fgi', {
        policyNumber: 'FGI123',
        memberId: 'M789'
      });

      expect(result.cardUrl).toBeDefined();
    });

    test('should execute hospital search operation', async () => {
      const mockHospitals = {
        hospitals: [
          { name: 'Test Hospital', city: 'Mumbai' }
        ]
      };

      jest.spyOn(tpaAggregator.providers.godigit, 'getNetworkHospitals')
        .mockResolvedValue(mockHospitals);

      const result = await tpaAggregator.getNetworkHospitals('godigit', {
        city: 'Mumbai'
      });

      expect(result.hospitals).toHaveLength(1);
    });
  });

  describe('Capability Detection', () => {
    test('should get provider capabilities', () => {
      const capabilities = tpaAggregator.getProviderCapabilities('heritage');
      expect(capabilities).toBeDefined();
      expect(typeof capabilities.enrollment).toBe('boolean');
      expect(typeof capabilities.claims).toBe('boolean');
    });

    test('should detect enrollment capability', () => {
      const capabilities = tpaAggregator.getProviderCapabilities('care');
      expect(capabilities.enrollment).toBe(true);
    });

    test('should detect claims capability', () => {
      const capabilities = tpaAggregator.getProviderCapabilities('fgi');
      expect(capabilities.claims).toBe(true);
    });

    test('should detect ecard capability', () => {
      const capabilities = tpaAggregator.getProviderCapabilities('godigit');
      expect(capabilities.ecard).toBe(true);
    });
  });

  describe('Dynamic Operation Execution', () => {
    test('should execute dynamic operation', async () => {
      const mockResult = { success: true, data: {} };

      jest.spyOn(tpaAggregator.providers.icici, 'getNetworkHospitals')
        .mockResolvedValue(mockResult);

      const result = await tpaAggregator.executeOperation('icici', 'getNetworkHospitals', {
        city: 'Delhi'
      });

      expect(result.success).toBe(true);
    });

    test('should throw error for invalid operation', async () => {
      await expect(
        tpaAggregator.executeOperation('heritage', 'invalidOperation', {})
      ).rejects.toThrow();
    });

    test('should handle operation errors gracefully', async () => {
      jest.spyOn(tpaAggregator.providers.mediassist, 'getClaimsList')
        .mockRejectedValue(new Error('API Error'));

      await expect(
        tpaAggregator.getClaimsList('mediassist', { policyNumber: 'ERR123' })
      ).rejects.toThrow('API Error');
    });
  });

  describe('Provider Fallback', () => {
    test('should handle provider unavailability', async () => {
      jest.spyOn(tpaAggregator.providers.starhealth, 'getEnrollmentDetails')
        .mockRejectedValue(new Error('Provider unavailable'));

      await expect(
        tpaAggregator.getEnrollmentDetails('starhealth', { groupCode: 'GRP123' })
      ).rejects.toThrow('Provider unavailable');
    });
  });

  describe('Multi-Provider Operations', () => {
    test('should get enrollment from multiple providers', async () => {
      const mockEnrollment1 = { provider: 'heritage', data: { members: [] } };
      const mockEnrollment2 = { provider: 'care', data: { members: [] } };

      jest.spyOn(tpaAggregator.providers.heritage, 'getEnrollmentDetails')
        .mockResolvedValue(mockEnrollment1);
      jest.spyOn(tpaAggregator.providers.care, 'getEnrollmentDetails')
        .mockResolvedValue(mockEnrollment2);

      const results = await Promise.all([
        tpaAggregator.getEnrollmentDetails('heritage', { policyNumber: 'H123' }),
        tpaAggregator.getEnrollmentDetails('care', { policyNumber: 'C123' })
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].provider).toBe('heritage');
      expect(results[1].provider).toBe('care');
    });
  });

  describe('Data Validation', () => {
    test('should validate provider parameter', async () => {
      await expect(
        tpaAggregator.getEnrollmentDetails('', { policyNumber: 'TEST' })
      ).rejects.toThrow();
    });

    test('should validate operation parameters', async () => {
      await expect(
        tpaAggregator.getEnrollmentDetails('heritage', null)
      ).rejects.toBeDefined();
    });
  });

  describe('Provider Statistics', () => {
    test('should get total provider count', () => {
      const providers = tpaAggregator.getAvailableProviders();
      expect(providers.length).toBe(9); // 9 providers total
    });

    test('should get providers with specific capability', () => {
      const providers = tpaAggregator.getAvailableProviders();
      const enrollmentProviders = providers.filter(p => p.capabilities.enrollment);
      expect(enrollmentProviders.length).toBeGreaterThan(0);
    });
  });
});
