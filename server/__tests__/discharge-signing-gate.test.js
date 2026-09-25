import { jest } from '@jest/globals';

const mockQuery = jest.fn();
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
  postgresSequelize: { query: mockQuery },
}));

const getDischargeReadiness = jest.fn();
jest.unstable_mockModule('../services/adt.service.js', () => ({ getDischargeReadiness }));

const { signDischargePacket } = await import('../services/discharge-workflow.service.js');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('discharge packet signing gate', () => {
  it('blocks signing with HTTP 409 semantics when reconciliation is incomplete', async () => {
    mockQuery.mockResolvedValueOnce([[{ admissionId: 41 }]]);
    getDischargeReadiness.mockResolvedValueOnce({ ready: false, mandatoryPending: [{ dimension: 'medication_reconciliation', label: 'Discharge medications reconciled and dispensed' }] });

    await expect(signDischargePacket(9, { signedBy: 7, organizationId: 3 })).rejects.toMatchObject({ code: 'DISCHARGE_READINESS_BLOCKED', status: 409 });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('signs once readiness is complete', async () => {
    mockQuery.mockResolvedValueOnce([[{ admissionId: 41 }]]).mockResolvedValueOnce([[{ id: 9, admissionId: 41, status: 'signed' }], 1]);
    getDischargeReadiness.mockResolvedValueOnce({ ready: true, mandatoryPending: [] });

    await expect(signDischargePacket(9, { signedBy: 7, organizationId: 3 })).resolves.toMatchObject({ success: true, data: { status: 'signed' } });
  });

  it('records an authorised override before signing', async () => {
    mockQuery.mockResolvedValueOnce([[{ admissionId: 41 }]]).mockResolvedValueOnce([[], 1]).mockResolvedValueOnce([[{ id: 9, admissionId: 41, status: 'signed' }], 1]);
    getDischargeReadiness.mockResolvedValueOnce({ ready: false, mandatoryPending: [{ dimension: 'medication_reconciliation', label: 'Medication reconciliation' }] });

    await signDischargePacket(9, { signedBy: 7, organizationId: 3, override: { reasonCode: 'CLINICAL_URGENCY', approverId: 2, approverRole: 'medical_director' } });
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });
});
