import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayCircle, Loader2 } from 'lucide-react';
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
          <CardContent className="space-y-3 max-h-[60vh] overflow-y-auto">
            {(playback.chapters || []).map((c: any, i: number) => (
              <div key={i} className="flex gap-3 text-sm">
                <span className="text-muted-foreground shrink-0 w-16">
                  {new Date(c.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <div>
                  <p className="font-medium">{c.title}</p>
                  {c.detail && <p className="text-slate-600">{c.detail}</p>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
