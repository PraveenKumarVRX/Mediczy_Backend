import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const query = jest.fn();
const connectPostgres = jest.fn();
const bloodBankEnsure = jest.fn();
const bloodBankScopedDb = jest.fn();
const pushToZone = jest.fn();
const buildLiveKitJoinData = jest.fn(async (o) => ({ serverUrl: 'wss://lk.test', token: `tok-${o.identity}`, roomName: o.meetingId, opts: o }));
let hospitalOrg = 3;

jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query } }));
jest.unstable_mockModule('../db/postgres.js', () => ({ connectPostgres }));
jest.unstable_mockModule('../services/dept-tenant-scope.service.js', () => ({
  bloodBankScope: { ensure: bloodBankEnsure, scopedDb: bloodBankScopedDb },
}));
jest.unstable_mockModule('../models/postgres/appointment.model.postgres.js', () => ({ default: {} }));
jest.unstable_mockModule('../services/hospital-queue.service.js', () => ({}));
jest.unstable_mockModule('../services/display-sse-broker.service.js', () => ({
  registerDisplaySSE: jest.fn(), pushToZone, pushToAll: jest.fn(), getSSEStats: jest.fn(),
}));
jest.unstable_mockModule('../utils/videoProvider.js', () => ({ buildLiveKitJoinData }));
jest.unstable_mockModule('../middleware/hospitalAuth.middleware.js', () => ({
  verifyHospitalToken: (req, _res, next) => { req.hospitalOrgId = hospitalOrg; req.userId = 77; next(); },
}));
jest.unstable_mockModule('../middleware/authDisplayDevice.middleware.js', () => ({
  requireDisplayDevice: (req, _res, next) => { req.organizationId = 3; req.displayDevice = { id: 9 }; next(); },
  optionalDisplayDeviceOrDefaultOrg: (req, _res, next) => { req.organizationId = 3; next(); },
  resolveOptionalDisplayOrg: jest.fn(),
  ensureDisplayDeviceSchema: jest.fn().mockResolvedValue(),
}));

let display;

beforeAll(async () => {
  const { default: displayRouter } = await import('../routes/hospital-display.route.js');
  display = express();
  display.use(express.json());
  display.use('/api/display', displayRouter);
});

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rows: [] });
  connectPostgres.mockReset();
  connectPostgres.mockResolvedValue({ query });
  bloodBankEnsure.mockReset();
  bloodBankEnsure.mockResolvedValue();
  bloodBankScopedDb.mockReset();
  bloodBankScopedDb.mockImplementation((raw) => ({ ...raw, release: jest.fn() }));
  pushToZone.mockClear();
  buildLiveKitJoinData.mockClear();
  hospitalOrg = 3;
});

describe('blood-bank display', () => {
  it('uses canonical available units and never manufactures inventory', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ blood_group: 'O+', component: 'RBC', units_available: '3', expiry_alert: true }] })
        .mockResolvedValueOnce({ rows: [{ req_id: 'REQ-1', blood_group: 'O+', component: 'RBC', units: 1, urgency: 'Emergency', ward: 'ICU', status: 'Pending' }] }),
    };
    connectPostgres.mockResolvedValue(db);
    bloodBankScopedDb.mockReturnValue({ ...db, release: jest.fn() });

    const res = await request(display).get('/api/display/blood-bank');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, live: true, source: 'blood_bank_units', generated: false });
    expect(res.body.inventory).toEqual([{ blood_group: 'O+', component: 'RBC', units_available: 3, expiry_alert: true, level: 'low' }]);
    expect(db.query.mock.calls[0][0]).toContain('FROM blood_bank_units');
    expect(db.query.mock.calls[0][0]).not.toContain('blood_inventory');
    expect(bloodBankEnsure).toHaveBeenCalledWith(db);
    expect(bloodBankScopedDb).toHaveBeenCalledWith(db, 3);
  });

  it('reports a source failure instead of displaying generated counts', async () => {
    connectPostgres.mockRejectedValue(new Error('database unavailable'));

    const res = await request(display).get('/api/display/blood-bank');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ success: false, code: 'blood_inventory_unavailable', live: false, inventory: [], requisitions: [] });
  });
});

