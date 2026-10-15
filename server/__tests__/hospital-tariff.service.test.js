import { jest } from '@jest/globals';

const sequelize = { query: jest.fn() };
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({ postgresSequelize: sequelize }));

const tariff = await import('../services/hospital-tariff.service.js');

describe('hospital tariff master', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tariff.resetHospitalTariffReadinessForTests();
  });

  test('fails closed when the migration has not been applied', async () => {
    sequelize.query.mockResolvedValueOnce([[]]);
    await expect(tariff.listHospitalTariffs(7)).rejects.toMatchObject({ code: 'SCHEMA_NOT_MIGRATED', status: 503 });
  });

  test('creates a scoped tariff after readiness and rejects overlapping periods', async () => {
    sequelize.query
      .mockResolvedValueOnce([[{ table_name: 'hospital_tariffs' }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ id: 11, code: 'CBC', rate: '500.00' }]])
      .mockResolvedValueOnce([[{ id: 11 }]]);

    await expect(tariff.createHospitalTariff(7, {
      code: 'CBC', itemName: 'Complete blood count', category: 'lab', unit: 'test', rate: 500,
      gst: 0, effectiveFrom: '2026-10-14', effectiveTo: '2026-12-31', payerType: 'cash',
    }, 42)).resolves.toMatchObject({ id: 11 });
    await expect(tariff.createHospitalTariff(7, {
      code: 'CBC', itemName: 'Complete blood count', category: 'lab', unit: 'test', rate: 550,
      gst: 0, effectiveFrom: '2026-11-01', effectiveTo: '2027-01-31', payerType: 'cash',
    })).rejects.toMatchObject({ code: 'TARIFF_OVERLAP', status: 409 });
  });

  test('validates rates and resolves active tariff', async () => {
    sequelize.query
      .mockResolvedValueOnce([[{ table_name: 'hospital_tariffs' }]])
      .mockResolvedValueOnce([[{ id: 12, code: 'ROOM-GEN', rate: '1800.00' }]]);
    await expect(tariff.lookupHospitalTariff(7, { code: 'ROOM-GEN', payerType: 'cash', onDate: '2026-10-14' }))
      .resolves.toMatchObject({ id: 12 });
    await expect(tariff.createHospitalTariff(7, {
      code: 'BAD', itemName: 'Bad', category: 'lab', unit: 'test', rate: -1, effectiveFrom: '2026-10-14',
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: 400 });
  });
});
