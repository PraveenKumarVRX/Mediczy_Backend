import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import api from "@/utils/api";
import { getSocketUrl } from "@/utils/socket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send, ArrowLeft, RefreshCw, MessageSquare, Stethoscope, Video, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import IncomingTeamCall, { IncomingTeamCallData } from "@/components/IncomingTeamCall";

const LiveKitRoom = lazy(() => import("@/components/video/LiveKitRoom"));

interface CallState {
  serverUrl: string;
  token: string;
  roomName: string;
  audioOnly: boolean;
}

interface DoctorContact {
  id: number;
  name: string;
  avatar?: string;
  email?: string;
  specialization?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
}

interface Message {
  id: number;
  conversationId: string;
  senderId: number;
  senderType: "doctor" | "nurse";
  recipientId: number;
  recipientType: "doctor" | "nurse";
  content: string;
  messageType: string;
  status: string;
  createdAt: string;
}

const POLL_INTERVAL = 5000;

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function timeAgo(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const getNurseToken = () => localStorage.getItem("nurseToken") || "";
const getNurseId    = (): number | null => {
  const raw = localStorage.getItem("nurseData");
  if (!raw) return null;
  try { return JSON.parse(raw).id ?? null; } catch { return null; }
};

const NurseChat: React.FC = () => {
  const navigate = useNavigate();
  const [doctors, setDoctors]       = useState<DoctorContact[]>([]);
  const [selected, setSelected]     = useState<DoctorContact | null>(null);
  const [messages, setMessages]     = useState<Message[]>([]);
  const [input, setInput]           = useState("");
  const [sending, setSending]                 = useState(false);
  const [loadingList, setLoadingList]          = useState(false);
  const [loadingMsgs, setLoadingMsgs]          = useState(false);
  const [callState, setCallState]              = useState<CallState | null>(null);
  const [callingLoading, setCallingLoading]    = useState(false);
  const [incomingCall, setIncomingCall]        = useState<IncomingTeamCallData | null>(null);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectedRef = useRef<DoctorContact | null>(null);
  const socketRef   = useRef<Socket | null>(null);
  const callStateRef = useRef<CallState | null>(null);

  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { callStateRef.current = callState; }, [callState]);

  const nurseToken = getNurseToken();

  // ── Socket.IO connection for incoming team call notifications ────────────
  useEffect(() => {
    const nurseId = getNurseId();
    if (!nurseToken || !nurseId) return;

<<<<<<< HEAD
    const sock = io(getSocketUrl(), {
      // Polling first: the Cloudflare edge fails the WS upgrade over HTTP/2 on this domain;
      // polling establishes over plain HTTP and upgrades when it can (single server process).
=======
    const socketOrigin =
      (import.meta.env.VITE_API_BASE_URL ||
       (import.meta.env.VITE_API_URL
         ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '')
         : window.location.origin));

    const sock = io(socketOrigin, {
      // Polling first — see socket.service.ts for why (Cloudflare edge fails
      // the WS upgrade over HTTP/2 on this domain; polling degrades safely).
>>>>>>> recover/care-intelligence-mesh
      transports: ['polling', 'websocket'],
      path: '/socket.io',
      query: { userId: nurseId, userType: 'nurse' },
    });
    sock.emit('user-connect', { userId: nurseId, userType: 'nurse' });
    sock.on('incoming_team_call', (data: IncomingTeamCallData) => {
      // If already on a call, auto-decline with busy
      const currentCallState = callStateRef.current;
      if (currentCallState) {
        const nurseData = localStorage.getItem('nurseData');
        let nurseName = 'Nurse';
        try { const p = JSON.parse(nurseData || '{}'); nurseName = `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Nurse'; } catch {}
        sock.emit('team_call_busy', { doctorId: data.doctorId, memberName: nurseName });
        return;
      }
      setIncomingCall(data);
    });
    sock.on('team_call_ended', (d: { doctorId?: number }) => {
      setIncomingCall(prev => (!d?.doctorId || prev?.doctorId === d.doctorId ? null : prev));
    });
    socketRef.current = sock;
    return () => { sock.disconnect(); socketRef.current = null; };
  }, [nurseToken]);

  const loadDoctors = useCallback(async () => {
    setLoadingList(true);
    try {
      const { data } = await api.get("/nurse/chat/contacts/doctors", {
        headers: { Authorization: `Bearer ${nurseToken}` },
      });
      setDoctors(data.contacts || []);
    } catch (e) {
      console.error("Failed to load doctors", e);
    } finally {
      setLoadingList(false);
    }
  }, [nurseToken]);

  const loadMessages = useCallback(async (doc: DoctorContact, silent = false) => {
    const nurseId = getNurseId();
    if (!nurseId) return;
    if (!silent) setLoadingMsgs(true);
    try {
      const cid = `nurse_${nurseId}_doctor_${doc.id}`;
      const { data } = await api.get(`/nurse/chat/messages/${encodeURIComponent(cid)}`, {
        headers: { Authorization: `Bearer ${nurseToken}` },
      });
      setMessages(data.messages || []);
      setDoctors(prev => prev.map(d => d.id === doc.id ? { ...d, unreadCount: 0 } : d));
    } catch (e) {
      console.error("Failed to load messages", e);
    } finally {
      if (!silent) setLoadingMsgs(false);
    }
  }, [nurseToken]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!selected) return;
    pollRef.current = setInterval(() => {
      if (selectedRef.current) loadMessages(selectedRef.current, true);
    }, POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selected, loadMessages]);

  useEffect(() => { loadDoctors(); }, [loadDoctors]);

  useEffect(() => {
    if (messages.length > 0) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selectDoctor = (doc: DoctorContact) => {
    setSelected(doc);
    setMessages([]);
    loadMessages(doc);
  };

  const startCall = async (audioOnly: boolean) => {
    if (!selected) return;
    const nurseId = getNurseId();
    if (!nurseId) return;
    setCallingLoading(true);
    try {
      const roomName = `team_call_doctor_${selected.id}`;
      const { data } = await api.get("/nurse/chat/call-token", {
        params: { roomName },
        headers: { Authorization: `Bearer ${nurseToken}` },
      });
      setCallState({
        serverUrl: data.serverUrl,
        token: data.token,
        roomName,
        audioOnly,
      });
    } catch (e) {
      console.error("nurse start call failed", e);
    } finally {
      setCallingLoading(false);
    }
  };

  // Accept an incoming team call from a doctor
  const acceptIncomingCall = async (call: IncomingTeamCallData) => {
    setIncomingCall(null);
    try {
      const { data } = await api.get("/nurse/chat/call-token", {
        params: { roomName: call.roomName },
        headers: { Authorization: `Bearer ${nurseToken}` },
      });
      setCallState({
        serverUrl: data.serverUrl,
        token: data.token,
        roomName: call.roomName,
        audioOnly: call.callType === "audio",
      });
    } catch (e) {
      console.error("accept team call failed", e);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || !selected || sending) return;
    const nurseId = getNurseId();
    if (!nurseId) return;
    setSending(true);
    const cid = `nurse_${nurseId}_doctor_${selected.id}`;
    try {
      const { data } = await api.post("/nurse/chat/messages", {
        conversationId: cid,
        recipientId: selected.id,
        content: text,
      }, {
        headers: { Authorization: `Bearer ${nurseToken}` },
      });
      setMessages(prev => [...prev, data.message]);
      setInput("");
      setDoctors(prev => prev.map(d => d.id === selected.id
        ? { ...d, lastMessage: text, lastMessageAt: new Date().toISOString() }
        : d
      ));
    } catch (e) {
      console.error("Send failed", e);
    } finally {
      setSending(false);
    }
  };

  const nurseId = getNurseId();

  return (
    <div className="flex h-screen bg-slate-900 text-white overflow-hidden">
      {/* Incoming team call overlay (WhatsApp-style) */}
      {incomingCall && !callState && (
        <IncomingTeamCall
          call={incomingCall}
          onAccept={acceptIncomingCall}
          onDecline={() => {
            const nurseData = localStorage.getItem('nurseData');
            let nurseName = 'Nurse';
            try { const p = JSON.parse(nurseData || '{}'); nurseName = `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Nurse'; } catch {}
            const nurseId = getNurseId();
            socketRef.current?.emit('team_call_decline', {
              doctorId: incomingCall.doctorId,
              memberId: nurseId,
              memberType: 'nurse',
              memberName: nurseName,
            });
            setIncomingCall(null);
          }}
        />
      )}
      {/* LiveKit call overlay */}
      {callState && (
        <Suspense fallback={<div className="fixed inset-0 bg-slate-900 z-50 flex items-center justify-center text-white">Connecting…</div>}>
          <LiveKitRoom
            serverUrl={callState.serverUrl}
            token={callState.token}
            roomName={callState.roomName}
            participantName="Nurse"
            audioOnly={callState.audioOnly}
            controls={{ screenShare: false, camera: !callState.audioOnly }}
            onDisconnect={() => setCallState(null)}
            onError={() => setCallState(null)}
          />
        </Suspense>
      )}
      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <div className={cn(
        "flex flex-col border-r border-slate-700/60 bg-slate-900/95",
        selected ? "hidden md:flex w-72 flex-shrink-0" : "flex w-full md:w-72 flex-shrink-0"
      )}>
        <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-700/60">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Stethoscope className="h-5 w-5 text-emerald-400" />
          <h1 className="font-semibold text-white">Doctors</h1>
          <Button variant="ghost" size="icon" className="ml-auto h-8 w-8 text-slate-400" onClick={loadDoctors}>
            <RefreshCw className={cn("h-4 w-4", loadingList && "animate-spin")} />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-1 p-2">
            {doctors.length === 0 && (
              <div className="text-center text-slate-500 text-sm py-10">
                {loadingList ? "Loading…" : "No doctors found"}
              </div>
            )}
            {doctors.map(doc => (
              <button
                key={doc.id}
                onClick={() => selectDoctor(doc)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors w-full",
                  selected?.id === doc.id
                    ? "bg-emerald-600/20 border border-emerald-500/30"
                    : "hover:bg-slate-700/50"
                )}
              >
                <div className="relative flex-shrink-0">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={doc.avatar} />
                    <AvatarFallback className="bg-emerald-800 text-white text-xs">{initials(doc.name)}</AvatarFallback>
                  </Avatar>
                  {doc.unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                      {doc.unreadCount > 9 ? "9+" : doc.unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white truncate">Dr. {doc.name}</span>
                    {doc.lastMessageAt && (
                      <span className="text-[11px] text-slate-500 ml-1 flex-shrink-0">{timeAgo(doc.lastMessageAt)}</span>
                    )}
                  </div>
                  {doc.lastMessage
                    ? <p className="text-xs text-slate-400 truncate">{doc.lastMessage}</p>
                    : <p className="text-xs text-slate-600 italic">No messages yet</p>
                  }
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* ── Chat Window ──────────────────────────────────────────────── */}
      {selected ? (
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-700/60 bg-slate-900/90">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 md:hidden" onClick={() => setSelected(null)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Avatar className="w-9 h-9">
              <AvatarImage src={selected.avatar} />
              <AvatarFallback className="bg-emerald-700 text-white text-xs">{initials(selected.name)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium text-white text-sm">Dr. {selected.name}</p>
              <p className="text-xs text-slate-400">{selected.specialization || "Doctor"}</p>
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <Button
                variant="ghost" size="icon"
                title="Audio call"
                disabled={callingLoading}
                onClick={() => startCall(true)}
                className="h-9 w-9 rounded-xl text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
              >
                <Phone className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost" size="icon"
                title="Video call"
                disabled={callingLoading}
                onClick={() => startCall(false)}
                className="h-9 w-9 rounded-xl text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
              >
                {callingLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1 px-4 py-4">
            {loadingMsgs && (
              <div className="text-center text-slate-500 text-sm py-10">Loading messages…</div>
            )}
            {!loadingMsgs && messages.length === 0 && (
              <div className="text-center text-slate-500 text-sm py-10">No messages yet. Start the conversation!</div>
            )}
            <div className="flex flex-col gap-2">
              {messages.map((msg) => {
                const isMe = msg.senderType === "nurse" && msg.senderId === nurseId;
                return (
                  <div key={msg.id} className={cn("flex", isMe ? "justify-end" : "justify-start")}>
                    {!isMe && (
                      <Avatar className="w-7 h-7 mr-2 flex-shrink-0 self-end">
                        <AvatarFallback className="bg-emerald-700 text-white text-[10px]">{initials(selected.name)}</AvatarFallback>
                      </Avatar>
                    )}
                    <div className={cn(
                      "max-w-[70%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                      isMe
                        ? "bg-emerald-600 text-white rounded-br-sm"
                        : "bg-slate-700/80 text-slate-100 rounded-bl-sm"
                    )}>
                      {msg.content}
                      <span className={cn("block text-[10px] mt-0.5", isMe ? "text-emerald-200 text-right" : "text-slate-500")}>
                        {new Date(msg.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                        {isMe && msg.status === "read" && " ✓✓"}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-700/60 bg-slate-900/90">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={`Message Dr. ${selected.name}…`}
              className="flex-1 bg-slate-800/80 border-slate-600/60 text-white placeholder:text-slate-500 focus-visible:ring-emerald-500/60 rounded-xl"
            />
            <Button
              size="icon"
              className="h-10 w-10 rounded-xl flex-shrink-0 bg-emerald-600 hover:bg-emerald-700"
              onClick={sendMessage}
              disabled={sending || !input.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center text-slate-500">
          <div className="text-center">
            <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Select a doctor to message</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default NurseChat;
