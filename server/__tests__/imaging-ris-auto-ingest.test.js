process.env.NODE_ENV = 'test';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../db/pgPool.js', () => ({
  default: { query: mockQuery },
}));

jest.unstable_mockModule('../config/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule('../services/imaging/imaging-ingest.service.js', () => ({
  onDicomStudyIngested: jest.fn(async () => ({})),
}));

jest.unstable_mockModule('../services/orthanc-pacs.service.js', () => ({
  formatDicomStudyDate: (d) => (d && String(d).length >= 8
    ? `${String(d).slice(0, 4)}-${String(d).slice(4, 6)}-${String(d).slice(6, 8)}`
    : null),
  fetchOrthancStudyByUid: jest.fn(),
  listOrthancStudyInstances: jest.fn(async () => []),
  listOrthancStudies: jest.fn(async () => []),
}));

const {
  resolveLabIdForOrthancIngest,
  resolveReferringDoctor,
  ensureRisStudyFromOrthancIngest,
} = await import('../services/imaging/imaging-ris-auto-ingest.service.js');

describe('imaging RIS auto-ingest', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    delete process.env.ORTHANC_DEFAULT_LAB_ID;
    delete process.env.ORTHANC_DEFAULT_REFERRING_DOCTOR_ID;
  });

  it('prefers an explicit lab id, then the modality AE title, then the institution name', async () => {
    expect(await resolveLabIdForOrthancIngest({ explicitLabId: 2368 })).toBe(2368);

    mockQuery.mockResolvedValueOnce({ rows: [{ tenant_id: 42 }] });
    expect(await resolveLabIdForOrthancIngest({ remoteAet: 'MRI_PC_1' })).toBe(42);

    mockQuery.mockResolvedValueOnce({ rows: [] });               // no AE match
    mockQuery.mockResolvedValueOnce({ rows: [{ tenant_id: 55 }] }); // institution match
    expect(await resolveLabIdForOrthancIngest({ remoteAet: 'RELAY', institutionName: 'City Imaging' })).toBe(55);
  });

  it('quarantines a study it cannot attribute rather than guessing from the env default', async () => {
    // ORTHANC_DEFAULT_LAB_ID was removed as an automatic fallback: once set it
    // silently overrode every study's real owning lab, for every lab, which
    // attributes a patient's imaging to the wrong one. No match now means no
    // attribution.
    process.env.ORTHANC_DEFAULT_LAB_ID = '99';
    expect(await resolveLabIdForOrthancIngest({})).toBeNull();

    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await resolveLabIdForOrthancIngest({ remoteAet: 'UNKNOWN_AE' })).toBeNull();
  });

  it('resolves referring doctor from env default', async () => {
    process.env.ORTHANC_DEFAULT_REFERRING_DOCTOR_ID = '70';
    const doc = await resolveReferringDoctor({ referringPhysician: 'Dr Test' });
    expect(doc.id).toBe(70);
  });

  it('skips RIS insert when lab cannot be resolved', async () => {
    const out = await ensureRisStudyFromOrthancIngest({
      tags: { studyInstanceUID: '1.2.3', modality: 'MR' },
    });
    expect(out.skipped).toBe(true);
    expect(out.reason).toBe('no_lab_id');
  });

  it('inserts a new ris_studies row for Orthanc MRI ingest', async () => {
    // The lab is named explicitly: an env default no longer attributes studies.
    process.env.ORTHANC_DEFAULT_REFERRING_DOCTOR_ID = '70';

    mockQuery
      // resolveReferringDoctor's env-default path looks up the doctor's
      // real display name via getDoctorDisplayName() — a real query that
      // runs before the "existing row" lookup below. Omitting this mock
      // was the actual bug: it shifted every later response by one slot,
      // so "existing lookup" landed on this query instead (making
      // existing.rows[0] truthy) and the real "existing lookup" response
      // landed on the UPDATE query with nothing left to mock the INSERT.
      .mockResolvedValueOnce({ rows: [{ name: 'Dr Mediczy' }] }) // doctor display-name lookup
      .mockResolvedValueOnce({ rows: [] }) // existing lookup
      .mockResolvedValueOnce({
        rows: [{
          id: 11,
          lab_id: 2368,
          study_instance_uid: '1.2.840.113619.2.1',
          modality: 'MR',
          referring_doctor_id: 70,
        }],
      });

    const out = await ensureRisStudyFromOrthancIngest({
      tags: {
        studyInstanceUID: '1.2.840.113619.2.1',
        patientName: 'YOGAVARSHAN^TEST',
        modality: 'MR',
        studyDate: '20260715',
        studyDescription: 'Brain MRI',
        ReferringPhysicianName: 'Dr Mediczy',
      },
      orthancStudyId: 'orthanc-study-1',
      remoteAet: 'MRI_CONSOLE',
      labId: 2368,
    });

    expect(out.success).toBe(true);
    expect(out.created).toBe(true);
    expect(out.study.id).toBe(11);
    expect(mockQuery).toHaveBeenCalledTimes(3);
    const insertSql = mockQuery.mock.calls[2][0];
    expect(insertSql).toMatch(/INSERT INTO ris_studies/i);
  });

  it('updates existing ris_studies instead of duplicating', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 11, referring_doctor_id: null, status: 'Completed', image_count: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 11, modality: 'MR' }] });

    const out = await ensureRisStudyFromOrthancIngest({
      tags: {
        studyInstanceUID: '1.2.840.113619.2.1',
        patientName: 'Existing Patient',
        modality: 'MR',
      },
      orthancStudyId: 'orthanc-study-1',
      labId: 2368,
    });

    expect(out.success).toBe(true);
    expect(out.created).toBe(false);
    expect(mockQuery.mock.calls[1][0]).toMatch(/UPDATE ris_studies/i);
  });
});
