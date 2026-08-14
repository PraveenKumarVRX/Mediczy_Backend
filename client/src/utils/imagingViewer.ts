/**
 * OHIF viewer launcher + measurement bridge to platform API.
 */
const OHIF_BASE = import.meta.env.VITE_OHIF_BASE_PATH || '/ohif';

export type OhifViewerMode = 'diagnostic' | 'balanced' | 'preview';

export type OhifViewerLaunchOptions = {
  mode?: OhifViewerMode;
  target?: '_blank' | '_self';
  viewport?: 'phone' | 'large' | 'workspace';
};

function cleanStudyInstanceUID(studyInstanceUID: string): string {
  return String(studyInstanceUID || '').trim().replace(/,+$/g, '').trim();
}

function isPhoneLikeViewport(): boolean {
  if (typeof window === 'undefined') return false;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
  return coarsePointer && Math.min(window.innerWidth, window.innerHeight) < 768;
}

function defaultViewerMode(): OhifViewerMode {
  if (typeof navigator !== 'undefined' && 'connection' in navigator) {
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    if (connection?.saveData || ['slow-2g', '2g', '3g'].includes(String(connection?.effectiveType || '').toLowerCase())) {
      return 'preview';
    }
  }
  return isPhoneLikeViewport() ? 'preview' : 'diagnostic';
}

export function buildOhifViewerUrl(studyInstanceUID: string, options: OhifViewerLaunchOptions = {}): string {
  const uid = cleanStudyInstanceUID(studyInstanceUID);
  const mode = options.mode || defaultViewerMode();
  const params = new URLSearchParams({
    StudyInstanceUIDs: uid,
    quality: mode === 'preview' ? 'preview' : mode,
    viewport: options.viewport || (isPhoneLikeViewport() ? 'phone' : 'large'),
  });
  return `${OHIF_BASE}/viewer?${params.toString()}`;
}

export async function openOhifViewer(
  studyInstanceUID: string,
  apiPost = defaultSessionPost,
  options: OhifViewerLaunchOptions = {},
): Promise<Window | null> {
  const uid = cleanStudyInstanceUID(studyInstanceUID);
  if (!uid) return null;
  await apiPost('/imaging/session', { studyInstanceUID: uid });
  const url = buildOhifViewerUrl(uid, options);
  const target = options.target || (isPhoneLikeViewport() ? '_self' : '_blank');
  if (target === '_self') {
    window.location.assign(url);
    return window;
  }
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) window.location.assign(url);
  return opened;
}

async function defaultSessionPost(path: string, body?: Record<string, unknown>) {
  const { default: api } = await import('@/utils/api');
  await api.post(path, body);
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
