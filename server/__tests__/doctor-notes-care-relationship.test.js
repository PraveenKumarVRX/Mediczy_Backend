/**
 * Doctor-app note listing (/clinical-workflow/notes/patient|admission/:id) must only return notes the doctor is entitled
 * to: their own, their hospital's, or for a patient they have a care relationship with. It used to return any patient's.
 */
import { jest } from '@jest/globals';

let doctor = { id: 5, hospital_id: null };
jest.unstable_mockModule('../middleware/doctor.middleware.js', () => ({ authDoctor: (req, _res, next) => { req.doctor = doctor; next(); } }));
jest.unstable_mockModule('../services/ai-brain/llm-provider.js', () => ({ default: {} }));
jest.unstable_mockModule('../services/clinical-intelligence.service.js', () => ({ createCodingSuggestions: jest.fn() }));
jest.unstable_mockModule('../services/healthcare-ai-opportunity.service.js', () => ({ draftSoapNote: jest.fn() }));

const { postgresSequelize } = await import('../db/postgres-sequelize.js');
const NOTES = [
  { id: 1, patientId: 19, doctorId: 5, organization_id: null },     // mine
  { id: 2, patientId: 19, doctorId: 9, organization_id: null },     // colleague, patient I treat
  { id: 3, patientId: 77, doctorId: 9, organization_id: null },     // someone else's patient
  { id: 4, patientId: 88, doctorId: 9, organization_id: 4 },        // my hospital's ward
  { id: 5, patientId: 99, doctorId: 9, organization_id: 6 },        // another hospital
];
const relationships = new Set(['5:19']);
postgresSequelize.query = jest.fn(async (sql, opts = {}) => {
  const r = opts.replacements || {};
  if (/FROM clinical_notes WHERE "doctorId" = :d/.test(sql)) return relationships.has(`${r.d}:${r.p}`) ? [{ '?column?': 1 }] : [];
  if (/SELECT \* FROM clinical_notes/.test(sql)) return NOTES.filter((n) => (!r.patientId || n.patientId === r.patientId));
  return [];
});

const { default: request } = await import('supertest');
const { default: express } = await import('express');
const { default: router } = await import('../routes/clinical-workflow.route.js');
const { doctorHasCareRelationship } = await import('../services/clinical-notes.service.js');
const app = express(); app.use(express.json()); app.use('/cw', router);
const ids = (res) => res.body.data.map((n) => n.id).sort();

beforeEach(() => { doctor = { id: 5, hospital_id: null }; });

describe('GET /notes/patient/:patientId', () => {
  it('a treating doctor sees their own and colleagues\' notes for that patient', async () => {
    expect(ids(await request(app).get('/cw/notes/patient/19'))).toEqual([1, 2]);
  });
  it('a doctor with no relationship to the patient sees nothing (not 403 — no existence leak)', async () => {
    const res = await request(app).get('/cw/notes/patient/77');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
  it('a doctor who wrote a note for the patient still sees it', async () => {
    NOTES.push({ id: 6, patientId: 123, doctorId: 5, organization_id: null });
    expect(ids(await request(app).get('/cw/notes/patient/123'))).toEqual([6]);
    NOTES.pop();
  });
});

describe('GET /notes/admission/:admissionId', () => {
  it('returns only what the doctor is entitled to: own + treated patients', async () => {
    expect(ids(await request(app).get('/cw/notes/admission/1'))).toEqual([1, 2]);
  });
  it('a hospital-employed doctor additionally sees their OWN hospital\'s notes, never another hospital\'s', async () => {
    doctor = { id: 5, hospital_id: 4 };
    expect(ids(await request(app).get('/cw/notes/admission/1'))).toEqual([1, 2, 4]);
  });
  it('a doctor with no hospital never matches a hospital-stamped note by null', async () => {
    doctor = { id: 6, hospital_id: null };
    expect(ids(await request(app).get('/cw/notes/admission/1'))).toEqual([]);
  });
});

describe('doctorHasCareRelationship input validation', () => {
  it('rejects non-positive / non-numeric ids without querying', async () => {
    postgresSequelize.query.mockClear();
    expect(await doctorHasCareRelationship(0, 19)).toBe(false);
    expect(await doctorHasCareRelationship(5, 'x')).toBe(false);
    expect(postgresSequelize.query).not.toHaveBeenCalled();
  });
});
