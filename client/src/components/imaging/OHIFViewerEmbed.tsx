/**
 * OHIF Viewer embed — opens study in OHIF iframe with JWT for DICOMweb auth.
 */
import { useMemo } from 'react';
import { ExternalLink, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const OHIF_BASE = import.meta.env.VITE_OHIF_URL || 'http://localhost:3001';

interface OHIFViewerEmbedProps {
  studyInstanceUID: string;
  className?: string;
  height?: string | number;
}

function getAuthToken(): string | null {
  return localStorage.getItem('token') || localStorage.getItem('doctorToken') || null;
}

export function buildOHIFViewerUrl(studyInstanceUID: string, token?: string | null) {
  const params = new URLSearchParams();
  params.set('StudyInstanceUIDs', studyInstanceUID);
  const t = token ?? getAuthToken();
  if (t) params.set('access_token', t);
  return `${OHIF_BASE}/viewer?${params.toString()}`;
}

export default function OHIFViewerEmbed({
  studyInstanceUID,
  className = '',
  height = '70vh',
}: OHIFViewerEmbedProps) {
  const src = useMemo(() => buildOHIFViewerUrl(studyInstanceUID), [studyInstanceUID]);

  if (!studyInstanceUID) {
    return (
      <div className={`flex items-center justify-center bg-muted/30 rounded-lg ${className}`} style={{ height }}>
        <p className="text-sm text-muted-foreground">Select a study to open in OHIF viewer</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" asChild>
          <a href={src} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-1" /> Open in new tab
          </a>
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.open(src, '_blank', 'noopener')}>
          <Maximize2 className="h-4 w-4 mr-1" /> Fullscreen
        </Button>
      </div>
      <iframe
        title={`OHIF — ${studyInstanceUID}`}
        src={src}
        className="w-full rounded-lg border border-border bg-black"
        style={{ height }}
        allow="fullscreen"
      />
    </div>
  );
}
