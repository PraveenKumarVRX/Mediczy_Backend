import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Video } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { joinMDT, getMDTCallToken } from '@/services/workspace.service';

const LiveKitRoom = lazy(() => import('@/components/video/LiveKitRoom'));

/** MDT video room — /:portal/mdt/:sessionId/room */
export default function MDTRoom() {
  const { sessionId, portal } = useParams<{ sessionId: string; portal: string }>();
  const navigate = useNavigate();
  const [joinData, setJoinData] = useState<{
    configured?: boolean;
    token?: string;
    livekitUrl?: string;
    room?: string;
    message?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sid = Number(sessionId);
    if (!sid) return;
    (async () => {
      try {
        await joinMDT(sid);
        const tokenRes = await getMDTCallToken(sid);
        setJoinData(tokenRes?.data || tokenRes);
      } catch (e: any) {
        setError(e?.message || 'Failed to join MDT room');
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <div className="flex items-center gap-3 p-3 bg-slate-800 text-white">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Video className="h-5 w-5" />
        <span className="font-medium">MDT Session #{sessionId}</span>
      </div>
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full text-white gap-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            Joining room…
          </div>
        ) : error ? (
          <div className="p-6 text-red-300 text-center">{error}</div>
        ) : joinData?.configured && joinData.token && joinData.livekitUrl ? (
          <Suspense fallback={<div className="text-white text-center p-8">Loading video…</div>}>
            <LiveKitRoom
              serverUrl={joinData.livekitUrl}
              token={joinData.token}
              roomName={joinData.room || `mdt-${sessionId}`}
              participantName={`${portal}-mdt`}
              inline
            />
          </Suspense>
        ) : (
          <div className="p-8 text-center text-slate-300">
            <p>{joinData?.message || 'LiveKit not configured for MDT video.'}</p>
            <p className="text-sm mt-2">Room: {joinData?.room || `session-${sessionId}`}</p>
          </div>
        )}
      </div>
    </div>
  );
}
