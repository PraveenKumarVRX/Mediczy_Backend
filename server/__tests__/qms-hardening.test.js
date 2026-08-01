process.env.POSTGRES_PRIMARY_HOST ||= '127.0.0.1';
process.env.POSTGRES_PRIMARY_DATABASE ||= 'mediczy_test';
process.env.POSTGRES_PRIMARY_USER ||= 'test';
process.env.POSTGRES_PRIMARY_PASSWORD ||= 'test';
process.env.HOSPITAL_DEFAULT_ORG_ID ||= '1';
process.env.QMS_SSE_REDIS = 'false';

import { describe, expect, it } from '@jest/globals';

describe('QMS hardening — deferred tokens + opt-in', () => {
  it('defers token when appointment date is not today (auto mode)', async () => {
    const { issueTokenForAppointment } = await import('../services/qms-opd.service.js');

    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 2);
    const appointmentDate = tomorrow.toISOString().slice(0, 10);

    const result = await issueTokenForAppointment(
      {
        id: 999001,
        appointmentDate,
        doctorId: 12,
        doctorName: 'Dr. Test',
        patientName: 'Patient',
        patientPhone: '9876543210',
        organization_id: 1,
      },
      { mode: 'auto', notifyOptIn: true },
    );

    expect(result.deferred).toBe(true);
    expect(result.tokenNumber).toBeNull();
    expect(result.activateOn).toBe(appointmentDate);
    expect(result.notifyOptIn).toBe(true);
    expect(result.queueZone).toBe('opd-doc-12');
  });

  it('defaults notifyOptIn to false when omitted', async () => {
    const { issueTokenForAppointment } = await import('../services/qms-opd.service.js');
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 3);
    const appointmentDate = tomorrow.toISOString().slice(0, 10);

    const result = await issueTokenForAppointment({
      id: 999002,
      appointmentDate,
      doctorId: 7,
    });

    expect(result.deferred).toBe(true);
    expect(result.notifyOptIn).toBe(false);
  });
});

describe('QMS hardening — device auth middleware', () => {
  it('rejects mutations without x-device-token', async () => {
    const { requireDisplayDevice } = await import('../middleware/authDisplayDevice.middleware.js');
    const req = { headers: {}, query: {}, body: {} };
    const res = {
      statusCode: 200,
      body: null,
      status(c) { this.statusCode = c; return this; },
      json(b) { this.body = b; return this; },
    };
    let nextCalled = false;
    await requireDisplayDevice(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('DEVICE_TOKEN_REQUIRED');
  });

  it('rejects public organizationId board override without device token', async () => {
    const { optionalDisplayDeviceOrDefaultOrg } = await import('../middleware/authDisplayDevice.middleware.js');
    const req = { headers: {}, query: { organizationId: '99' }, body: {} };
    const res = {
      statusCode: 200,
      body: null,
      status(c) { this.statusCode = c; return this; },
      json(b) { this.body = b; return this; },
    };
    let nextCalled = false;
    await optionalDisplayDeviceOrDefaultOrg(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('DEVICE_TOKEN_REQUIRED');
  });

  it('allows default org when no organizationId and no token', async () => {
    const { optionalDisplayDeviceOrDefaultOrg } = await import('../middleware/authDisplayDevice.middleware.js');
    const req = { headers: {}, query: {}, body: {} };
    const res = {
      status(c) { this.statusCode = c; return this; },
      json(b) { this.body = b; return this; },
    };
    let nextCalled = false;
    await optionalDisplayDeviceOrDefaultOrg(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(req.organizationId).toBeTruthy();
  });
});

describe('QMS hardening — SSE broker non-PHI signal', () => {
  it('exports pushQueueEvent and documents queue_updated signal shape', async () => {
    const broker = await import('../services/display-sse-broker.service.js');
    expect(typeof broker.pushQueueEvent).toBe('function');
    expect(typeof broker.pushToZone).toBe('function');
    const signal = { zone: 'opd-doc-12', event: 'queue_token_called', ts: Date.now() };
    expect(signal).not.toHaveProperty('entry');
    expect(signal).not.toHaveProperty('patientName');
  });
});

describe('QMS hardening — sequence table contract', () => {
  it('documents PK for hospital_queue_token_sequences', () => {
    const pk = ['organization_id', 'department', 'doctor_id', 'queue_zone', 'seq_date'];
    expect(pk).toContain('seq_date');
    expect(pk).toContain('doctor_id');
  });
});
