import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Import TPA services (adjust paths as needed)
import careHealthTPA from '../services/care-health-tpa.service';
import fgiTPA from '../services/fgi-tpa.service';
import godigitTPA from '../services/godigit-tpa.service';
import iciciTPA from '../services/icici-tpa.service';
import mediassistTPA from '../services/mediassist-tpa.service';
import starhealthTPA from '../services/starhealth-tpa.service';

describe('TPA Services Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Care Health TPA Service', () => {
    test('should generate token successfully', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          token: 'mock-token-12345',
          expiresIn: 3600
        }
      });

      const token = await careHealthTPA.generateToken();
      expect(token).toBe('mock-token-12345');
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    test('should get active enrollments', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { token: 'mock-token' }
      });
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          enrollments: [
            { memberId: '123', name: 'John Doe', status: 'active' }
          ]
        }
      });

      const result = await careHealthTPA.getActiveEnrollments({ policyNumber: 'POL123' });
      expect(result.enrollments).toHaveLength(1);
      expect(result.enrollments[0].memberId).toBe('123');
    });

    test('should get E-card', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { token: 'mock-token' }
      });
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          cardUrl: 'https://example.com/ecard.pdf',
          memberId: '123'
        }
      });

      const result = await careHealthTPA.getECard({ policyNumber: 'POL123', memberId: '123' });
      expect(result.cardUrl).toBeDefined();
    });

    test('should get network hospitals', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { token: 'mock-token' }
      });
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          hospitals: [
            { name: 'Test Hospital', city: 'Mumbai', state: 'Maharashtra' }
          ]
        }
      });

      const result = await careHealthTPA.getNetworkHospitals({ city: 'Mumbai' });
      expect(result.hospitals).toHaveLength(1);
    });
  });

  describe('FGI TPA Service', () => {
    test('should get enrollment details', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          memberDetails: {
            policyNumber: 'FGI123',
            memberId: 'M456',
            name: 'Jane Doe'
          }
        }
      });

      const result = await fgiTPA.getEnrollmentDetails({ policyNumber: 'FGI123', memberId: 'M456' });
      expect(result.memberDetails).toBeDefined();
      expect(result.memberDetails.name).toBe('Jane Doe');
    });

    test('should get claims list', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          claims: [
            { claimNumber: 'CLM001', status: 'approved', amount: 50000 }
          ]
        }
      });

      const result = await fgiTPA.getClaimsList({ policyNumber: 'FGI123' });
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].status).toBe('approved');
    });
  });

  describe('GoDigit TPA Service', () => {
    test('should generate auth token', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          authToken: 'godigit-token-123',
          expiresIn: 3600
        }
      });

      const token = await godigitTPA.generateToken();
      expect(token).toBe('godigit-token-123');
    });

    test('should get enrollment details', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { authToken: 'token' }
      });
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          memberDetails: {
            policyNumber: 'GD123',
            members: [{ memberId: 'M1', name: 'Test User' }]
          }
        }
      });

      const result = await godigitTPA.getEnrollmentDetails({ policyNumber: 'GD123' });
      expect(result.memberDetails).toBeDefined();
    });

    test('should initiate payment', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { authToken: 'token' }
      });
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          paymentUrl: 'https://payment.godigit.com/pay',
          transactionId: 'TXN123'
        }
      });

      const result = await godigitTPA.initiatePayment({
        customerId: 'C123',
        amount: 1000,
        returnUrl: 'https://example.com/return',
        purpose: 'Premium Payment'
      });

      expect(result.paymentUrl).toBeDefined();
      expect(result.transactionId).toBe('TXN123');
    });
  });

  describe('ICICI Lombard TPA Service', () => {
    test('should generate JWT token', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          token: 'icici-jwt-token',
          expiresIn: 600
        }
      });

      const token = await iciciTPA.generateToken();
      expect(token).toBe('icici-jwt-token');
    });

    test('should get network hospitals', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { token: 'jwt-token' }
      });
      mockedAxios.mockResolvedValueOnce({
        data: {
          hospitals: [
            { name: 'ICICI Hospital', city: 'Delhi' }
          ]
        }
      });

      const result = await iciciTPA.getNetworkHospitals({ city: 'Delhi' });
      expect(result.hospitals).toBeDefined();
    });

    test('should get E-card', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { token: 'jwt-token' }
      });
      mockedAxios.mockResolvedValueOnce({
        data: {
          cardData: { uhid: 'UHID123', policyNumber: 'POL123' }
        }
      });

      const result = await iciciTPA.getECard({ policyNumber: 'POL123', uhid: 'UHID123' });
      expect(result.cardData).toBeDefined();
    });
  });

  describe('MediAssist TPA Service', () => {
    test('should get enrollment details', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          beneficiaries: [
            { memberId: 'M123', name: 'Test Member' }
          ]
        }
      });

      const result = await mediassistTPA.getEnrollmentDetails({ policyNumber: 'MA123' });
      expect(result.beneficiaries).toBeDefined();
    });

    test('should get claims list', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          claims: [
            { claimNumber: 'C001', status: 'pending' }
          ]
        }
      });

      const result = await mediassistTPA.getClaimsList({ policyNumber: 'MA123' });
      expect(result.claims).toHaveLength(1);
    });

    test('should get network hospitals', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          hospitals: [
            { name: 'MediAssist Hospital', city: 'Bangalore' }
          ]
        }
      });

      const result = await mediassistTPA.getNetworkHospitals({ city: 'Bangalore' });
      expect(result.hospitals).toBeDefined();
    });
  });

  describe('Star Health TPA Service', () => {
    test('should generate token', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          token: 'starhealth-token',
          expiresIn: 3600
        }
      });

      const token = await starhealthTPA.generateToken();
      expect(token).toBe('starhealth-token');
    });

    test('should validate token', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { token: 'valid-token' }
      });
      mockedAxios.get.mockResolvedValueOnce({
        data: { valid: true }
      });

      const isValid = await starhealthTPA.validateToken();
      expect(isValid).toBe(true);
    });

    test('should get enrollment data', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { token: 'token' }
      });
      mockedAxios.mockResolvedValueOnce({
        data: {
          enrollmentData: [
            { employeeId: 'E123', name: 'Employee Name' }
          ]
        }
      });

      const result = await starhealthTPA.getEnrollmentDetails({ groupCode: 'GRP123' });
      expect(result.enrollmentData).toBeDefined();
    });

    test('should get network hospitals by pincode', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { token: 'token' }
      });
      mockedAxios.mockResolvedValueOnce({
        data: {
          hospitals: [
            { name: 'Star Hospital', pincode: '600092' }
          ]
        }
      });

      const result = await starhealthTPA.getNetworkHospitals({ pincode: '600092' });
      expect(result.hospitals).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

      await expect(careHealthTPA.generateToken()).rejects.toThrow('Network error');
    });

    test('should handle authentication failures', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        response: { status: 401, data: { message: 'Unauthorized' } }
      });

      await expect(fgiTPA.getEnrollmentDetails({ policyNumber: 'TEST' }))
        .rejects.toBeDefined();
    });

    test('should handle missing required parameters', async () => {
      await expect(godigitTPA.getECard({ policyNumber: '', memberId: '' }))
        .rejects.toBeDefined();
    });
  });
});
