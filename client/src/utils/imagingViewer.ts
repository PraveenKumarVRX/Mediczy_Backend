/**
 * OHIF viewer launcher — separate service, not embedded in React bundle.
 */
const OHIF_BASE = import.meta.env.VITE_OHIF_BASE_PATH || '/ohif';

export function buildOhifViewerUrl(studyInstanceUID: string): string {
  return `${OHIF_BASE}/viewer?StudyInstanceUIDs=${encodeURIComponent(studyInstanceUID)}`;
}

/** Issue PACS session cookie then open OHIF in new tab. */
export async function openOhifViewer(studyInstanceUID: string, apiPost = defaultSessionPost): Promise<void> {
  if (!studyInstanceUID) return;
  await apiPost('/imaging/session');
  const url = buildOhifViewerUrl(studyInstanceUID);
  window.open(url, '_blank', 'noopener,noreferrer');
}

async function defaultSessionPost(path: string) {
  const { default: api } = await import('@/utils/api');
  await api.post(path);
}
