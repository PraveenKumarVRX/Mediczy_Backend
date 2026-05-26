import { jest } from '@jest/globals';

jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, _res, next) => { req.user = { id: 1, organization_id: 1, role: 'doctor' }; next(); }
}));

jest.unstable_mockModule('../services/discharge-workflow.service.js', () => ({
  createDischargeDraft:  jest.fn(),
  getDraftByAdmission:   jest.fn(),
  updateDraftContent:    jest.fn(),
  signDischargePacket:   jest.fn(),
  sendDischargePacket:   jest.fn(),
}));

const { default: request } = await import('supertest');
const { default: express }  = await import('express');

const svc = await import('../services/discharge-workflow.service.js');
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
    expect(svc.signDischargePacket).toHaveBeenCalledWith(10, expect.objectContaining({ signedBy: 1 }));
  });
});

// ── Sign — path param (frontend alias) ────────────────────────────────────────

describe('POST /api/v1/discharge/sign/:packetId (path)', () => {
  it('signs packet via path param', async () => {
    svc.signDischargePacket.mockResolvedValueOnce({ id: 10, status: 'signed' });
    const res = await request(app).post('/api/v1/discharge/sign/10').send({});
    expect(res.status).toBe(200);
    expect(svc.signDischargePacket).toHaveBeenCalledWith(10, expect.objectContaining({ signedBy: 1 }));
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
      10, expect.objectContaining({ channel: 'whatsapp', sentBy: 1 })
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
