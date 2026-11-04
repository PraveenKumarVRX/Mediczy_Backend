import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const redisValues = new Map();
const redisClient = {
  get: jest.fn(async key => redisValues.get(key) || null),
  set: jest.fn(async (key, value) => { redisValues.set(key, value); return 'OK'; }),
  expire: jest.fn(async () => 1)
};

const appointmentCreate = jest.fn();
const appointmentFindAll = jest.fn();
const doctorFindAll = jest.fn();
const availabilityFindAll = jest.fn();
const sendMessage = jest.fn();

jest.unstable_mockModule('ioredis', () => ({ default: jest.fn(() => redisClient) }));
jest.unstable_mockModule('../models/appointment.model.intelligent.js', () => ({
  Appointment: { create: appointmentCreate, findAll: appointmentFindAll, findOne: async () => null }
}));
jest.unstable_mockModule('../models/doctor.model.intelligent.js', () => ({
  default: { findAll: doctorFindAll }
}));
jest.unstable_mockModule('../models/doctorAvailability.model.intelligent.js', () => ({
  default: { findAll: availabilityFindAll }
}));
jest.unstable_mockModule('../models/lab.model.enhanced.js', () => ({ default: { findAll: jest.fn() } }));
jest.unstable_mockModule('../models/user.model.intelligent.js', () => ({
  User: { findOne: jest.fn(), findByPk: jest.fn() }
}));
jest.unstable_mockModule('../services/whatsapp-production.service.js', () => ({
  default: { sendMessage }
}));
jest.unstable_mockModule('../services/medicalAI.service.js', () => ({ default: {} }));

jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({ postgresSequelize: { transaction: async work => work({ LOCK: { UPDATE: 'UPDATE' } }), query: async () => [] } }));
jest.unstable_mockModule('../middleware/rls-context.middleware.js', () => ({ setRlsContext: async () => {} }));
jest.unstable_mockModule('../services/appointmentEligibility.service.js', () => ({ checkDoctorConflict: async () => ({ conflict: false }), checkPatientConflict: async () => ({ conflict: false }) }));
const bookingService = (await import('../services/whatsapp-agentic-booking.service.js')).default;

const userContext = {
  isKnownUser: true,
  profileName: 'Dr Shiva Kumar',
  user: {
    id: 7,
    firstName: 'Shiva',
    lastName: 'Kumar',
    name: 'Dr Shiva Kumar',
    email: 'shiva@example.com'
  }
};

describe('WhatsApp mental-health booking flow', () => {
  beforeEach(() => {
    redisValues.clear();
    jest.clearAllMocks();
    appointmentFindAll.mockResolvedValue([]);
    doctorFindAll.mockResolvedValue([
      { id: 22, firstName: 'Anita', lastName: 'Rao', specialization: 'Clinical Psychology', consultationFee: 900 }
    ]);
    availabilityFindAll.mockResolvedValue([
      { doctorId: 22, startTime: '09:00:00', endTime: '12:00:00', slotDuration: 30, isAvailable: true, consultationType: 'online' }
    ]);
    appointmentCreate.mockResolvedValue({ id: 42 });
    sendMessage.mockResolvedValue({ sid: 'wa-confirmation' });
  });

  it('turns the transcript request into a virtual psychology booking flow', async () => {
    const first = await bookingService.processBookingIntent(
      '+919000000001',
      'Search for a psychology counselor and schedule a virtual call with them for me',
      userContext
    );
    expect(first.shouldReply).toBe(true);
    expect(first.response).toMatch(/qualified psychology counsellor/i);
    expect(first.response).toMatch(/virtual consultation/i);

    const date = await bookingService.processBookingIntent('+919000000001', 'tomorrow', userContext);
    expect(date.currentState).toBe('gathering_time');

    const slots = await bookingService.processBookingIntent('+919000000001', 'morning', userContext);
    expect(slots.currentState).toBe('confirming');
    expect(slots.response).toMatch(/Anita Rao/);
    expect(slots.response).toMatch(/Virtual consultation/);

    const confirmation = await bookingService.processBookingIntent('+919000000001', '1', userContext);
    expect(confirmation.actionTaken).toBe('BOOKING_CREATED');
    expect(appointmentCreate).toHaveBeenCalledWith(expect.objectContaining({
      doctorId: 22,
      specialization: 'Clinical Psychology',
      consultationType: 'online',
      reason: 'Mental health counselling consultation'
    }), expect.objectContaining({ transaction: expect.any(Object) }));
  });
  it('does not invent general consultation slots when availability fails', async () => {
    const lookup = jest.spyOn(bookingService, 'findDoctorSlots').mockRejectedValueOnce(new Error('database unavailable'));
    expect(await bookingService.findAvailableSlots({ preferredDate: new Date(Date.now() + 86400000), specialization: 'General Medicine' })).toEqual([]);
    lookup.mockRestore();
  });

  it('returns no fallback lab or doctor slots without authoritative availability', () => {
    expect(bookingService.getDefaultLabSlots(new Date(), {}, {})).toEqual([]);
    expect(bookingService.getDefaultDoctorSlots({}, 'General Medicine')).toEqual([]);
  });

  it('does not create a placeholder patient for an unlinked number', async () => {
    const result = await bookingService.executeBooking({}, { isKnownUser: false }, '+919000000099');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/link your existing patient account/i);
    expect(appointmentCreate).not.toHaveBeenCalled();
  });

});
