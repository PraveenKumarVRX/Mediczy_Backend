import type { doctorProfileProps } from '@/lib/user.type';
import type { DoctorNavItem } from '@/config/doctorNav.config';

type DoctorLike = doctorProfileProps & Record<string, unknown>;

/** True when the doctor is affiliated with a hospital (not solo/clinic-only). */
export function isDoctorHospitalAffiliated(
  doctor: DoctorLike | null | undefined
): boolean {
  if (!doctor) return false;

  const orgType = String(
    doctor.organization_type ?? doctor.organizationType ?? ''
  ).toLowerCase();

  if (orgType === 'hospital') return true;

  const hospitalId = doctor.hospitalId ?? doctor.hospital_id;
  if (hospitalId != null && hospitalId !== '' && hospitalId !== 0) return true;

  const orgId = doctor.organization_id ?? doctor.organizationId;
  if (orgId != null && orgId !== '' && orgId !== 0 && orgType !== 'clinic' && orgType !== 'individual') {
    return true;
  }

  return false;
}

/** True when the doctor is linked to a clinic tenant (doctors.organization_type = 'clinic'). */
export function isDoctorClinicAffiliated(
  doctor: DoctorLike | null | undefined
): boolean {
  if (!doctor) return false;
  const orgType = String(
    doctor.organization_type ?? doctor.organizationType ?? ''
  ).toLowerCase();
  return orgType === 'clinic';
}

export function filterDoctorNavItems(
  items: DoctorNavItem[],
  doctor: DoctorLike | null | undefined
): DoctorNavItem[] {
  const affiliated = isDoctorHospitalAffiliated(doctor);
  const clinicAffiliated = isDoctorClinicAffiliated(doctor);
  return items.filter((item) =>
    (!item.hospitalOnly || affiliated) && (!item.clinicOnly || clinicAffiliated)
  );
}
