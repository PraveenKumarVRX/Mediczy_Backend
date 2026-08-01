process.env.NODE_ENV = 'test';
process.env.PUBLIC_APP_URL = 'https://app.mediqzy.com';
process.env.KIOSK_REG_INVITE_TTL_MIN = '30';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const poolQuery = jest.fn();
const sendKioskRegistrationNotify = jest.fn();
const checkIn = jest.fn();
const allocateUhid = jest.fn();

jest.unstable_mockModule('../db/pgPool.js', () => ({
  default: { query: (...args) => poolQuery(...args) },
}));

jest.unstable_mockModule('../services/queue-notify.service.js', () => ({
  sendKioskRegistrationNotify: (...args) => sendKioskRegistrationNotify(...args),
}));

jest.unstable_mockModule('../services/hospital-queue.service.js', () => ({
  checkIn: (...args) => checkIn(...args),
  allocateUhid: (...args) => allocateUhid(...args),
}));

const {
  createRegistrationInvite,
  getInviteByRawToken,
  completeInviteRegistration,
  getInviteStatusForKiosk,
} = await import('../services/kiosk-registration.service.js');

describe('kiosk registration invites', () => {
  beforeEach(() => {
    poolQuery.mockReset();
    sendKioskRegistrationNotify.mockReset();
    checkIn.mockReset();
    allocateUhid.mockReset();
    sendKioskRegistrationNotify.mockResolvedValue({
      ok: true,
      channels: ['whatsapp', 'sms'],
      usedTemplate: true,
      errors: [],
    });
    allocateUhid.mockResolvedValue('UHID-TEST-1');
    checkIn.mockResolvedValue({
      id: 55,
      tokenNumber: 'A12-042',
      doctorName: 'General OPD',
      estimatedWaitMinutes: 12,
      counterId: 'C1',
      queueZone: 'opd-waiting',
    });
  });

  it('createRegistrationInvite stores hash, sends WhatsApp link, never exposes raw token', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE
      .mockResolvedValueOnce({ rows: [] }) // index phone
      .mockResolvedValueOnce({ rows: [] }) // index expires
      .mockResolvedValueOnce({ rows: [] }) // revoke prior
      .mockResolvedValueOnce({
        rows: [{ id: 9, expires_at: new Date(Date.now() + 30 * 60 * 1000), status: 'pending' }],
      })
      .mockResolvedValueOnce({ rows: [] }); // notify diagnostics update

    const result = await createRegistrationInvite({
      organizationId: 7,
      deviceId: 3,
      phone: '+91 98765 43210',
      hospitalName: 'City Care',
    });

    expect(result.inviteId).toBe(9);
    expect(result.phone).toBe('9876543210');
    expect(result.linkSent).toBe(true);
    expect(result.channels).toEqual(['whatsapp', 'sms']);
    expect(result.registerUrl).toContain('/kiosk/register/');
    expect(result.registerUrl).toContain(result._rawTokenForTests);
    expect(result.registerUrlHint).toContain('/kiosk/register/');
    expect(result.registerUrlHint).toContain('…');
    expect(result._rawTokenForTests).toMatch(/^[a-f0-9]{48}$/);

    expect(sendKioskRegistrationNotify).toHaveBeenCalledTimes(1);
    const [phoneArg, payload] = sendKioskRegistrationNotify.mock.calls[0];
    expect(phoneArg).toBe('9876543210');
    expect(payload.registerUrl).toContain('https://app.mediqzy.com/kiosk/register/');
    expect(payload.registerUrl).toContain(result._rawTokenForTests);
    expect(payload.hospitalName).toBe('City Care');
    expect(payload.token).toBe(result._rawTokenForTests);

    // INSERT used token_hash (sha256 hex), not raw token
    const insertCall = poolQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO kiosk_registration_invites'));
    expect(insertCall).toBeTruthy();
    const tokenHash = insertCall[1][0];
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenHash).not.toBe(result._rawTokenForTests);
  });

  it('rejects invalid phone numbers', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      createRegistrationInvite({ organizationId: 1, phone: '123' })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('getInviteByRawToken returns pending invite; expires stale ones', async () => {
    const crypto = await import('crypto');
    const raw = 'a'.repeat(48);
    const hash = crypto.createHash('sha256').update(raw).digest('hex');

    // tables already ready from prior test — but ensure path works
    poolQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          token_hash: hash,
          organization_id: 7,
          phone: '9876543210',
          status: 'pending',
          expires_at: new Date(Date.now() + 60_000),
          prefill: {},
        },
      ],
    });

    const ok = await getInviteByRawToken(raw);
    expect(ok.success).toBe(true);
    expect(ok.status).toBe('pending');
    expect(ok.phone).toBe('9876543210');
    expect(ok.organizationId).toBe(7);

    poolQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 2,
            token_hash: hash,
            organization_id: 7,
            phone: '9876543210',
            status: 'pending',
            expires_at: new Date(Date.now() - 1000),
            prefill: {},
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }); // expire update

    const expired = await getInviteByRawToken(raw);
    expect(expired.success).toBe(false);
    expect(expired.message).toMatch(/expired/i);
  });

  it('completeInviteRegistration creates patient + marks invite completed', async () => {
    const crypto = await import('crypto');
    const raw = 'b'.repeat(48);
    const hash = crypto.createHash('sha256').update(raw).digest('hex');

    // getInviteByRawToken
    poolQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 11,
            token_hash: hash,
            organization_id: 7,
            phone: '9123456789',
            status: 'pending',
            expires_at: new Date(Date.now() + 60_000),
            prefill: {},
          },
        ],
      })
      // existing user lookup
      .mockResolvedValueOnce({ rows: [] })
      // insert user
      .mockResolvedValueOnce({ rows: [{ id: 101 }] })
      // update uhid metadata
      .mockResolvedValueOnce({ rows: [] })
      // mark invite completed
      .mockResolvedValueOnce({ rows: [] });

    const result = await completeInviteRegistration(raw, {
      firstName: 'Anita',
      lastName: 'Sharma',
      gender: 'Female',
      dateOfBirth: '1990-08-15',
      address: 'Pune',
      consentAccepted: true,
      notifyOptIn: true,
    });

    expect(result.alreadyCompleted).toBe(false);
    expect(result.tokenNumber).toBe('A12-042');
    expect(result.uhid).toBe('UHID-TEST-1');
    expect(result.phone).toBe('9123456789');
    expect(checkIn).toHaveBeenCalled();
    expect(allocateUhid).toHaveBeenCalledWith(7);

    const completeUpdate = poolQuery.mock.calls.find((c) =>
      String(c[0]).includes("SET status = 'completed'")
    );
    expect(completeUpdate).toBeTruthy();
    expect(completeUpdate[1][3]).toBe('A12-042');
  });

  it('completeInviteRegistration requires consent', async () => {
    const crypto = await import('crypto');
    const raw = 'c'.repeat(48);
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    poolQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 12,
          token_hash: hash,
          organization_id: 7,
          phone: '9123456789',
          status: 'pending',
          expires_at: new Date(Date.now() + 60_000),
          prefill: {},
        },
      ],
    });

    await expect(
      completeInviteRegistration(raw, { firstName: 'X', consentAccepted: false })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('getInviteStatusForKiosk returns latest invite row', async () => {
    poolQuery.mockResolvedValueOnce({
      rows: [{ id: 3, status: 'completed', token_number: 'T-9', expires_at: new Date(), consumed_at: new Date(), created_at: new Date() }],
    });
    const row = await getInviteStatusForKiosk({ organizationId: 7, phone: '9876543210' });
    expect(row.status).toBe('completed');
    expect(row.token_number).toBe('T-9');
  });
});
