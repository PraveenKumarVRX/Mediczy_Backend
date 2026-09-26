/**
 * ER registration / triage route (audit CLN-04/05). Route-level: the role gate, the server-side ESI verification, the
 * explicit-confirmation rule, and that nothing is written when a request is refused.
 */
import { jest } from '@jest/globals';

const mockQuery = jest.fn();
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({ postgresSequelize: { query: mockQuery } }));
jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, _res, next) => {
    req.user = { id: 42, role: req.headers['x-test-role'] || 'nurse' };
    if (req.headers['x-test-org'] !== 'none') req.user.organization_id = 7;
    next();
  },
}));
jest.unstable_mockModule('../services/adt.service.js', () => ({ convertErToIp: jest.fn() }));
jest.unstable_mockModule('../services/ot-scheduling.service.js', () => ({ emergencyActivateOT: jest.fn() }));
const notifyERArrival = jest.fn().mockResolvedValue(undefined);
jest.unstable_mockModule('../services/family-notification.service.js', () => ({ notifyERArrival }));

const { default: request } = await import('supertest');
const { default: express } = await import('express');
const { default: router } = await import('../routes/er-workflow.route.js');
const app = express();
app.use(express.json());
app.use('/api/v1/er', router);

const ANSWERS = { immediateLifeThreat: false, highRiskDistress: false, multipleResources: true, oneResource: false };
const insertedRow = (over = {}) => [[{ id: 900, esi_level: 3, ...over }], 1];
const inserts = () => mockQuery.mock.calls.filter((c) => /INSERT INTO er_visits/.test(c[0]));

beforeEach(() => { mockQuery.mockReset(); notifyERArrival.mockClear(); });

