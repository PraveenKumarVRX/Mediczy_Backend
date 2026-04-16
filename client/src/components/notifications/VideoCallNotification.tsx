/**
 * Video Call Notification Component
 * Displays incoming video call notifications with ringing sound
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, Video, User, Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import api from '@/utils/api';

interface CallNotification {
  type: 'incoming_call' | 'appointment_reminder';
  urgency: 'info' | 'warning' | 'urgent' | 'critical';
  title: string;
  message: string;
  appointmentId: number;
  appointmentTime: string;
  doctorName?: string;
  doctorSpecialization?: string;
  patientName?: string;
  roomId: string;
  meetingLink?: string;
  timeRemaining: string;
  action: 'prepare' | 'get_ready' | 'join_now' | 'answer';
  sound?: 'notification' | 'calling' | 'ringing';
  vibrate?: boolean;
  persistent?: boolean;
  fullScreen?: boolean;
}

export default function VideoCallNotification() {
  const [notification, setNotification] = useState<CallNotification | null>(null);
  const [isRinging, setIsRinging] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ringingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const vibrateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();
  const { currentUser, currentDoctor } = useAuth();
  const isExternalMeetingLink = (meetingLink?: string) => {
    if (!meetingLink) return false;
    try {
      const parsed = new URL(meetingLink);
      return !parsed.hostname.endsWith('mediqzy.com');
    } catch (error) {
      return false;
    }
  };
  const extractRoomIdFromLink = (meetingLink?: string) => {
    if (!meetingLink) return '';
    if (meetingLink.includes('/rooms/')) return meetingLink.split('/rooms/')[1]?.split('?')[0] || '';
    if (meetingLink.includes('/room/')) return meetingLink.split('/room/')[1]?.split('?')[0] || '';
    if (meetingLink.includes('/join/')) return meetingLink.split('/join/')[1]?.split('?')[0] || '';
    try {
      const parsed = new URL(meetingLink);
      return (
        parsed.searchParams.get('room') ||
        parsed.searchParams.get('roomId') ||
        parsed.searchParams.get('meetingId') ||
        ''
      );
    } catch (error) {
      return '';
    }
  };

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      stopRinging();
    };
  }, []);

  // Setup socket listeners - defined first so it can be used in effect
  const setupSocketListeners = useCallback((socket: typeof window.socket) => {
    if (!socket) return;

    console.log('🔔 Setting up VideoCallNotification socket listeners');

    // Handle standard appointment notification
    const handleNotification = (data: CallNotification) => {
      console.log('📞 Received appointment notification:', data);
      setNotification(data);
      handleNotificationSound(data);
    };

    // Handle doctor-initiated-call (when doctor starts a scheduled call)
    const handleDoctorInitiatedCall = (data: {
      appointmentId: number;
      doctorName?: string;
      meetingLink?: string;
      appointmentTime?: string;
      appointmentDate?: string;
    }) => {
      console.log('📞 Doctor initiated call:', data);
      const callNotification: CallNotification = {
        type: 'incoming_call',
        urgency: 'critical',
        title: `📞 ${data.doctorName || 'Your Doctor'} is calling`,
        message: 'Your doctor has started the video consultation. Tap to join!',
        appointmentId: data.appointmentId,
        appointmentTime: data.appointmentTime || new Date().toISOString(),
        doctorName: data.doctorName,
        roomId: extractRoomIdFromLink(data.meetingLink) || `apt-${data.appointmentId}`,
        meetingLink: data.meetingLink,
        timeRemaining: 'now',
        action: 'answer',
        sound: 'ringing',
        vibrate: true,
        persistent: true,
        fullScreen: true
      };
      setNotification(callNotification);
      handleNotificationSound(callNotification);
    };

    // Handle triage-call-request (for doctors receiving emergency calls)
    const handleTriageCallRequest = (data: {
      appointmentId: number;
      patientName?: string;
      urgencyLevel?: string;
      symptoms?: string;
      roomId?: string;
      joinUrl?: string;
      timestamp?: string;
    }) => {
      console.log('🚨 Triage call request:', data);
      const callNotification: CallNotification = {
        type: 'incoming_call',
        urgency: 'critical',
        title: `🚨 Emergency: ${data.patientName || 'Patient'} needs help`,
        message: `Urgency: ${data.urgencyLevel || 'URGENT'} - ${data.symptoms || 'Emergency consultation'}`,
        appointmentId: data.appointmentId,
        appointmentTime: data.timestamp || new Date().toISOString(),
        patientName: data.patientName,
        roomId: data.roomId || '',
        meetingLink: data.joinUrl,
        timeRemaining: 'now',
        action: 'answer',
        sound: 'ringing',
        vibrate: true,
        persistent: true,
        fullScreen: true
      };
      setNotification(callNotification);
      handleNotificationSound(callNotification);
    };

    // Handle triage-call-accepted (for patients when doctor accepts)
    // Skip if Emergency.tsx is actively handling the triage flow to avoid duplicate notifications
    const handleTriageCallAccepted = (data: {
      appointmentId: number;
      doctorName?: string;
      roomId?: string;
      joinUrl?: string;
      timestamp?: string;
    }) => {
      if ((window as any).__emergencyTriageActive) {
        console.log('✅ Triage call accepted (handled by Emergency page, skipping global notification)');
        return;
      }
      console.log('✅ Triage call accepted:', data);
      const callNotification: CallNotification = {
        type: 'incoming_call',
        urgency: 'critical',
        title: `✅ ${data.doctorName || 'Doctor'} accepted your call!`,
        message: 'Your doctor is ready. Join the video consultation now!',
        appointmentId: data.appointmentId,
        appointmentTime: data.timestamp || new Date().toISOString(),
        doctorName: data.doctorName,
        roomId: data.roomId || '',
        meetingLink: data.joinUrl,
        timeRemaining: 'now',
        action: 'join_now',
        sound: 'calling',
        vibrate: true,
        persistent: true,
        fullScreen: true
      };
      setNotification(callNotification);
      handleNotificationSound(callNotification);
    };

    const handleNotificationSound = (data: CallNotification) => {
      // Play sound based on urgency
      if (data.sound === 'ringing' || data.action === 'answer') {
        playRingingSound();
      } else if (data.sound === 'calling' || data.action === 'join_now') {
        playCallingSound();
      } else if (data.sound === 'notification') {
        playNotificationSound();
      }

      // Vibrate if supported and requested
      if (data.vibrate && 'vibrate' in navigator) {
        startVibration();
      }

      // Show browser notification
      showBrowserNotification(data);

      // Auto-dismiss non-critical notifications after 30 seconds
      if (data.urgency !== 'critical' && !data.persistent) {
        setTimeout(() => {
          dismissNotification();
        }, 30000);
      }
    };

    socket.on('appointment_notification', handleNotification);
    socket.on('doctor-initiated-call', handleDoctorInitiatedCall);
    socket.on('triage-call-request', handleTriageCallRequest);
    socket.on('triage-call-accepted', handleTriageCallAccepted);

    // Re-attach on reconnect in case the server drops the room (socket.io
    // keeps the same socket instance across reconnects but the server-side
    // rooms are lost — a "reconnect" event fires when the transport recovers)
    socket.off('reconnect', (socket as any)._vcnReconnectHandler);
    const reconnectHandler = () => {
      console.log('🔁 Socket reconnected — re-attaching VideoCallNotification listeners');
      setupSocketListeners(window.socket);
    };
    (socket as any)._vcnReconnectHandler = reconnectHandler;
    socket.on('reconnect', reconnectHandler);

    // Mark that we've set up listeners using a custom property
    (socket as unknown as { _hasVideoCallListeners?: boolean })._hasVideoCallListeners = true;
  }, []);

  // Check for socket connection periodically
  useEffect(() => {
    const checkSocket = () => {
      const socket = window.socket;
      if (socket && !(socket as unknown as { _hasVideoCallListeners?: boolean })._hasVideoCallListeners) {
        setupSocketListeners(socket);
      }
    };

    // Check immediately and then every 2 seconds
    checkSocket();
    const interval = setInterval(checkSocket, 2000);

    return () => clearInterval(interval);
  }, [setupSocketListeners]);

  // Listen for Socket.io notifications (initial setup)
  useEffect(() => {
    const socket = window.socket;
    if (!socket) return;

    setupSocketListeners(socket);

    return () => {
      socket.off('appointment_notification');
      socket.off('doctor-initiated-call');
      socket.off('triage-call-request');
      socket.off('triage-call-accepted');
    };
  }, [setupSocketListeners]);

  // ─── Web Audio API ringtone helpers ───────────────────────────────────────

  const getAudioCtx = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  const playTone = (ctx: AudioContext, freq: number, start: number, dur: number, vol = 0.5) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(vol, start + 0.02);
    gain.gain.setValueAtTime(vol, start + dur - 0.06);
    gain.gain.linearRampToValueAtTime(0, start + dur);
    osc.start(start);
    osc.stop(start + dur);
  };

  // One ring cycle: G5 → B5 → D6 → G6 ascending arpeggio (pentatonic, pleasant)
  const playRingCycle = () => {
    try {
      const ctx = getAudioCtx();
      const t = ctx.currentTime;
      playTone(ctx, 784,  t + 0.00, 0.18, 0.50);  // G5
      playTone(ctx, 988,  t + 0.20, 0.18, 0.50);  // B5
      playTone(ctx, 1175, t + 0.40, 0.18, 0.48);  // D6
      playTone(ctx, 1568, t + 0.62, 0.32, 0.38);  // G6 (longer, softer — the "top")
    } catch (e) {
      console.log('Web Audio ring failed:', e);
    }
  };

  const playRingingSound = () => {
    playRingCycle();
    ringingTimerRef.current = setInterval(playRingCycle, 2000);
    setIsRinging(true);
  };

  const playCallingSound = () => {
    // Outgoing ringing: classic two-tone 440/330 Hz pulse
    const playPulse = () => {
      try {
        const ctx = getAudioCtx();
        const t = ctx.currentTime;
        playTone(ctx, 440, t + 0.0, 0.38, 0.35);
        playTone(ctx, 330, t + 0.5, 0.38, 0.32);
      } catch (e) {
        console.log('Web Audio calling failed:', e);
      }
    };
    playPulse();
    ringingTimerRef.current = setInterval(playPulse, 1200);
    setIsRinging(true);
  };

  const playNotificationSound = () => {
    // Single 2-note gentle chime: A5 → D6
    try {
      const ctx = getAudioCtx();
      const t = ctx.currentTime;
      playTone(ctx, 880,  t,        0.25, 0.45);  // A5
      playTone(ctx, 1175, t + 0.28, 0.35, 0.35);  // D6
    } catch (e) {
      console.log('Web Audio notification failed:', e);
    }
  };

  const stopRinging = () => {
    if (ringingTimerRef.current) {
      clearInterval(ringingTimerRef.current);
      ringingTimerRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch (_) { /* ignore */ }
      audioCtxRef.current = null;
    }
    if (vibrateIntervalRef.current) {
      clearInterval(vibrateIntervalRef.current);
      vibrateIntervalRef.current = null;
    }
    setIsRinging(false);
  };

  const startVibration = () => {
    if ('vibrate' in navigator) {
      // Vibrate pattern: 500ms on, 200ms off, 500ms on
      vibrateIntervalRef.current = setInterval(() => {
        navigator.vibrate([500, 200, 500]);
      }, 1200);
    }
  };

  const showBrowserNotification = (data: CallNotification) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(data.title, {
        body: data.message,
        icon: '/logo/Mediqzy_logo.jpeg',
        badge: '/logo/Mediqzy_logo.jpeg',
        tag: `appointment-${data.appointmentId}`,
        requireInteraction: data.persistent
        // Note: vibrate is not supported in NotificationOptions, using startVibration() instead
      });

      notification.onclick = () => {
        window.focus();
        handleAnswer();
        notification.close();
      };
    } else if ('Notification' in window && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  };

  const handleAnswer = async () => {
    if (!notification) return;

    stopRinging();
    
    // If we have a direct meeting link for an external provider, open it
    if (notification.meetingLink && isExternalMeetingLink(notification.meetingLink)) {
      window.open(notification.meetingLink, '_blank', 'width=1280,height=720');
      setNotification(null);
      return;
    }
    
    // Navigate to video consultation page with room ID
    if (currentDoctor) {
      navigate(`/doctor/video?room=${notification.roomId}&appointmentId=${notification.appointmentId}`);
    } else {
      navigate(`/video-consultation?room=${notification.roomId}&appointmentId=${notification.appointmentId}`);
    }
    
    setNotification(null);
  };

  const handleDecline = () => {
    stopRinging();
    setNotification(null);
  };

  const dismissNotification = () => {
    stopRinging();
    setNotification(null);
  };

  if (!notification) return null;

  const isIncomingCall = notification.type === 'incoming_call' && 
                         (notification.action === 'answer' || notification.action === 'join_now');
  
  const isFullScreen = notification.fullScreen && notification.urgency === 'critical';

  const urgencyColors = {
    info: 'border-blue-500 bg-blue-50 dark:bg-blue-950',
    warning: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950',
    urgent: 'border-orange-500 bg-orange-50 dark:bg-orange-950',
    critical: 'border-red-500 bg-red-50 dark:bg-red-950'
  };

  if (isFullScreen && isIncomingCall) {
    return (
      <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center animate-pulse">
        <div className="text-center text-white space-y-8">
          {/* Caller Avatar */}
          <div className="flex justify-center">
            <div className="relative">
              <Avatar className="h-32 w-32 border-4 border-white shadow-2xl">
                <AvatarFallback className="bg-white text-teal-600 text-4xl font-bold">
                  {notification.doctorName ? notification.doctorName[0] : notification.patientName?.[0] || 'U'}
                </AvatarFallback>
              </Avatar>
              {isRinging && (
                <div className="absolute inset-0 rounded-full border-4 border-white animate-ping opacity-75" />
              )}
            </div>
          </div>

          {/* Caller Info */}
          <div className="space-y-2">
            <h2 className="text-4xl font-bold">
              {notification.doctorName || notification.patientName || 'Unknown'}
            </h2>
            {notification.doctorSpecialization && (
              <p className="text-xl text-white/90">{notification.doctorSpecialization}</p>
            )}
            <p className="text-2xl font-semibold flex items-center justify-center gap-2">
              <Video className="h-6 w-6" />
              Video Consultation
            </p>
            <p className="text-lg text-white/80">
              <Clock className="h-4 w-4 inline mr-1" />
              {notification.appointmentTime}
            </p>
          </div>

          {/* Call Actions */}
          <div className="flex items-center justify-center gap-8 pt-8">
            <Button
              onClick={handleDecline}
              size="lg"
              className="h-20 w-20 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-2xl"
            >
              <PhoneOff className="h-10 w-10" />
            </Button>
            <Button
              onClick={handleAnswer}
              size="lg"
              className="h-24 w-24 rounded-full bg-green-500 hover:bg-green-600 text-white shadow-2xl animate-bounce"
            >
              <Phone className="h-12 w-12" />
            </Button>
          </div>

          <p className="text-lg text-white/90 pt-4">
            {notification.message}
          </p>
        </div>
      </div>
    );
  }

  // Standard notification card
  return (
    <div className={`fixed ${isIncomingCall ? 'top-4 right-4' : 'bottom-4 right-4'} z-[9998] max-w-md animate-slide-in`}>
      <Card className={`p-6 shadow-2xl border-2 ${urgencyColors[notification.urgency]}`}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-teal-100 text-teal-700">
                {notification.doctorName ? notification.doctorName[0] : notification.patientName?.[0] || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-bold text-lg">{notification.title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {notification.doctorName || notification.patientName}
              </p>
            </div>
          </div>
          {!isIncomingCall && (
            <Button variant="ghost" size="sm" onClick={dismissNotification}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <p className="text-sm mb-4">{notification.message}</p>

        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-4">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {notification.appointmentTime}
          </span>
          <span className="font-semibold">
            {notification.timeRemaining === 'now' ? 'NOW' : `in ${notification.timeRemaining}`}
          </span>
        </div>

        <div className="flex gap-2">
          {isIncomingCall && (
            <>
              <Button
                onClick={handleDecline}
                variant="destructive"
                className="flex-1"
              >
                <PhoneOff className="h-4 w-4 mr-2" />
                Decline
              </Button>
              <Button
                onClick={handleAnswer}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                <Phone className="h-4 w-4 mr-2" />
                Answer
              </Button>
            </>
          )}
          {notification.action === 'join_now' && !isIncomingCall && (
            <Button onClick={handleAnswer} className="w-full bg-teal-600 hover:bg-teal-700">
              <Video className="h-4 w-4 mr-2" />
              Join Now
            </Button>
          )}
          {notification.action === 'get_ready' && (
            <Button onClick={dismissNotification} variant="outline" className="w-full">
              Got it
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
