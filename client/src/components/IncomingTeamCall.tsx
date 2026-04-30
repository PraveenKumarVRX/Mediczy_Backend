/**
 * IncomingTeamCall — WhatsApp-style incoming group call overlay
 * Shown when a doctor starts a team audio/video call.
 */
import { useEffect, useRef } from "react";
import { Phone, PhoneOff, Video } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface IncomingTeamCallData {
  doctorId: number;
  doctorName: string;
  roomName: string;
  callType: "audio" | "video";
}

interface Props {
  call: IncomingTeamCallData;
  onAccept: (call: IncomingTeamCallData) => void;
  onDecline: () => void;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function IncomingTeamCall({ call, onAccept, onDecline }: Props) {
  const audioRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Simple ring tone using Web Audio API
  useEffect(() => {
    const ring = () => {
      try {
        if (!audioRef.current) {
          audioRef.current = new AudioContext();
        }
        const ctx = audioRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      } catch (_) {
        // Audio not available — ignore
      }
    };

    ring();
    intervalRef.current = setInterval(ring, 1500);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      try { audioRef.current?.close(); } catch (_) {}
      audioRef.current = null;
    };
  }, []);

  const stopRing = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    try { audioRef.current?.close(); } catch (_) {}
    audioRef.current = null;
  };

  const handleAccept = () => { stopRing(); onAccept(call); };
  const handleDecline = () => { stopRing(); onDecline(); };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative flex flex-col items-center gap-6 bg-slate-900 rounded-3xl px-10 py-10 shadow-2xl border border-slate-700/60 w-72 text-center">
        {/* Pulsing ring animation */}
        <div className="relative">
          <span className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" />
          <Avatar className="w-20 h-20 relative z-10">
            <AvatarFallback className="bg-blue-700 text-white text-2xl font-bold">
              {initials(call.doctorName)}
            </AvatarFallback>
          </Avatar>
        </div>

        <div>
          <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">
            Incoming {call.callType === "video" ? "Video" : "Audio"} Call
          </p>
          <p className="text-lg font-semibold text-white">{call.doctorName}</p>
          <p className="text-sm text-slate-400 mt-0.5">Team call</p>
        </div>

        <div className="flex items-center justify-center gap-8 w-full">
          {/* Decline */}
          <div className="flex flex-col items-center gap-1.5">
            <Button
              onClick={handleDecline}
              size="icon"
              className="h-14 w-14 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg"
            >
              <PhoneOff className="h-6 w-6" />
            </Button>
            <span className="text-xs text-slate-400">Decline</span>
          </div>

          {/* Accept */}
          <div className="flex flex-col items-center gap-1.5">
            <Button
              onClick={handleAccept}
              size="icon"
              className={cn(
                "h-14 w-14 rounded-full text-white shadow-lg animate-bounce",
                call.callType === "video"
                  ? "bg-blue-500 hover:bg-blue-600"
                  : "bg-emerald-500 hover:bg-emerald-600"
              )}
            >
              {call.callType === "video" ? (
                <Video className="h-6 w-6" />
              ) : (
                <Phone className="h-6 w-6" />
              )}
            </Button>
            <span className="text-xs text-slate-400">Accept</span>
          </div>
        </div>
      </div>
    </div>
  );
}
