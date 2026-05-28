type TelemetryPayload = Record<string, unknown>;

function isBrowser() {
  return typeof window !== 'undefined';
}

export function trackEvent(eventName: string, payload: TelemetryPayload = {}) {
  if (!isBrowser()) return;

  const event = {
    event: eventName,
    timestamp: new Date().toISOString(),
    path: window.location.pathname,
    ...payload,
  };

  // Generic dataLayer support.
  const dataLayer = (window as any).dataLayer;
  if (Array.isArray(dataLayer)) {
    dataLayer.push(event);
  }

  // PostHog support when present globally.
  const posthog = (window as any).posthog;
  if (posthog?.capture) {
    posthog.capture(eventName, payload);
  }

  // Optional local debug trail for QA verification.
  try {
    const existing = JSON.parse(localStorage.getItem('telemetry_debug_events') || '[]');
    existing.push(event);
    localStorage.setItem('telemetry_debug_events', JSON.stringify(existing.slice(-100)));
  } catch {
    // Ignore localStorage issues in privacy-restricted contexts.
  }
}
