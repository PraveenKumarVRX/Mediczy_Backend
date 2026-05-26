import { jest } from '@jest/globals';

// Mock DB so no real Sequelize calls
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
  postgresSequelize: {
    query: jest.fn(),
    define: jest.fn(() => ({ findOne: jest.fn(), create: jest.fn() })),
  },
}));

const db = await import('../db/postgres-sequelize.js');
const svc = await import('../services/consent-enforcement.service.js');

const mockQuery = db.postgresSequelize.query;

// QueryTypes.SELECT returns just the rows array.
// Return [row] for a found consent, [] for none found.
// QueryTypes.INSERT / DDL: return [[], 1] (default).
function consentRow(status = 'signed') {
  return { id: 99, consent_type: 'treatment', signed_at: new Date().toISOString(), expires_at: null };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: INSERT/DDL succeeds; SELECT returns empty (no consent found)
  mockQuery.mockResolvedValue([[], 1]);
});

// ── Emergency bypass ───────────────────────────────────────────────────────────

describe('enforceOTBookingConsent — emergency bypass', () => {
  it('skips consent check for emergency admissions', async () => {
    const result = await svc.enforceOTBookingConsent({
      organizationId: 1, patientId: 1,
      procedureName: 'Emergency Lap', admissionType: 'emergency'
    });
    expect(result.skipped).toBe('emergency');
    // No DB calls should happen on emergency bypass
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

// ── Consent present ────────────────────────────────────────────────────────────

describe('enforceOTBookingConsent — consent present', () => {
  it('allows booking when valid consent exists', async () => {
    // First call = SELECT (returns one row); subsequent calls = INSERT audit log
    mockQuery
      .mockResolvedValueOnce([consentRow()])   // SELECT → row found
      .mockResolvedValue([[], 1]);              // INSERT audit log
    const result = await svc.enforceOTBookingConsent({
      organizationId: 1, patientId: 1,
      procedureName: 'Hip Replacement', admissionType: 'elective'
    });
    expect(result.allowed).toBe(true);
  });
});

// ── Consent missing — hard block ───────────────────────────────────────────────

describe('enforceOTBookingConsent — consent missing, no override', () => {
  it('throws with consentBlocked=true when consent absent and no override', async () => {
    // SELECT returns [] (no rows) → no consent found
    mockQuery
      .mockResolvedValueOnce([])    // SELECT → no consent
      .mockResolvedValue([[], 1]);  // INSERT audit log
    await expect(
      svc.enforceOTBookingConsent({
        organizationId: 1, patientId: 1,
        procedureName: 'Knee Replacement', admissionType: 'elective'
      })
    ).rejects.toMatchObject({ consentBlocked: true });
  });
});

// ── Override path ──────────────────────────────────────────────────────────────

describe('enforceOTBookingConsent — override by authorised role', () => {
  it('allows booking with valid override from surgeon', async () => {
    mockQuery
      .mockResolvedValueOnce([])    // SELECT → no consent
      .mockResolvedValue([[], 1]);  // INSERT audit log
    const result = await svc.enforceOTBookingConsent({
      organizationId: 1, patientId: 1,
      procedureName: 'CABG', admissionType: 'elective',
      override: { reasonCode: 'VERBAL_CONSENT', approverId: 5, approverRole: 'surgeon' }
    });
    expect(result.overrideApplied).toBe(true);
    // Audit log should have been written
    expect(mockQuery).toHaveBeenCalled();
  });

  it('rejects override from unauthorised role', async () => {
    mockQuery
      .mockResolvedValueOnce([])    // SELECT → no consent
      .mockResolvedValue([[], 1]);  // INSERT audit log
    await expect(
      svc.enforceOTBookingConsent({
        organizationId: 1, patientId: 1,
        procedureName: 'CABG', admissionType: 'elective',
        override: { reasonCode: 'VERBAL_CONSENT', approverId: 5, approverRole: 'ward_boy' }
      })
    ).rejects.toMatchObject({ consentBlocked: true });
  });
});

// ── Incision consent ───────────────────────────────────────────────────────────

describe('enforceOTIncisionConsent', () => {
  it('allows incision when consent present', async () => {
    // enforceOTIncisionConsent calls findActiveConsent for 'procedure_specific' first
    mockQuery
      .mockResolvedValueOnce([consentRow()])  // SELECT procedure_specific → found
      .mockResolvedValue([[], 1]);            // INSERT audit log
    const result = await svc.enforceOTIncisionConsent({
      organizationId: 1, patientId: 1, procedureName: 'CABG', isEmergency: false
    });
    expect(result.allowed).toBe(true);
  });

  it('skips check for emergency', async () => {
    const result = await svc.enforceOTIncisionConsent({
      organizationId: 1, patientId: 1, procedureName: 'Emergency OT', isEmergency: true
    });
    expect(result.skipped).toBe('emergency');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('blocks incision without consent or override', async () => {
    // Both procedure_specific and treatment SELECT return no rows
    mockQuery
      .mockResolvedValueOnce([])    // SELECT procedure_specific → none
      .mockResolvedValueOnce([])    // SELECT treatment → none
      .mockResolvedValue([[], 1]);  // INSERT audit log
    await expect(
      svc.enforceOTIncisionConsent({
        organizationId: 1, patientId: 1, procedureName: 'Appendectomy', isEmergency: false
      })
    ).rejects.toMatchObject({ consentBlocked: true });
  });
});
