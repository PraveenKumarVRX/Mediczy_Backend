import { jest } from '@jest/globals';

const mockAppointment = {
  findByPk: jest.fn(),
  findOne: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
};

const makeMockTransaction = () => ({
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),
});

let currentTransaction;
const mockPostgresSequelize = {
  transaction: jest.fn(() => {
    currentTransaction = makeMockTransaction();
    return Promise.resolve(currentTransaction);
  }),
};

const mockSetRlsContext = jest.fn().mockResolvedValue(undefined);
const mockFindDoctorAuthorizedAppointment = jest.fn();
const mockResolveActor = jest.fn();

jest.unstable_mockModule('../models/index.js', () => ({
  Appointment: mockAppointment,
  Doctor: {},
  User: {},
}));

jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
  postgresSequelize: mockPostgresSequelize,
}));

jest.unstable_mockModule('../middleware/rls-context.middleware.js', () => ({
  setRlsContext: mockSetRlsContext,
}));

jest.unstable_mockModule('../utils/doctor-appointment-access.js', () => ({
  findDoctorAuthorizedAppointment: mockFindDoctorAuthorizedAppointment,
}));

jest.unstable_mockModule('../services/appointment-identity.service.js', () => ({
  resolveActor: mockResolveActor,
}));

describe('appointment.repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const makeReq = () => ({ setSequelizeRlsContext: jest.fn().mockResolvedValue(undefined) });

  describe('withTransaction', () => {
    it('sets RLS context, commits on success, and returns the work result', async () => {
      const repo = await import('../repositories/appointment.repository.js');
      const req = makeReq();

      const result = await repo.withTransaction(req, async (transaction) => {
        expect(transaction).toBe(currentTransaction);
        return 'ok';
      });

      expect(req.setSequelizeRlsContext).toHaveBeenCalledWith(currentTransaction);
      expect(currentTransaction.commit).toHaveBeenCalled();
      expect(currentTransaction.rollback).not.toHaveBeenCalled();
      expect(result).toBe('ok');
    });

    it('rolls back and rethrows when work() throws — never leaves a dangling transaction', async () => {
      const repo = await import('../repositories/appointment.repository.js');
      const req = makeReq();
      const boom = new Error('boom');

      await expect(
        repo.withTransaction(req, async () => {
          throw boom;
        })
      ).rejects.toThrow('boom');

      expect(currentTransaction.rollback).toHaveBeenCalled();
      expect(currentTransaction.commit).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('fetches by primary key inside an RLS transaction', async () => {
      mockAppointment.findByPk.mockResolvedValue({ id: 5 });
      const repo = await import('../repositories/appointment.repository.js');
      const req = makeReq();

      const result = await repo.findById(req, 5, { include: [] });

      expect(result).toEqual({ id: 5 });
      expect(mockAppointment.findByPk).toHaveBeenCalledWith(5, {
        include: [],
        transaction: currentTransaction,
      });
    });
  });

  describe('findByIdForDoctor', () => {
    it('resolves the actor, then delegates to findDoctorAuthorizedAppointment with its candidateIds', async () => {
      mockResolveActor.mockResolvedValue({ type: 'doctor', id: 70, candidateIds: [70, '70'] });
      mockFindDoctorAuthorizedAppointment.mockResolvedValue({ id: 9, doctorId: 70 });
      const repo = await import('../repositories/appointment.repository.js');
      const req = makeReq();

      const result = await repo.findByIdForDoctor(req, 9, { allowMeetingFallback: false });

      expect(result).toEqual({ id: 9, doctorId: 70 });
      expect(mockFindDoctorAuthorizedAppointment).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentId: 9,
          doctorIdCandidates: [70, '70'],
          allowMeetingFallback: false,
          transaction: currentTransaction,
        })
      );
    });

    it('defaults allowMeetingFallback to true when not specified', async () => {
      mockResolveActor.mockResolvedValue({ type: 'doctor', id: 70, candidateIds: [70] });
      mockFindDoctorAuthorizedAppointment.mockResolvedValue(null);
      const repo = await import('../repositories/appointment.repository.js');
      const req = makeReq();

      await repo.findByIdForDoctor(req, 9);

      expect(mockFindDoctorAuthorizedAppointment).toHaveBeenCalledWith(
        expect.objectContaining({ allowMeetingFallback: true })
      );
    });
  });

  describe('findByIdForPatient', () => {
    it('scopes the lookup to the resolved actor\'s own userId', async () => {
      mockResolveActor.mockResolvedValue({ type: 'patient', id: 19, candidateIds: [19] });
      mockAppointment.findOne.mockResolvedValue({ id: 3, userId: 19 });
      const repo = await import('../repositories/appointment.repository.js');
      const req = makeReq();

      const result = await repo.findByIdForPatient(req, 3);

      expect(result).toEqual({ id: 3, userId: 19 });
      expect(mockAppointment.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 3, userId: 19 } })
      );
    });
  });

  describe('findBookedSlotsForDoctorOnDate', () => {
    it('uses a platform-admin bypass, not a request-scoped RLS context', async () => {
      mockAppointment.findAll.mockResolvedValue([{ appointmentTime: '10:00' }]);
      const repo = await import('../repositories/appointment.repository.js');

      const result = await repo.findBookedSlotsForDoctorOnDate(1235, '2026-07-11');

      expect(result).toEqual([{ appointmentTime: '10:00' }]);
      expect(mockSetRlsContext).toHaveBeenCalledWith(
        currentTransaction,
        expect.objectContaining({ isPlatformAdmin: true })
      );
      expect(currentTransaction.commit).toHaveBeenCalled();
    });
  });

  describe('create / updateStatus', () => {
    it('create() passes data through inside an RLS transaction', async () => {
      mockAppointment.create.mockResolvedValue({ id: 11 });
      const repo = await import('../repositories/appointment.repository.js');
      const req = makeReq();

      const result = await repo.create(req, { doctorId: 1235, userId: 19 });

      expect(result).toEqual({ id: 11 });
      expect(mockAppointment.create).toHaveBeenCalledWith(
        { doctorId: 1235, userId: 19 },
        { transaction: currentTransaction }
      );
    });

    it('updateStatus() calls .update() on the given instance inside an RLS transaction', async () => {
      const appointment = { id: 11, update: jest.fn().mockResolvedValue({ id: 11, status: 'confirmed' }) };
      const repo = await import('../repositories/appointment.repository.js');
      const req = makeReq();

      const result = await repo.updateStatus(req, appointment, { status: 'confirmed' });

      expect(result).toEqual({ id: 11, status: 'confirmed' });
      expect(appointment.update).toHaveBeenCalledWith(
        { status: 'confirmed' },
        { transaction: currentTransaction }
      );
    });
  });
});
