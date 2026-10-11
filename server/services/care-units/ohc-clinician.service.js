/**
 * Gives an `ohc_doctor` / `corporate_cmo` (a `users` row) a genuine `doctors` row, linked by
 * `linked_user_uid`, so they can use the hospital's real prescription and clinical-referral systems —
 * not a side, OHC-only copy of either. One linked identity backs both: if they're trusted to sign a
 * fitness certificate (registrationNumber on file), they're trusted to sign a prescription or a
 * referral too.
 *
 * `linked_user_uid` is read/written via the plain pool, not the Sequelize `Doctor` model — the model's
 * own attribute list doesn't declare that column, so anything routed through the model (`.findOne`,
 * `.create`) silently drops it, matches nothing, and (confirmed live) creates a fresh duplicate row on
 * every call until `registrationNumber`'s unique constraint throws. Only the initial `Doctor.create`
 * for everything else still goes through the model, to get its password-hashing and unique_id hooks.
 *
 * Tenant scoping: an `ohc_doctor` practices under the OHC's operating hospital/clinic's license, so
 * their linked Doctor row is scoped to that tenant. A `corporate_cmo` can span OHCs run by different
 * hospitals, so theirs is `organization_type: 'individual'` — not attributable to any one tenant.
 */
import { randomBytes } from 'node:crypto';
import DoctorPostgres from '../../models/postgres/doctor.model.postgres.js';
import { CollectionError } from '../collection/errors.js';

export function createOhcClinicianService({ pool }) {
  async function resolveOperatorTenant(ownerUid) {
    const { rows } = await pool.query(`SELECT id, type::text AS type FROM tenants WHERE unique_id = $1`, [ownerUid]);
    return rows[0] || null;
  }

  /** The OHC/corporate principal's own `users` row — email/phone/name aren't on the OHC principal itself. */
  async function loadUserRow(uid) {
    const { rows } = await pool.query(
      `SELECT id, "firstName", "lastName", email, "phoneNumber" FROM users WHERE unique_id = $1`, [uid]);
    return rows[0] || null;
  }

  async function findLinkedDoctorRaw(uid) {
    const { rows } = await pool.query(`SELECT * FROM doctors WHERE linked_user_uid = $1`, [uid]);
    return rows[0] || null;
  }

  async function findOrCreateLinkedDoctor(principal) {
    const existing = await findLinkedDoctorRaw(principal.uid);
    if (existing) {
      if (principal.registrationNumber && existing.registrationNumber !== principal.registrationNumber) {
        await pool.query(`UPDATE doctors SET "registrationNumber" = $1 WHERE id = $2`, [principal.registrationNumber, existing.id]);
        existing.registrationNumber = principal.registrationNumber;
      }
      return existing;
    }

    if (!principal.registrationNumber) {
      throw new CollectionError('registration_missing', 422, 'Your medical registration number is not on file. Ask your administrator to add it.', { field: 'registrationNumber' });
    }

    const user = await loadUserRow(principal.uid);
    if (!user) throw new CollectionError('not_found', 404, 'Account not found');

    let organizationId = null;
    let organizationType = 'individual';
    let tenantId = null;
    if (principal.role === 'ohc_doctor') {
      const unit = principal.units?.[0];
      const operator = unit ? await resolveOperatorTenant(unit.operatorUid) : null;
      if (operator) {
        organizationId = operator.id;
        organizationType = operator.type === 'clinic' ? 'clinic' : 'hospital';
        tenantId = operator.id;
      }
    }

    const placeholderPassword = randomBytes(24).toString('hex');
    const created = await DoctorPostgres.create({
      firstName: user.firstName || 'OHC',
      lastName: user.lastName || 'Doctor',
      email: user.email,
      phoneNumber: user.phoneNumber || '0000000000',
      password: placeholderPassword,
      specialization: 'Occupational Health',
      qualification: 'Occupational Health Physician',
      registrationNumber: principal.registrationNumber,
      organization_id: organizationId,
      organization_type: organizationType,
      tenantId,
      status: 'active',
      isVerified: true,
      emailVerified: true,
    });
    await pool.query(`UPDATE doctors SET linked_user_uid = $1 WHERE id = $2`, [principal.uid, created.id]);
    return findLinkedDoctorRaw(principal.uid);
  }

  return { findOrCreateLinkedDoctor };
}
