import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Video, Copy, CheckCheck, Users, ArrowLeft, Loader2, PhoneOff } from 'lucide-react';
import api from '@/utils/api';

const LiveKitRoom = lazy(() => import('@/components/video/LiveKitRoom'));

interface CallState {
  serverUrl: string;
  token: string;
  roomName: string;
}

const LIVEKIT_MEET_URL = import.meta.env.VITE_LIVEKIT_MEET_URL || 'https://video.mediqzy.com';

export default function VideoConsultation() {
  const navigate = useNavigate();
  const nurseToken = localStorage.getItem('nurseToken');

  const [callState, setCallState] = useState<CallState | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [customRoom, setCustomRoom] = useState('');
  const [copied, setCopied] = useState(false);
  const inviteUrl = callState
    ? `${LIVEKIT_MEET_URL}/rooms/${callState.roomName}`
    : null;

  // Generate a unique consultation room name once per mount
  const defaultRoomName = useRef(
    `nurse-consult-${Date.now().toString(36)}`
  );

  useEffect(() => {
    if (!nurseToken) navigate('/nurse/login');
  }, [navigate, nurseToken]);

  const joinRoom = useCallback(async (roomName: string) => {
    if (!nurseToken || !roomName.trim()) return;
    setError('');
    setJoining(true);
    try {
      const { data } = await api.get('/nurse/chat/call-token', {
        params: { roomName: roomName.trim() },
        headers: { Authorization: `Bearer ${nurseToken}` },
      });
      if (!data.success) throw new Error(data.message || 'Failed to get token');
      setCallState({
        serverUrl: data.serverUrl,
        token: data.token,
        roomName: roomName.trim(),
      });
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Could not start consultation');
    } finally {
      setJoining(false);
    }
  }, [nurseToken]);

  const copyInvite = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const endCall = () => setCallState(null);

  // ── Active call view ──────────────────────────────────────────────────────
  if (callState) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-black/80 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Badge variant="default" className="bg-green-600 animate-pulse text-xs">● LIVE</Badge>
            <span className="text-white text-sm font-mono truncate max-w-[220px]">
              {callState.roomName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="text-white border-white/30 bg-white/10 hover:bg-white/20 text-xs"
              onClick={copyInvite}
            >
              {copied ? <CheckCheck className="h-3 w-3 mr-1 text-green-400" /> : <Copy className="h-3 w-3 mr-1" />}
              {copied ? 'Copied!' : 'Copy invite'}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={endCall}
              className="text-xs"
            >
              <PhoneOff className="h-3 w-3 mr-1" /> End
            </Button>
          </div>
        </div>

        {/* LiveKit room fills remaining space */}
        <div className="flex-1 min-h-0">
          <Suspense fallback={
            <div className="h-full flex items-center justify-center text-white">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          }>
            <LiveKitRoom
              serverUrl={callState.serverUrl}
              token={callState.token}
              roomName={callState.roomName}
              onDisconnect={endCall}
              controls={{ screenShare: true, camera: true }}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  // ── Pre-call lobby ────────────────────────────────────────────────────────
  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate('/nurse/dashboard')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Video Consultation</h1>
          <p className="text-muted-foreground text-sm">Start or join a multiparty video session</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Start new room */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Video className="h-4 w-4 text-primary" /> Start New Consultation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              A private room will be created. Share the invite link with the doctor and patient to join.
            </p>
            <Button
              className="w-full"
              onClick={() => joinRoom(defaultRoomName.current)}
              disabled={joining}
            >
              {joining ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Video className="h-4 w-4 mr-2" />}
              {joining ? 'Starting…' : 'Start Consultation'}
            </Button>
          </CardContent>
        </Card>

        {/* Join existing room */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Join Existing Room
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter the consultation room name shared by a doctor or colleague.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="Room name (e.g. nurse-consult-abc123)"
                value={customRoom}
                onChange={e => setCustomRoom(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && joinRoom(customRoom)}
              />
              <Button
                onClick={() => joinRoom(customRoom)}
                disabled={joining || !customRoom.trim()}
              >
                {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Join'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {error && (
          <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-md px-4 py-2">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