describe('OT proctoring video', () => {
  it('names the room after the device organization and pushes to the OT zone of that org', async () => {
    const res = await request(display).post('/api/display/video/sessions').send({ sessionType: 'ot-proctor', targetZone: 'ot', role: 'ot-display' });
    expect(res.status).toBe(200);
    expect(res.body.roomId).toMatch(/^display-ot-proctor-3-\d+$/);
    expect(res.body.join.token).toBeTruthy();
    expect(pushToZone).toHaveBeenCalledWith('ot', 'video_session_start', expect.objectContaining({ roomId: res.body.roomId }), 3);
  });

  it('issues a subscribe-only observer token for a room of the same organization', async () => {
    const roomId = `display-ot-proctor-3-${Date.now()}`;
    const res = await request(display).post('/api/display/video/sessions/observer').send({ roomId });
    expect(res.status).toBe(200);
    const opts = buildLiveKitJoinData.mock.calls[0][0];
    expect(opts).toMatchObject({ meetingId: roomId, canPublish: false, canSubscribe: true });
  });

  it('refuses a room that belongs to another organization (even with a prefix collision)', async () => {
    for (const roomId of [`display-ot-proctor-4-${Date.now()}`, `display-ot-proctor-30-${Date.now()}`, `display-ot-proctor-3-abc`, 'display-ward-1']) {
      const res = await request(display).post('/api/display/video/sessions/observer').send({ roomId });
      expect(res.status).toBe(403);
    }
    expect(buildLiveKitJoinData).not.toHaveBeenCalled();
  });

  it('refuses an expired room', async () => {
    const roomId = `display-ot-proctor-3-${Date.now() - 13 * 3600 * 1000}`;
    expect((await request(display).post('/api/display/video/sessions/observer').send({ roomId })).status).toBe(410);
  });
});

describe('OT proctoring room list', () => {
  it('lists live rooms only for the organization that started them, and drops ended ones', async () => {
    const started = await request(display).post('/api/display/video/sessions').send({ sessionType: 'ot-proctor', targetZone: 'ot' });
    const roomId = started.body.roomId;

    hospitalOrg = 3;
    const mine = await request(display).get('/api/display/video/sessions/ot-proctor/active');
    expect(mine.body.rooms.map((r) => r.roomId)).toContain(roomId);

    hospitalOrg = 4;
    const other = await request(display).get('/api/display/video/sessions/ot-proctor/active');
    expect(other.body.rooms.map((r) => r.roomId)).not.toContain(roomId);

    hospitalOrg = 3;
    await request(display).post('/api/display/video/sessions/end').send({ targetZone: 'ot', roomId });
    const after = await request(display).get('/api/display/video/sessions/ot-proctor/active');
    expect(after.body.rooms.map((r) => r.roomId)).not.toContain(roomId);
  });

  it('does not list non-OT display sessions', async () => {
    const started = await request(display).post('/api/display/video/sessions').send({ sessionType: 'er-triage', targetZone: 'er' });
    const list = await request(display).get('/api/display/video/sessions/ot-proctor/active');
    expect(list.body.rooms.map((r) => r.roomId)).not.toContain(started.body.roomId);
  });
});

describe('wayfinding floor-map admin', () => {
  it('lists only the caller organization', async () => {
    hospitalOrg = 11;
    await request(display).get('/api/display/wayfinding/floors');
    expect(query.mock.calls[0][1]).toEqual([11]);
  });

  it('upserts a floor for the caller organization and validates input', async () => {
    query.mockResolvedValueOnce({ rows: [{ floor_number: 1, floor_name: 'First', departments: [], landmarks: [] }] });
    const ok = await request(display).put('/api/display/wayfinding/floors/1').send({ floorName: 'First', departments: [{ name: 'Lab' }] });
    expect(ok.status).toBe(200);
    expect(query.mock.calls[0][1][0]).toBe(3);
    const bad = await request(display).put('/api/display/wayfinding/floors/abc').send({});
    expect(bad.status).toBe(400);
  });
});
