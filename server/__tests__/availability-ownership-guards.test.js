import { jest } from '@jest/globals';

const mockValidationResult = jest.fn();

jest.unstable_mockModule('express-validator', () => ({
  validationResult: mockValidationResult,
}));

jest.unstable_mockModule('../models/doctorAvailability.model.intelligent.js', () => ({
  default: {
    create: jest.fn(),
    findOne: jest.fn(),
  },
}));

jest.unstable_mockModule('../models/appointment.model.intelligent.js', () => ({
  default: {
    findAll: jest.fn(),
  },
}));

jest.unstable_mockModule('../models/doctor.model.intelligent.js', () => ({
  default: {
    findByPk: jest.fn(),
  },
}));

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Availability Ownership Guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidationResult.mockReturnValue({
      isEmpty: () => true,
      array: () => [],
    });
  });

  it('blocks non-doctor users from setting availability', async () => {
    const { setDoctorAvailability } = await import('../controller/availability.controller.js');

    const req = {
      params: { doctorId: '5' },
      userRole: 'assistant',
      user: { id: 5, role: 'assistant' },
      body: {},
    };
    const res = makeRes();

    await setDoctorAvailability(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Only doctors can set availability',
    }));
  });

  it('blocks doctors from updating another doctor\'s availability', async () => {
    const { updateDoctorAvailability } = await import('../controller/availability.controller.js');

    const req = {
      params: { doctorId: '9', scheduleId: '11' },
      userRole: 'doctor',
      user: { id: 5, role: 'doctor' },
      body: {},
    };
    const res = makeRes();

    await updateDoctorAvailability(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'You can only update your own availability',
    }));
  });
});
