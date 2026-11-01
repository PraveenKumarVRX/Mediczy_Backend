import { DOCTOR_SENSITIVE_FIELDS, sanitizeDoctorForResponse, sanitizeDoctorsForResponse } from '../utils/doctorSanitizer.js';

const RAW_DOCTOR = {
  id: 1747,
  unique_id: 'DXKJ96',
  firstName: 'Nandita',
  lastName: 'Agarwal',
  specialization: 'General Medicine',
  password: '$2b$10$hash',
  passwordResetToken: 'reset-token',
  passwordResetExpires: new Date().toISOString(),
  documents: {
    idProof: 'base64...', medicalDegree: 'base64...', councilCertificate: 'base64...',
    signatureImage: 'base64...', sealImage: 'base64...', addressProof: 'base64...',
  },
  metadata: { internal: true },
  search_vector: 'tsvector-data',
  uid: 'uid-123',
  userId: 99,
  lastLoginAt: new Date().toISOString(),
  lastActivityAt: new Date().toISOString(),
};

describe('DOCTOR_SENSITIVE_FIELDS', () => {
  // Regression guard for the incident this module exists to prevent: a 8.5MB base64 KYC
  // bundle (idProof/medicalDegree/councilCertificate/signatureImage/sealImage/addressProof)
  // was served publicly, unauthenticated, from GET /api/doctors/:id/public because the
  // route's own hand-rolled field list didn't match the real `documents` column name.
  it('includes documents, the field that actually caused the live leak', () => {
    expect(DOCTOR_SENSITIVE_FIELDS).toContain('documents');
  });

  it('includes every credential/token field', () => {
    for (const field of ['password', 'passwordResetToken', 'passwordResetExpires']) {
      expect(DOCTOR_SENSITIVE_FIELDS).toContain(field);
    }
  });
});

describe('sanitizeDoctorForResponse', () => {
  it('strips every sensitive field from a plain object', () => {
    const result = sanitizeDoctorForResponse({ ...RAW_DOCTOR });
    for (const field of DOCTOR_SENSITIVE_FIELDS) {
      expect(result).not.toHaveProperty(field);
    }
  });

  it('keeps legitimate public fields intact', () => {
    const result = sanitizeDoctorForResponse({ ...RAW_DOCTOR });
    expect(result.id).toBe(1747);
    expect(result.firstName).toBe('Nandita');
    expect(result.lastName).toBe('Agarwal');
    expect(result.specialization).toBe('General Medicine');
  });

  it('calls .toJSON() when given a Sequelize-instance-like object, instead of leaking its internals', () => {
    const instance = { toJSON: () => ({ ...RAW_DOCTOR }) };
    const result = sanitizeDoctorForResponse(instance);
    expect(result.documents).toBeUndefined();
    expect(result.firstName).toBe('Nandita');
    expect(typeof result.toJSON).toBe('undefined');
  });

  it('passes through null/undefined without throwing', () => {
    expect(sanitizeDoctorForResponse(null)).toBeNull();
    expect(sanitizeDoctorForResponse(undefined)).toBeUndefined();
  });

  it('does not mutate the input object', () => {
    const original = { ...RAW_DOCTOR };
    sanitizeDoctorForResponse(original);
    expect(original.documents).toBeDefined();
    expect(original.password).toBeDefined();
  });
});

describe('sanitizeDoctorsForResponse', () => {
  it('sanitizes every doctor in an array', () => {
    const result = sanitizeDoctorsForResponse([{ ...RAW_DOCTOR }, { ...RAW_DOCTOR, id: 2 }]);
    expect(result).toHaveLength(2);
    for (const doctor of result) {
      expect(doctor.documents).toBeUndefined();
      expect(doctor.password).toBeUndefined();
    }
  });

  it('passes through non-array input unchanged', () => {
    expect(sanitizeDoctorsForResponse(null)).toBeNull();
  });
});
