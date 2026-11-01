/**
 * Single source of truth for which doctor fields must never reach an API response.
 *
 * Context: GET /api/doctors/:doctorId/public used to hand-roll its own exclusion by
 * destructuring out password/verificationDocuments/digitalSignature/medicalSeal — none
 * of which are real column names. The actual KYC blob lives under `documents`
 * (idProof/medicalDegree/councilCertificate/signatureImage/sealImage/addressProof), so
 * nothing was actually stripped and doctors' ID/degree/council-certificate images were
 * served publicly, unauthenticated, as base64 (confirmed live for a real doctor: an
 * 8.5MB response). A hand-written field list silently drifts from the schema; this list
 * is the one place to update, and sanitizeDoctorForResponse() is a defense-in-depth
 * strip applied to the *output*, independent of whether the query already excluded them.
 *
 * Known legitimate exception: server/routes/admin/pending-registrations.route.js reads
 * the raw `documents` field to let an admin review a doctor's submitted KYC documents
 * during registration approval. That route must keep fetching the full row — do not
 * apply this list there.
 */
export const DOCTOR_SENSITIVE_FIELDS = [
  'password',
  'passwordResetToken',
  'passwordResetExpires',
  'documents',
  'verificationDocuments',
  'metadata',
  'search_vector',
  'uid',
  'unique_id',
  'userId',
  'lastLoginAt',
  'lastActivityAt',
];

/**
 * Strip every sensitive field from a doctor record before it is sent in an API response.
 * Accepts a Sequelize instance (calls .toJSON()) or a plain object. Defense-in-depth: use
 * this even when the query already used `attributes: { exclude: DOCTOR_SENSITIVE_FIELDS }`,
 * so a future caller that fetches the full row by mistake still can't leak it.
 */
export function sanitizeDoctorForResponse(doctor) {
  if (!doctor) return doctor;
  const plain = typeof doctor.toJSON === 'function' ? doctor.toJSON() : { ...doctor };
  for (const field of DOCTOR_SENSITIVE_FIELDS) delete plain[field];
  return plain;
}

export function sanitizeDoctorsForResponse(doctors) {
  return Array.isArray(doctors) ? doctors.map(sanitizeDoctorForResponse) : doctors;
}
