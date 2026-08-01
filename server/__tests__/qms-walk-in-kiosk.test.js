import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const poolQuery = jest.fn();

jest.unstable_mockModule('../db/pgPool.js', () => ({
  default: { query: (...args) => poolQuery(...args) },
}));

jest.unstable_mockModule('../middleware/authPortalQms.middleware.js', () => ({
  authPortalQms: (req, _res, next) => {
    req.qms = {
      portal: 'hospital',
      organizationId: 42,
      department: 'opd',
      queueZone: 'opd-waiting',
      label: 'Hospital',
    };
    next();
  },
  QMS_PORTAL_DEFAULTS: {},
}));

jest.unstable_mockModule('../services/hospital-queue.service.js', () => ({
  checkIn: jest.fn(),
  getConsole: jest.fn(),
  getAnalytics: jest.fn(),
}));

jest.unstable_mockModule('../services/qms-opd.service.js', () => ({
  listOpdQueues: jest.fn(),
  queueZoneForDoctor: jest.fn(),
}));

jest.unstable_mockModule('../services/display-sse-broker.service.js', () => ({
  pushQueueEvent: jest.fn(),
}));

jest.unstable_mockModule('../services/queue-notify.service.js', () => ({
  sendToPhone: jest.fn(),
}));

jest.unstable_mockModule('../services/aadhaar-qr.service.js', () => ({
  parseAadhaarQrInput: jest.fn(),
}));

const qmsRouter = (await import('../routes/qms.route.js')).default;

function invokeWalkInKiosk() {
  return new Promise((resolve, reject) => {
    const req = {
      method: 'GET',
      url: '/walk-in-kiosk',
      originalUrl: '/api/qms/walk-in-kiosk',
      baseUrl: '/api/qms',
      path: '/walk-in-kiosk',
      headers: {},
      query: {},
      body: {},
      params: {},
      qms: {
        portal: 'hospital',
        organizationId: 42,
        department: 'opd',
        queueZone: 'opd-waiting',
        label: 'Hospital',
      },
    };
    const res = {
      statusCode: 200,
      body: null,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(b) {
        this.body = b;
        resolve({ statusCode: this.statusCode, body: b });
        return this;
      },
    };
    qmsRouter.handle(req, res, (err) => {
      if (err) reject(err);
    });
  });
}

describe('QMS walk-in kiosk launch', () => {
  beforeEach(() => {
    poolQuery.mockReset();
  });

  it('returns existing self-checkin device token for org', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ device_token: 'abc123tokendevice' }] });

    const result = await invokeWalkInKiosk();
    expect(result.statusCode).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.deviceToken).toBe('abc123tokendevice');
    expect(result.body.kioskPath).toContain('/kiosk/checkin?deviceToken=abc123tokendevice');
  });

  it('creates a device when none exists', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ device_token: 'newtoken999' }] });

    const result = await invokeWalkInKiosk();
    expect(result.body.success).toBe(true);
    expect(result.body.deviceToken).toBe('newtoken999');
    const insert = poolQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO display_devices'));
    expect(insert).toBeTruthy();
    expect(insert[1][2]).toBe(42);
  });
});
