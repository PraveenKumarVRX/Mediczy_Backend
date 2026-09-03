/**
 * Route tests for /api/v1/revenue-share/* (Tier 1), marketplace and Tele-ICU
 * (Tier 2).  Mocks pgPool + auth + all service modules; drives routers via supertest.
 */
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const mockQuery = jest.fn();
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: mockQuery } }));

const mockAuth = (req, _res, next) => { req.user = { id: 1, role: 'admin', organization_id: 42 }; next(); };
jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({ authUser: mockAuth }));

jest.unstable_mockModule('../services/revenue-share/revenue-share-ledger.service.js', () => ({
  upsertAgreement: jest.fn(), listAgreements: jest.fn(), recordRevenueEvent: jest.fn(),
  listLedger: jest.fn(), ledgerSummary: jest.fn(), transitionEntry: jest.fn(),
  FEE_TYPES: ['percent', 'flat', 'per_unit'],
}));
jest.unstable_mockModule('../services/revenue-share/rcm-success-fee.service.js', () => ({
  recordRecoveredRevenue: jest.fn(), getRcmFeeSummary: jest.fn(), listRcmFeeEntries: jest.fn(),
}));
jest.unstable_mockModule('../services/revenue-share/rcm-denial-workflow.service.js', () => ({
  runDenialRiskWorkflow: jest.fn(), getFollowupQueue: jest.fn(), claimFollowup: jest.fn(), resolveFollowup: jest.fn(),
}));
jest.unstable_mockModule('../services/revenue-share/homecare-billing.service.js', () => ({
  billHomecareEpisode: jest.fn(), billHelplineCall: jest.fn(), runSubscriptionBilling: jest.fn(),
  listBillingEvents: jest.fn(), getHomecareRevenueSummary: jest.fn(), HOMECARE_DOMAIN: 'homecare',
}));
jest.unstable_mockModule('../services/marketplace/specialist-marketplace.service.js', () => ({
  registerSpecialist: jest.fn(), searchSpecialists: jest.fn(), updateSpecialistStatus: jest.fn(),
  createRequest: jest.fn(), matchRequest: jest.fn(), assignSpecialist: jest.fn(), listRequests: jest.fn(),
  completeRequest: jest.fn(), getMarketplaceRevenueSummary: jest.fn(),
  SERVICE_TYPES: ['second_opinion', 'tele_radiology', 'tele_pathology', 'locum'],
}));
jest.unstable_mockModule('../services/marketplace/tele-pathology.service.js', () => ({
  registerSlide: jest.fn(), listSlides: jest.fn(), createConsult: jest.fn(), listConsults: jest.fn(),
  submitReport: jest.fn(), amendReport: jest.fn(), buildSynopticTemplate: jest.fn(), isSlideAdequate: jest.fn(),
  SLIDE_STAINS: ['H&E', 'IHC', 'PAP'], CONSULT_STATUSES: ['assigned', 'in_progress', 'reported'], PRIORITIES: ['routine', 'urgent', 'stat'],
}));
jest.unstable_mockModule('../services/tele-icu/tele-icu-device-bridge.service.js', () => ({
  registerBedDevice: jest.fn(), listBedDevices: jest.fn(), deviceHeartbeat: jest.fn(),
  startAvSession: jest.fn(), endAvSession: jest.fn(), issueCommand: jest.fn(), pollPendingCommands: jest.fn(),
  validatePtzCommand: jest.fn(), DEVICE_TYPES: ['camera', 'audio'],
  COMMAND_TYPES: ['ptz_move', 'ptz_preset', 'ptz_zoom', 'audio_mute', 'audio_unmute'],
  SESSION_TYPES: ['round', 'emergency', 'family', 'continuous'],
}));
jest.unstable_mockModule('../services/tele-icu/icu-command-network.service.js', () => ({
  createNetwork: jest.fn(), addMember: jest.fn(), listNetworks: jest.fn(), addRosterShift: jest.fn(),
  listRoster: jest.fn(), getOnCall: jest.fn(), getNetworkCensus: jest.fn(), ensureTables: jest.fn(),
}));

const ledger = await import('../services/revenue-share/revenue-share-ledger.service.js');
const rcm = await import('../services/revenue-share/rcm-success-fee.service.js');
const homecare = await import('../services/revenue-share/homecare-billing.service.js');
const marketplace = await import('../services/marketplace/specialist-marketplace.service.js');
const deviceBridge = await import('../services/tele-icu/tele-icu-device-bridge.service.js');
const { default: revShareRouter } = await import('../routes/revenue-share.route.js');
const { default: mktRouter } = await import('../routes/specialist-marketplace.route.js');
const { default: teleIcuRouter } = await import('../routes/tele-icu-command.route.js');

function buildApp() {
  const app = express(); app.use(express.json());
  app.use('/api/v1/revenue-share', revShareRouter);
  app.use('/api/v1/marketplace', mktRouter);
  app.use('/api/v1/tele-icu', teleIcuRouter);
    return app;
}

