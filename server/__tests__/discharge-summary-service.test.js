/**
 * Discharge summaries via the practice screen (audit CLN-06): scope verification, one open row per admission (no
 * duplicates), status limited to draft/pending_approval, approved summaries immutable.
 */
import { jest } from '@jest/globals';

const query = jest.fn();
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query } }));
// The patient lookup runs inside a tenant-scoped transaction; expose its inner query so tests can steer it.
const scopedQuery = jest.fn();
const withRlsTransaction = jest.fn(async (_pool, ctx, work) => work({ query: scopedQuery }, ctx));
jest.unstable_mockModule('../middleware/rls-context.middleware.js', () => ({ withRlsTransaction }));

const { assertScope, saveSummary, updateSummary } = await import('../services/discharge-summary.service.js');

const H = 11;                                   // hospital / organization
const BODY = { patientId: 5, admissionId: 8, diagnosis: [{ code: 'I10' }], followUp: 'OPD 1 week', ward: 'A' };
const rows = (...r) => ({ rows: r });

beforeEach(() => { query.mockReset(); scopedQuery.mockReset(); withRlsTransaction.mockClear(); });

describe('assertScope — ids are verified against the hospital, not trusted from the body', () => {
  it('rejects an admission that belongs to another hospital (404) before looking at the patient', async () => {
    query.mockResolvedValueOnce(rows());                                     // ip_admissions lookup: not found
    await expect(assertScope(H, { patientId: 5, admissionId: 8 })).rejects.toMatchObject({ status: 404, code: 'ADMISSION_NOT_FOUND' });
    expect(query.mock.calls[0][0]).toMatch(/organization_id = \$2/);
    expect(query.mock.calls[0][1]).toEqual([8, H]);
    expect(withRlsTransaction).not.toHaveBeenCalled();
  });

  it('rejects a patient that is not visible in the tenant (404), resolving it under the hospital\'s RLS context', async () => {
    query.mockResolvedValueOnce(rows({ id: 8 }));
    scopedQuery.mockResolvedValueOnce(rows());
    await expect(assertScope(H, { patientId: 5, admissionId: 8 })).rejects.toMatchObject({ status: 404, code: 'PATIENT_NOT_FOUND' });
    expect(withRlsTransaction.mock.calls[0][1]).toMatchObject({ orgId: H, isPlatformAdmin: false });
  });

  it('validates the patient id shape', async () => {
    await expect(assertScope(H, {})).rejects.toMatchObject({ status: 400, code: 'PATIENT_REQUIRED' });
    await expect(assertScope(H, { patientId: 'abc' })).rejects.toMatchObject({ status: 400, code: 'PATIENT_INVALID' });
    await expect(assertScope(H, { patientId: -3 })).rejects.toMatchObject({ status: 400, code: 'PATIENT_INVALID' });
  });

  it('skips the admission check when none is given and returns the numeric patient id', async () => {
    scopedQuery.mockResolvedValueOnce(rows({ '?column?': 1 }));
    await expect(assertScope(H, { patientId: '5' })).resolves.toBe(5);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('saveSummary — one open summary per admission', () => {
  const scopeOk = () => { query.mockResolvedValueOnce(rows({ id: 8 })); scopedQuery.mockResolvedValueOnce(rows({ x: 1 })); };

  it('inserts a draft when none is open', async () => {
    scopeOk();
    query.mockResolvedValueOnce(rows())                                       // findOpen: nothing
      .mockResolvedValueOnce(rows({ id: 1, status: 'draft' }));               // INSERT
    const out = await saveSummary(H, BODY);
    expect(out).toMatchObject({ created: true, submittedNow: false });
    const insert = query.mock.calls[2];
    expect(insert[0]).toMatch(/INSERT INTO discharge_summaries/);
    expect(insert[1]).toContain('draft');
    expect(insert[1]).toContain(H);
  });

  it('saving again UPDATES the open draft instead of inserting a duplicate (production had 4 rows for 2 admissions)', async () => {
    scopeOk();
    query.mockResolvedValueOnce(rows({ id: 7, status: 'draft' })).mockResolvedValueOnce(rows({ id: 7, status: 'draft' }));
    const out = await saveSummary(H, BODY);
    expect(out).toMatchObject({ updatedExisting: true });
    expect(query.mock.calls.some((c) => /INSERT INTO discharge_summaries/.test(c[0]))).toBe(false);
    expect(query.mock.calls[2][0]).toMatch(/UPDATE discharge_summaries/);
    expect(query.mock.calls[2][0]).toMatch(/hospital_id = \$2/);
  });

  it('submitting a draft moves it to pending_approval on the SAME row and reports the transition once', async () => {
    scopeOk();
    query.mockResolvedValueOnce(rows({ id: 7, status: 'draft' })).mockResolvedValueOnce(rows({ id: 7, status: 'pending_approval' }));
    const out = await saveSummary(H, BODY, { submit: true });
    expect(out).toMatchObject({ submittedNow: true, updatedExisting: true });
    expect(query.mock.calls[2][1]).toContain('pending_approval');
  });

  it('submitting an already-submitted summary is a no-op — no second row, no second survey invitation', async () => {
    scopeOk();
    query.mockResolvedValueOnce(rows({ id: 7, status: 'pending_approval' }));
    const out = await saveSummary(H, BODY, { submit: true });
    expect(out).toMatchObject({ alreadySubmitted: true, submittedNow: false });
    expect(query).toHaveBeenCalledTimes(2);                                   // scope + findOpen only
  });

  it('a plain save of an already-submitted summary is refused (409) rather than silently reopening it', async () => {
    scopeOk();
    query.mockResolvedValueOnce(rows({ id: 7, status: 'pending_approval' }));
    await expect(saveSummary(H, BODY)).rejects.toMatchObject({ status: 409, code: 'SUMMARY_ALREADY_SUBMITTED' });
  });

  it('with no admission it looks for an open summary of that patient only where admission_id IS NULL', async () => {
    scopedQuery.mockResolvedValueOnce(rows({ x: 1 }));
    query.mockResolvedValueOnce(rows()).mockResolvedValueOnce(rows({ id: 2, status: 'draft' }));
    await saveSummary(H, { patientId: 5, diagnosis: [] });
    expect(query.mock.calls[0][0]).toMatch(/admission_id IS NULL/);
  });

  it('submitting a brand-new summary inserts it as pending_approval with submitted_at', async () => {
    scopeOk();
    query.mockResolvedValueOnce(rows()).mockResolvedValueOnce(rows({ id: 3, status: 'pending_approval' }));
    const out = await saveSummary(H, BODY, { submit: true });
    expect(out).toMatchObject({ created: true, submittedNow: true });
    expect(query.mock.calls[2][0]).toMatch(/submitted_at/);
    expect(query.mock.calls[2][1]).toContain('pending_approval');
  });
});

describe('updateSummary — approval is not writable here', () => {
  it.each(['approved', 'rejected', 'signed', 'anything'])('refuses status %s (400) without touching the database', async (status) => {
    await expect(updateSummary(H, 1, { status })).rejects.toMatchObject({ status: 400, code: 'STATUS_NOT_ALLOWED' });
    expect(query).not.toHaveBeenCalled();
  });

  it('allows draft / pending_approval / no status, scoped to the hospital and only while still editable', async () => {
    for (const status of ['draft', 'pending_approval', undefined]) {
      query.mockResolvedValueOnce(rows({ id: 1 }));
      await expect(updateSummary(H, 1, { status, diagnosis: [] })).resolves.toEqual({ id: 1 });
    }
    const sql = query.mock.calls[0][0];
    expect(sql).toMatch(/hospital_id = \$2/);
    expect(sql).toMatch(/status = ANY\(\$8\)/);
    expect(query.mock.calls[0][1][7]).toEqual(['draft', 'pending_approval']);   // an approved summary is not in the editable set
  });

  it('404s for a summary that is approved, missing, or another hospital\'s', async () => {
    query.mockResolvedValueOnce(rows());
    await expect(updateSummary(H, 99, { diagnosis: [] })).rejects.toMatchObject({ status: 404, code: 'SUMMARY_NOT_EDITABLE' });
  });
});
