import { jest } from '@jest/globals';

const clone = (value) => JSON.parse(JSON.stringify(value));

const makeWeeklyAvailability = () => ({
  monday: { isAvailable: true, slots: [{ startTime: '09:00', endTime: '17:00', consultationType: 'both' }] },
  tuesday: { isAvailable: true, slots: [{ startTime: '09:00', endTime: '17:00', consultationType: 'both' }] },
  wednesday: { isAvailable: true, slots: [{ startTime: '09:00', endTime: '17:00', consultationType: 'both' }] },
  thursday: { isAvailable: true, slots: [{ startTime: '09:00', endTime: '17:00', consultationType: 'both' }] },
  friday: { isAvailable: true, slots: [{ startTime: '09:00', endTime: '17:00', consultationType: 'both' }] },
  saturday: { isAvailable: false, slots: [] },
  sunday: { isAvailable: false, slots: [] },
});

const state = {
  doctorId: 27,
  weeklyAvailability: makeWeeklyAvailability(),
};

const mockFindByPk = jest.fn(async (id) => {
  if (Number(id) !== state.doctorId) return null;

  const weeklyAvailability = clone(state.weeklyAvailability);
  return {
    id: state.doctorId,
    dataValues: { weeklyAvailability },
    weeklyAvailability,
    consultationTypes: {
      online: { available: true, fee: 500 },
      walkIn: { available: true, fee: 600 },
      homeVisit: { available: false, fee: 1000 },
    },
    isAvailable: true,
  };
});

const mockUpdate = jest.fn(async (id, payload) => {
  if (Number(id) !== state.doctorId) {
    throw new Error('Doctor not found');
  }

  if (payload?.weeklyAvailability) {
    state.weeklyAvailability = clone(payload.weeklyAvailability);
  }

  return {
    id: state.doctorId,
    weeklyAvailability: clone(state.weeklyAvailability),
  };
});

jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, _res, next) => {
    req.user = { id: state.doctorId, role: 'doctor' };
    next();
  },
}));

jest.unstable_mockModule('../models/doctor.model.intelligent.js', () => ({
  default: {
    findByPk: mockFindByPk,
    update: mockUpdate,
  },
}));

const express = (await import('express')).default;
const { default: request } = await import('supertest');
const { default: availabilityRouter } = await import('../routes/doctor-availability.route.js');

const app = express();
app.use(express.json());
app.use('/api/doctors/availability', availabilityRouter);

describe('Doctor Availability Bulk Update', () => {
  beforeEach(() => {
    state.weeklyAvailability = makeWeeklyAvailability();
    mockFindByPk.mockClear();
    mockUpdate.mockClear();
  });

  it('saves weeklyAvailability-wrapped mobile payload and normalizes slot aliases', async () => {
    const payload = {
      weeklyAvailability: {
        monday: {
          isAvailable: true,
          slots: [{ start: '11:25', end: '13:25', type: 'walkin' }],
        },
      },
    };

    const saveRes = await request(app)
      .post('/api/doctors/availability/bulk-update')
      .send(payload);

    expect(saveRes.status).toBe(200);
    expect(saveRes.body).toEqual(expect.objectContaining({ success: true }));

    const getRes = await request(app).get('/api/doctors/availability');
    expect(getRes.status).toBe(200);

    expect(getRes.body.data.weeklyAvailability.monday).toEqual({
      isAvailable: true,
      slots: [{ startTime: '11:25', endTime: '13:25', consultationType: 'walkIn' }],
    });

    // Unchanged days should remain intact when payload updates only one day.
    expect(getRes.body.data.weeklyAvailability.tuesday).toEqual({
      isAvailable: true,
      slots: [{ startTime: '09:00', endTime: '17:00', consultationType: 'both' }],
    });
  });

  it('keeps supporting legacy day-keyed payload format', async () => {
    const payload = {
      monday: {
        isAvailable: true,
        slots: [{ startTime: '09:30', endTime: '11:30', consultationType: 'online' }],
      },
    };

    const saveRes = await request(app)
      .post('/api/doctors/availability/bulk-update')
      .send(payload);

    expect(saveRes.status).toBe(200);
    expect(saveRes.body).toEqual(expect.objectContaining({ success: true }));

    const getRes = await request(app).get('/api/doctors/availability');
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.weeklyAvailability.monday).toEqual({
      isAvailable: true,
      slots: [{ startTime: '09:30', endTime: '11:30', consultationType: 'online' }],
    });
  });
});
