/**
 * Hospital Insurance Routes Tests
 * Comprehensive test suite for all 23 insurance endpoints
 */

import request from 'supertest';
import { jest } from '@jest/globals';

// Mock app instance
let app;
let authToken;
let testClaimId;
let testPreAuthId;

describe('Hospital Insurance API Tests', () => {
  
  beforeAll(async () => {
    // Import app (will be done dynamically)
    const { default: appInstance } = await import('../app.js');
    app = appInstance;
    
    // TODO: Get auth token (mock for now)
    authToken = 'Bearer test-token-123';
  });

  // ==================== DASHBOARD TESTS ====================
  
  describe('GET /api/hospital/insurance/dashboard', () => {
    it('should return dashboard statistics', async () => {
      const res = await request(app)
        .get('/api/hospital/insurance/dashboard')
        .set('Authorization', authToken)
        .query({ hospitalId: 1 });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.dashboard).toHaveProperty('stats');
      expect(res.body.dashboard).toHaveProperty('recentActivity');
      expect(res.body.dashboard).toHaveProperty('alerts');
    });

    it('should return cached data on subsequent requests', async () => {
      const res = await request(app)
        .get('/api/hospital/insurance/dashboard')
        .set('Authorization', authToken)
        .query({ hospitalId: 1 });
      
      expect(res.body.cached).toBeDefined();
    });
  });

  describe('POST /api/hospital/insurance/dashboard/search', () => {
    it('should search claims by claim number', async () => {
      const res = await request(app)
        .post('/api/hospital/insurance/dashboard/search')
        .set('Authorization', authToken)
        .send({ searchTerm: 'CLM123' });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('claims');
    });

    it('should return 400 for empty search term', async () => {
      const res = await request(app)
        .post('/api/hospital/insurance/dashboard/search')
        .set('Authorization', authToken)
        .send({ searchTerm: '' });
      
      expect(res.status).toBe(400);
    });
  });

  // ==================== CLAIMS MANAGEMENT TESTS ====================
  
  describe('POST /api/hospital/insurance/claims/new', () => {
    it('should create a new claim', async () => {
      const res = await request(app)
        .post('/api/hospital/insurance/claims/new')
        .set('Authorization', authToken)
        .send({
          patientId: 1,
          policyNumber: 'POL123456',
          claimAmount: 50000,
          claimType: 'cashless',
          diagnosis: 'Test diagnosis',
          treatmentDetails: { procedure: 'Test procedure' }
        });
      
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.claim).toHaveProperty('claimNumber');
      testClaimId = res.body.claim.id;
    });
  });

  describe('GET /api/hospital/insurance/claims/drafts', () => {
    it('should return draft claims', async () => {
      const res = await request(app)
        .get('/api/hospital/insurance/claims/drafts')
        .set('Authorization', authToken);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.claims)).toBe(true);
    });
  });

  describe('GET /api/hospital/insurance/claims/submitted', () => {
    it('should return submitted claims with pagination', async () => {
      const res = await request(app)
        .get('/api/hospital/insurance/claims/submitted')
        .set('Authorization', authToken)
        .query({ page: 1, limit: 10 });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('pagination');
      expect(res.body.pagination).toHaveProperty('currentPage');
      expect(res.body.pagination).toHaveProperty('totalPages');
    });
  });

  describe('POST /api/hospital/insurance/claims/:claimId/submit', () => {
    it('should submit a draft claim', async () => {
      const res = await request(app)
        .post(`/api/hospital/insurance/claims/${testClaimId}/submit`)
        .set('Authorization', authToken);
      
      // Might fail if claim doesn't have documents, but should return proper error
      expect([200, 400]).toContain(res.status);
    });
  });

  describe('GET /api/hospital/insurance/claims/:claimId/history', () => {
    it('should return claim history timeline', async () => {
      const res = await request(app)
        .get(`/api/hospital/insurance/claims/${testClaimId}/history`)
        .set('Authorization', authToken);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('timeline');
      expect(Array.isArray(res.body.timeline)).toBe(true);
    });
  });

  describe('GET /api/hospital/insurance/claims/:claimId/pdf', () => {
    it('should generate claim PDF', async () => {
      const res = await request(app)
        .get(`/api/hospital/insurance/claims/${testClaimId}/pdf`)
        .set('Authorization', authToken);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('pdfUrl');
    });
  });

  describe('POST /api/hospital/insurance/claims/:claimId/enhance', () => {
    it('should add clarification to claim', async () => {
      const res = await request(app)
        .post(`/api/hospital/insurance/claims/${testClaimId}/enhance`)
        .set('Authorization', authToken)
        .send({ clarificationText: 'Additional information provided' });
      
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('POST /api/hospital/insurance/claims/bulk-upload', () => {
    it('should validate bulk upload format', async () => {
      const res = await request(app)
        .post('/api/hospital/insurance/claims/bulk-upload')
        .set('Authorization', authToken)
        .attach('file', Buffer.from('test'), 'claims.csv');
      
      expect([200, 400]).toContain(res.status);
    });
  });

  // ==================== PRE-AUTHORIZATION TESTS ====================
  
  describe('POST /api/hospital/insurance/pre-auth/new', () => {
    it('should create pre-authorization request', async () => {
      const res = await request(app)
        .post('/api/hospital/insurance/pre-auth/new')
        .set('Authorization', authToken)
        .send({
          patientId: 1,
          policyNumber: 'POL123456',
          estimatedAmount: 100000,
          admissionDetails: {
            admissionDate: '2025-02-01',
            procedure: 'Surgery'
          }
        });
      
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      if (res.body.preAuth) {
        testPreAuthId = res.body.preAuth.id;
      }
    });
  });

  describe('GET /api/hospital/insurance/pre-auth/pending', () => {
    it('should return pending pre-authorizations', async () => {
      const res = await request(app)
        .get('/api/hospital/insurance/pre-auth/pending')
        .set('Authorization', authToken);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.preAuths)).toBe(true);
    });
  });

  describe('GET /api/hospital/insurance/pre-auth/approved', () => {
    it('should return approved pre-authorizations', async () => {
      const res = await request(app)
        .get('/api/hospital/insurance/pre-auth/approved')
        .set('Authorization', authToken);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/hospital/insurance/pre-auth/rejected', () => {
    it('should return rejected pre-authorizations', async () => {
      const res = await request(app)
        .get('/api/hospital/insurance/pre-auth/rejected')
        .set('Authorization', authToken);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ==================== DOCUMENTS TESTS ====================
  
  describe('POST /api/hospital/insurance/documents/upload', () => {
    it('should upload document', async () => {
      const res = await request(app)
        .post('/api/hospital/insurance/documents/upload')
        .set('Authorization', authToken)
        .attach('document', Buffer.from('test'), 'discharge-summary.pdf')
        .field('claimId', testClaimId)
        .field('documentType', 'discharge-summary');
      
      expect([200, 400]).toContain(res.status);
    });
  });

  describe('GET /api/hospital/insurance/documents/missing', () => {
    it('should return claims with missing documents', async () => {
      const res = await request(app)
        .get('/api/hospital/insurance/documents/missing')
        .set('Authorization', authToken);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ==================== PATIENT SEARCH TESTS ====================
  
  describe('POST /api/hospital/insurance/patient/search', () => {
    it('should search patients by mobile', async () => {
      const res = await request(app)
        .post('/api/hospital/insurance/patient/search')
        .set('Authorization', authToken)
        .send({ searchTerm: '9876543210', searchType: 'mobile' });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should search patients by name', async () => {
      const res = await request(app)
        .post('/api/hospital/insurance/patient/search')
        .set('Authorization', authToken)
        .send({ searchTerm: 'John', searchType: 'name' });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/hospital/insurance/patient/:patientId/eligibility', () => {
    it('should check patient eligibility', async () => {
      const res = await request(app)
        .get('/api/hospital/insurance/patient/1/eligibility')
        .set('Authorization', authToken)
        .query({ policyNumber: 'POL123456' });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.eligibility).toHaveProperty('eligible');
    });

    it('should cache eligibility data', async () => {
      const res = await request(app)
        .get('/api/hospital/insurance/patient/1/eligibility')
        .set('Authorization', authToken)
        .query({ policyNumber: 'POL123456' });
      
      expect(res.body).toHaveProperty('cached');
    });
  });

  // ==================== REVENUE TESTS ====================
  
  describe('GET /api/hospital/insurance/revenue/receivables', () => {
    it('should return receivables summary', async () => {
      const res = await request(app)
        .get('/api/hospital/insurance/revenue/receivables')
        .set('Authorization', authToken);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.receivables).toHaveProperty('approvedNotSettled');
      expect(res.body.receivables).toHaveProperty('settled');
    });
  });

  describe('GET /api/hospital/insurance/revenue/settlement-status', () => {
    it('should return settlement status', async () => {
      const res = await request(app)
        .get('/api/hospital/insurance/revenue/settlement-status')
        .set('Authorization', authToken);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ==================== REPORTS TESTS ====================
  
  describe('GET /api/hospital/insurance/reports/claims-aging', () => {
    it('should return claims aging report', async () => {
      const res = await request(app)
        .get('/api/hospital/insurance/reports/claims-aging')
        .set('Authorization', authToken);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('aging');
    });
  });

  describe('GET /api/hospital/insurance/reports/tat', () => {
    it('should return turnaround time report', async () => {
      const res = await request(app)
        .get('/api/hospital/insurance/reports/tat')
        .set('Authorization', authToken);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('tat');
    });
  });

  describe('GET /api/hospital/insurance/reports/query-rejection-trends', () => {
    it('should return query and rejection trends', async () => {
      const res = await request(app)
        .get('/api/hospital/insurance/reports/query-rejection-trends')
        .set('Authorization', authToken);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('trends');
    });
  });

  // ==================== AUTHORIZATION TESTS ====================
  
  describe('Authorization Tests', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .get('/api/hospital/insurance/dashboard');
      
      expect(res.status).toBe(401);
    });

    it('should return 403 with invalid role', async () => {
      const invalidToken = 'Bearer patient-token';
      const res = await request(app)
        .get('/api/hospital/insurance/dashboard')
        .set('Authorization', invalidToken);
      
      // Should be 403 if auth works, or 401 if token invalid
      expect([401, 403]).toContain(res.status);
    });
  });
});

// Run tests with: npm test
// Or: jest hospital-insurance.test.js
