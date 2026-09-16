/**
 * Resolves the correct stationery (clinic/hospital name, address, phone) for
 * whichever entity a doctor is actually attached to, so every prescription
 * and fitness certificate a doctor issues carries their real entity's
 * letterhead — not a generic platform default. Used by both
 * prescription.route.js and clinic-occupational-health.route.js.
 *
 *   organization_type = 'clinic'     -> tenants table (by tenant_id)
 *   organization_type = 'hospital'   -> hospitals table (by hospitalId/organization_id)
 *   organization_type = 'individual' (or unset) -> the doctor's own recorded
 *     practice address, if any; otherwise the Mediqzy platform default.
 */
import sharedPool from '../db/pgPool.js';

function joinAddress(parts) {
  return parts.filter(Boolean).join(', ');
}

/** @param {object} doctor - a doctors-table row (or any object with the same field names) */
export async function resolveDoctorLetterhead(doctor = {}) {
  const orgType = String(doctor.organization_type || doctor.organizationType || '').toLowerCase();

  if (orgType === 'clinic' && (doctor.tenant_id || doctor.tenantId)) {
    const tenantId = doctor.tenant_id || doctor.tenantId;
    const { rows } = await sharedPool.query(`SELECT name, address, phone FROM tenants WHERE id = $1`, [tenantId]);
    const t = rows[0];
    if (t) {
      const addr = t.address || {};
      return {
        clinicName: t.name,
        clinicAddress: joinAddress([addr.street, addr.city, addr.state, addr.pincode]),
        clinicPhone: t.phone || '',
      };
    }
  }

  const hospitalId = doctor.hospitalId || doctor.hospital_id
    || (orgType === 'hospital' ? (doctor.organization_id || doctor.organizationId) : null);
  if (hospitalId) {
    const { rows } = await sharedPool.query(
      `SELECT hospital_name, address, city, state, pincode, phone_number FROM hospitals WHERE id = $1`,
      [hospitalId]
    );
    const h = rows[0];
    if (h) {
      return {
        clinicName: h.hospital_name,
        clinicAddress: joinAddress([h.address, h.city, h.state, h.pincode]),
        clinicPhone: h.phone_number || '',
      };
    }
  }

  if (doctor.clinicAddress) {
    const name = `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim();
    return {
      clinicName: name ? `Dr. ${name}` : 'Mediqzy',
      clinicAddress: doctor.clinicAddress,
      clinicPhone: doctor.phoneNumber || doctor.phone || '',
    };
  }

  return { clinicName: 'Mediqzy', clinicAddress: '', clinicPhone: '' };
}
