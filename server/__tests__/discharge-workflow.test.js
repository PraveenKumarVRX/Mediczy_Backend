import { jest } from '@jest/globals';

jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  // Test hooks: x-test-role / x-test-org let one suite exercise the role gate and the tenant rules.
  authUser: (req, _res, next) => {
    req.user = { id: 1, role: req.headers['x-test-role'] || 'doctor' };
    if (req.headers['x-test-org'] !== 'none') req.user.organization_id = 1;
    next();
  }
}));

jest.unstable_mockModule('../services/discharge-workflow.service.js', () => ({
  createDischargeDraft:  jest.fn(),
  getDraftByAdmission:   jest.fn(),
  updateDraftContent:    jest.fn(),
  signDischargePacket:   jest.fn(),
  sendDischargePacket:   jest.fn(),
  getPacketScope:        jest.fn(),
}));

jest.unstable_mockModule('../services/consent-enforcement.service.js', () => ({
  enforceDischargeSignConsent: jest.fn().mockResolvedValue(undefined),
  enforceOTBookingConsent:     jest.fn().mockResolvedValue(undefined),
  enforceOTIncisionConsent:    jest.fn().mockResolvedValue(undefined),
  enforceAnesthesiaConsent:    jest.fn().mockResolvedValue(undefined),
  enforceHighAlertMedConsent:  jest.fn().mockResolvedValue(undefined),
  enforceConsent:              jest.fn().mockResolvedValue(undefined),
  getConsentEnforcementLog:    jest.fn().mockResolvedValue([]),
}));

jest.unstable_mockModule('../services/adt.service.js', () => ({
  getDischargeReadiness: jest.fn().mockResolvedValue({ dimensions: [], allClear: false }),
  admitPatient:          jest.fn(),
  transferPatient:       jest.fn(),
  dischargePatient:      jest.fn(),
  getAdmission:          jest.fn(),
  getActiveAdmissions:   jest.fn(),
  getPatientAdtHistory:  jest.fn(),
  cancelAdmit:           jest.fn(),
  convertOpToIp:         jest.fn(),
  convertErToIp:         jest.fn(),
  initDischargeReadiness: jest.fn(),
  updateReadinessItem:   jest.fn(),
}));

const { default: request } = await import('supertest');
const { default: express }  = await import('express');

const svc = await import('../services/discharge-workflow.service.js');
const consent = await import('../services/consent-enforcement.service.js');
beforeEach(() => { svc.getPacketScope.mockReset(); svc.getPacketScope.mockResolvedValue({ admissionId: 5, patientId: 12, status: 'draft' }); });
const { default: router } = await import('../routes/discharge-workflow.route.js');

const app = express();
app.use(express.json());
app.use('/api/v1/discharge', router);

// ── Draft creation ─────────────────────────────────────────────────────────────

describe('POST /api/v1/discharge/draft', () => {
  it('auto-generates draft and returns 201', async () => {
    svc.createDischargeDraft.mockResolvedValueOnce({
      id: 10, admission_id: 5, status: 'draft', content: 'Patient was admitted...'
    });
    const res = await request(app).post('/api/v1/discharge/draft').send({ admissionId: 5 });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('draft');
    expect(res.body.data.content).toBeTruthy();
  });

  it('returns 400 on service error', async () => {
    svc.createDischargeDraft.mockRejectedValueOnce(new Error('Admission not found'));
    const res = await request(app).post('/api/v1/discharge/draft').send({ admissionId: 999 });
    expect(res.status).toBe(400);
  });
});

// ── Draft retrieval ────────────────────────────────────────────────────────────

describe('GET /api/v1/discharge/draft/:admissionId', () => {
  it('returns draft for admission', async () => {
    svc.getDraftByAdmission.mockResolvedValueOnce({ id: 10, status: 'draft' });
    const res = await request(app).get('/api/v1/discharge/draft/5');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(10);
  });

  it('returns 404 when no draft exists', async () => {
    svc.getDraftByAdmission.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/v1/discharge/draft/999');
    expect(res.status).toBe(404);
  });
});

// ── Draft update ───────────────────────────────────────────────────────────────

describe('PATCH /api/v1/discharge/draft/:packetId', () => {
  it('updates draft content', async () => {
    svc.updateDraftContent.mockResolvedValueOnce({ id: 10, status: 'draft', content: 'Updated content' });
    const res = await request(app)
      .patch('/api/v1/discharge/draft/10')
      .send({ content: 'Updated content' });
    expect(res.status).toBe(200);
  });
});

// ── Sign — body param ──────────────────────────────────────────────────────────

describe('POST /api/v1/discharge/sign (body)', () => {
  it('signs packet via body param', async () => {
    svc.signDischargePacket.mockResolvedValueOnce({ id: 10, status: 'signed' });
    const res = await request(app).post('/api/v1/discharge/sign').send({ packetId: 10 });
    expect(res.status).toBe(200);
    expect(svc.signDischargePacket).toHaveBeenCalledWith(10, expect.objectContaining({ signedBy: 1, organizationId: 1 }));
  });
});

// ── Sign — path param (frontend alias) ────────────────────────────────────────

