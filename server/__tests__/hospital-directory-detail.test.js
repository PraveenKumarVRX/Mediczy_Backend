import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const findOne = jest.fn();
const query = jest.fn();
jest.unstable_mockModule('../models/postgres/tenant.model.postgres.js', () => ({
  default: { findOne, findAll: jest.fn() },
}));
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
  postgresSequelize: { query },
}));

const { default: router } = await import('../routes/hospital.route.js');
const hospital = { id: 5, type: 'hospital', status: 'active', name: 'Example', address: { city: 'Pune' } };

function appFor(tenant) {
  const app = express();
  app.use((req, _res, next) => { req.tenant = tenant; next(); });
  app.use('/api', router);
  return app;
}

beforeEach(() => { findOne.mockReset(); query.mockReset(); });

test('main directory detail returns the same active hospital directory fields', async () => {
  findOne.mockResolvedValue(hospital);
  const res = await request(appFor(null)).get('/api/hospitals/tenant-5');
  expect(res.status).toBe(200);
  expect(res.body.data).toMatchObject({ id: 'tenant-5', name: 'Example', city: 'Pune' });
  expect(findOne).toHaveBeenCalledWith({ where: { id: 5, type: 'hospital', status: 'active' } });
});

test('tenant-scoped hosts cannot read another tenant detail', async () => {
  findOne.mockResolvedValue(hospital);
  const res = await request(appFor({ id: 6, type: 'clinic' })).get('/api/hospitals/tenant-5');
  expect(res.status).toBe(403);
});

test('invalid or missing ids return 404 without querying legacy with an invalid integer', async () => {
  findOne.mockResolvedValue(null);
  for (const id of ['0', 'tenant-0', 'tenant-bad', 'unknown-slug']) {
    const res = await request(appFor(null)).get(`/api/hospitals/${id}`);
    expect(res.status).toBe(404);
  }
  expect(query).not.toHaveBeenCalled();
});
