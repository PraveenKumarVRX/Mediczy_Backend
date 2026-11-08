/**
 * MED-MIND-001 Phase 3 — HTTP contract for crisis support on diary writes.
 *
 * The unit tests in crisis-detection.test.js prove the matcher. This covers the
 * wiring, which is what would actually break in silence: whether the route
 * passes the right fields in, whether `support` reaches the response body, and —
 * most importantly — whether a detection changes anything that gets *stored* or
 * sent. It must not.
 */
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const created = [];
let currentUser = { id: 4242, role: 'user' };

const makeEntry = (attrs) => ({
  ...attrs,
  update: jest.fn(async function update(patch) {
    Object.assign(this, patch);
    return this;
  }),
});

const HealthDiary = {
  create: jest.fn(async (attrs) => {
    created.push(attrs);
    return makeEntry({ id: 900 + created.length, ...attrs });
  }),
  findByPk: jest.fn(),
  findAll: jest.fn(async () => []),
  sequelize: { fn: jest.fn(), col: jest.fn() },
};

jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, _res, next) => { req.user = currentUser; next(); },
  requireRole: () => (_req, _res, next) => next(),
}));

jest.unstable_mockModule('../models/postgres/ehr.model.postgres.js', () => ({
  HealthDiary,
  EHRRecord: { findAll: jest.fn(async () => []) },
}));

// Anything that could notify, persist elsewhere, or email is mocked with a spy,
// so the "nobody is told" guarantee is asserted rather than assumed.
const diaryServiceSpies = {
  logConsultation: jest.fn(),
  logPrescription: jest.fn(),
  logEHRRecord: jest.fn(),
};
jest.unstable_mockModule('../services/health-diary.service.js', () => ({
  default: diaryServiceSpies,
}));

jest.unstable_mockModule('../repositories/prescription.repository.js', () => ({
  findAllForPatient: jest.fn(async () => []),
}));

const { default: diaryRouter } = await import('../routes/health-diary.route.js');

const app = express();
app.use(express.json());
app.use('/api/health-diary', diaryRouter);

const ENTRY_DATE = '2026-11-08T10:00:00.000Z';

beforeEach(() => {
  created.length = 0;
  HealthDiary.create.mockClear();
  HealthDiary.findByPk.mockReset();
  for (const spy of Object.values(diaryServiceSpies)) spy.mockClear();
  currentUser = { id: 4242, role: 'user' };
});

describe('POST /api/health-diary — crisis support', () => {
  it('returns helplines when the description reads as distress', async () => {
    const res = await request(app).post('/api/health-diary').send({
      entryDate: ENTRY_DATE,
      entryType: 'mood',
      title: 'Very low',
      description: 'I keep thinking I want to kill myself',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.support).toBeTruthy();
    expect(res.body.support.level).toBe('imminent');
    expect(res.body.support.message).toMatch(/danger/i);
    const numbers = res.body.support.helplines.flatMap((h) => h.numbers);
    expect(numbers).toContain('14416');
    expect(numbers).toContain('1800-599-0019');
  });

  it('scans the title too, not only the description', async () => {
    const res = await request(app).post('/api/health-diary').send({
      entryDate: ENTRY_DATE,
      entryType: 'note',
      title: 'I feel completely hopeless',
    });
    expect(res.body.support?.level).toBe('elevated');
  });

  it('omits `support` entirely for an ordinary entry', async () => {
    const res = await request(app).post('/api/health-diary').send({
      entryDate: ENTRY_DATE,
      entryType: 'vital',
      title: 'BP reading',
      description: 'BP 130/85, slightly high today',
    });
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('support');
  });

  it('stores exactly the same row whether or not a detection fired', async () => {
    // The detection must not add a flag, a tag, or a derived column. A stored
    // marker would be sensitive data the patient never consented to, and would
    // be the thing a future join could reach.
    const base = { entryDate: ENTRY_DATE, entryType: 'mood', title: 'Low', mood: 2 };

    await request(app).post('/api/health-diary').send({ ...base, description: 'rough day at work' });
    await request(app).post('/api/health-diary').send({ ...base, description: 'I want to die' });

    expect(created).toHaveLength(2);
    const [calm, crisis] = created;
    expect(Object.keys(crisis).sort()).toEqual(Object.keys(calm).sort());
    // Only the description differs.
    for (const key of Object.keys(calm)) {
      if (key === 'description') continue;
      expect(crisis[key]).toEqual(calm[key]);
    }
    expect(crisis.tags).toEqual(calm.tags);
  });

  it('notifies nobody and writes nowhere else', async () => {
    await request(app).post('/api/health-diary').send({
      entryDate: ENTRY_DATE,
      entryType: 'note',
      description: 'I have a suicide plan',
    });
    expect(HealthDiary.create).toHaveBeenCalledTimes(1);
    // Named explicitly so a failure says which side-effect crept in.
    const called = Object.entries(diaryServiceSpies)
      .filter(([, spy]) => spy.mock.calls.length > 0)
      .map(([name]) => name);
    expect(called).toEqual([]);
  });

  it('does not echo the patient\'s words back in the support payload', async () => {
    const res = await request(app).post('/api/health-diary').send({
      entryDate: ENTRY_DATE,
      entryType: 'note',
      description: 'I will hang myself tonight',
    });
    expect(JSON.stringify(res.body.support)).not.toMatch(/hang myself/i);
  });
});

describe('PUT /api/health-diary/:id — crisis support', () => {
  it('scans the entry as it stands after the edit, not only the patched fields', async () => {
    HealthDiary.findByPk.mockResolvedValue(
      makeEntry({
        id: 77,
        userId: 4242,
        title: 'Monday',
        description: 'I feel completely hopeless',
        data: null, mood: 2, severity: null, tags: [], isPrivate: true,
      }),
    );

    // Only the title is changed; the untouched body still carries the distress.
    const res = await request(app).put('/api/health-diary/77').send({ title: 'Tuesday' });

    expect(res.status).toBe(200);
    expect(res.body.support?.level).toBe('elevated');
  });

  it('returns no support for another user\'s entry (403 before any scan)', async () => {
    HealthDiary.findByPk.mockResolvedValue(
      makeEntry({ id: 78, userId: 9999, description: 'I want to die' }),
    );
    const res = await request(app).put('/api/health-diary/78').send({ title: 'x' });
    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty('support');
  });
});

describe('POST /api/health-diary/log-symptom — crisis support', () => {
  it('scans the symptom name and its description', async () => {
    const res = await request(app).post('/api/health-diary/log-symptom').send({
      symptom: 'Low mood',
      severity: 5,
      description: 'nothing matters any more',
    });
    expect(res.status).toBe(201);
    expect(res.body.support?.level).toBe('elevated');
  });

  it('stays quiet for a physical symptom that merely sounds dramatic', async () => {
    const res = await request(app).post('/api/health-diary/log-symptom').send({
      symptom: 'Back pain',
      severity: 4,
      description: 'my back pain is killing me',
    });
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('support');
  });
});
