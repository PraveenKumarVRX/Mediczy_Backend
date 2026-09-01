import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = 'consultation-recording-test-secret';

const mockAppointmentFindByPk = jest.fn();
const mockRecordingFindOne = jest.fn();
const mockRecordingCreate = jest.fn();

jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authDoctor: (req, _res, next) => {
    req.doctor = { id: 11, firstName: 'Guard', lastName: 'Doctor' };
    next();
  },
  authUser: (req, _res, next) => {
    req.user = { id: 222, role: 'user' };
    req.userRole = 'user';
    next();
  },
}));

jest.unstable_mockModule('../config/auth.config.js', () => ({
  JWT_CONFIG: { SECRET: TEST_JWT_SECRET },
}));

jest.unstable_mockModule('../models/appointment.model.intelligent.js', () => ({
  default: { findByPk: mockAppointmentFindByPk },
}));

jest.unstable_mockModule('../models/consultationRecording.model.intelligent.js', () => ({
  default: {
    findOne: mockRecordingFindOne,
    create: mockRecordingCreate,
    findByPk: jest.fn(),
    findAll: jest.fn(),
  },
}));

jest.unstable_mockModule('../services/ai-brain/llm-provider.js', () => ({
  default: { transcribe: jest.fn(), chat: jest.fn() },
}));

jest.unstable_mockModule('../services/minio-upload.service.js', () => ({
  uploadToMinio: jest.fn(),
}));

let app;

const consentToken = (overrides = {}) => jwt.sign({
  purpose: 'consultation_recording_consent',
  patientId: 222,
  appointmentId: 44,
  roomId: 'room-44',
  requestId: 'request-1',
  granted: true,
  grantedAt: new Date().toISOString(),
  ...overrides,
}, TEST_JWT_SECRET, { expiresIn: '5m' });

describe('Consultation recording guards', () => {
  beforeAll(async () => {
    const { default: router } = await import('../routes/consultation-recording.route.js');
    app = express();
    app.use(express.json());
    app.use('/api/consultation-recordings', router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRecordingFindOne.mockResolvedValue(null);
  });

  it('rejects a doctor recording request without patient consent', async () => {
    const res = await request(app)
      .post('/api/consultation-recordings/start')
      .send({ appointmentId: 44, roomId: 'room-44', patientId: 222 });

    expect(res.status).toBe(400);
    expect(mockAppointmentFindByPk).not.toHaveBeenCalled();
    expect(mockRecordingCreate).not.toHaveBeenCalled();
  });

  it('rejects an appointment owned by another doctor', async () => {
    mockAppointmentFindByPk.mockResolvedValue({ id: 44, doctorId: 99, userId: 222 });

    const res = await request(app)
      .post('/api/consultation-recordings/start')
      .send({
        appointmentId: 44,
        roomId: 'room-44',
        patientId: 222,
        consent: {
          granted: true,
          requestId: 'request-1',
          grantedAt: new Date().toISOString(),
          token: consentToken(),
        },
      });

    expect(res.status).toBe(403);
    expect(mockRecordingCreate).not.toHaveBeenCalled();
  });

  it('stores consent evidence for the assigned doctor and patient', async () => {
    mockAppointmentFindByPk.mockResolvedValue({ id: 44, doctorId: 11, userId: 222 });
    mockRecordingCreate.mockImplementation(async data => ({ id: 7, ...data }));
    const grantedAt = new Date().toISOString();
    const token = consentToken({ grantedAt });

    const res = await request(app)
      .post('/api/consultation-recordings/start')
      .send({
        appointmentId: 44,
        roomId: 'room-44',
        patientId: 222,
        consent: {
          granted: true,
          requestId: 'request-1',
          grantedAt,
          token,
          participantIdentity: 'patient-222',
        },
      });

    expect(res.status).toBe(200);
    expect(mockRecordingCreate).toHaveBeenCalledWith(expect.objectContaining({
      doctorId: 11,
      patientId: 222,
      metadata: {
        patientConsent: expect.objectContaining({
          granted: true,
          requestId: 'request-1',
          grantedAt,
          participantIdentity: 'patient-222',
        }),
      },
    }));
  });

  it('issues a signed receipt only to the patient who owns the appointment', async () => {
    mockAppointmentFindByPk.mockResolvedValue({ id: 44, doctorId: 11, userId: 222 });

    const res = await request(app)
      .post('/api/consultation-recordings/consent')
      .send({ appointmentId: 44, roomId: 'room-44', requestId: 'request-1', granted: true });

    expect(res.status).toBe(200);
    const receipt = jwt.verify(res.body.consentToken, TEST_JWT_SECRET);
    expect(receipt).toMatchObject({
      purpose: 'consultation_recording_consent',
      patientId: 222,
      appointmentId: 44,
      roomId: 'room-44',
      requestId: 'request-1',
      granted: true,
    });
  });
});
