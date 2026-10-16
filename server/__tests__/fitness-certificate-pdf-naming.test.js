import {
  fitnessCertificateNumber,
  fitnessCertificatePdfFileName,
  fitnessCertificatePdfPath,
  legacyFitnessCertificatePdfPath,
} from '../services/fitness-certificate-pdf.service.js';

describe('fitness certificate PDF naming', () => {
  test('uses the unique FC sequence, employee ID, and issued date', () => {
    expect(fitnessCertificateNumber({ id: 123 })).toBe('FC-000123');
    expect(fitnessCertificatePdfFileName({
      id: 123,
      employee_id: 'NC/EMP 0042',
      signed_at: '2026-10-17T05:30:00.000Z',
    })).toBe('FC-000123_NC-EMP-0042_20261017.pdf');
  });

  test('uses a stable employee fallback when an older record has no employee ID', () => {
    expect(fitnessCertificatePdfFileName({
      id: 7,
      patient_id: 88,
      created_at: '2026-10-17T00:00:00.000Z',
    })).toBe('FC-000007_PATIENT-88_20261017.pdf');
  });

  test('keeps the legacy path available for older files', () => {
    expect(legacyFitnessCertificatePdfPath(7)).toMatch(/fitness-cert-7\.pdf$/);
    expect(fitnessCertificatePdfPath({ id: 7, employee_id: 'E-1', signed_at: '2026-10-17' }))
      .toMatch(/FC-000007_E-1_20261017\.pdf$/);
  });
});
