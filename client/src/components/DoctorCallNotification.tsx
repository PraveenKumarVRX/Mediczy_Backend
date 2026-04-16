import React, { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, User, Clock, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface DoctorCallProps {
  appointmentId: number;
  doctorName: string;
  doctorId?: number;
  meetingLink: string;
  callInitiatedAt: string;
  appointmentDate?: string;
  appointmentTime?: string;
  onAccept: () => void;
  onDecline: () => void;
  autoRejectTimeout?: number; // seconds
}

export function DoctorCallNotification({ 
  appointmentId,
  doctorName, 
  doctorId,
  meetingLink, 
  callInitiatedAt,
  appointmentDate,
  appointmentTime,
  onAccept, 
  onDecline,
  autoRejectTimeout = 60
}: DoctorCallProps) {
  const [timeLeft, setTimeLeft] = useState(autoRejectTimeout);
  const [isRinging, setIsRinging] = useState(true);

  useEffect(() => {
    // Countdown timer
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onDecline(); // Auto-decline when time runs out
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Cleanup
    return () => clearInterval(timer);
  }, [onDecline]);

  // Play ringtone sound via Web Audio API
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ringTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!isRinging) {
      if (ringTimerRef.current) clearInterval(ringTimerRef.current);
      if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch (_) {} audioCtxRef.current = null; }
      return;
    }
    const playRingCycle = () => {
      try {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') audioCtxRef.current = new AudioContext();
        if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
        const ctx = audioCtxRef.current; const t = ctx.currentTime;
        [[784, 0.0, 0.18, 0.50], [988, 0.2, 0.18, 0.50], [1175, 0.4, 0.18, 0.48], [1568, 0.62, 0.32, 0.38]].forEach(([freq, start, dur, vol]) => {
          const osc = ctx.createOscillator(); const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t + start);
          gain.gain.setValueAtTime(0, t + start);
          gain.gain.linearRampToValueAtTime(vol, t + start + 0.02);
          gain.gain.linearRampToValueAtTime(0, t + start + dur);
          osc.start(t + start); osc.stop(t + start + dur);
        });
      } catch (_) {}
    };
    playRingCycle();
    ringTimerRef.current = setInterval(playRingCycle, 2000);
    return () => {
      if (ringTimerRef.current) clearInterval(ringTimerRef.current);
      if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch (_) {} audioCtxRef.current = null; }
    };
  }, [isRinging]);

  const handleAccept = () => {
    setIsRinging(false);
    onAccept();
  };

  const handleDecline = () => {
    setIsRinging(false);
    onDecline();
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-teal-900/95 via-blue-900/95 to-slate-900/95 z-[9999] flex items-center justify-center backdrop-blur-sm">
      <div className="absolute inset-0 bg-black/30"></div>
      
      <div className="relative bg-white dark:bg-slate-800 rounded-3xl p-8 max-w-md w-full mx-4 shadow-2xl border-4 border-teal-500/30 animate-in fade-in zoom-in duration-300">
        
        {/* Pulse animation ring */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="relative">
            <div className="absolute inset-0 bg-teal-500 rounded-full opacity-75 animate-ping"></div>
            <div className="relative w-32 h-32 bg-gradient-to-br from-teal-400 to-blue-500 rounded-full flex items-center justify-center shadow-lg border-4 border-white dark:border-slate-800">
              <Phone className="w-16 h-16 text-white animate-pulse" />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="mt-20 text-center space-y-6">
          {/* Doctor Info */}
          <div className="space-y-3">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white">
              Incoming Call
            </h2>
            <div className="flex items-center justify-center gap-3">
              <Avatar className="w-16 h-16 border-2 border-teal-500">
                <AvatarImage src={`/api/placeholder/64/64`} />
                <AvatarFallback className="bg-teal-100 text-teal-700 text-xl">
                  {doctorName.split(' ').map(n => n[0]).join('').toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="text-left">
                <p className="text-2xl font-semibold text-slate-900 dark:text-white">
                  {doctorName}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Video Consultation
                </p>
              </div>
            </div>
          </div>

          {/* Appointment Details */}
          {(appointmentDate || appointmentTime) && (
            <div className="flex items-center justify-center gap-4 text-sm text-slate-600 dark:text-slate-400">
              {appointmentDate && (
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>{new Date(appointmentDate).toLocaleDateString()}</span>
                </div>
              )}
              {appointmentTime && (
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>{appointmentTime}</span>
                </div>
              )}
            </div>
          )}

          {/* Timer */}
          <div className="flex items-center justify-center gap-2 text-slate-600 dark:text-slate-400">
            <Clock className="w-4 h-4" />
            <span className="text-sm">
              Auto-decline in <span className="font-bold text-red-500">{timeLeft}s</span>
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 pt-4">
            <Button
              onClick={handleDecline}
              variant="outline"
              size="lg"
              className="flex-1 h-16 rounded-2xl border-2 hover:bg-red-50 hover:border-red-300 dark:hover:bg-red-900/20 group"
            >
              <PhoneOff className="w-6 h-6 mr-2 text-red-600 group-hover:animate-bounce" />
              <span className="text-lg font-semibold">Decline</span>
            </Button>
            
            <Button
              onClick={handleAccept}
              size="lg"
              className="flex-1 h-16 rounded-2xl bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 shadow-lg group"
            >
              <Phone className="w-6 h-6 mr-2 animate-pulse" />
              <span className="text-lg font-semibold">Accept</span>
            </Button>
          </div>

          {/* Info Text */}
          <p className="text-xs text-slate-500 dark:text-slate-400 pt-2">
            Your doctor is ready to start the consultation
          </p>
        </div>
      </div>
    </div>
  );
}

export default DoctorCallNotification;
