import { jest } from '@jest/globals';

const clone = (value) => JSON.parse(JSON.stringify(value));

const state = {
  doctorId: 1303,
  doctor: {
    id: 1303,
    role: 'doctor',
    weeklySchedule: {
      monday: { isOff: false, online: { enabled: true, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' } },
      tuesday: { isOff: false, online: { enabled: true, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' } },
      wednesday: { isOff: false, online: { enabled: true, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' } },
      thursday: { isOff: false, online: { enabled: true, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' } },
      friday: { isOff: false, online: { enabled: true, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' } },
      saturday: { isOff: false, online: { enabled: true, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' } },
      sunday: { isOff: true, online: { enabled: false, startTime: '', endTime: '' }, inPerson: { enabled: false, startTime: '', endTime: '' } }
    },
    weeklyAvailability: {
      monday: { isAvailable: true, slots: [{ startTime: '09:00', endTime: '17:00', consultationType: 'both' }] },
      tuesday: { isAvailable: true, slots: [{ startTime: '09:00', endTime: '17:00', consultationType: 'both' }] },
      wednesday: { isAvailable: true, slots: [{ startTime: '09:00', endTime: '17:00', consultationType: 'both' }] },
      thursday: { isAvailable: true, slots: [{ startTime: '09:00', endTime: '17:00', consultationType: 'both' }] },
      friday: { isAvailable: true, slots: [{ startTime: '09:00', endTime: '17:00', consultationType: 'both' }] },
      saturday: { isAvailable: true, slots: [{ startTime: '09:00', endTime: '17:00', consultationType: 'both' }] },
      sunday: { isAvailable: false, slots: [] }
    },
    offDays: ['sunday'],
    slotDuration: 30,
    onlineConsultationEnabled: true,
    inPersonConsultationEnabled: true,
    onlineConsultationFee: 500,
    inPersonConsultationFee: 700,
    practiceLocations: [],
    save: jest.fn(async function save() {
      return this;
    })
  }
};

const mockFindByPk = jest.fn(async (id) => {
  if (Number(id) !== state.doctorId) return null;
  state.doctor.save = jest.fn(async function save() {
    return this;
  });
  return state.doctor;
});

jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, _res, next) => {
    req.user = { id: state.doctorId, role: 'doctor' };
    next();
  },
  authDoctor: (_req, _res, next) => next(),
}));

jest.unstable_mockModule('../models/index.js', () => ({
  Doctor: {
    findByPk: mockFindByPk,
  },
  Appointment: {},
}));

const express = (await import('express')).default;
const { default: request } = await import('supertest');
const { default: router } = await import('../routes/doctor-settings.route.js');

const app = express();
app.use(express.json());
app.use('/api/doctor-settings', router);

describe('Doctor settings schedule sync', () => {
  beforeEach(() => {
    state.doctor.weeklySchedule.saturday = {
      isOff: false,
      online: { enabled: true, startTime: '09:00', endTime: '13:00' },
      inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' }
    };
    state.doctor.weeklyAvailability.saturday = {
      isAvailable: true,
      slots: [{ startTime: '09:00', endTime: '17:00', consultationType: 'both' }]
    };
    state.doctor.offDays = ['sunday'];
    mockFindByPk.mockClear();
  });

  it('updates weeklyAvailability when appointment-config saves schedule changes', async () => {
    const weeklySchedule = clone(state.doctor.weeklySchedule);
    weeklySchedule.saturday = {
      isOff: false,
      online: { enabled: true, startTime: '09:00', endTime: '13:00' },
      inPerson: { enabled: false, startTime: '', endTime: '' },
      blockedSlots: []
    };

    const res = await request(app)
      .put('/api/doctor-settings/appointment-config')
      .send({ weeklySchedule });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(state.doctor.weeklySchedule.saturday.inPerson.enabled).toBe(false);
    expect(state.doctor.weeklyAvailability.saturday).toEqual({
      isAvailable: true,
      slots: [{ startTime: '09:00', endTime: '13:00', consultationType: 'online' }]
    });
    expect(state.doctor.offDays).toEqual(['sunday']);
  });
});