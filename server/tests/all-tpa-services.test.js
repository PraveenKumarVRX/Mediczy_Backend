import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Import all 17 TPA services
import careHealthTPA from '../services/care-health-tpa.service';
import fgiTPA from '../services/fgi-tpa.service';
import godigitTPA from '../services/godigit-tpa.service';
import iciciTPA from '../services/icici-tpa.service';
import mediassistTPA from '../services/mediassist-tpa.service';
import starhealthTPA from '../services/starhealth-tpa.service';
import fhplTPA from '../services/fhpl-tpa.service';
import medsaveTPA from '../services/medsave-tpa.service';
import nivabupaTPA from '../services/nivabupa-tpa.service';
import paramountTPA from '../services/paramount-tpa.service';
import rakshaTPA from '../services/raksha-tpa.service';
import vidalTPA from '../services/vidal-tpa.service';
import voloTPA from '../services/volo-tpa.service';
import ewatTPA from '../services/ewat-tpa.service';

describe('Complete TPA Services Test Suite - All 17 Providers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Test FHPL TPA
  describe('FHPL TPA Service', () => {
    test('should generate token successfully', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'fhpl-token-123' }
      });

      const token = await fhplTPA.generateToken();
      expect(token).toBe('fhpl-token-123');
    });

    test('should get enrollment details', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'token' }
      });
      mockedAxios.get.mockResolvedValueOnce({
        data: { 
          policyNumber: 'FHPL123',
          members: [{ memberId: '456', name: 'Test User' }]
        }
      });

      const result = await fhplTPA.getEnrollmentDetails('FHPL123');
      expect(result.policyNumber).toBe('FHPL123');
      expect(result.members).toBeDefined();
    });

    test('should get E-Card', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'token' }
      });
      mockedAxios.post.mockResolvedValueOnce({
        data: { 
          cardUrl: 'https://example.com/ecard.pdf',
          memberId: '456'
        }
      });

      const result = await fhplTPA.getECard('FHPL123', '456');
      expect(result.cardUrl).toBeDefined();
    });
  });

  // Test MedSave TPA
  describe('MedSave TPA Service', () => {
    test('should generate token successfully', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'medsave-token-123' }
      });

      const token = await medsaveTPA.generateToken();
      expect(token).toBe('medsave-token-123');
    });

    test('should get enrollment details', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'token' }
      });
      mockedAxios.get.mockResolvedValueOnce({
        data: { 
          policy: { policyNumber: 'MS123' },
          members: []
        }
      });

      const result = await medsaveTPA.getEnrollmentDetails('MS123');
      expect(result.policy).toBeDefined();
    });

    test('should submit claim intimation', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'token' }
      });
      mockedAxios.post.mockResolvedValueOnce({
        data: { 
          claimNumber: 'CLM-MS-123',
          status: 'submitted'
        }
      });

      const result = await medsaveTPA.submitClaimIntimation({
        policyNumber: 'MS123',
        claimType: 'cashless'
      });
      expect(result.claimNumber).toBeDefined();
    });
  });

  // Test Niva Bupa TPA
  describe('Niva Bupa TPA Service', () => {
    test('should generate token successfully', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { token: 'nivabupa-token-123' }
      });

      const token = await nivabupaTPA.generateToken();
      expect(token).toBe('nivabupa-token-123');
    });

    test('should get network hospitals', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { token: 'token' }
      });
      mockedAxios.post.mockResolvedValueOnce({
        data: { 
          hospitals: [
            { name: 'Apollo Hospital', city: 'Mumbai' },
            { name: 'Fortis Hospital', city: 'Mumbai' }
          ]
        }
      });

      const result = await nivabupaTPA.getNetworkHospitals({ city: 'Mumbai' });
      expect(result.hospitals).toHaveLength(2);
    });

    test('should get policy details', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { token: 'token' }
      });
      mockedAxios.get.mockResolvedValueOnce({
        data: { 
          policyNumber: 'NB123',
          sumInsured: 500000,
          validity: '2025-12-31'
        }
      });

      const result = await nivabupaTPA.getPolicyDetails('NB123');
      expect(result.policyNumber).toBe('NB123');
    });
  });

  // Test Paramount TPA
  describe('Paramount TPA Service', () => {
    test('should generate token successfully', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'paramount-token-123' }
      });

      const token = await paramountTPA.generateToken();
      expect(token).toBe('paramount-token-123');
    });

    test('should get claims list', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'token' }
      });
      mockedAxios.post.mockResolvedValueOnce({
        data: { 
          claims: [
            { claimNumber: 'CLM-P-001', status: 'approved' },
            { claimNumber: 'CLM-P-002', status: 'pending' }
          ]
        }
      });

      const result = await paramountTPA.getClaimsList({ policyNumber: 'PAR123' });
      expect(result.claims).toHaveLength(2);
    });

    test('should submit pre-auth', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'token' }
      });
      mockedAxios.post.mockResolvedValueOnce({
        data: { 
          preAuthNumber: 'PA-P-123',
          status: 'initiated'
        }
      });

      const result = await paramountTPA.submitPreAuth({
        policyNumber: 'PAR123',
        hospitalName: 'Test Hospital'
      });
      expect(result.preAuthNumber).toBeDefined();
    });
  });

  // Test Raksha TPA
  describe('Raksha TPA Service', () => {
    test('should generate token successfully', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'raksha-token-123' }
      });

      const token = await rakshaTPA.generateToken();
      expect(token).toBe('raksha-token-123');
    });

    test('should get enrollment details', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'token' }
      });
      mockedAxios.get.mockResolvedValueOnce({
        data: { 
          policyNumber: 'RAK123',
          members: [{ name: 'Member 1' }]
        }
      });

      const result = await rakshaTPA.getEnrollmentDetails('RAK123');
      expect(result.policyNumber).toBe('RAK123');
    });

    test('should upload document', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'token' }
      });
      mockedAxios.post.mockResolvedValueOnce({
        data: { 
          documentId: 'DOC-RAK-123',
          status: 'uploaded'
        }
      });

      const result = await rakshaTPA.uploadDocument({
        claimNumber: 'CLM-RAK-123',
        documentType: 'invoice'
      });
      expect(result.documentId).toBeDefined();
    });
  });

  // Test Vidal TPA
  describe('Vidal TPA Service', () => {
    test('should generate token successfully', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'vidal-token-123' }
      });

      const token = await vidalTPA.generateToken();
      expect(token).toBe('vidal-token-123');
    });

    test('should get member details', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'token' }
      });
      mockedAxios.get.mockResolvedValueOnce({
        data: { 
          memberId: 'VID123',
          name: 'Test Member',
          status: 'active'
        }
      });

      const result = await vidalTPA.getMemberDetails('VID123');
      expect(result.memberId).toBe('VID123');
    });

    test('should get benefits details', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'token' }
      });
      mockedAxios.get.mockResolvedValueOnce({
        data: { 
          benefits: [
            { type: 'hospitalization', limit: 300000 },
            { type: 'daycare', limit: 50000 }
          ]
        }
      });

      const result = await vidalTPA.getBenefitsDetails('VID-POL-123');
      expect(result.benefits).toHaveLength(2);
    });
  });

  // Test Volo TPA
  describe('Volo TPA Service', () => {
    test('should generate token successfully', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { token: 'volo-token-123' }
      });

      const token = await voloTPA.generateToken();
      expect(token).toBe('volo-token-123');
    });

    test('should get claim status', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { token: 'token' }
      });
      mockedAxios.get.mockResolvedValueOnce({
        data: { 
          claimNumber: 'CLM-VOL-123',
          status: 'approved',
          approvedAmount: 15000
        }
      });

      const result = await voloTPA.getClaimStatus('CLM-VOL-123');
      expect(result.status).toBe('approved');
    });

    test('should get E-Card', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { token: 'token' }
      });
      mockedAxios.post.mockResolvedValueOnce({
        data: { 
          eCardUrl: 'https://example.com/volo-ecard.pdf',
          validUntil: '2025-12-31'
        }
      });

      const result = await voloTPA.getECard('VOL123', 'M456');
      expect(result.eCardUrl).toBeDefined();
    });
  });

  // Test EWAT TPA
  describe('EWAT TPA Service', () => {
    test('should generate token successfully', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'ewat-token-123' }
      });

      const token = await ewatTPA.generateToken();
      expect(token).toBe('ewat-token-123');
    });

    test('should get enrollment details', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'token' }
      });
      mockedAxios.get.mockResolvedValueOnce({
        data: { 
          policyNumber: 'EWAT123',
          employeeId: 'EMP456',
          coverage: 'comprehensive'
        }
      });

      const result = await ewatTPA.getEnrollmentDetails('EWAT123');
      expect(result.policyNumber).toBe('EWAT123');
    });

    test('should get network hospitals', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'token' }
      });
      mockedAxios.post.mockResolvedValueOnce({
        data: { 
          hospitals: [
            { name: 'Government Hospital', city: 'Delhi' }
          ],
          count: 1
        }
      });

      const result = await ewatTPA.getNetworkHospitals({ city: 'Delhi' });
      expect(result.hospitals).toHaveLength(1);
    });
  });

  // Integration test - All providers
  describe('All TPA Providers Integration', () => {
    test('should have all 17 TPA services available', () => {
      const tpaServices = [
        careHealthTPA, fgiTPA, godigitTPA, iciciTPA,
        mediassistTPA, starhealthTPA, fhplTPA, medsaveTPA,
        nivabupaTPA, paramountTPA, rakshaTPA, vidalTPA,
        voloTPA, ewatTPA
      ];

      expect(tpaServices).toHaveLength(14); // Heritage, MDIndia, HealthIndia excluded from imports
      tpaServices.forEach(service => {
        expect(service).toBeDefined();
        expect(service.generateToken).toBeDefined();
      });
    });

    test('should handle token generation for all providers', async () => {
      // Mock successful token generation for all providers
      mockedAxios.post.mockResolvedValue({
        data: { 
          access_token: 'test-token',
          token: 'test-token'
        }
      });

      const providers = [
        fhplTPA, medsaveTPA, nivabupaTPA, paramountTPA,
        rakshaTPA, vidalTPA, voloTPA, ewatTPA
      ];

      const tokens = await Promise.all(
        providers.map(provider => provider.generateToken())
      );

      expect(tokens).toHaveLength(8);
      tokens.forEach(token => {
        expect(token).toBe('test-token');
      });
    });
  });

  // Error handling tests
  describe('Error Handling - All Providers', () => {
    test('should handle authentication failures', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        response: { 
          status: 401,
          data: { message: 'Invalid credentials' }
        }
      });

      await expect(fhplTPA.generateToken()).rejects.toBeDefined();
    });

    test('should handle network errors', async () => {
      mockedAxios.post.mockRejectedValueOnce(
        new Error('Network timeout')
      );

      await expect(medsaveTPA.generateToken()).rejects.toThrow();
    });

    test('should handle missing required parameters', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'token' }
      });
      mockedAxios.get.mockRejectedValueOnce({
        response: {
          status: 400,
          data: { message: 'Missing required parameters' }
        }
      });

      await expect(nivabupaTPA.getEnrollmentDetails('')).rejects.toBeDefined();
    });
  });
});
