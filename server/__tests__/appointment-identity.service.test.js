import { jest } from '@jest/globals';

const mockResolveDoctorIdCandidates = jest.fn();
const mockIsDoctorOwnerFromCandidates = jest.fn();

jest.unstable_mockModule('../utils/doctor-appointment-access.js', () => ({
  resolveDoctorIdCandidates: mockResolveDoctorIdCandidates,
  isDoctorOwnerFromCandidates: mockIsDoctorOwnerFromCandidates,
}));

jest.unstable_mockModule('../models/index.js', () => ({
  User: { findOne: jest.fn() },
}));

describe('appointment-identity.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveActor', () => {
    it('identifies an admin actor before checking doctor/patient', async () => {
      const { resolveActor } = await import('../services/appointment-identity.service.js');

      const req = { user: { id: 42, isAdmin: true }, userRole: 'admin' };
      const actor = await resolveActor(req);

      expect(actor).toEqual({ type: 'admin', id: 42, candidateIds: [] });
      expect(mockResolveDoctorIdCandidates).not.toHaveBeenCalled();
    });

    it('resolves a doctor actor via req.doctor, using candidate resolution', async () => {
      mockResolveDoctorIdCandidates.mockResolvedValue([70, '70']);
      const { resolveActor } = await import('../services/appointment-identity.service.js');

      const req = { doctor: { id: 70, email: 'doc@example.com' }, userRole: 'doctor' };
      const actor = await resolveActor(req);

      expect(actor.type).toBe('doctor');
      expect(actor.id).toBe(70);
      expect(actor.candidateIds).toEqual([70, '70']);
      expect(mockResolveDoctorIdCandidates).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: 70, actorEmail: 'doc@example.com' })
      );
    });

    it('resolves a doctor actor via userRole even without req.doctor (authUser-based routes)', async () => {
      mockResolveDoctorIdCandidates.mockResolvedValue([1235]);
      const { resolveActor } = await import('../services/appointment-identity.service.js');

      const req = { user: { id: 1235, email: 'doc2@example.com' }, userRole: 'doctor' };
      const actor = await resolveActor(req);

      expect(actor.type).toBe('doctor');
      expect(actor.id).toBe(1235);
    });

    it('falls back to a patient actor using users.id directly — no candidate resolution', async () => {
      const { resolveActor } = await import('../services/appointment-identity.service.js');

      const req = { user: { id: 19 }, userRole: 'user' };
      const actor = await resolveActor(req);

      expect(actor).toEqual({ type: 'patient', id: 19, candidateIds: [19] });
      expect(mockResolveDoctorIdCandidates).not.toHaveBeenCalled();
    });

    it('returns a patient actor with empty candidates when no user id is present', async () => {
      const { resolveActor } = await import('../services/appointment-identity.service.js');

      const req = { user: null, userRole: 'user' };
      const actor = await resolveActor(req);

      expect(actor).toEqual({ type: 'patient', id: null, candidateIds: [] });
    });
  });

  describe('isOwnedByActor', () => {
    it('always allows admin actors', async () => {
      const { isOwnedByActor } = await import('../services/appointment-identity.service.js');

      const appointment = { doctorId: 999, userId: 999 };
      const actor = { type: 'admin', id: 1, candidateIds: [] };

      expect(isOwnedByActor(appointment, actor)).toBe(true);
    });

    it('delegates doctor ownership to isDoctorOwnerFromCandidates', async () => {
      mockIsDoctorOwnerFromCandidates.mockReturnValue(true);
      const { isOwnedByActor } = await import('../services/appointment-identity.service.js');

      const appointment = { doctorId: 70 };
      const actor = { type: 'doctor', id: 70, candidateIds: [70, '70'] };

      const result = isOwnedByActor(appointment, actor);

      expect(result).toBe(true);
      expect(mockIsDoctorOwnerFromCandidates).toHaveBeenCalledWith(70, [70, '70']);
    });

    it('rejects a doctor actor when isDoctorOwnerFromCandidates says no (id-space collision case)', async () => {
      // Regression guard for the exact bug class this service exists to prevent:
      // appointment.doctorId happening to equal a *different* doctor's or
      // patient's raw id must never be treated as ownership.
      mockIsDoctorOwnerFromCandidates.mockReturnValue(false);
      const { isOwnedByActor } = await import('../services/appointment-identity.service.js');

      const appointment = { doctorId: 70 }; // belongs to doctors.id=70
      const actor = { type: 'doctor', id: 1235, candidateIds: [1235] }; // a different doctor

      expect(isOwnedByActor(appointment, actor)).toBe(false);
    });

    it('matches patient ownership by userId equality only', async () => {
      const { isOwnedByActor } = await import('../services/appointment-identity.service.js');

      expect(isOwnedByActor({ userId: 19 }, { type: 'patient', id: 19, candidateIds: [19] })).toBe(true);
      expect(isOwnedByActor({ userId: 20 }, { type: 'patient', id: 19, candidateIds: [19] })).toBe(false);
    });

    it('rejects an appointment belonging to a different patient even if the numeric id matches a doctor elsewhere', async () => {
      // Regression guard for users.id / doctors.id collisions: this appointment's
      // userId=70 is a *patient*, not the doctors.id=70 record from a different table.
      const { isOwnedByActor } = await import('../services/appointment-identity.service.js');

      const appointment = { userId: 70 };
      const actor = { type: 'patient', id: 19, candidateIds: [19] };

      expect(isOwnedByActor(appointment, actor)).toBe(false);
    });
  });
});
