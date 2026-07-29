import { getTenantSubdomain } from '@/utils/tenantHost';

/** Canonical clinic login path for current host. */
export function getClinicLoginPath(): string {
  return getTenantSubdomain() ? '/login' : '/clinic/login';
}

export function getClinicData(): any | null {
  try {
    const raw = localStorage.getItem('clinicData');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getClinicTenantId(): number | null {
  const data = getClinicData();
  const id = Number(data?.tenantId || data?.tenant_id || 0);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function clearClinicSession(): void {
  localStorage.removeItem('clinicToken');
  localStorage.removeItem('clinicData');
  localStorage.removeItem('clinicHospitalSlug');
  localStorage.removeItem('token');
  localStorage.removeItem('userType');
  localStorage.removeItem('userId');
}
