/** Hospital portal auth helpers — shared across ward, HMIS, and practice pages */

export function getHospitalToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('hospitalToken');
}

export function hospitalAuthHeaders(): Record<string, string> {
  const token = getHospitalToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
