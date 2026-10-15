import { jest } from '@jest/globals';

const query = jest.fn();
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query } }));
jest.unstable_mockModule('../services/ai-drug-interaction.service.js', () => ({
  default: { checkInteractions: jest.fn().mockResolvedValue({ interactions: [] }) },
}));

const { evaluatePrescriptionSignoff } = await import('../services/prescription-safety-gate.service.js');

describe('prescription safety audit fail-closed behavior', () => {
  it('blocks sign-off when the audit row cannot be written', async () => {
    query.mockRejectedValue(new Error('database unavailable'));
    const result = await evaluatePrescriptionSignoff({
      medications: [{ name: 'Paracetamol', dosage: '500 mg' }],
      patientId: 7,
      actorId: 3,
      tenantUid: 'TEN123',
    });

    expect(result).toMatchObject({
      allowed: false,
      status: 'audit_unavailable',
      code: 'safety_audit_unavailable',
      auditAvailable: false,
    });
  });
});
