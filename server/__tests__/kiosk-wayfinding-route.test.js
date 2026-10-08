import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const query = jest.fn();
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query } }));
jest.unstable_mockModule('../middleware/authDisplayDevice.middleware.js', () => ({
  requireDisplayDevice: (req, _res, next) => { req.organizationId = 3; req.displayDevice = { id: 9 }; next(); },
}));
// The kiosk router pulls in registration/Aadhaar/queue code that is irrelevant here.
const f = () => jest.fn();
jest.unstable_mockModule('../db/postgres.js', () => ({ connectPostgres: f() }));
jest.unstable_mockModule('../services/hospital-queue.service.js', () => ({}));
jest.unstable_mockModule('../models/postgres/appointment.model.postgres.js', () => ({ default: {} }));
jest.unstable_mockModule('../services/ai-emergency-triage.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../utils/videoProvider.js', () => ({ buildLiveKitJoinData: f() }));
jest.unstable_mockModule('../services/display-sse-broker.service.js', () => ({ pushToZone: f() }));
jest.unstable_mockModule('../services/kiosk-liveness.service.js', () => ({ assessKioskLiveness: f() }));
jest.unstable_mockModule('../services/aadhaar-qr.service.js', () => ({ parseAadhaarQrInput: f() }));
jest.unstable_mockModule('../services/aadhaar-image-decode.service.js', () => ({ decodeAadhaarFromImageBytes: f() }));
jest.unstable_mockModule('../services/kiosk-registration.service.js', () => ({
  createRegistrationInvite: f(), getInviteStatusForKiosk: f(), registerWalkInPatient: f(),
  ensureKioskRegistrationTables: jest.fn().mockResolvedValue(), resolveOrgDisplayName: f(), lookupWalkInPatient: f(),
  sendKioskPhoneOtp: f(), verifyKioskPhoneOtp: f(), listKioskDoctors: f(), bookKioskAppointment: f(),
  listKioskCamps: f(), registerKioskCamp: f(),
}));

let app;
beforeAll(async () => {
  const { default: router } = await import('../routes/display-kiosk.route.js');
  app = express();
  app.use(express.json());
  app.use('/api/display/kiosk', router);
}, 60000);

describe('POST /api/display/kiosk/wayfinding', () => {
  it('rejects a too-short query', async () => {
    expect((await request(app).post('/api/display/kiosk/wayfinding').send({ query: 'a' })).status).toBe(400);
  });

  it('answers from the device organization map, never a hardcoded table', async () => {
    query.mockReset();
    query.mockResolvedValueOnce({ rows: [{ floor_number: 0, floor_name: 'Ground', departments: [{ id: 'lab', name: 'Laboratory', aliases: ['blood test'] }] }] })
      .mockResolvedValue({ rows: [] });
    const res = await request(app).post('/api/display/kiosk/wayfinding').send({ query: 'blood test' });
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([3]);
    expect(res.body).toMatchObject({ success: true, matched: true, destination: 'Laboratory', aiAssisted: false });
  });

  it('does not invent a route for a hospital with no map', async () => {
    query.mockReset();
    query.mockResolvedValue({ rows: [] });
    const res = await request(app).post('/api/display/kiosk/wayfinding').send({ query: 'pharmacy' });
    expect(res.body).toMatchObject({ configured: false, matched: false });
    expect(res.body.direction).toMatch(/reception/i);
  });
});