describe('Revenue-Share REST API', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('POST /agreements', () => {
    test('rejects missing scopeDomain (400, no DB write)', async () => {
      const res = await request(buildApp()).post('/api/v1/revenue-share/agreements').send({ feeType: 'percent' });
      expect(res.status).toBe(400);
      expect(ledger.upsertAgreement).not.toHaveBeenCalled();
    });
    test('rejects invalid feeType', async () => {
      const res = await request(buildApp()).post('/api/v1/revenue-share/agreements').send({ scopeDomain: 'x', feeType: 'bogus' });
      expect(res.status).toBe(400);
    });
    test('creates agreement when valid', async () => {
      ledger.upsertAgreement.mockResolvedValue({ id: 1 });
      const res = await request(buildApp()).post('/api/v1/revenue-share/agreements').send({ scopeDomain: 'homecare', feeType: 'percent', feeRate: 15 });
      expect(res.status).toBe(200);
      expect(ledger.upsertAgreement).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 42, scopeDomain: 'homecare', feeType: 'percent' }));
    });
  });

  describe('POST /events', () => {
    test('requires domain, sourceType, sourceId, grossAmount', async () => {
      const res = await request(buildApp()).post('/api/v1/revenue-share/events').send({ domain: 'x' });
      expect(res.status).toBe(400);
    });
    test('records a revenue event', async () => {
      ledger.recordRevenueEvent.mockResolvedValue({ id: 99, status: 'pending', fee: 5.25 });
      const res = await request(buildApp()).post('/api/v1/revenue-share/events').send({ domain: 'homecare', sourceType: 'episode', sourceId: 'ep123', grossAmount: 350 });
      expect(res.status).toBe(200);
      expect(ledger.recordRevenueEvent).toHaveBeenCalledWith(expect.objectContaining({ domain: 'homecare', sourceId: 'ep123', grossAmount: 350 }));
    });
  });

  describe('RCM success fee (POST /rcm/recovered)', () => {
    test('requires claimId and recoveredAmount', async () => {
      const res = await request(buildApp()).post('/api/v1/revenue-share/rcm/recovered').send({ claimId: 1 });
      expect(res.status).toBe(400);
    });
    test('bills fee on recovered revenue', async () => {
      rcm.recordRecoveredRevenue.mockResolvedValue({ id: 5, fee: 17.5 });
      const res = await request(buildApp()).post('/api/v1/revenue-share/rcm/recovered').send({ claimId: 42, recoveredAmount: 350, successFeePercent: 5 });
      expect(res.status).toBe(200);
      expect(rcm.recordRecoveredRevenue).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 42, claimId: 42, recoveredAmount: 350, successFeePercent: 5 }));
    });
  });

  describe('Homecare billing', () => {
    test('requires baseFee', async () => {
      const res = await request(buildApp()).post('/api/v1/revenue-share/homecare/episodes/ep1/bill').send({});
      expect(res.status).toBe(400);
    });
    test('bills episode with acuity multiplier', async () => {
      homecare.billHomecareEpisode.mockResolvedValue({ episodeId: 'ep1', fee: 1600 });
      const res = await request(buildApp()).post('/api/v1/revenue-share/homecare/episodes/ep1/bill').send({ baseFee: 800, acuityMultiplier: 2 });
      expect(res.status).toBe(200);
      expect(homecare.billHomecareEpisode).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 42, episodeId: 'ep1', baseFee: 800, acuityMultiplier: 2 }));
    });
  });
});

describe('Specialist Marketplace REST API', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('POST /specialists', () => {
    test('requires doctorId and name', async () => {
      const res = await request(buildApp()).post('/api/v1/marketplace/specialists').send({ name: 'Dr. X' });
      expect(res.status).toBe(400);
    });
    test('registers a specialist', async () => {
      marketplace.registerSpecialist.mockResolvedValue({ id: 7 });
      const res = await request(buildApp()).post('/api/v1/marketplace/specialists').send({ doctorId: 101, name: 'Dr. X', specialties: ['cardiology'], serviceTypes: ['second_opinion'] });
      expect(res.status).toBe(200);
      expect(marketplace.registerSpecialist).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 42, doctorId: 101 }));
    });
  });

  describe('POST /requests', () => {
    test('requires serviceType', async () => {
      const res = await request(buildApp()).post('/api/v1/marketplace/requests').send({});
      expect(res.status).toBe(400);
    });
  });
});

describe('Tele-ICU REST API', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('POST /devices', () => {
    test('requires bedId and deviceType', async () => {
      const res = await request(buildApp()).post('/api/v1/tele-icu/devices').send({ bedId: 'ICU-1' });
      expect(res.status).toBe(400);
    });
    test('registers a PTZ camera', async () => {
      deviceBridge.registerBedDevice.mockResolvedValue({ id: 1, bed_id: 'ICU-1' });
      const res = await request(buildApp()).post('/api/v1/tele-icu/devices').send({ bedId: 'ICU-1', deviceType: 'camera', ptzCapable: true, presets: [{ name: 'wide', preset: 1 }] });
      expect(res.status).toBe(200);
      expect(deviceBridge.registerBedDevice).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 42, bedId: 'ICU-1', deviceType: 'camera', ptzCapable: true }));
    });
  });

  describe('POST /devices/:id/commands', () => {
    test('requires commandType', async () => {
      const res = await request(buildApp()).post('/api/v1/tele-icu/devices/1/commands').send({});
      expect(res.status).toBe(400);
    });
    test('issues PTZ move command', async () => {
      deviceBridge.issueCommand.mockResolvedValue({ id: 5, command_type: 'ptz_move' });
      const res = await request(buildApp()).post('/api/v1/tele-icu/devices/1/commands').send({ commandType: 'ptz_move', payload: { pan: 10, tilt: 0, zoom: 0 } });
      expect(res.status).toBe(200);
      expect(deviceBridge.issueCommand).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 42, deviceId: 1, commandType: 'ptz_move' }));
    });
  });
});


