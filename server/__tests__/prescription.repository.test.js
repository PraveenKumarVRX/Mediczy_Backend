import { jest } from '@jest/globals';

const mockPrescription = {
  findByPk: jest.fn(),
  findOne: jest.fn(),
  findAll: jest.fn(),
  findAndCountAll: jest.fn(),
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

jest.unstable_mockModule('../models/index.js', () => ({
  Prescription: mockPrescription,
}));

jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
  postgresSequelize: mockPostgresSequelize,
}));

jest.unstable_mockModule('../middleware/rls-context.middleware.js', () => ({
  setRlsContext: mockSetRlsContext,
}));

describe('prescription.repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const makeReq = () => ({ setSequelizeRlsContext: jest.fn().mockResolvedValue(undefined) });

  describe('withTransaction', () => {
    it('sets RLS context, commits on success', async () => {
      const repo = await import('../repositories/prescription.repository.js');
      const req = makeReq();

      const result = await repo.withTransaction(req, async (transaction) => {
        expect(transaction).toBe(currentTransaction);
        return 'ok';
      });

      expect(req.setSequelizeRlsContext).toHaveBeenCalledWith(currentTransaction);
      expect(currentTransaction.commit).toHaveBeenCalled();
      expect(result).toBe('ok');
    });

    it('rolls back and rethrows when work() throws', async () => {
      const repo = await import('../repositories/prescription.repository.js');
      const req = makeReq();

      await expect(
        repo.withTransaction(req, async () => {
          throw new Error('boom');
        })
      ).rejects.toThrow('boom');

      expect(currentTransaction.rollback).toHaveBeenCalled();
      expect(currentTransaction.commit).not.toHaveBeenCalled();
    });
  });

  describe('withTransactionBypass', () => {
    it('uses a platform-admin RLS context, not a request-scoped one', async () => {
      const repo = await import('../repositories/prescription.repository.js');

      await repo.withTransactionBypass(async () => 'ok');

      expect(mockSetRlsContext).toHaveBeenCalledWith(
        currentTransaction,
        expect.objectContaining({ orgId: 0, userId: 0, isPlatformAdmin: true })
      );
      expect(currentTransaction.commit).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('looks up by numeric id when id is numeric', async () => {
      mockPrescription.findOne.mockResolvedValue({ id: 5 });
      const repo = await import('../repositories/prescription.repository.js');
      const req = makeReq();

      const result = await repo.findById(req, '5');

      expect(result).toEqual({ id: 5 });
      expect(mockPrescription.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 5 } })
      );
    });

    it('looks up by prescriptionId when id is non-numeric', async () => {
      mockPrescription.findOne.mockResolvedValue({ prescriptionId: 'RX-ABC123' });
      const repo = await import('../repositories/prescription.repository.js');
      const req = makeReq();

      const result = await repo.findById(req, 'RX-ABC123');

      expect(result).toEqual({ prescriptionId: 'RX-ABC123' });
      expect(mockPrescription.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { prescriptionId: 'RX-ABC123' } })
      );
    });
  });

  describe('findByIdBypass', () => {
    it('fetches via the platform-admin bypass transaction', async () => {
      mockPrescription.findOne.mockResolvedValue({ id: 9 });
      const repo = await import('../repositories/prescription.repository.js');

      const result = await repo.findByIdBypass('9');

      expect(result).toEqual({ id: 9 });
      expect(mockSetRlsContext).toHaveBeenCalledWith(
        currentTransaction,
        expect.objectContaining({ isPlatformAdmin: true })
      );
    });
  });

  describe('findByIdInTransaction', () => {
    it('runs inside an already-open transaction without opening its own', async () => {
      mockPrescription.findOne.mockResolvedValue({ id: 3 });
      const repo = await import('../repositories/prescription.repository.js');
      const fakeTransaction = { id: 'existing-tx' };

      const result = await repo.findByIdInTransaction('3', fakeTransaction);

      expect(result).toEqual({ id: 3 });
      expect(mockPrescription.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ transaction: fakeTransaction })
      );
      // No new transaction should have been opened for this call.
      expect(mockPostgresSequelize.transaction).not.toHaveBeenCalled();
    });
  });

  describe('findByAppointmentId', () => {
    it('scopes the lookup to the given appointmentId', async () => {
      mockPrescription.findOne.mockResolvedValue({ appointmentId: 42 });
      const repo = await import('../repositories/prescription.repository.js');
      const req = makeReq();

      const result = await repo.findByAppointmentId(req, '42');

      expect(result).toEqual({ appointmentId: 42 });
      expect(mockPrescription.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { appointmentId: 42 } })
      );
    });
  });

  describe('findAllForDoctor / findAndCountAllForDoctor', () => {
    it('findAllForDoctor scopes to doctorId with an optional limit', async () => {
      mockPrescription.findAll.mockResolvedValue([{ id: 1 }]);
      const repo = await import('../repositories/prescription.repository.js');
      const req = makeReq();

      const result = await repo.findAllForDoctor(req, '70', { limit: 5 });

      expect(result).toEqual([{ id: 1 }]);
      expect(mockPrescription.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ where: { doctorId: 70 }, limit: 5 })
      );
    });

    it('findAndCountAllForDoctor passes through pagination', async () => {
      mockPrescription.findAndCountAll.mockResolvedValue({ count: 12, rows: [] });
      const repo = await import('../repositories/prescription.repository.js');
      const req = makeReq();

      const result = await repo.findAndCountAllForDoctor(req, '70', { limit: 20, offset: 40 });

      expect(result).toEqual({ count: 12, rows: [] });
      expect(mockPrescription.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({ where: { doctorId: 70 }, limit: 20, offset: 40 })
      );
    });
  });

  describe('findAllForPatient', () => {
    it('scopes to patientId and includes status filter only when provided', async () => {
      mockPrescription.findAll.mockResolvedValue([]);
      const repo = await import('../repositories/prescription.repository.js');
      const req = makeReq();

      await repo.findAllForPatient(req, '19', { status: ['issued', 'active'] });

      expect(mockPrescription.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ where: { patientId: 19, status: ['issued', 'active'] } })
      );

      await repo.findAllForPatient(req, '19');

      expect(mockPrescription.findAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { patientId: 19 } })
      );
    });
  });

  describe('create / update', () => {
    it('create() passes data through inside an RLS transaction', async () => {
      mockPrescription.create.mockResolvedValue({ id: 11 });
      const repo = await import('../repositories/prescription.repository.js');
      const req = makeReq();

      const result = await repo.create(req, { doctorId: 70, patientId: 19 });

      expect(result).toEqual({ id: 11 });
      expect(mockPrescription.create).toHaveBeenCalledWith(
        { doctorId: 70, patientId: 19 },
        { transaction: currentTransaction }
      );
    });

    it('update() calls .update() on the given instance inside an RLS transaction', async () => {
      const prescription = { id: 11, update: jest.fn().mockResolvedValue({ id: 11, status: 'issued' }) };
      const repo = await import('../repositories/prescription.repository.js');
      const req = makeReq();

      const result = await repo.update(req, prescription, { status: 'issued' });

      expect(result).toEqual({ id: 11, status: 'issued' });
      expect(prescription.update).toHaveBeenCalledWith(
        { status: 'issued' },
        { transaction: currentTransaction }
      );
    });
  });
});
