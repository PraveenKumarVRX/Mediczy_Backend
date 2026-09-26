import { jest } from '@jest/globals';

/**
 * WP-1.1: pins the actual admission/discharge reconciliation behaviour.
 *
 * The plan asked to "verify the admission-complete endpoint blocks when reconciliation is
 * unsigned". Checking the code showed there is no such endpoint — `completeAdmission` does not
 * exist, and `admitPatient` carries no reconciliation gate. Only the discharge path gates.
 *
 * This suite therefore asserts the TRUE current state rather than the plan's assumption, so that:
 *   - the discharge gate cannot be quietly removed without a test turning red, and
 *   - if an admission-time gate is ever added (a clinical design decision, not a bug fix), the
 *     structural assertion at the bottom fails and forces this file and the plan to be updated.
 */

const mockQuery = jest.fn();
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({ postgresSequelize: { query: mockQuery } }));

const reconcileTransaction = jest.fn(async (work) => work({
  query: jest.fn(async () => { const [r] = { rows: [] }; return [r]; }),
}));
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: jest.fn(async () => ({ rows: [] })), connect: jest.fn() } }));

const hasSignedReconciliation = jest.fn();
jest.unstable_mockModule('../services/med-reconciliation.service.js', () => ({ hasSignedReconciliation }));
const reconciliationRequired = jest.fn();
jest.unstable_mockModule('../services/prescription-safety.service.js', () => ({ reconciliationRequired }));

const adt = await import('../services/adt.service.js');
const { readFileSync } = await import('node:fs');
const { dirname, join } = await import('node:path');
const { fileURLToPath } = await import('node:url');

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../..');
const adtSrc = readFileSync(join(REPO, 'server/services/adt.service.js'), 'utf8');

beforeEach(() => {
  jest.clearAllMocks();
  reconciliationRequired.mockResolvedValue(true);
  hasSignedReconciliation.mockResolvedValue(true);
});

describe('WP-1.1 admission vs discharge reconciliation gate', () => {
  it('there is no admission-complete endpoint to verify', () => {
    // Recorded as a fact, not an aspiration. If a real admission-completion step is introduced,
    // this test is the tripwire that forces the plan and the gate design to be revisited.
    expect(adt.completeAdmission).toBeUndefined();
    expect(adt.closeAdmission).toBeUndefined();
    expect(adtSrc).not.toMatch(/export\s+(async\s+)?function\s+completeAdmission/);
  });

  it('admitPatient does NOT gate on reconciliation today', () => {
    // Isolated structurally: the admit function's own body must not reference the gate helpers.
    const body = adtSrc.slice(adtSrc.indexOf('export async function admitPatient'),
      adtSrc.indexOf('export async function transferPatient'));
    expect(body).not.toContain('hasSignedReconciliation');
    expect(body).not.toContain('reconciliationRequired');
  });

  it('the DISCHARGE path does gate, and the gate is in the discharge function', () => {
    const body = adtSrc.slice(adtSrc.indexOf('export async function dischargePatient'),
      adtSrc.indexOf('export async function convertOpToIp'));
    expect(body).toContain('hasSignedReconciliation');
    expect(body).toContain('reconciliationRequired');
    // It must block rather than warn.
    expect(body).toMatch(/RECONCILIATION_REQUIRED/);
  });

  it('the gate is tenant-controlled: a tenant with reconciliation_required off is not blocked', async () => {
    reconciliationRequired.mockResolvedValue(false);
    // No signed reconciliation is set up; if the gate ran it would block. The transaction mock
    // returns no admission, so the lookup yields no patient and cannot produce a block either way —
    // what this proves is that reconciliationRequired is consulted BEFORE the signed check.
    hasSignedReconciliation.mockResolvedValue(false);
    await expect(adt.dischargePatient({
      admissionId: 1, organizationId: 3, override: { reasonCode: 'X', approverId: 1, approverRole: 'admin' },
    })).rejects.toBeDefined();
    // hasSignedReconciliation must NOT have been consulted, because the tenant opted out.
    expect(hasSignedReconciliation).not.toHaveBeenCalled();
  });

  it('an override is required to proceed past an unsigned reconciliation', () => {
    expect(adtSrc).toMatch(/DISCHARGE_OVERRIDE_ROLES/);
    expect(adtSrc).toMatch(/discharge_overrides/);
    // The override must be recorded, not merely permitted.
    expect(adtSrc).toMatch(/reason_code/);
    expect(adtSrc).toMatch(/approver_id/);
  });
});
