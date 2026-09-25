import { jest } from '@jest/globals';

const mockQuery = jest.fn();
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
  postgresSequelize: { query: mockQuery },
}));

const getDischargeReadiness = jest.fn();
jest.unstable_mockModule('../services/adt.service.js', () => ({ getDischargeReadiness }));

// The signing gate consults the real signed-reconciliation record, not just the readiness list.
const reconciliationRequired = jest.fn();
const hasSignedReconciliation = jest.fn();
jest.unstable_mockModule('../services/prescription-safety.service.js', () => ({ reconciliationRequired }));
jest.unstable_mockModule('../services/med-reconciliation.service.js', () => ({ hasSignedReconciliation }));

const { signDischargePacket } = await import('../services/discharge-workflow.service.js');

beforeEach(() => {
  // mockReset (not clearAllMocks) — otherwise unconsumed mockResolvedValueOnce values
  // leak into the next test and the query sequence desynchronises.
  mockQuery.mockReset();
  getDischargeReadiness.mockReset();
  reconciliationRequired.mockReset();
  hasSignedReconciliation.mockReset();
  // Default: the tenant has the gate on and reconciliation is already signed.
  reconciliationRequired.mockResolvedValue(true);
  hasSignedReconciliation.mockResolvedValue(true);
});

describe('discharge packet signing gate', () => {
  it('blocks signing with HTTP 409 semantics when readiness is incomplete', async () => {
    mockQuery.mockResolvedValueOnce([[{ admissionId: 41 }]]).mockResolvedValueOnce([[{ patient_id: 12 }]]);
    getDischargeReadiness.mockResolvedValueOnce({ ready: false, mandatoryPending: [{ dimension: 'medication_reconciliation', label: 'Discharge medications reconciled and dispensed' }] });

    await expect(signDischargePacket(9, { signedBy: 7, organizationId: 3 })).rejects.toMatchObject({ code: 'DISCHARGE_READINESS_BLOCKED', status: 409 });
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('signs once readiness is complete', async () => {
    mockQuery.mockResolvedValueOnce([[{ admissionId: 41 }]]).mockResolvedValueOnce([[{ patient_id: 12 }]])
      .mockResolvedValueOnce([[{ id: 9, admissionId: 41, status: 'signed' }], 1]);
    getDischargeReadiness.mockResolvedValueOnce({ ready: true, mandatoryPending: [] });

    await expect(signDischargePacket(9, { signedBy: 7, organizationId: 3 })).resolves.toMatchObject({ success: true, data: { status: 'signed' } });
  });

  it('records an authorised override before signing', async () => {
    mockQuery.mockResolvedValueOnce([[{ admissionId: 41 }]]).mockResolvedValueOnce([[{ patient_id: 12 }]])
      .mockResolvedValueOnce([[], 1]).mockResolvedValueOnce([[{ id: 9, admissionId: 41, status: 'signed' }], 1]);
    getDischargeReadiness.mockResolvedValueOnce({ ready: false, mandatoryPending: [{ dimension: 'medication_reconciliation', label: 'Medication reconciliation' }] });

    await signDischargePacket(9, { signedBy: 7, organizationId: 3, override: { reasonCode: 'CLINICAL_URGENCY', approverId: 2, approverRole: 'medical_director' } });
    expect(mockQuery).toHaveBeenCalledTimes(4);
  });

  it('blocks signing when reconciliation is unsigned even if readiness reports ready', async () => {
    hasSignedReconciliation.mockResolvedValueOnce(false);
    mockQuery.mockResolvedValueOnce([[{ admissionId: 41 }]]).mockResolvedValueOnce([[{ patient_id: 12 }]]);
    getDischargeReadiness.mockResolvedValueOnce({ ready: true, mandatoryPending: [] });

    await expect(signDischargePacket(9, { signedBy: 7, organizationId: 3 }))
      .rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED', status: 409 });
    // The packet update must never run once the reconciliation gate blocks.
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('skips the reconciliation gate entirely when the tenant has it disabled', async () => {
    reconciliationRequired.mockResolvedValueOnce(false);
    mockQuery.mockResolvedValueOnce([[{ admissionId: 41 }]]).mockResolvedValueOnce([[{ id: 9, admissionId: 41, status: 'signed' }], 1]);
    getDischargeReadiness.mockResolvedValueOnce({ ready: true, mandatoryPending: [] });

    await expect(signDischargePacket(9, { signedBy: 7, organizationId: 3 })).resolves.toMatchObject({ success: true });
    expect(hasSignedReconciliation).not.toHaveBeenCalled();
  });
});
