/**
 * hospital-clinical-notes router: passes the caller's hospital to the listings and refuses a tenant-less token
 * (audit SEC-01) — the router carries its own private copy of the hospital-token check.
 */
import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';

const listClinicalNotes = jest.fn().mockResolvedValue([{ id: 1 }]);
jest.unstable_mockModule('../services/clinical-notes.service.js', () => ({
  createClinicalNote: jest.fn(), listClinicalNotes, updateClinicalNote: jest.fn(), signClinicalNote: jest.fn(),
  getClinicalNoteById: jest.fn(), resolveDoctorId: jest.fn().mockResolvedValue(9),
}));
jest.unstable_mockModule('../models/clinical-note.model.js', () => ({ default: { findOne: jest.fn(), create: jest.fn() } }));
jest.unstable_mockModule('../services/ai-brain/llm-provider.js', () => ({ default: { chat: jest.fn() } }));

const { default: request } = await import('supertest');
const { default: express } = await import('express');
const { default: router } = await import('../routes/hospital-clinical-notes.route.js');
const app = express();
app.use(express.json());
app.use('/api/hospital/clinical-notes', router);

const listSpy = listClinicalNotes;
const tok = (claims) => jwt.sign(claims, JWT_CONFIG.SECRET, { expiresIn: '5m' });
beforeEach(() => listSpy.mockClear());

describe('hospital-clinical-notes router', () => {
  it('passes the caller\'s hospital to the patient listing', async () => {
    const res = await request(app).get('/api/hospital/clinical-notes/notes/patient/5').set('authorization', `Bearer ${tok({ id: 3, role: 'doctor', organization_id: 11 })}`);
    expect(res.status).toBe(200);
    expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ patientId: 5, organizationId: 11 }));
  });

  it('passes the caller\'s hospital to the admission listing', async () => {
    await request(app).get('/api/hospital/clinical-notes/notes/admission/8').set('authorization', `Bearer ${tok({ id: 3, role: 'nurse', tenant_id: 12 })}`);
    expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ admissionId: 8, organizationId: 12 }));
  });

  it('two hospitals asking for the same patient id each get only their own scope', async () => {
    await request(app).get('/api/hospital/clinical-notes/notes/patient/5').set('authorization', `Bearer ${tok({ id: 3, role: 'doctor', organization_id: 11 })}`);
    await request(app).get('/api/hospital/clinical-notes/notes/patient/5').set('authorization', `Bearer ${tok({ id: 4, role: 'doctor', organization_id: 22 })}`);
    expect(listSpy.mock.calls.map((c) => c[0].organizationId)).toEqual([11, 22]);
  });

  it('refuses a staff token with no tenant instead of using the user id as the hospital (audit SEC-01)', async () => {
    const res = await request(app).get('/api/hospital/clinical-notes/notes/patient/5').set('authorization', `Bearer ${tok({ id: 6203, role: 'doctor' })}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_CONTEXT_REQUIRED');
    expect(listSpy).not.toHaveBeenCalled();
  });

  it('the legacy hospital account still resolves to its own id', async () => {
    await request(app).get('/api/hospital/clinical-notes/notes/patient/5').set('authorization', `Bearer ${tok({ id: 30, role: 'hospital' })}`);
    expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 30 }));
  });

  it('401 without a token, 403 for a non-hospital role', async () => {
    expect((await request(app).get('/api/hospital/clinical-notes/notes/patient/5')).status).toBe(401);
    expect((await request(app).get('/api/hospital/clinical-notes/notes/patient/5').set('authorization', `Bearer ${tok({ id: 1, role: 'patient', organization_id: 11 })}`)).status).toBe(403);
    expect(listSpy).not.toHaveBeenCalled();
  });
});
