import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SimpleLiveKitRoom } from '@/components/video/LiveKitRoom';
import { joinOtProctorRoom, listOtProctorRooms, OtObserverJoin, OtProctorRoom } from '@/services/otProctor.service';

export function minutesAgo(startedAt: number, now = Date.now()): string {
  const m = Math.max(0, Math.floor((now - startedAt) / 60000));
  return m < 1 ? 'just now' : `${m} min ago`;
}

/** Remote-expert side of the OT proctoring wall: lists live rooms of this hospital and joins one (watch and listen). */
export default function OtExpertConsole() {
  const [rooms, setRooms] = useState<OtProctorRoom[]>([]);
  const [session, setSession] = useState<(OtObserverJoin & { roomId: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState<string | null>(null);

  const load = useCallback(() => {
    listOtProctorRooms().then(setRooms).catch(() => setRooms([]));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  const join = async (roomId: string) => {
    setJoining(roomId);
    setError(null);
    try {
      setSession({ ...(await joinOtProctorRoom(roomId)), roomId });
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not join this session.');
      load();
    } finally {
      setJoining(null);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">OT remote expert</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {session ? (
          <div className="space-y-2">
            <div className="h-[60vh] bg-black rounded-lg overflow-hidden">
              <SimpleLiveKitRoom serverUrl={session.serverUrl} token={session.token} onDisconnect={() => setSession(null)} />
            </div>
            <Button variant="outline" size="sm" onClick={() => setSession(null)}>Leave session</Button>
          </div>
        ) : rooms.length === 0 ? (
          <p className="text-muted-foreground">No live OT sessions. A session appears here when the theatre starts expert video.</p>
        ) : (
          rooms.map((r) => (
            <div key={r.roomId} className="flex items-center justify-between gap-2 border-b py-2">
              <span>Operation theatre session · started {minutesAgo(r.startedAt)}</span>
              <Button size="sm" disabled={joining === r.roomId} onClick={() => join(r.roomId)}>
                {joining === r.roomId ? 'Joining…' : 'Join (watch and listen)'}
              </Button>
            </div>
          ))
        )}
        {error && <p className="text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
