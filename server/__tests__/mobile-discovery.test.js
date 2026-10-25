import { describe, test, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { buildMobileDiscoveryRouter, discoveryConfiguration } from '../routes/mobile-discovery.route.js';
import { buildMobilePatientBinding } from '../middleware/mobile-patient-binding.js';
const env = { MOBILE_DEPLOYMENT_ID: 'deployment-rado-001', MOBILE_DISPLAY_NAME: 'Rado Labs', MOBILE_PRODUCTS: 'patient,phlebo', MOBILE_PATIENT_CLINIC_ID: '42' };

describe('tenant mobile discovery and patient binding', () => {
  test('is credential-free, minimal and explicitly provisioned', async () => {
    const app = express(); app.use('/api/mobile', buildMobileDiscoveryRouter({ env }));
    const response = await request(app).get('/api/mobile/discovery');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ product: 'mediczy-mobile', mobileApiVersion: 1, apiBasePath: '/api', deploymentId: env.MOBILE_DEPLOYMENT_ID, displayName: 'Rado Labs', products: [{ id: 'patient', registration: 'disabled' }, { id: 'phlebo', registration: 'disabled' }] });
    expect(response.headers['cache-control']).toBe('no-store');
    expect((await request(app).get('/api/mobile/other')).status).toBe(404);
  });
  test('never invents identity or silently enables unsupported products', async () => {
    for (const config of [{}, { ...env, MOBILE_PRODUCTS: 'unknown' }, { ...env, MOBILE_PATIENT_CLINIC_ID: '' }]) expect(discoveryConfiguration(config)).toBeNull();
    const app = express(); app.use(buildMobileDiscoveryRouter({ env: {} }));
    expect((await request(app).get('/discovery')).status).toBe(503);
  });
  test('registration is patient-only and explicit', () => {
    expect(discoveryConfiguration({ ...env, MOBILE_PATIENT_REGISTRATION: 'open' }).products).toEqual([{ id: 'patient', registration: 'open' }, { id: 'phlebo', registration: 'disabled' }]);
  });
  test('limits unauthenticated discovery traffic', async () => {
    const app = express(); app.use(buildMobileDiscoveryRouter({ env }));
    for (let i = 0; i < 30; i++) expect((await request(app).get('/discovery')).status).toBe(200);
    expect((await request(app).get('/discovery')).status).toBe(429);
  });
  function patientApp(config) {
    const app = express(); app.use(express.json(), buildMobilePatientBinding(config));
    app.post(['/login', '/signup'], (req, res) => res.json(req.body)); return app;
  }
  test('client cannot select another clinic in a bound deployment', async () => {
    const response = await request(patientApp(env)).post('/login').send({ clinic_id: '99', clinic_slug: 'other', clinic_domain: 'other.example', email: 'test@example.org' });
    expect(response.body).toEqual({ clinic_id: '42', email: 'test@example.org' });
  });
  test('enforces registration policy and fails closed if tenant is missing', async () => {
    expect((await request(patientApp(env)).post('/signup').send({})).status).toBe(403);
    expect((await request(patientApp({ ...env, MOBILE_PATIENT_CLINIC_ID: '' })).post('/login').send({})).status).toBe(503);
    expect((await request(patientApp({ ...env, MOBILE_PATIENT_REGISTRATION: 'open' })).post('/signup').send({})).body.clinic_id).toBe('42');
  });
  test('unconfigured legacy shared deployments retain their existing contract', async () => {
    expect((await request(patientApp({})).post('/login').send({ clinic_slug: 'existing' })).body).toEqual({ clinic_slug: 'existing' });
  });
});
