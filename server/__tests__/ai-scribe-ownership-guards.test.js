import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const mockAppointmentFindByPk = jest.fn();
const mockAppointmentCount = jest.fn();

jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authDoctor: (req, _res, next) => {
    req.doctor = { id: 11, firstName: 'Guard', lastName: 'Doctor' };
    next();
  },
}));

jest.unstable_mockModule('../services/medicalAI.service.js', () => ({
  default: {
    consultMedical: jest.fn(),
  },
}));

jest.unstable_mockModule('../services/medical-terminology.service.js', () => ({
  default: {
    search: jest.fn().mockReturnValue([]),
    getAbbreviations: jest.fn().mockReturnValue([]),
    getDiagnoses: jest.fn().mockReturnValue([]),
    getDosages: jest.fn().mockReturnValue([]),
    getLabTests: jest.fn().mockReturnValue([]),
  },
}));

jest.unstable_mockModule('../services/cims.service.js', () => ({
  default: {
    searchMedicines: jest.fn().mockResolvedValue([]),
  },
}));

jest.unstable_mockModule('../models/index.js', () => ({
  Prescription: { create: jest.fn() },
  Appointment: {
    findByPk: mockAppointmentFindByPk,
    count: mockAppointmentCount,
  },
  User: { findByPk: jest.fn() },
  Doctor: {},
}));

let app;

describe('AI Scribe Ownership Guards', () => {
  beforeAll(async () => {
    const { default: router } = await import('../routes/ai-scribe.route.js');
    app = express();
    app.use(express.json());
    app.use('/api/ai', router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks generate-prescription when appointment belongs to another doctor', async () => {
    mockAppointmentFindByPk.mockResolvedValue({
      id: 44,
      doctorId: 99,
      userId: 222,
    });

    const res = await request(app)
      .post('/api/ai/generate-prescription')
      .set('Authorization', 'Bearer test-token')
      .send({
        consultationNotes: 'Patient has fever and cough',
        appointmentId: 44,
      });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      success: false,
      code: 'APPOINTMENT_ACCESS_DENIED',
    });
  });

  it('blocks generate-prescription for unrelated patient when appointmentId is absent', async () => {
    mockAppointmentCount.mockResolvedValue(0);

    const res = await request(app)
      .post('/api/ai/generate-prescription')
      .set('Authorization', 'Bearer test-token')
      .send({
        consultationNotes: 'BP elevated',
        patientId: 777,
      });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      success: false,
      code: 'PATIENT_ACCESS_DENIED',
    });
  });
});