describe('POST /api/v1/discharge/sign/:packetId (path)', () => {
  it('signs packet via path param', async () => {
    svc.signDischargePacket.mockResolvedValueOnce({ id: 10, status: 'signed' });
    const res = await request(app).post('/api/v1/discharge/sign/10').send({});
    expect(res.status).toBe(200);
    expect(svc.signDischargePacket).toHaveBeenCalledWith(10, expect.objectContaining({ signedBy: 1, organizationId: 1 }));
  });

  it('returns 400 if already signed', async () => {
    svc.signDischargePacket.mockRejectedValueOnce(new Error('Packet already signed'));
    const res = await request(app).post('/api/v1/discharge/sign/10').send({});
    expect(res.status).toBe(400);
  });
});

// ── Send — body param ──────────────────────────────────────────────────────────

describe('POST /api/v1/discharge/packet/send (body)', () => {
  it('sends packet via body param', async () => {
    svc.sendDischargePacket.mockResolvedValueOnce({ id: 10, status: 'sent' });
    const res = await request(app)
      .post('/api/v1/discharge/packet/send')
      .send({ packetId: 10, channel: 'whatsapp' });
    expect(res.status).toBe(200);
    expect(svc.sendDischargePacket).toHaveBeenCalledWith(
      10, expect.objectContaining({ channel: 'whatsapp', sentBy: 1, organizationId: 1 })
    );
  });
});

// ── Send — path param (frontend alias) ────────────────────────────────────────

describe('POST /api/v1/discharge/packet/send/:packetId (path)', () => {
  it('sends packet via path param', async () => {
    svc.sendDischargePacket.mockResolvedValueOnce({ id: 10, status: 'sent' });
    const res = await request(app)
      .post('/api/v1/discharge/packet/send/10')
      .send({ channel: 'sms' });
    expect(res.status).toBe(200);
    expect(svc.sendDischargePacket).toHaveBeenCalledWith(
      10, expect.objectContaining({ channel: 'sms' })
    );
  });

  it('returns 400 if packet not signed', async () => {
    svc.sendDischargePacket.mockRejectedValueOnce(new Error('Packet not signed'));
    const res = await request(app).post('/api/v1/discharge/packet/send/10').send({});
    expect(res.status).toBe(400);
  });
});

// ── Audit CLN-01/02/03 + SEC-01: who may sign, who may override, and which packets ──────────────────

describe('discharge signing security (audit CLN-01/02/03)', () => {
  beforeEach(() => { svc.signDischargePacket.mockReset(); consent.enforceDischargeSignConsent.mockClear(); });

  it('refuses a caller whose role may not sign, on both routes, without touching the service', async () => {
    for (const role of ['patient', 'receptionist', 'billing']) {
      const a = await request(app).post('/api/v1/discharge/sign/10').set('x-test-role', role).send({});
      const b = await request(app).post('/api/v1/discharge/sign').set('x-test-role', role).send({ packetId: 10 });
      expect(a.status).toBe(403); expect(b.status).toBe(403);
      expect(a.body.code).toBe('ROLE_NOT_PERMITTED');
    }
    expect(svc.signDischargePacket).not.toHaveBeenCalled();
  });

  it('ignores a forged approver in the body: the approver is the authenticated caller', async () => {
    svc.signDischargePacket.mockResolvedValueOnce({ success: true });
    const res = await request(app).post('/api/v1/discharge/sign/10').set('x-test-role', 'ms')
      .send({ override: { reasonCode: 'CLINICAL_URGENCY', approverId: 999, approverRole: 'medical_director' } });
    expect(res.status).toBe(200);
    const passed = svc.signDischargePacket.mock.calls[0][1].override;
    expect(passed).toMatchObject({ approverId: 1, approverRole: 'ms', reasonCode: 'CLINICAL_URGENCY' });
    expect(JSON.stringify(passed)).not.toMatch(/999|medical_director/);
  });

  it('a doctor may sign but may NOT override, even by claiming a director as the approver', async () => {
    const res = await request(app).post('/api/v1/discharge/sign/10').set('x-test-role', 'doctor')
      .send({ override: { reasonCode: 'URGENT', approverId: 2, approverRole: 'medical_director' } });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('OVERRIDE_ROLE_NOT_PERMITTED');
    expect(svc.signDischargePacket).not.toHaveBeenCalled();
  });

  it('404s for a packet outside the caller\'s organization and never signs it', async () => {
    svc.getPacketScope.mockResolvedValueOnce(null);
    const res = await request(app).post('/api/v1/discharge/sign/10').send({});
    expect(res.status).toBe(404);
    expect(svc.getPacketScope).toHaveBeenCalledWith(10, 1);
    expect(svc.signDischargePacket).not.toHaveBeenCalled();
  });

  it('checks consent against the PACKET\'s patient, not a patient id supplied in the body', async () => {
    svc.signDischargePacket.mockResolvedValueOnce({ success: true });
    await request(app).post('/api/v1/discharge/sign/10').send({ patientId: 77 });
    expect(consent.enforceDischargeSignConsent).toHaveBeenCalledWith(expect.objectContaining({ patientId: 12, organizationId: 1 }));
  });

  it('403s a token with no hospital attached instead of treating the user id as a tenant', async () => {
    const res = await request(app).post('/api/v1/discharge/sign/10').set('x-test-org', 'none').send({});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_CONTEXT_REQUIRED');
    expect(svc.getPacketScope).not.toHaveBeenCalled();
  });

  it('never leaks database error text on a failed sign', async () => {
    svc.signDischargePacket.mockRejectedValueOnce(Object.assign(new Error('relation "discharge_packets" does not exist'), { name: 'SequelizeDatabaseError' }));
    const res = await request(app).post('/api/v1/discharge/sign/10').send({});
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/relation|discharge_packets/);
  });
});
