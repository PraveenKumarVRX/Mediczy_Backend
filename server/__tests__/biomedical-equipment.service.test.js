import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn();
const connect = jest.fn();
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query, connect } }));

const { default: service } = await import('../services/biomedical-equipment.service.js');

describe('biomedical equipment registry', () => {
  beforeEach(() => { query.mockReset(); connect.mockReset(); });

  it('scopes equipment lookup to the authenticated tenant', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 4, tenant_id: 12, device_name: 'Infusion pump' }] });
    const rows = await service.listEquipment(12);
    expect(rows).toHaveLength(1);
    expect(query.mock.calls[0][1]).toEqual([12]);
    expect(query.mock.calls[0][0]).toMatch(/WHERE tenant_id = \$1/i);
  });

  it('uses tenant-scoped calibration uniqueness for repeat scheduling', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 9, tenant_id: 12, equipment_id: 4 }] });
    await service.scheduleCalibration({ tenantId: 12, equipmentId: 4, calibrationType: 'electrical', nextDueAt: '2026-12-01' });
    expect(query.mock.calls[1][0]).toMatch(/ON CONFLICT \(tenant_id, equipment_id, calibration_type\)/i);
    expect(query.mock.calls[1][1]).toEqual([12, 4, 'electrical', '2026-12-01', 365]);
  });

  it('fails clinical use when a maintenance task is overdue', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 4, device_name: 'Infusion pump', integration_status: 'identified' }] })
      .mockResolvedValueOnce({ rows: [{ id: 8, task_type: 'ppm', due_at: '2026-01-01', status: 'scheduled', clinical_use_blocked: false, block_reason: null }] });
    const result = await service.checkClinicalUse(12, 4);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('preventive_maintenance_overdue');
  });

  it('creates a cold-chain alert when a reading breaches sensor bounds', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    connect.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 3, min_temperature_c: 2, max_temperature_c: 8, location: 'Blood bank' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 10, temperature_c: 12 }] })
      .mockResolvedValueOnce({ rows: [{ id: 20, status: 'open' }] })
      .mockResolvedValueOnce({}); // COMMIT
    const result = await service.recordColdChainReading({ tenantId: 12, sensorId: 3, temperatureC: 12, idempotencyKey: 'reading-1' });
    expect(result.outOfRange).toBe(true);
    expect(result.alert.id).toBe(20);
    expect(client.release).toHaveBeenCalled();
  });

  it('rejects reusing a cold-chain key for a different reading', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    connect.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 3, min_temperature_c: 2, max_temperature_c: 8, location: 'Blood bank' }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, request_hash: 'different-hash', alert_id: null }] })
      .mockResolvedValueOnce({});
    await expect(service.recordColdChainReading({ tenantId: 12, sensorId: 3, temperatureC: 4, idempotencyKey: 'reading-1' }))
      .rejects.toMatchObject({ code: 'idempotency_key_reuse', status: 422 });
  });

  it('marks overdue preventive maintenance and calibration records as blocked', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    connect.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 2 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({});
    await expect(service.markPreventiveMaintenanceOverdue()).resolves.toEqual({ preventiveMaintenance: 2, calibrations: 1 });
    expect(client.query.mock.calls[1][0]).toMatch(/clinical_use_blocked = TRUE/);
    expect(client.query.mock.calls[2][0]).toMatch(/biomedical_calibration_schedule/);
  });
});
