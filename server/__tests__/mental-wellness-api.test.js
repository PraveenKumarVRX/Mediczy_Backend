/**
 * MED-MIND-001 Phase 1 — HTTP contract for the instrument endpoints.
 *
 * Exercises the REAL router with a stubbed authUser and a stubbed pg pool, so it
 * covers the things unit-testing the scorer cannot: route ORDER against the
 * /:slug catch-all (plan R-3), enrollment ownership, and the SQL actually issued.
 */
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const mockQuery = jest.fn();
let currentUser = { id: 7001, role: 'user' };

jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, _res, next) => { req.user = currentUser; next(); },
  requireRole: () => (_req, _res, next) => next(),
}));

jest.unstable_mockModule('../db/pgPool.js', () => ({
  default: { query: mockQuery },
}));

const { default: programsRouter } = await import('../routes/health-programs.route.js');

const app = express();
app.use(express.json());
app.use('/api/programs', programsRouter);

/** An enrollment owned by the current user. */
const ownEnrollment = {
  id: 55, user_id: 7001, program_id: 9,
  program_name: 'Mood Care', program_slug: 'mood-care',
};

const fullPhq9 = [1, 1, 1, 1, 1, 1, 1, 1, 0]; // total 8 -> 'mild', no crisis

beforeEach(() => {
  mockQuery.mockReset();
  currentUser = { id: 7001, role: 'user' };
});

describe('GET /api/programs/instruments', () => {
  // The exact regression the plan flagged as R-3.
  it('is NOT shadowed by the /:slug catch-all', async () => {
    const res = await request(app).get('/api/programs/instruments');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.map((i) => i.code).sort()).toEqual(['GAD7', 'PHQ9']);
    // If it had fallen through to /:slug it would have hit the database.
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('serves item text, options and the non-diagnostic disclaimer', async () => {
    const { body } = await request(app).get('/api/programs/instruments');
    const phq = body.data.find((i) => i.code === 'PHQ9');
    expect(phq.items).toHaveLength(9);
    expect(phq.options.map((o) => o.value)).toEqual([0, 1, 2, 3]);
    expect(body.disclaimer).toMatch(/not a diagnosis/i);
  });
});

describe('POST /api/programs/enrollment/:id/assessments', () => {
  it('scores, persists and returns the band for a valid submission', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [ownEnrollment] })                                  // ownership
      .mockResolvedValueOnce({ rows: [{ id: 901, administered_at: '2026-11-08T00:00:00Z' }] }); // insert

    const res = await request(app)
      .post('/api/programs/enrollment/55/assessments')
      .send({ instrumentCode: 'PHQ9', answers: fullPhq9 });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      id: 901, instrumentCode: 'PHQ9', instrumentVersion: '1.0',
      rawScore: 8, maxScore: 27, band: 'mild', crisis: false,
    });
    expect(res.body.disclaimer).toMatch(/not a diagnosis/i);

    const [sql, params] = mockQuery.mock.calls[1];
    expect(sql).toMatch(/INSERT INTO program_assessment_responses/);
    expect(params[0]).toBe(55);          // enrollment_id, server-resolved
    expect(params[5]).toBe(8);           // raw_score computed server-side
    expect(params[6]).toBe('mild');      // severity_band
  });

  it('flags the crisis pathway when PHQ-9 item 9 is above zero', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [ownEnrollment] })
      .mockResolvedValueOnce({ rows: [{ id: 902, administered_at: 'now' }] });

    const res = await request(app)
      .post('/api/programs/enrollment/55/assessments')
      .send({ instrumentCode: 'PHQ9', answers: [0, 0, 0, 0, 0, 0, 0, 0, 2] });

    expect(res.status).toBe(201);
    expect(res.body.data.crisis).toBe(true);
    expect(res.body.data.flaggedItems).toEqual(['PHQ9_Q9']);
    expect(JSON.parse(mockQuery.mock.calls[1][1][7])).toEqual(['PHQ9_Q9']);
  });

  it('refuses an enrollment belonging to someone else, indistinguishably from a missing one', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // ownership query returns nothing

    const res = await request(app)
      .post('/api/programs/enrollment/99999/assessments')
      .send({ instrumentCode: 'PHQ9', answers: fullPhq9 });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Enrollment not found');
    expect(mockQuery).toHaveBeenCalledTimes(1); // never reached the insert
    // Ownership is enforced in SQL, not in JS after the fact.
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/WHERE e\.id = \$1 AND e\.user_id = \$2/);
    expect(params).toEqual([99999, 7001]);
  });

  it('rejects an incomplete instrument with 400 and writes nothing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [ownEnrollment] });

    const res = await request(app)
      .post('/api/programs/enrollment/55/assessments')
      .send({ instrumentCode: 'PHQ9', answers: [1, 2, 3] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/exactly 9 answers/);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('rejects an unknown instrument with 400', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [ownEnrollment] });
    const res = await request(app)
      .post('/api/programs/enrollment/55/assessments')
      .send({ instrumentCode: 'BDI2', answers: fullPhq9 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/unknown instrument/i);
  });

  it('ignores an assessmentId that belongs to another program', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [ownEnrollment] })
      .mockResolvedValueOnce({ rows: [] })                                  // assessment not in program
      .mockResolvedValueOnce({ rows: [{ id: 903, administered_at: 'now' }] });

    const res = await request(app)
      .post('/api/programs/enrollment/55/assessments')
      .send({ instrumentCode: 'GAD7', answers: [0, 0, 0, 0, 0, 0, 0], assessmentId: 4242 });

    expect(res.status).toBe(201);
    expect(mockQuery.mock.calls[2][1][1]).toBeNull(); // assessment_id stored as null
  });

  it('does not leak a database error to the patient', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [ownEnrollment] })
      .mockRejectedValueOnce(new Error('relation "program_assessment_responses" does not exist'));

    const res = await request(app)
      .post('/api/programs/enrollment/55/assessments')
      .send({ instrumentCode: 'PHQ9', answers: fullPhq9 });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Could not save your check-in');
    expect(JSON.stringify(res.body)).not.toMatch(/relation|does not exist/);
  });
});

describe('GET /api/programs/enrollment/:id/assessments', () => {
  it('returns the caller\'s own history with instrument metadata', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [ownEnrollment] })
      .mockResolvedValueOnce({
        rows: [{
          id: 901, instrument_code: 'PHQ9', instrument_ver: '1.0', raw_score: '8',
          severity_band: 'mild', flagged_items: [], administered_at: '2026-11-08T00:00:00Z',
        }],
      });

    const res = await request(app).get('/api/programs/enrollment/55/assessments');
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      instrumentCode: 'PHQ9', instrumentName: 'PHQ-9', rawScore: 8, maxScore: 27, band: 'mild',
    });
  });

  it('scopes the query to the enrollment and caps the page size', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [ownEnrollment] })
      .mockResolvedValueOnce({ rows: [] });

    await request(app).get('/api/programs/enrollment/55/assessments?limit=99999&instrumentCode=gad-7');

    const [, params] = mockQuery.mock.calls[1];
    expect(params[0]).toBe(55);
    expect(params[1]).toBe('GAD7'); // normalised from 'gad-7'
    expect(params[2]).toBe(200);    // clamped
  });

  it('refuses another user\'s enrollment', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/programs/enrollment/4242/assessments');
    expect(res.status).toBe(404);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-numeric enrollment id without querying', async () => {
    const res = await request(app).get('/api/programs/enrollment/not-a-number/assessments');
    expect(res.status).toBe(404);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
