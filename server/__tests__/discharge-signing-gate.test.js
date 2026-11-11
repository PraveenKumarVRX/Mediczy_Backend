import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockTransaction = jest.fn((work) => work({ id: 'tx' }));
// Models on the route's import path call sequelize.define at module load, so a
// stub without it throws before the graph is built and the suite cannot run.
const stubModel = () => ({
  findByPk: jest.fn(async () => null), findOne: jest.fn(async () => null),
  findAll: jest.fn(async () => []), create: jest.fn(async (v) => v),
  update: jest.fn(async () => [0]), destroy: jest.fn(async () => 0),
  count: jest.fn(async () => 0), belongsTo: jest.fn(), hasMany: jest.fn(),
  hasOne: jest.fn(), belongsToMany: jest.fn(), addHook: jest.fn(),
  sync: jest.fn(async () => undefined), prototype: {},
});

jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
  postgresSequelize: {
    query: mockQuery,
    transaction: mockTransaction,
    define: jest.fn(() => stubModel()),
    model: jest.fn(() => stubModel()),
    literal: jest.fn((v) => v),
    fn: jest.fn((...a) => a),
    col: jest.fn((v) => v),
    where: jest.fn((...a) => a),
    authenticate: jest.fn(async () => undefined),
  },
}));

const getDischargeReadiness = jest.fn();
jest.unstable_mockModule('../services/adt.service.js', () => ({ getDischargeReadiness }));

// The signing gate consults the real signed-reconciliation record, not just the readiness list.
const reconciliationRequired = jest.fn();
const hasSignedReconciliation = jest.fn();
jest.unstable_mockModule('../services/prescription-safety.service.js', () => ({ reconciliationRequired }));
jest.unstable_mockModule('../services/med-reconciliation.service.js', () => ({ hasSignedReconciliation }));

const { signDischargePacket, sendDischargePacket, updateDraftContent } = await import('../services/discharge-workflow.service.js');

const SCOPE = [{ admissionId: 41, patientId: 12, status: 'draft' }];
const SIGNED = [[{ id: 9, admissionId: 41, status: 'signed' }], 1];
const OVERRIDE = { reasonCode: 'CLINICAL_URGENCY', approverId: 2, approverRole: 'ms' };
const PENDING = [{ dimension: 'medication_reconciliation', label: 'Medication reconciliation' }];

beforeEach(() => {
  // mockReset (not clearAllMocks) — otherwise unconsumed mockResolvedValueOnce values leak between tests.
  mockQuery.mockReset();
  mockTransaction.mockClear();
  getDischargeReadiness.mockReset();
  reconciliationRequired.mockReset();
  hasSignedReconciliation.mockReset();
  reconciliationRequired.mockResolvedValue(true);
  hasSignedReconciliation.mockResolvedValue(true);
});

