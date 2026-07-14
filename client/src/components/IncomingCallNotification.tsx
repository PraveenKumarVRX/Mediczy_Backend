import { useEffect, useState, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, PhoneOff, AlertTriangle, User, Clock, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IncomingCallData {
  appointmentId: number;
  roomId: string;
  patientId: number;
  patientName: string;
  patientPhone: string;
  symptoms: string;
  urgencyLevel: 'IMMEDIATE' | 'URGENT' | 'LESS_URGENT' | 'NON_URGENT';
  joinUrl: string;
  timestamp: string;
  status: string;
}

interface IncomingCallNotificationProps {
  callData: IncomingCallData;
  onAccept: (appointmentId: number) => void;
  onReject: (appointmentId: number, reason?: string) => void;
  autoRejectTimeout?: number; // in seconds, default 60
}

const urgencyColors = {
  IMMEDIATE: 'bg-red-500',
  URGENT: 'bg-orange-500',
  LESS_URGENT: 'bg-yellow-500',
  NON_URGENT: 'bg-green-500',
};

const urgencyLabels = {
  IMMEDIATE: 'IMMEDIATE',
  URGENT: 'URGENT',
  LESS_URGENT: 'Less Urgent',
  NON_URGENT: 'Non-Urgent',
};

export function IncomingCallNotification({
  callData,
  onAccept,
  onReject,
  autoRejectTimeout = 60,
}: IncomingCallNotificationProps) {
  const [timeLeft, setTimeLeft] = useState(autoRejectTimeout);
  const [isRinging, setIsRinging] = useState(true);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ringingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep the latest onReject without making the ring/timer effect below
  // depend on it — onAccept/onReject are recreated on every render by all
  // three callers (DoctorDashboard/DoctorTriage/DoctorMobileHome), which
  // would otherwise tear down and restart the ring cycle on every parent
  // re-render (e.g. background query polling) while the call is still ringing.
  const onRejectRef = useRef(onReject);
  onRejectRef.current = onReject;

  const stopRinging = () => {
    if (ringingTimerRef.current) {
      clearInterval(ringingTimerRef.current);
      ringingTimerRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch (_) { /* ignore */ }
      audioCtxRef.current = null;
    }
  };

  useEffect(() => {
    // Play ringtone using Web Audio API (G5→B5→D6→G6 ascending arpeggio)
    const playRingCycle = () => {
      try {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
          audioCtxRef.current = new AudioContext();
        }
        if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
        const ctx = audioCtxRef.current;
        const t = ctx.currentTime;
        const playNote = (freq: number, start: number, dur: number, vol: number) => {
          const osc = ctx.createOscillator(); const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = 'sine'; osc.frequency.setValueAtTime(freq, start);
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(vol, start + 0.02);
          gain.gain.linearRampToValueAtTime(0, start + dur);
          osc.start(start); osc.stop(start + dur);
        };
        playNote(784,  t + 0.00, 0.18, 0.50);
        playNote(988,  t + 0.20, 0.18, 0.50);
        playNote(1175, t + 0.40, 0.18, 0.48);
        playNote(1568, t + 0.62, 0.32, 0.38);
      } catch (error) {
        console.error('Failed to play ringtone:', error);
      }
    };
    playRingCycle();
    ringingTimerRef.current = setInterval(playRingCycle, 2000);

    // Countdown timer
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Auto-reject when time runs out
          onRejectRef.current(callData.appointmentId, 'No response - timeout');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Pulse animation interval
    const pulseInterval = setInterval(() => {
      setIsRinging((prev) => !prev);
    }, 500);

    // Cleanup
    return () => {
      clearInterval(timer);
      clearInterval(pulseInterval);
      stopRinging();
    };
  }, [callData.appointmentId]);

  const handleAccept = () => {
    stopRinging();
    onAccept(callData.appointmentId);
  };

  const handleReject = () => {
    stopRinging();
    onReject(callData.appointmentId, 'Busy');
  };

  // Browser notification
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('🚨 Emergency Triage Call', {
        body: `${callData.patientName} needs urgent medical attention`,
        icon: '/emergency-icon.png',
        tag: `call-${callData.appointmentId}`,
        requireInteraction: true,
      });
    }
  }, [callData]);

  return (
    <>
      {/* Fullscreen overlay */}
      <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 flex items-center justify-center p-4">
        {/* Animated background circles */}
        <div className="absolute inset-0 overflow-hidden">
          <div
            className={cn(
              'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10',
              isRinging ? 'w-96 h-96' : 'w-80 h-80'
            )}
            style={{ transition: 'all 0.5s ease-in-out' }}
          />
          <div
            className={cn(
              'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/5',
              isRinging ? 'w-[30rem] h-[30rem]' : 'w-96 h-96'
            )}
            style={{ transition: 'all 0.5s ease-in-out', transitionDelay: '0.1s' }}
          />
        </div>

        {/* Content card */}
        <Card className="relative w-full max-w-md shadow-2xl">
          <div className="p-8 space-y-6">
            {/* Header */}
            <div className="text-center space-y-2">
              <div className="flex items-center justify-center gap-2 text-red-600">
                <AlertTriangle className="h-6 w-6 animate-pulse" />
                <span className="text-lg font-bold">EMERGENCY TRIAGE CALL</span>
              </div>
              
              <Badge className={cn('text-white', urgencyColors[callData.urgencyLevel])}>
                {urgencyLabels[callData.urgencyLevel]}
              </Badge>
            </div>

            {/* Patient avatar */}
            <div className="flex justify-center">
              <div className={cn('relative', isRinging && 'animate-pulse')}>
                <Avatar className="h-32 w-32 border-4 border-white shadow-xl">
                  <AvatarImage src="/patient-avatar.png" />
                  <AvatarFallback className="bg-blue-500 text-white text-4xl">
                    {callData.patientName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-2 -right-2 bg-green-500 rounded-full p-2">
                  <Phone className="h-6 w-6 text-white animate-bounce" />
                </div>
              </div>
            </div>

            {/* Patient info */}
            <div className="text-center space-y-3">
              <h2 className="text-2xl font-bold text-gray-900">
                {callData.patientName}
              </h2>
              
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-center gap-2 text-gray-600">
                  <Phone className="h-4 w-4" />
                  <span>{callData.patientPhone}</span>
                </div>
                
                <div className="flex items-center justify-center gap-2 text-gray-700">
                  <Activity className="h-4 w-4 text-red-500" />
                  <span className="font-medium">Symptoms: {callData.symptoms}</span>
                </div>
              </div>
            </div>

            {/* Timer */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-gray-500">
                <Clock className="h-4 w-4" />
                <span className="text-sm">
                  Auto-reject in {timeLeft}s
                </span>
              </div>
              <div className="mt-2 w-full bg-gray-200 rounded-full h-1">
                <div
                  className="bg-blue-600 h-1 rounded-full transition-all duration-1000"
                  style={{ width: `${(timeLeft / autoRejectTimeout) * 100}%` }}
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-4">
              {/* Reject button */}
              <Button
                variant="destructive"
                size="lg"
                onClick={handleReject}
                className="h-16 rounded-full bg-red-500 hover:bg-red-600 shadow-lg hover:shadow-xl transition-all"
              >
                <PhoneOff className="h-6 w-6 mr-2" />
                <span className="text-lg font-semibold">Reject</span>
              </Button>

              {/* Accept button */}
              <Button
                variant="default"
                size="lg"
                onClick={handleAccept}
                className="h-16 rounded-full bg-green-500 hover:bg-green-600 shadow-lg hover:shadow-xl transition-all animate-pulse"
              >
                <Phone className="h-6 w-6 mr-2" />
                <span className="text-lg font-semibold">Accept</span>
              </Button>
            </div>

            {/* Additional info */}
            <div className="text-center text-xs text-gray-500">
              Call ID: #{callData.appointmentId}
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