describe('POST /register — who may assign a level (CLN-05)', () => {
  it('refuses an ESI level from a non-clinical role and writes nothing', async () => {
    const res = await request(app).post('/api/v1/er/register').set('x-test-role', 'receptionist').send({ patientName: 'X', esiLevel: 3 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TRIAGE_ROLE_REQUIRED');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('a non-clinical role may still register with NO level (bedside triage later) — and it is not marked reviewed', async () => {
    mockQuery.mockResolvedValueOnce(insertedRow({ esi_level: null }));
    const res = await request(app).post('/api/v1/er/register').set('x-test-role', 'receptionist').send({ patientName: 'X' });
    expect(res.status).toBe(201);
    expect(inserts()[0][1].replacements).toMatchObject({ esiLevel: null, reviewed: false, confirmedBy: null });
  });

  it('rejects an out-of-range level', async () => {
    const res = await request(app).post('/api/v1/er/register').send({ patientName: 'X', esiLevel: 9 });
    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('POST /register — "reviewed" needs an explicit confirmation (CLN-05)', () => {
  it('a level without triageConfirmed is stored but NOT reviewed and has no confirmer', async () => {
    mockQuery.mockResolvedValueOnce(insertedRow());
    await request(app).post('/api/v1/er/register').send({ patientName: 'X', esiLevel: 3 });
    expect(inserts()[0][1].replacements).toMatchObject({ esiLevel: 3, reviewed: false, confirmedBy: null });
  });

  it('a confirmed level is reviewed and attributed to the authenticated clinician', async () => {
    mockQuery.mockResolvedValueOnce(insertedRow());
    await request(app).post('/api/v1/er/register').send({ patientName: 'X', esiLevel: 3, triageConfirmed: true });
    expect(inserts()[0][1].replacements).toMatchObject({ reviewed: true, confirmedBy: 42 });
  });

  it('only a strict boolean true confirms (a truthy string does not)', async () => {
    mockQuery.mockResolvedValueOnce(insertedRow());
    await request(app).post('/api/v1/er/register').send({ patientName: 'X', esiLevel: 3, triageConfirmed: 'yes' });
    expect(inserts()[0][1].replacements.reviewed).toBe(false);
  });
});

describe('POST /register — guided triage is verified on the server (CLN-04)', () => {
  const guided = (over = {}) => ({ patientName: 'X', age: 40, triageConfirmed: true, ...over });

  it('409s and writes nothing when danger-zone vitals need an up-triage decision', async () => {
    const res = await request(app).post('/api/v1/er/register').send(guided({ esiLevel: 3, triageInputs: { answers: ANSWERS, vitals: { heartRate: 130 } } }));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('UP_TRIAGE_DECISION_REQUIRED');
    expect(res.body.assessment).toMatchObject({ base: 3, upTriageSuggested: true });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('an accepted up-triage registers as ESI-2 and stores the server assessment with the inputs', async () => {
    mockQuery.mockResolvedValueOnce(insertedRow({ esi_level: 2 }));
    const res = await request(app).post('/api/v1/er/register')
      .send(guided({ esiLevel: 2, triageInputs: { answers: ANSWERS, vitals: { heartRate: 130 }, upTriage: { decision: 'accepted' } } }));
    expect(res.status).toBe(201);
    const stored = JSON.parse(inserts()[0][1].replacements.triageInputs);
    expect(stored.serverAssessment).toMatchObject({ base: 3, upTriageSuggested: true, suggestedLevel: 2 });
    expect(stored.upTriage).toEqual({ decision: 'accepted' });
  });

  it('a declined up-triage needs a reason, then registers at the tree level', async () => {
    const bad = await request(app).post('/api/v1/er/register')
      .send(guided({ esiLevel: 3, triageInputs: { answers: ANSWERS, vitals: { heartRate: 130 }, upTriage: { decision: 'declined', reason: '' } } }));
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('UP_TRIAGE_REASON_REQUIRED');
    expect(mockQuery).not.toHaveBeenCalled();
    mockQuery.mockResolvedValueOnce(insertedRow());
    const ok = await request(app).post('/api/v1/er/register')
      .send(guided({ esiLevel: 3, triageInputs: { answers: ANSWERS, vitals: { heartRate: 130 }, upTriage: { decision: 'declined', reason: 'Anxious; recheck in 10 min' } } }));
    expect(ok.status).toBe(201);
  });

  it('refuses a level that does not follow from the answers (a tampered client)', async () => {
    const res = await request(app).post('/api/v1/er/register').send(guided({ esiLevel: 5, triageInputs: { answers: ANSWERS, vitals: {} } }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TRIAGE_INCONSISTENT');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('refuses physiologically impossible vitals instead of ignoring them', async () => {
    const res = await request(app).post('/api/v1/er/register').send(guided({ esiLevel: 3, triageInputs: { answers: ANSWERS, vitals: { spo2: 250 } } }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TRIAGE_INPUT');
  });

  it('direct ESI (no guided answers) passes straight through to the role + range checks', async () => {
    mockQuery.mockResolvedValueOnce(insertedRow({ esi_level: 1 }));
    const res = await request(app).post('/api/v1/er/register').send({ patientName: 'X', esiLevel: 1, triageConfirmed: true });
    expect(res.status).toBe(201);
  });
});

describe('POST /register — tenant and errors', () => {
  it('scopes the visit to the caller\'s organization', async () => {
    mockQuery.mockResolvedValueOnce(insertedRow());
    await request(app).post('/api/v1/er/register').send({ patientName: 'X', esiLevel: 3, triageConfirmed: true });
    expect(inserts()[0][1].replacements.orgId).toBe(7);
  });

  it('never leaks database error text when the insert fails', async () => {
    mockQuery.mockRejectedValueOnce(Object.assign(new Error('relation "er_visits" does not exist'), { name: 'SequelizeDatabaseError' }));
    const res = await request(app).post('/api/v1/er/register').send({ patientName: 'X' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/relation|er_visits/);
  });
});

describe('PUT /triage/:id', () => {
  it('refuses an ESI level from a non-clinical role without touching the database', async () => {
    const res = await request(app).put('/api/v1/er/triage/5').set('x-test-role', 'billing').send({ esiLevel: 2 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TRIAGE_ROLE_REQUIRED');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('verifies guided answers on update too, and scopes the update to the organization', async () => {
    const bad = await request(app).put('/api/v1/er/triage/5').send({ esiLevel: 5, triageInputs: { answers: ANSWERS } });
    expect(bad.status).toBe(400);
    mockQuery.mockResolvedValueOnce([[{ id: 5, esi_level: 3 }], 1]);
    const ok = await request(app).put('/api/v1/er/triage/5').send({ esiLevel: 3, triageInputs: { answers: ANSWERS, vitals: {} } });
    expect(ok.status).toBe(200);
    expect(mockQuery.mock.calls[0][0]).toMatch(/organization_id = :orgId/);
    expect(mockQuery.mock.calls[0][1].replacements.orgId).toBe(7);
  });

  it('404s for a visit outside the organization', async () => {
    mockQuery.mockResolvedValueOnce([[], 0]);
    const res = await request(app).put('/api/v1/er/triage/999').send({ esiLevel: 3 });
    expect(res.status).toBe(404);
  });

  it('a colour-only update needs no level, so it does not need a triage role and is not marked reviewed', async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 5 }], 1]);
    const res = await request(app).put('/api/v1/er/triage/5').set('x-test-role', 'receptionist').send({ triageLevel: 'red' });
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][1].replacements.esiGiven).toBe(false);
  });
});
