/**
 * Hospital MRD screen backed by the real MRD tables. Regression for the rollout finding that the new practice
 * endpoints queried medical_records (mrd_number / hospital_id / patient_name / uhid) — columns that do not exist
 * on this database — so the screen only ever returned errors. Pure mapping + validation only; no DB needed.
 */
import { formatMrdNumber, toApiRecord, createMrdRecord } from '../services/hospital-mrd.service.js';

describe('hospital MRD service', () => {
  test('MRD number is derived from the row, zero-padded, using the row year', () => {
    expect(formatMrdNumber(7, '2026-09-25T18:41:08.281Z')).toBe('MRD-2026-000007');
    expect(formatMrdNumber(123456, '2031-01-01T00:00:00Z')).toBe('MRD-2031-123456');
  });

  test('API record carries only what MRD owns — nothing clinical is invented', () => {
    const api = toApiRecord({
      id: 1, patient_id: 6149, record_type: 'IPD', format: 'physical', location: 'Main Archive', status: 'in_mrd',
      retention_due_at: null, created_at: '2026-09-25T18:41:08.281Z', updated_at: '2026-09-25T18:41:08.281Z',
      first_name: 'Asha', last_name: 'Rao', uhid: 'UH-1', total_pages: null,
    });
    expect(api).toMatchObject({ mrdNumber: 'MRD-2026-000001', patientName: 'Asha Rao', uhid: 'UH-1', totalPages: null });
    for (const invented of ['department', 'attendingDoctor', 'diagnosis', 'admissionDate', 'dischargeDate']) {
      expect(api).not.toHaveProperty(invented);
    }
  });

  test('missing name/UHID stay null instead of becoming placeholders', () => {
    const api = toApiRecord({ id: 2, patient_id: 1, record_type: 'OPD', format: 'digital', status: 'archived', created_at: '2026-01-01T00:00:00Z' });
    expect(api.patientName).toBeNull();
    expect(api.uhid).toBeNull();
    expect(api.location).toBeUndefined();
  });

  test('create validates input before touching the database', async () => {
    await expect(createMrdRecord(3, { recordType: 'IPD' })).rejects.toMatchObject({ status: 400 });
    await expect(createMrdRecord(3, { uhid: 'U1' })).rejects.toMatchObject({ status: 400 });
    await expect(createMrdRecord(3, { uhid: 'U1', recordType: 'IPD', format: 'tape' })).rejects.toMatchObject({ status: 400 });
  });
});
