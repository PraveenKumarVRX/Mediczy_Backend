import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayCircle, Loader2 } from 'lucide-react';
import { PlaybackScrubber } from '@/components/clinical/PlaybackScrubber';
import { useWorkspace } from '@/features/workspace/hooks/useWorkspace';
import { getClinicalPlayback } from '@/services/workspace.service';

export default function ClinicalPlaybackPage() {
  const { patientId, actionLoading, setActionLoading } = useWorkspace();
  const [playback, setPlayback] = useState<any>(null);

  const loadPlayback = async () => {
    setActionLoading('playback');
    try {
      const res = await getClinicalPlayback(patientId, 48);
      setPlayback(res?.data || null);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      <Button onClick={loadPlayback} disabled={actionLoading === 'playback'}>
        {actionLoading === 'playback' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <PlayCircle className="h-4 w-4 mr-1" />}
        Replay last 48 hours
      </Button>
      {playback && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{playback.replayLabel}</CardTitle>
            <p className="text-sm text-muted-foreground">{playback.summary}</p>
          </CardHeader>
          <CardContent>
            <PlaybackScrubber chapters={playback.chapters || []} label={playback.replayLabel} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
