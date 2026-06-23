/**
 * OHIF viewer launcher + measurement bridge to platform API.
 */
const OHIF_BASE = import.meta.env.VITE_OHIF_BASE_PATH || '/ohif';

export function buildOhifViewerUrl(studyInstanceUID: string): string {
  return `${OHIF_BASE}/viewer?StudyInstanceUIDs=${encodeURIComponent(studyInstanceUID)}`;
}

export async function openOhifViewer(studyInstanceUID: string, apiPost = defaultSessionPost): Promise<Window | null> {
  if (!studyInstanceUID) return null;
  await apiPost('/imaging/session');
  const url = buildOhifViewerUrl(studyInstanceUID);
  return window.open(url, '_blank', 'noopener,noreferrer');
}

async function defaultSessionPost(path: string) {
  const { default: api } = await import('@/utils/api');
  await api.post(path);
}

export type OhifMeasurementPayload = {
  studyId?: number;
  studyInstanceUID: string;
  lesionLabel?: string;
  location?: string;
  sizeMm?: number;
  volumeMm3?: number;
  patientName?: string;
  data?: Record<string, unknown>;
};

/** Listen for OHIF measurement postMessages and POST to platform API. */
export function listenOhifMeasurements(
  token: string,
  defaults: Partial<OhifMeasurementPayload> = {},
): () => void {
  const handler = async (event: MessageEvent) => {
    if (event.data?.type !== 'MEDICZY_OHIF_MEASUREMENT') return;
    const payload = { ...defaults, ...(event.data.payload || {}) } as OhifMeasurementPayload;
    if (!payload.studyInstanceUID) return;
    try {
      await fetch('/api/imaging/platform/measurements/from-viewer', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          studyId: payload.studyId,
          studyInstanceUID: payload.studyInstanceUID,
          lesionLabel: payload.lesionLabel || 'lesion',
          location: payload.location,
          sizeMm: payload.sizeMm,
          volumeMm3: payload.volumeMm3,
          patientName: payload.patientName,
          data: payload.data,
        }),
      });
    } catch { /* non-blocking */ }
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

/** Publish measurement from OHIF custom tool or manual UI. */
export function publishOhifMeasurement(payload: OhifMeasurementPayload): void {
  window.postMessage({ type: 'MEDICZY_OHIF_MEASUREMENT', payload }, window.location.origin);
}
