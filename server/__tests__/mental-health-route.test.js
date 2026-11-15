import { jest, beforeAll, beforeEach, describe, it, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// In-memory stand-in for the HealthDiary model: enough of Sequelize's where
// semantics (userId/entryType/id equality, JSONB clientId+source, tags contains).
let rows = [];
let nextId = 1;
const { Op } = await import('sequelize');
const matches = (row, where) => Object.entries(where).every(([k, v]) => {
  if (k === 'data') return Object.entries(v).every(([dk, dv]) => row.data?.[dk] === dv);
  if (k === 'tags') return v[Op.contains].every((t) => (row.tags || []).includes(t));
  if (k === 'entryDate') return new Date(row.entryDate) >= v[Op.gte];
  return row[k] === v;
});
const wrap = (row) => Object.assign(row, {
  update: async (patch) => Object.assign(row, patch, { updatedAt: new Date() }),
  destroy: async () => { rows = rows.filter((r) => r !== row); },
});
const HealthDiary = {
  create: jest.fn(async (v) => { const row = wrap({ id: nextId++, createdAt: new Date(), updatedAt: new Date(), ...v }); rows.push(row); return row; }),
  findOne: jest.fn(async ({ where }) => rows.find((r) => matches(r, where)) || null),
  findAll: jest.fn(async ({ where, limit }) => rows.filter((r) => matches(r, where)).slice(0, limit)),
};
jest.unstable_mockModule('../models/postgres/ehr.model.postgres.js', () => ({ HealthDiary }));
jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, res, next) => {
    if (!req.headers['x-test-user']) return res.sendStatus(401);
    req.user = { id: Number(req.headers['x-test-user']) }; next();
  },
}));

let app;
beforeAll(async () => {
  const { default: router } = await import('../routes/mental-health.route.js');
  app = express().use(express.json()).use('/api/mental-health', router);
});
beforeEach(() => { rows = []; nextId = 1; jest.clearAllMocks(); });
const as = (user) => ({
  post: (p, b) => request(app).post(`/api/mental-health${p}`).set('x-test-user', String(user)).send(b),
  put: (p, b) => request(app).put(`/api/mental-health${p}`).set('x-test-user', String(user)).send(b),
  get: (p) => request(app).get(`/api/mental-health${p}`).set('x-test-user', String(user)),
  del: (p) => request(app).delete(`/api/mental-health${p}`).set('x-test-user', String(user)),
});

describe('/api/mental-health (app Mind & Mood sync over the health diary)', () => {
  it('requires sign-in', async () => {
    expect((await request(app).get('/api/mental-health/moods')).status).toBe(401);
  });

  it('logs a mood as a private diary row with the 1–5 score, and a retried sync does not duplicate it', async () => {
    const body = { clientId: 'm_1', moodId: 'negative', label: 'Low', intensity: 2, note: 'long day', recordedAt: '2026-11-15T08:00:00.000Z' };
    const first = await as(7).post('/moods/log', body);
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ id: 1, moodId: 'negative', intensity: 2, label: 'Low', note: 'long day', clientId: 'm_1' });
    expect(rows[0]).toMatchObject({ userId: 7, entryType: 'mood', mood: 2, isPrivate: true });
    const again = await as(7).post('/moods/log', body);
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ duplicate: true, data: { id: 1 } });
    expect(rows).toHaveLength(1);
  });

  it('refuses an unknown mood instead of guessing', async () => {
    expect((await as(7).post('/moods/log', { moodId: 'ecstatic' })).status).toBe(400);
    expect((await as(7).post('/moods/log', { intensity: 9 })).status).toBe(400);
    expect(rows).toHaveLength(0);
  });

  it('lists only the caller\'s own moods', async () => {
    await as(7).post('/moods/log', { clientId: 'a', moodId: 'positive' });
    await as(8).post('/moods/log', { clientId: 'b', moodId: 'neutral' });
    const list = await as(7).get('/moods');
    expect(list.body.data.map((m) => m.clientId)).toEqual(['a']);
  });

  it('creates, edits, lists and deletes a journal entry; another user cannot touch it', async () => {
    const created = await as(7).post('/journal', { clientId: 'j_1', title: 'Today', text: 'Felt calmer after a walk', moodId: 'positive' });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    expect(rows[0]).toMatchObject({ entryType: 'note', isPrivate: true, mood: 4 });
    expect(rows[0].tags).toContain('journal');

    expect((await as(8).put(`/journal/${id}`, { text: 'hijack' })).status).toBe(404);
    const edited = await as(7).put(`/journal/${id}`, { title: 'Today', text: 'Felt much calmer' });
    expect(edited.body.data.text).toBe('Felt much calmer');
    expect((await as(7).get('/journal')).body.data).toHaveLength(1);
    expect((await as(8).get('/journal')).body.data).toHaveLength(0);

    expect((await as(8).del(`/journal/${id}`)).body.deleted).toBe(false);
    expect(rows).toHaveLength(1);
    expect((await as(7).del(`/journal/${id}`)).body.deleted).toBe(true);
    expect((await as(7).del(`/journal/${id}`)).body).toEqual({ success: true, deleted: false });
  });

  it('a plain diary note is not exposed or editable as a journal entry', async () => {
    rows.push(wrap({ id: 50, userId: 7, entryType: 'note', tags: [], description: 'symptom note', data: {} }));
    expect((await as(7).get('/journal')).body.data).toHaveLength(0);
    expect((await as(7).put('/journal/50', { text: 'x' })).status).toBe(404);
  });

  it('returns helplines with the saved journal entry when it contains crisis language, and never otherwise', async () => {
    const calm = await as(7).post('/journal', { clientId: 'j_2', text: 'Good sleep, went for a run' });
    expect(calm.body.support).toBeUndefined();
    const crisis = await as(7).post('/journal', { clientId: 'j_3', text: 'I want to end my life' });
    expect(crisis.status).toBe(201);
    expect(crisis.body.support?.helplines?.length).toBeGreaterThan(0);
  });

  it('serves the verified helplines in the shape the app reads (label + number)', async () => {
    const res = await as(7).get('/crisis/resources');
    expect(res.status).toBe(200);
    const numbers = res.body.data.map((r) => r.number);
    expect(numbers).toEqual(expect.arrayContaining(['14416', '1800-891-4416', '1800-599-0019', '112']));
    for (const r of res.body.data) expect(r.label).toBeTruthy();
  });

  it('assessments and AI coaching are not served (governed / not built)', async () => {
    expect((await as(7).get('/assessments')).status).toBe(404);
    expect((await as(7).post('/coaching/chat', { message: 'hi' })).status).toBe(404);
  });
});
