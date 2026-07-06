import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/utils/api";
import { useSocket } from "@/context/SocketContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Send, ArrowLeft, RefreshCw, MessageSquare, Users, Stethoscope,
  Paperclip, X, FileText, Download, Video, Phone, PhoneOff, UserPlus, Check, Inbox, Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";

const LiveKitRoom = lazy(() => import("@/components/video/LiveKitRoom"));

interface CallState {
  serverUrl: string;
  token: string;
  roomName: string;
  audioOnly: boolean;
}

type MemberType = "nurse" | "doctor" | "assistant" | "team";

interface Contact {
  id: number;
  name: string;
  avatar?: string;
  email?: string;
  role_label?: string;
  memberType?: MemberType;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
}

interface Attachment {
  url: string;
  name: string;
  size: number;
  mimeType: string;
}

interface Message {
  id: number;
  conversationId: string;
  senderId: number;
  senderType: string;
  recipientId: number;
  recipientType: string;
  content: string;
  messageType: string;
  attachments: Attachment[] | Record<string, Attachment>;
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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MEMBER_LABEL: Record<MemberType, string> = {
  nurse: "Nurse", doctor: "Doctor", assistant: "Assistant", team: "Staff",
};
const MEMBER_BADGE_CLASS: Record<MemberType, string> = {
  nurse:     "bg-emerald-600/20 text-emerald-300 border border-emerald-500/30",
  doctor:    "bg-blue-600/20 text-blue-300 border border-blue-500/30",
  assistant: "bg-purple-600/20 text-purple-300 border border-purple-500/30",
  team:      "bg-amber-600/20 text-amber-300 border border-amber-500/30",
};
const MEMBER_AVATAR_BG: Record<MemberType, string> = {
  nurse: "bg-emerald-700", doctor: "bg-blue-700", assistant: "bg-purple-700", team: "bg-amber-700",
};

function getAttachments(raw: Attachment[] | Record<string, Attachment> | null | undefined): Attachment[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return Object.values(raw);
}

interface InboxMessage {
  id: string;
  from: string;
  subject: string;
  message: string;
  timestamp: string;
  status: 'new' | 'read' | 'replied';
  priority: 'low' | 'medium' | 'high';
}

const DoctorMessaging: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { socket } = useSocket();
  const initialTab = (searchParams.get('tab') === 'inbox' ? 'inbox' : searchParams.get('tab') === 'team' ? 'team' : 'patients') as 'patients' | 'team' | 'inbox';
  const [tab, setTab] = useState<"patients" | "team" | "inbox">(initialTab);
  const [patientContacts, setPatientContacts] = useState<Contact[]>([]);
  const [teamContacts, setTeamContacts]       = useState<Contact[]>([]);
  const [selected, setSelected]               = useState<Contact | null>(null);
  const [messages, setMessages]               = useState<Message[]>([]);
  const [input, setInput]                     = useState("");
  const [sending, setSending]                 = useState(false);
  const [uploading, setUploading]             = useState(false);
  const [pendingFile, setPendingFile]         = useState<File | null>(null);
  const [pendingPreview, setPendingPreview]   = useState<string | null>(null);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [loadingMsgs, setLoadingMsgs]         = useState(false);
  const [callState, setCallState]             = useState<CallState | null>(null);
  const [callingLoading, setCallingLoading]   = useState(false);
  const [callPickerOpen, setCallPickerOpen]   = useState(false);
  const [callPickerType, setCallPickerType]   = useState<"audio" | "video">("video");
  const [selectedCallees, setSelectedCallees] = useState<Set<string>>(new Set());
  const [callToasts, setCallToasts]           = useState<Array<{id:number; status:string; memberName:string}>>([]);
  const callToastIdRef = useRef(0);
  const bottomRef    = useRef<HTMLDivElement>(null);
  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectedRef  = useRef<Contact | null>(null);
  const tabRef       = useRef<"patients" | "team" | "inbox">("patients");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedInbox, setSelectedInbox] = useState<InboxMessage | null>(null);
  const [inboxReply, setInboxReply] = useState("");

  const { data: inboxMessages = [], refetch: refetchInbox, isLoading: inboxLoading } = useQuery({
    queryKey: ['doctor-async-inbox'],
    queryFn: async () => {
      const { data } = await api.get('/doctors/messages');
      return (data.messages || []) as InboxMessage[];
    },
    staleTime: 2 * 60 * 1000,
    enabled: tab === 'inbox',
  });

  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { tabRef.current = tab; }, [tab]);

  // Listen for call status events (declined, busy) from team members
  useEffect(() => {
    if (!socket) return;
    const handler = (d: { status: string; memberName: string }) => {
      const id = ++callToastIdRef.current;
      setCallToasts(prev => [...prev, { id, status: d.status, memberName: d.memberName }]);
      setTimeout(() => setCallToasts(prev => prev.filter(t => t.id !== id)), 4000);
    };
    socket.on('team_call_status', handler);
    return () => { socket.off('team_call_status', handler); };
  }, [socket]);

  const getDoctorId = (): number | null => {
    const raw = localStorage.getItem("doctorData") || localStorage.getItem("userData");
    if (raw) {
      try { const p = JSON.parse(raw); if (p?.id) return p.id; } catch {}
    }
    const uid = localStorage.getItem("userId");
    return uid ? parseInt(uid, 10) || null : null;
  };

  const convId = (contact: Contact): string => {
    const docId = getDoctorId();
    if (!docId) return "";
    const prefix = tabRef.current === "patients" ? "patient" : (contact.memberType || "nurse");
    return `${prefix}_${contact.id}_doctor_${docId}`;
  };

  const loadContacts = useCallback(async () => {
    setLoadingContacts(true);
    try {
      const [pRes, tRes] = await Promise.all([
        api.get("/doctor/chat/contacts/patients"),
        api.get("/doctor/chat/contacts/team"),
      ]);
      setPatientContacts(pRes.data.contacts || []);
      setTeamContacts(tRes.data.contacts || []);
    } catch (e) { console.error("load contacts", e); }
    finally { setLoadingContacts(false); }
  }, []);

  const loadMessages = useCallback(async (contact: Contact, silent = false) => {
    if (!silent) setLoadingMsgs(true);
    try {
      const cid = convId(contact);
      if (!cid) return;
      const { data } = await api.get(`/doctor/chat/messages/${encodeURIComponent(cid)}`);
      setMessages(data.messages || []);
      const clear = (prev: Contact[]) => prev.map(c => c.id === contact.id ? { ...c, unreadCount: 0 } : c);
      if (tabRef.current === "patients") setPatientContacts(clear); else setTeamContacts(clear);
    } catch (e) { console.error("load messages", e); }
    finally { if (!silent) setLoadingMsgs(false); }
  }, []);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!selected) return;
    pollRef.current = setInterval(() => { if (selectedRef.current) loadMessages(selectedRef.current, true); }, POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selected, loadMessages]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  // Deep-link: ?patientId= or ?userId=
  useEffect(() => {
    const pid = searchParams.get('patientId') || searchParams.get('userId');
    if (!pid || patientContacts.length === 0) return;
    const found = patientContacts.find((c) => String(c.id) === String(pid));
    if (found) {
      setTab('patients');
      selectContact(found);
    }
  }, [patientContacts, searchParams]);

  useEffect(() => { if (messages.length > 0) bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const clearPendingFile = () => {
    setPendingFile(null); setPendingPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const selectContact = (contact: Contact) => {
    setSelected(contact); setMessages([]); clearPendingFile(); loadMessages(contact);
  };

  const openCallPicker = (type: "audio" | "video") => {
    setCallPickerType(type);
    setSelectedCallees(new Set());
    setCallPickerOpen(true);
  };

  const toggleCallee = (key: string) => {
    setSelectedCallees(prev => {
      const s = new Set(prev);
      if (s.has(key)) s.delete(key); else s.add(key);
      return s;
    });
  };

  const launchGroupCall = async () => {
    const docId = getDoctorId();
    if (!docId || selectedCallees.size === 0) return;
    setCallPickerOpen(false);
    setCallingLoading(true);
    try {
      const roomName = `team_call_doctor_${docId}`;
      const { data } = await api.post("/video/livekit/token", { roomName });
      const doctorData = localStorage.getItem("doctorData") || localStorage.getItem("userData");
      let doctorName = "Doctor";
      try { const p = JSON.parse(doctorData || "{}"); doctorName = `Dr. ${p.firstName || p.name || ""} ${p.lastName || ""}`.trim(); } catch {}
      // Notify only selected members
      const participants = Array.from(selectedCallees).map(k => {
        const [type, idStr] = k.split(":");
        return { id: parseInt(idStr, 10), memberType: type };
      });
      socket?.emit("team_call_start", {
        doctorId: docId,
        doctorName,
        roomName,
        callType: callPickerType,
        participants,
      });
      setCallState({
        serverUrl: data.video.livekit.serverUrl,
        token: data.video.livekit.token,
        roomName,
        audioOnly: callPickerType === "audio",
      });
    } catch (e) {
      console.error("start call failed", e);
    } finally {
      setCallingLoading(false);
    }
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setPendingPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else { setPendingPreview(null); }
  };

  const sendMessage = async () => {
    if ((!input.trim() && !pendingFile) || !selected || sending) return;
    const docId = getDoctorId();
    if (!docId) return;
    setSending(true);
    const recipientType = tab === "patients" ? "patient" : (selected.memberType || "nurse");
    const cid = `${recipientType}_${selected.id}_doctor_${docId}`;
    try {
      let attachments: Attachment[] = [];
      if (pendingFile) {
        setUploading(true);
        const fd = new FormData();
        fd.append("file", pendingFile);
        const { data: up } = await api.post("/doctor/chat/upload", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        setUploading(false);
        attachments = [{ url: up.url, name: up.name, size: up.size, mimeType: up.mimeType }];
      }
      const msgType = attachments.length > 0
        ? (attachments[0].mimeType.startsWith("image/") ? "image" : "file") : "text";
      const { data } = await api.post("/doctor/chat/messages", {
        conversationId: cid, recipientId: selected.id, recipientType,
        content: input.trim() || (pendingFile?.name ?? ""),
        messageType: msgType,
        attachments: JSON.stringify(attachments),
      });
      setMessages(prev => [...prev, data.message]);
      setInput(""); clearPendingFile();
      const updateLast = (prev: Contact[]) => prev.map(c =>
        c.id === selected.id ? { ...c, lastMessage: input.trim() || pendingFile?.name || "", lastMessageAt: new Date().toISOString() } : c
      );
      if (tab === "patients") setPatientContacts(updateLast); else setTeamContacts(updateLast);
    } catch (e) { console.error("send failed", e); setUploading(false); }
    finally { setSending(false); }
  };

  const docId = getDoctorId();
  const patientUnread = patientContacts.reduce((s, c) => s + c.unreadCount, 0);
  const teamUnread    = teamContacts.reduce((s, c) => s + c.unreadCount, 0);

  const selectedAvatarBg = tab === "team" && selected?.memberType
    ? MEMBER_AVATAR_BG[selected.memberType] : "bg-blue-700";

  const ContactList = ({ items, type }: { items: Contact[]; type: "patients" | "team" }) => (
    <div className="flex flex-col gap-1 p-2">
      {items.length === 0 && (
        <div className="text-center text-slate-500 text-sm py-10">
          {loadingContacts ? "Loading…" : "No contacts yet"}
        </div>
      )}
      {items.map(c => (
        <button
          key={`${type}-${c.id}`}
          onClick={() => { setTab(type); selectContact(c); }}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors w-full",
            selected?.id === c.id && tab === type
              ? "bg-blue-600/20 border border-blue-500/30"
              : "hover:bg-slate-700/50"
          )}
        >
          <div className="relative flex-shrink-0">
            <Avatar className="w-10 h-10">
              <AvatarImage src={c.avatar} />
              <AvatarFallback className={cn(
                "text-white text-xs",
                type === "team" && c.memberType ? MEMBER_AVATAR_BG[c.memberType] : "bg-blue-700"
              )}>
                {initials(c.name)}
              </AvatarFallback>
            </Avatar>
            {c.unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {c.unreadCount > 9 ? "9+" : c.unreadCount}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <span className="text-sm font-medium text-white truncate">{c.name}</span>
              <div className="flex items-center gap-1 flex-shrink-0">
                {c.lastMessageAt && <span className="text-[11px] text-slate-500">{timeAgo(c.lastMessageAt)}</span>}
                {type === "team" && c.memberType && (
                  <span className={cn("text-[10px] px-1 rounded", MEMBER_BADGE_CLASS[c.memberType])}>
                    {MEMBER_LABEL[c.memberType]}
                  </span>
                )}
              </div>
            </div>
            <p className={cn("text-xs truncate", c.lastMessage ? "text-slate-400" : "text-slate-600 italic")}>
              {c.lastMessage || "No messages yet"}
            </p>
            {c.role_label && <p className="text-[11px] text-slate-500 truncate">{c.role_label}</p>}
          </div>
        </button>
      ))}
    </div>
  );

  const AttachmentBubble = ({ att }: { att: Attachment }) => {
    if (att.mimeType.startsWith("image/")) {
      return (
        <a href={att.url} target="_blank" rel="noreferrer">
          <img src={att.url} alt={att.name} className="max-w-[200px] max-h-[180px] rounded-lg object-cover border border-white/10" />
        </a>
      );
    }
    return (
      <a href={att.url} download={att.name} target="_blank" rel="noreferrer"
        className="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-2 hover:bg-black/30 transition-colors">
        <FileText className="h-4 w-4 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-medium truncate max-w-[160px]">{att.name}</p>
          <p className="text-[10px] opacity-70">{formatBytes(att.size)}</p>
        </div>
        <Download className="h-3.5 w-3.5 opacity-70 flex-shrink-0" />
      </a>
    );
  };

  const sendInboxReply = async () => {
    if (!selectedInbox || !inboxReply.trim()) return;
    try {
      await api.post('/doctors/messages/reply', { messageId: selectedInbox.id, reply: inboxReply.trim() });
      toast({ title: 'Reply sent' });
      setInboxReply('');
      setSelectedInbox(null);
      refetchInbox();
    } catch {
      toast({ title: 'Failed to send reply', variant: 'destructive' });
    }
  };

  const showSidebarList = !(selected || (tab === 'inbox' && selectedInbox));

  return (
    <div className="flex h-screen bg-slate-900 text-white overflow-hidden">
      {/* Call status toasts (declined / busy) */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {callToasts.map(t => (
          <div key={t.id} className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium",
            t.status === "declined" ? "bg-red-500/90 text-white" : "bg-amber-500/90 text-white"
          )}>
            <PhoneOff className="h-4 w-4 flex-shrink-0" />
            <span>{t.memberName} — {t.status === "declined" ? "Declined" : "Busy"}</span>
          </div>
        ))}
      </div>
      {/* Group call participant picker modal */}
      {callPickerOpen && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-800 rounded-2xl shadow-2xl border border-slate-700/60 w-80 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/60">
              <p className="font-semibold text-white text-sm">Add participants</p>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400" onClick={() => setCallPickerOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {/* Call type toggle */}
            <div className="flex gap-2 px-4 py-3 border-b border-slate-700/40">
              <button
                onClick={() => setCallPickerType("audio")}
                className={cn("flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  callPickerType === "audio" ? "bg-emerald-600 text-white" : "bg-slate-700/60 text-slate-400 hover:bg-slate-700")}
              >
                <Phone className="h-3.5 w-3.5" /> Audio
              </button>
              <button
                onClick={() => setCallPickerType("video")}
                className={cn("flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  callPickerType === "video" ? "bg-blue-600 text-white" : "bg-slate-700/60 text-slate-400 hover:bg-slate-700")}
              >
                <Video className="h-3.5 w-3.5" /> Video
              </button>
            </div>
            {/* Contact checkboxes */}
            <div className="flex-1 overflow-y-auto py-2">
              {teamContacts.length === 0 && (
                <p className="text-center text-slate-500 text-xs py-6">No team members</p>
              )}
              {teamContacts.map(c => {
                const key = `${c.memberType}:${c.id}`;
                const checked = selectedCallees.has(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleCallee(key)}
                    className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-slate-700/50 transition-colors"
                  >
                    <div className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                      checked ? "bg-blue-500 border-blue-500" : "border-slate-500"
                    )}>
                      {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                    </div>
                    <Avatar className="w-8 h-8 flex-shrink-0">
                      <AvatarImage src={c.avatar} />
                      <AvatarFallback className={cn("text-white text-[10px]", c.memberType ? MEMBER_AVATAR_BG[c.memberType] : "bg-slate-600")}>
                        {initials(c.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm text-white truncate">{c.name}</p>
                      <p className="text-[11px] text-slate-400 truncate">{c.role_label || MEMBER_LABEL[c.memberType!] || ""}</p>
                    </div>
                    {c.memberType && (
                      <span className={cn("text-[10px] px-1 rounded", MEMBER_BADGE_CLASS[c.memberType])}>
                        {MEMBER_LABEL[c.memberType]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {/* Start button */}
            <div className="px-4 py-3 border-t border-slate-700/60">
              <Button
                onClick={launchGroupCall}
                disabled={selectedCallees.size === 0 || callingLoading}
                className={cn(
                  "w-full gap-2 font-semibold",
                  callPickerType === "video" ? "bg-blue-600 hover:bg-blue-700" : "bg-emerald-600 hover:bg-emerald-700"
                )}
              >
                {callPickerType === "video" ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                Start {callPickerType === "video" ? "Video" : "Audio"} Call
                {selectedCallees.size > 0 && <span className="ml-1 bg-white/20 text-white text-xs px-1.5 rounded-full">{selectedCallees.size}</span>}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* LiveKit call overlay */}
      {callState && (
        <Suspense fallback={<div className="fixed inset-0 bg-slate-900 z-50 flex items-center justify-center text-white">Connecting…</div>}>
          <LiveKitRoom
            serverUrl={callState.serverUrl}
            token={callState.token}
            roomName={callState.roomName}
            participantName="Doctor"
            audioOnly={callState.audioOnly}
            controls={{ screenShare: false, camera: !callState.audioOnly }}
            onDisconnect={() => {
              const docId = getDoctorId();
              if (docId) socket?.emit("team_call_end", { doctorId: docId });
              setCallState(null);
            }}
            onError={() => setCallState(null)}
          />
        </Suspense>
      )}
      {/* Sidebar */}
      <div className={cn(
        "flex flex-col border-r border-slate-700/60 bg-slate-900/95",
        showSidebarList ? "flex w-full md:w-80 flex-shrink-0" : "hidden md:flex w-80 flex-shrink-0"
      )}>
        <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-700/60">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <MessageSquare className="h-5 w-5 text-blue-400" />
          <h1 className="font-semibold text-white">Messages</h1>
          <Button variant="ghost" size="icon" className="ml-auto h-8 w-8 text-slate-400" onClick={loadContacts}>
            <RefreshCw className={cn("h-4 w-4", loadingContacts && "animate-spin")} />
          </Button>
        </div>
        <Tabs value={tab} onValueChange={(v) => { setTab(v as "patients" | "team" | "inbox"); setSelected(null); setSelectedInbox(null); }} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-3 mx-3 mt-3 mb-1 bg-slate-800/60">
            <TabsTrigger value="patients" className="flex items-center gap-1.5 text-xs data-[state=active]:bg-blue-600">
              <Users className="h-3.5 w-3.5" /> Patients
              {patientUnread > 0 && <Badge className="bg-red-500 text-white text-[10px] h-4 px-1 ml-0.5">{patientUnread}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="team" className="flex items-center gap-1.5 text-xs data-[state=active]:bg-emerald-600">
              <Stethoscope className="h-3.5 w-3.5" /> Team
              {teamUnread > 0 && <Badge className="bg-red-500 text-white text-[10px] h-4 px-1 ml-0.5">{teamUnread}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="inbox" className="flex items-center gap-1.5 text-xs data-[state=active]:bg-amber-600">
              <Inbox className="h-3.5 w-3.5" /> Inbox
            </TabsTrigger>
          </TabsList>
          <TabsContent value="patients" className="flex-1 overflow-y-auto mt-0">
            <ScrollArea className="h-full"><ContactList items={patientContacts} type="patients" /></ScrollArea>
          </TabsContent>
          <TabsContent value="team" className="flex-1 flex flex-col overflow-hidden mt-0">
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-700/40 flex-shrink-0 bg-slate-900/60">
              <Users className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
              <span className="text-xs text-slate-400 flex-1">Group Call</span>
              <Button
                variant="ghost" size="sm"
                title="Start group audio call"
                onClick={() => openCallPicker("audio")}
                className="h-7 px-2 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 gap-1"
              >
                <Phone className="h-3.5 w-3.5" /> Audio
              </Button>
              <Button
                variant="ghost" size="sm"
                title="Start group video call"
                onClick={() => openCallPicker("video")}
                className="h-7 px-2 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 gap-1"
              >
                <Video className="h-3.5 w-3.5" /> Video
              </Button>
            </div>
            <ScrollArea className="flex-1"><ContactList items={teamContacts} type="team" /></ScrollArea>
          </TabsContent>
          <TabsContent value="inbox" className="flex-1 overflow-y-auto mt-0">
            <ScrollArea className="h-full px-2 py-1">
              {inboxLoading ? (
                <p className="text-center text-slate-500 text-xs py-8">Loading inbox…</p>
              ) : inboxMessages.length === 0 ? (
                <p className="text-center text-slate-500 text-xs py-8">No admin or async messages</p>
              ) : (
                inboxMessages.map((msg) => (
                  <button
                    key={msg.id}
                    type="button"
                    onClick={async () => {
                      setSelectedInbox(msg);
                      if (msg.status === 'new') {
                        try { await api.patch(`/doctors/messages/${msg.id}/read`); refetchInbox(); } catch { /* ignore */ }
                      }
                    }}
                    className={cn(
                      "w-full text-left p-3 rounded-lg mb-1 border border-transparent hover:bg-slate-800/60 transition-colors",
                      selectedInbox?.id === msg.id && "bg-slate-800 border-slate-600"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Mail className="h-3.5 w-3.5 text-amber-400" />
                      <span className="text-sm font-medium text-white truncate">{msg.from}</span>
                      {msg.status === 'new' && <Badge className="bg-amber-500 text-[10px] h-4 px-1">New</Badge>}
                    </div>
                    <p className="text-xs font-medium text-slate-300 truncate">{msg.subject}</p>
                    <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{msg.message}</p>
                  </button>
                ))
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>

      {/* Chat Window */}
      {selected ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-700/60 bg-slate-900/90">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 md:hidden" onClick={() => setSelected(null)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Avatar className="w-9 h-9">
              <AvatarImage src={selected.avatar} />
              <AvatarFallback className={cn("text-white text-xs", selectedAvatarBg)}>{initials(selected.name)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-white text-sm">{selected.name}</p>
                {tab === "team" && selected.memberType && (
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded", MEMBER_BADGE_CLASS[selected.memberType])}>
                    {MEMBER_LABEL[selected.memberType]}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate">{selected.role_label || selected.email || ""}</p>
            </div>
            {tab === "team" && (
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
            )}
          </div>

          {/* Messages area */}
          <ScrollArea className="flex-1 px-4 py-4">
            {loadingMsgs && <div className="text-center text-slate-500 text-sm py-10">Loading messages…</div>}
            {!loadingMsgs && messages.length === 0 && (
              <div className="text-center text-slate-500 text-sm py-10">No messages yet. Start the conversation!</div>
            )}
            <div className="flex flex-col gap-2">
              {messages.map((msg) => {
                const isMe = msg.senderType === "doctor" && msg.senderId === docId;
                const atts = getAttachments(msg.attachments);
                return (
                  <div key={msg.id} className={cn("flex", isMe ? "justify-end" : "justify-start")}>
                    {!isMe && (
                      <Avatar className="w-7 h-7 mr-2 flex-shrink-0 self-end">
                        <AvatarFallback className={cn("text-white text-[10px]", selectedAvatarBg)}>{initials(selected.name)}</AvatarFallback>
                      </Avatar>
                    )}
                    <div className={cn(
                      "max-w-[70%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                      isMe ? "bg-blue-600 text-white rounded-br-sm" : "bg-slate-700/80 text-slate-100 rounded-bl-sm"
                    )}>
                      {atts.map((att, i) => (
                        <div key={i} className="mb-1.5"><AttachmentBubble att={att} /></div>
                      ))}
                      {msg.content && (atts.length === 0 || msg.content !== atts[0]?.name) && (
                        <span>{msg.content}</span>
                      )}
                      <span className={cn("block text-[10px] mt-0.5", isMe ? "text-blue-200 text-right" : "text-slate-500")}>
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

          {/* Pending file preview strip */}
          {pendingFile && (
            <div className="mx-4 mb-0 mt-1 flex items-center gap-2 bg-slate-800/70 border border-slate-600/50 rounded-xl px-3 py-2">
              {pendingPreview
                ? <img src={pendingPreview} alt="" className="w-12 h-12 rounded object-cover flex-shrink-0" />
                : <FileText className="h-8 w-8 text-slate-400 flex-shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{pendingFile.name}</p>
                <p className="text-xs text-slate-400">{formatBytes(pendingFile.size)}</p>
              </div>
              <button onClick={clearPendingFile} className="text-slate-400 hover:text-white flex-shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Input bar */}
          <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-700/60 bg-slate-900/90">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={onFileSelect}
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.mp3,.mp4,.wav,.ogg,.webm"
            />
            <Button
              variant="ghost" size="icon"
              className={cn("h-10 w-10 flex-shrink-0 rounded-xl", pendingFile ? "text-blue-400 bg-blue-600/10" : "text-slate-400 hover:text-slate-200")}
              onClick={() => fileInputRef.current?.click()}
              title="Attach file"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={`Message ${selected.name}…`}
              className="flex-1 bg-slate-800/80 border-slate-600/60 text-white placeholder:text-slate-500 focus-visible:ring-blue-500/60 rounded-xl"
            />
            <Button
              size="icon"
              className="h-10 w-10 rounded-xl flex-shrink-0 bg-blue-600 hover:bg-blue-700"
              onClick={sendMessage}
              disabled={sending || uploading || (!input.trim() && !pendingFile)}
            >
              {uploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      ) : tab === 'inbox' && selectedInbox ? (
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-700/60 bg-slate-900/90">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 md:hidden" onClick={() => setSelectedInbox(null)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Mail className="h-5 w-5 text-amber-400" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-white text-sm">{selectedInbox.subject}</p>
              <p className="text-xs text-slate-400">From {selectedInbox.from}</p>
            </div>
          </div>
          <ScrollArea className="flex-1 p-4">
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{selectedInbox.message}</p>
            <p className="text-xs text-slate-500 mt-4">{new Date(selectedInbox.timestamp).toLocaleString()}</p>
          </ScrollArea>
          <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-700/60 bg-slate-900/90">
            <Input
              value={inboxReply}
              onChange={(e) => setInboxReply(e.target.value)}
              placeholder="Write a reply…"
              className="flex-1 bg-slate-800/80 border-slate-600/60 text-white"
            />
            <Button onClick={sendInboxReply} disabled={!inboxReply.trim()} className="bg-amber-600 hover:bg-amber-700">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center text-slate-500">
          <div className="text-center">
            <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Select a conversation</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DoctorMessaging;
