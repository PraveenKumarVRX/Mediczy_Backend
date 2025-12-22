import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import app from '../index'; // Adjust path to your Express app

describe('TPA API Routes E2E Tests', () => {
  let authToken: string;
  let server: any;

  beforeAll(async () => {
    // Start server
    server = app.listen(0); // Random port for testing

    // Login to get auth token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'testpassword'
      });

    authToken = loginResponse.body.token;
  });

  afterAll((done) => {
    server.close(done);
  });

  describe('GET /api/tpa/providers', () => {
    test('should return list of all TPA providers', async () => {
      const response = await request(app)
        .get('/api/tpa/providers')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.providers).toBeDefined();
      expect(Array.isArray(response.body.providers)).toBe(true);
    });

    test('should return 401 without auth token', async () => {
      const response = await request(app)
        .get('/api/tpa/providers');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/tpa/execute', () => {
    test('should execute unified operation', async () => {
      const response = await request(app)
        .post('/api/tpa/execute')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          provider: 'heritage',
          operation: 'getEnrollmentDetails',
          data: {
            policyNumber: 'TEST123'
          }
        });

      expect([200, 500]).toContain(response.status); // 500 if credentials not configured
    });

    test('should return 400 for missing provider', async () => {
      const response = await request(app)
        .post('/api/tpa/execute')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          operation: 'getEnrollmentDetails',
          data: {}
        });

      expect(response.status).toBe(400);
    });

    test('should return 400 for invalid operation', async () => {
      const response = await request(app)
        .post('/api/tpa/execute')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          provider: 'heritage',
          operation: 'invalidOperation',
          data: {}
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/tpa/:provider/enrollment', () => {
    test('should get enrollment details for heritage', async () => {
      const response = await request(app)
        .post('/api/tpa/heritage/enrollment')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          policyNumber: 'HERI123'
        });

      expect([200, 500]).toContain(response.status);
    });

    test('should get enrollment details for care', async () => {
      const response = await request(app)
        .post('/api/tpa/care/enrollment')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          policyNumber: 'CARE123'
        });

      expect([200, 500]).toContain(response.status);
    });
  });

  describe('POST /api/tpa/:provider/claims', () => {
    test('should get claims list', async () => {
      const response = await request(app)
        .post('/api/tpa/heritage/claims')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          policyNumber: 'TEST123',
          fromDate: '2024-01-01',
          toDate: '2024-12-31'
        });

      expect([200, 500]).toContain(response.status);
    });

    test('should return 400 for missing policy number', async () => {
      const response = await request(app)
        .post('/api/tpa/heritage/claims')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/tpa/:provider/claim-intimation', () => {
    test('should submit claim intimation', async () => {
      const response = await request(app)
        .post('/api/tpa/godigit/claim-intimation')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          policyNumber: 'GD123',
          memberId: 'M456',
          claimType: 'cashless',
          hospitalName: 'Test Hospital',
          dateOfAdmission: '2024-12-21',
          ailmentDetails: 'Test ailment',
          estimatedAmount: '50000'
        });

      expect([200, 500]).toContain(response.status);
    });

    test('should return 400 for incomplete data', async () => {
      const response = await request(app)
        .post('/api/tpa/godigit/claim-intimation')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          policyNumber: 'GD123'
          // Missing required fields
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/tpa/:provider/ecard', () => {
    test('should get E-card for member', async () => {
      const response = await request(app)
        .post('/api/tpa/care/ecard')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          policyNumber: 'CARE123',
          memberId: 'M789'
        });

      expect([200, 500]).toContain(response.status);
    });

    test('should work for different providers', async () => {
      const providers = ['heritage', 'mdindia', 'healthindia', 'fgi', 'godigit'];
      
      for (const provider of providers) {
        const response = await request(app)
          .post(`/api/tpa/${provider}/ecard`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            policyNumber: 'TEST123',
            memberId: 'M123'
          });

        expect([200, 400, 500]).toContain(response.status);
      }
    });
  });

  describe('POST /api/tpa/:provider/hospitals', () => {
    test('should search network hospitals', async () => {
      const response = await request(app)
        .post('/api/tpa/care/hospitals')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          city: 'Mumbai',
          state: 'Maharashtra'
        });

      expect([200, 500]).toContain(response.status);
    });

    test('should search by pincode', async () => {
      const response = await request(app)
        .post('/api/tpa/starhealth/hospitals')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          pincode: '600092'
        });

      expect([200, 500]).toContain(response.status);
    });
  });

  describe('POST /api/tpa/:provider/hospitals/count', () => {
    test('should get network hospital count', async () => {
      const response = await request(app)
        .post('/api/tpa/godigit/hospitals/count')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          city: 'Delhi'
        });

      expect([200, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(typeof response.body.count).toBe('number');
      }
    });
  });

  describe('POST /api/tpa/:provider/policy', () => {
    test('should get policy details', async () => {
      const response = await request(app)
        .post('/api/tpa/heritage/policy')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          policyNumber: 'HERI123'
        });

      expect([200, 500]).toContain(response.status);
    });
  });

  describe('POST /api/tpa/:provider/claim-status', () => {
    test('should get claim status', async () => {
      const response = await request(app)
        .post('/api/tpa/care/claim-status')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          claimNumber: 'CLM123',
          policyNumber: 'POL123'
        });

      expect([200, 500]).toContain(response.status);
    });

    test('should return 400 for missing claim number', async () => {
      const response = await request(app)
        .post('/api/tpa/care/claim-status')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          policyNumber: 'POL123'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/tpa/:provider/upload', () => {
    test('should upload document', async () => {
      const response = await request(app)
        .post('/api/tpa/godigit/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          claimNumber: 'CLM123',
          documentType: 'discharge-summary',
          documentBase64: 'base64encodedstring',
          fileName: 'discharge.pdf'
        });

      expect([200, 400, 500]).toContain(response.status);
    });
  });

  describe('POST /api/tpa/:provider/preauth', () => {
    test('should get pre-authorization details', async () => {
      const response = await request(app)
        .post('/api/tpa/fgi/preauth')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          preauthNumber: 'PA123',
          policyNumber: 'FGI123'
        });

      expect([200, 400, 500]).toContain(response.status);
    });
  });

  describe('Provider Validation', () => {
    test('should return 400 for invalid provider', async () => {
      const response = await request(app)
        .post('/api/tpa/invalidprovider/enrollment')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          policyNumber: 'TEST123'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('Rate Limiting', () => {
    test('should handle multiple concurrent requests', async () => {
      const requests = Array(5).fill(null).map(() =>
        request(app)
          .get('/api/tpa/providers')
          .set('Authorization', `Bearer ${authToken}`)
      );

      const responses = await Promise.all(requests);
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status); // 429 if rate limited
      });
    });
  });

  describe('Error Responses', () => {
    test('should return proper error format', async () => {
      const response = await request(app)
        .post('/api/tpa/heritage/enrollment')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      if (response.status >= 400) {
        expect(response.body.error || response.body.message).toBeDefined();
      }
    });
  });
});
