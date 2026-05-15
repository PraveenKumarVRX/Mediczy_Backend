// @jest-environment node
import request from 'supertest';
import app from '../app.js'; // Adjust if your Express app export path differs

describe('Mobile Social Auth Endpoints', () => {
  describe('POST /api/mobile/auth/google', () => {
    it('should fail with missing idToken', async () => {
      const res = await request(app)
        .post('/api/mobile/auth/google')
        .send({});
      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('MISSING_TOKEN');
    });
    // Add a valid idToken test with a real/fake token if available
  });

  describe('POST /api/mobile/auth/facebook', () => {
    it('should fail with missing accessToken', async () => {
      const res = await request(app)
        .post('/api/mobile/auth/facebook')
        .send({});
      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('MISSING_TOKEN');
    });
    // Add a valid accessToken test with a real/fake token if available
  });
});
