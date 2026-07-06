import { formatDicomStudyDate } from '../services/orthanc-pacs.service.js';

describe('orthanc-pacs', () => {
  it('formats DICOM date YYYYMMDD to ISO', () => {
    expect(formatDicomStudyDate('20240615')).toBe('2024-06-15');
  });

  it('passes through ISO dates', () => {
    expect(formatDicomStudyDate('2024-06-15')).toBe('2024-06-15');
  });
});