describe('discharge packet signing gate', () => {
  it('404s without touching anything else when the packet is not in the caller\'s organization', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await expect(signDischargePacket(9, { signedBy: 7, organizationId: 3 })).rejects.toMatchObject({ code: 'DISCHARGE_DRAFT_NOT_FOUND', status: 404 });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][1].replacements).toMatchObject({ id: 9, orgId: 3 });
  });

  it('blocks signing with 409 semantics when readiness is incomplete', async () => {
    mockQuery.mockResolvedValueOnce(SCOPE);
    getDischargeReadiness.mockResolvedValueOnce({ ready: false, mandatoryPending: PENDING });
    await expect(signDischargePacket(9, { signedBy: 7, organizationId: 3 })).rejects.toMatchObject({ code: 'DISCHARGE_READINESS_BLOCKED', status: 409 });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('signs once readiness is complete, updating only within the organization', async () => {
    mockQuery.mockResolvedValueOnce(SCOPE).mockResolvedValueOnce(SIGNED);
    getDischargeReadiness.mockResolvedValueOnce({ ready: true, mandatoryPending: [] });
    await expect(signDischargePacket(9, { signedBy: 7, organizationId: 3 })).resolves.toMatchObject({ success: true, data: { status: 'signed' } });
    expect(mockQuery.mock.calls[1][0]).toMatch(/organization_id = :orgId/);
    expect(mockQuery.mock.calls[1][1].replacements.orgId).toBe(3);
  });

  it('records an authorised override in the same transaction as the signature, attributed to the session approver', async () => {
    mockQuery.mockResolvedValueOnce(SCOPE).mockResolvedValueOnce(SIGNED).mockResolvedValueOnce([[], 1]);
    getDischargeReadiness.mockResolvedValueOnce({ ready: false, mandatoryPending: PENDING });
    await signDischargePacket(9, { signedBy: 7, organizationId: 3, override: OVERRIDE });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    const insert = mockQuery.mock.calls[2];
    expect(insert[0]).toMatch(/INSERT INTO discharge_overrides/);
    expect(insert[1].replacements).toMatchObject({ approver: 2, role: 'ms', reason: 'CLINICAL_URGENCY', orgId: 3 });
  });

  it('writes no override row when the signature itself fails (no orphan audit for a discharge that did not happen)', async () => {
    mockQuery.mockResolvedValueOnce(SCOPE).mockResolvedValueOnce([[], 0]);
    getDischargeReadiness.mockResolvedValueOnce({ ready: false, mandatoryPending: PENDING });
    await expect(signDischargePacket(9, { signedBy: 7, organizationId: 3, override: OVERRIDE })).rejects.toMatchObject({ code: 'DISCHARGE_ALREADY_SIGNED' });
    expect(mockQuery).toHaveBeenCalledTimes(2); // scope + the failed update, never the insert
  });

  it('does not honour an override whose role is not permitted to override', async () => {
    mockQuery.mockResolvedValueOnce(SCOPE);
    getDischargeReadiness.mockResolvedValueOnce({ ready: false, mandatoryPending: PENDING });
    await expect(signDischargePacket(9, { signedBy: 7, organizationId: 3, override: { reasonCode: 'x'.repeat(5), approverId: 2, approverRole: 'nurse' } }))
      .rejects.toMatchObject({ code: 'DISCHARGE_READINESS_BLOCKED' });
  });

  it('blocks signing when reconciliation is unsigned even if readiness reports ready, using the PACKET\'s patient', async () => {
    hasSignedReconciliation.mockResolvedValueOnce(false);
    mockQuery.mockResolvedValueOnce(SCOPE);
    getDischargeReadiness.mockResolvedValueOnce({ ready: true, mandatoryPending: [] });
    await expect(signDischargePacket(9, { signedBy: 7, organizationId: 3 })).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED', status: 409 });
    expect(hasSignedReconciliation).toHaveBeenCalledWith({ organizationId: 3, patientId: 12, admissionId: 41, type: 'discharge' });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('skips the reconciliation gate entirely when the tenant has it disabled', async () => {
    reconciliationRequired.mockResolvedValueOnce(false);
    mockQuery.mockResolvedValueOnce(SCOPE).mockResolvedValueOnce(SIGNED);
    getDischargeReadiness.mockResolvedValueOnce({ ready: true, mandatoryPending: [] });
    await expect(signDischargePacket(9, { signedBy: 7, organizationId: 3 })).resolves.toMatchObject({ success: true });
    expect(hasSignedReconciliation).not.toHaveBeenCalled();
  });
});

describe('send and edit are organization-scoped', () => {
  it('refuses to send a packet that is not signed or not in the caller\'s organization', async () => {
    mockQuery.mockResolvedValueOnce([[]]);
    await expect(sendDischargePacket(9, { channel: 'whatsapp', deliveryAddress: 'x', sentBy: 7, organizationId: 3 })).rejects.toMatchObject({ status: 404 });
    expect(mockQuery.mock.calls[0][0]).toMatch(/organization_id = :orgId AND status = 'signed'/);
  });

  it('refuses to edit a draft outside the organization', async () => {
    mockQuery.mockResolvedValueOnce([undefined, 0]);
    await expect(updateDraftContent(9, { draftContent: 'x' }, 3)).rejects.toMatchObject({ status: 404 });
    expect(mockQuery.mock.calls[0][0]).toMatch(/organization_id = :orgId/);
  });
});
