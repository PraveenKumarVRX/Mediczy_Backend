/** Resolve kiosk/display device token from URL or localStorage (P0). */
export function getDisplayDeviceToken(): string | null {
  if (typeof window === 'undefined') return null;
  const qs = new URLSearchParams(window.location.search);
  const fromQuery = qs.get('deviceToken') || qs.get('device_token');
  if (fromQuery) {
    try {
      localStorage.setItem('displayDeviceToken', fromQuery);
    } catch { /* ignore */ }
    return fromQuery;
  }
  try {
    return localStorage.getItem('displayDeviceToken');
  } catch {
    return null;
  }
}

export function displayDeviceHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getDisplayDeviceToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };
  if (token) headers['x-device-token'] = token;
  return headers;
}
