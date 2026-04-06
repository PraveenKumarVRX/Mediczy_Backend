import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import MainLayout from '@/components/layout/MainLayout';
import {
  Send, Phone, Search, RefreshCw, X, Plus, Trash2,
  Paperclip, Check, CheckCheck, Megaphone, Zap, User,
  Clock, BookOpen, Lock, MessageSquare,
} from 'lucide-react';
import api from '@/utils/api';
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';

// ─── Types ───────────────────────────────────────────────────────────────────

interface InboxConversation {
  id: string;
  name: string;
  phone: string | null;
  source: 'whatsapp';
  status: 'open' | 'closed';
  unread: number;
  lastMessage: string;
  lastMessageAt: string | null;
  servedBy: string | null;
  department: string | null;
  tags: string[];
}

interface ChatMessage {
  id: string;
  text: string;
  ts: string;
  author: string;
  isAgent: boolean;
  isNote: boolean;
  mediaUrl: string | null;
  deliverySid: string | null;
}

interface CannedResponse { id: string; shortcut: string; text: string; source: string; }

interface WaTemplate { id: string; name: string; body: string; variables?: string[]; }

interface ContactProfile {
  name: string; phone: string | null; email: string | null; createdAt: string | null;
  tags: string[]; totalMessages: number; pastConversations: number;
  firstResponseMs: number | null; lastSeen: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ago = (ts: string | null) => {
  if (!ts) return '';
  try { return formatDistanceToNow(new Date(ts), { addSuffix: true }); }
  catch { return ''; }
};

const dateLabel = (ts: string) => {
  const d = new Date(ts);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'dd MMM yyyy');
};

const fmtTime = (ts: string) => { try { return format(new Date(ts), 'HH:mm'); } catch { return ''; } };

const initial = (s: string) => (s?.[0] || '?').toUpperCase();

const AVATAR_COLORS = ['#0ea5e9','#8b5cf6','#f59e0b','#ef4444','#10b981','#6366f1','#ec4899'];
const avatarBg = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
};

const slaFmt = (ms: number | null) => {
  if (ms === null || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

const TAG_CLS: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  vip: 'bg-yellow-100 text-yellow-800',
  followup: 'bg-blue-100 text-blue-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  new: 'bg-violet-100 text-violet-700',
};
const tagCls = (t: string) => TAG_CLS[t.toLowerCase()] ?? 'bg-gray-100 text-gray-600';

// Filter RC system messages from preview
const RC_SYSTEM = new Set(['connected', 'livechat_video_call_started', 'uj', 'ul', 'au', 'subscription-role-added']);
const previewText = (msg: string) => {
  if (!msg || RC_SYSTEM.has(msg.trim()) || msg.startsWith('\uD83D') && msg.length < 4) return 'New conversation';
  return msg.length > 60 ? msg.slice(0, 60) + '…' : msg;
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function WhatsAppInbox() {

  // ── State ──────────────────────────────────────────────────────────────────
  const [conversations, setConversations]   = useState<InboxConversation[]>([]);
  const [filtered, setFiltered]             = useState<InboxConversation[]>([]);
  const [selected, setSelected]             = useState<InboxConversation | null>(null);
  const [messages, setMessages]             = useState<ChatMessage[]>([]);
  const [replyText, setReplyText]           = useState('');
  const [search, setSearch]                 = useState('');
  const [statusFilter, setStatusFilter]     = useState<'open' | 'closed' | 'all'>('open');
  const [loadingConvs, setLoadingConvs]     = useState(false);
  const [loadingMsgs, setLoadingMsgs]       = useState(false);
  const [sending, setSending]               = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [noteMode, setNoteMode]             = useState(false);
  const [showProfile, setShowProfile]       = useState(false);
  const [profile, setProfile]               = useState<ContactProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [cannedResponses, setCannedResponses] = useState<CannedResponse[]>([]);
  const [showCannedPicker, setShowCannedPicker] = useState(false);
  const [cannedSearch, setCannedSearch]     = useState('');
  const [showCannedManager, setShowCannedManager] = useState(false);
  const [newCanned, setNewCanned]           = useState({ shortcut: '', text: '' });
  const [templates, setTemplates]           = useState<WaTemplate[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WaTemplate | null>(null);
  const [templateVars, setTemplateVars]     = useState<Record<string, string>>({});
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastPhones, setBroadcastPhones] = useState('');
  const [broadcastMsg, setBroadcastMsg]     = useState('');
  const [broadcastResult, setBroadcastResult] = useState<{ sent: number; failed: number } | null>(null);
  const [broadcasting, setBroadcasting]     = useState(false);
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [mediaUrl, setMediaUrl]             = useState('');
  const [mediaCaption, setMediaCaption]     = useState('');
  const [sendingMedia, setSendingMedia]     = useState(false);
  const [tagInput, setTagInput]             = useState('');
  const [savingTags, setSavingTags]         = useState(false);
  const [deliveryStatus, setDeliveryStatus] = useState<Record<string, string>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchConversations = useCallback(async () => {
    setLoadingConvs(true); setError(null);
    try {
      const params: Record<string, unknown> = { count: 100 };
      if (statusFilter !== 'all') params.open = statusFilter === 'open';
      const res = await api.get('/support/inbox/conversations', { params });
      setConversations((res.data?.conversations || []).map((c: any) => ({ ...c, tags: c.tags || [] })));
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load inbox');
    } finally { setLoadingConvs(false); }
  }, [statusFilter]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(conversations.filter(c =>
      !q || c.name.toLowerCase().includes(q) ||
      (c.phone || '').includes(q) || c.lastMessage.toLowerCase().includes(q)
    ));
  }, [conversations, search]);

  // NOTE: backend returns messages oldest→newest; do NOT reverse here
  const fetchMessages = useCallback(async (conv: InboxConversation) => {
    setLoadingMsgs(true);
    try {
      const res = await api.get(`/support/inbox/rooms/${conv.id}/messages`, { params: { count: 100 } });
      setMessages(res.data?.messages || []);
    } catch { /* ignore poll errors */ }
    finally { setLoadingMsgs(false); }
  }, []);

  useEffect(() => {
    if (!selected) { setMessages([]); return; }
    fetchMessages(selected);
    pollRef.current = setInterval(() => fetchMessages(selected), 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selected, fetchMessages]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    api.get('/support/inbox/canned-responses').then(r => setCannedResponses(r.data?.cannedResponses || [])).catch(() => {});
    api.get('/support/inbox/templates').then(r => setTemplates(r.data?.templates || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selected || !showProfile) return;
    setLoadingProfile(true);
    api.get(`/support/inbox/rooms/${selected.id}/profile`)
      .then(r => setProfile(r.data?.profile || null))
      .catch(() => setProfile(null))
      .finally(() => setLoadingProfile(false));
  }, [selected, showProfile]);

  const refreshDelivery = useCallback(async (roomId: string) => {
    try {
      const res = await api.get(`/support/inbox/rooms/${roomId}/delivery`);
      if (res.data?.status) setDeliveryStatus(prev => ({ ...prev, [roomId]: res.data.status }));
    } catch (_) { /* intentional */ }
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleSend = async () => {
    if (!selected || !replyText.trim()) return;
    setSending(true);
    try {
      if (noteMode) {
        await api.post(`/support/inbox/rooms/${selected.id}/note`, { text: replyText.trim() });
      } else {
        await api.post(`/support/inbox/rooms/${selected.id}/send`, { message: replyText.trim(), phone: selected.phone });
        setTimeout(() => refreshDelivery(selected.id), 3000);
      }
      setReplyText('');
      await fetchMessages(selected);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed to send');
    } finally { setSending(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleClose = async () => {
    if (!selected || !window.confirm(`Close conversation with ${selected.name}?`)) return;
    try {
      await api.post(`/support/inbox/rooms/${selected.id}/close`);
      setSelected(null);
      fetchConversations();
    } catch (e: any) { alert(e?.response?.data?.message || 'Failed to close'); }
  };

  const insertCanned = (cr: CannedResponse) => { setReplyText(cr.text); setShowCannedPicker(false); textareaRef.current?.focus(); };

  const handleCreateCanned = async () => {
    if (!newCanned.shortcut.trim() || !newCanned.text.trim()) return;
    try {
      const res = await api.post('/support/inbox/canned-responses', newCanned);
      setCannedResponses(prev => [...prev, res.data.cannedResponse]);
      setNewCanned({ shortcut: '', text: '' });
    } catch (e: any) { alert(e?.response?.data?.message || 'Failed'); }
  };

  const handleDeleteCanned = async (id: string) => {
    try {
      await api.delete(`/support/inbox/canned-responses/${id}`);
      setCannedResponses(prev => prev.filter(c => c.id !== id));
    } catch (_) { /* intentional */ }
  };

  const openTemplate = (tmpl: WaTemplate) => {
    setSelectedTemplate(tmpl);
    const v: Record<string, string> = {};
    (tmpl.variables || []).forEach(k => { v[k] = ''; });
    setTemplateVars(v);
  };

  const applyTemplate = () => {
    if (!selectedTemplate) return;
    let body = selectedTemplate.body;
    Object.entries(templateVars).forEach(([k, v]) => { body = body.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v || `[${k}]`); });
    setReplyText(body);
    setShowTemplateModal(false);
    setSelectedTemplate(null);
    textareaRef.current?.focus();
  };

  const handleBroadcast = async () => {
    const phones = broadcastPhones.split(/[\n,]+/).map(p => p.trim()).filter(Boolean);
    if (!phones.length || !broadcastMsg.trim()) return alert('Enter phone numbers and a message');
    setBroadcasting(true); setBroadcastResult(null);
    try {
      const res = await api.post('/support/inbox/broadcast', { phones, message: broadcastMsg });
      setBroadcastResult({ sent: res.data.sent, failed: res.data.failed });
    } catch (e: any) { alert(e?.response?.data?.message || 'Broadcast failed'); }
    finally { setBroadcasting(false); }
  };

  const persistTags = async (roomId: string, updated: string[]) => {
    setSavingTags(true);
    try {
      await api.put(`/support/inbox/rooms/${roomId}/tags`, { tags: updated });
      if (profile) setProfile({ ...profile, tags: updated });
      setConversations(prev => prev.map(c => c.id === roomId ? { ...c, tags: updated } : c));
      setSelected(prev => prev ? { ...prev, tags: updated } : prev);
    } catch (_) { /* intentional */ }
    finally { setSavingTags(false); }
  };

  const handleTagAdd = async () => {
    if (!selected || !tagInput.trim()) return;
    const tag = tagInput.trim().toLowerCase();
    const cur = profile?.tags ?? selected.tags;
    setTagInput('');
    await persistTags(selected.id, [...new Set([...cur, tag])]);
  };

  const handleTagRemove = async (tag: string) => {
    if (!selected) return;
    await persistTags(selected.id, (profile?.tags ?? selected.tags).filter(t => t !== tag));
  };

  const handleSendMedia = async () => {
    if (!selected || !mediaUrl.trim()) return;
    setSendingMedia(true);
    try {
      await api.post(`/support/inbox/rooms/${selected.id}/send-media`, { mediaUrl: mediaUrl.trim(), caption: mediaCaption.trim(), phone: selected.phone });
      setShowMediaModal(false); setMediaUrl(''); setMediaCaption('');
      await fetchMessages(selected);
    } catch (e: any) { alert(e?.response?.data?.message || 'Failed to send media'); }
    finally { setSendingMedia(false); }
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const filteredCanned = cannedResponses.filter(c =>
    !cannedSearch || c.shortcut.toLowerCase().includes(cannedSearch.toLowerCase()) || c.text.toLowerCase().includes(cannedSearch.toLowerCase())
  );

  // Group messages by date for date separators
  const msgGroups: { label: string; msgs: ChatMessage[] }[] = [];
  messages.forEach(msg => {
    const lbl = dateLabel(msg.ts);
    if (!msgGroups.length || msgGroups[msgGroups.length - 1].label !== lbl) {
      msgGroups.push({ label: lbl, msgs: [] });
    }
    msgGroups[msgGroups.length - 1].msgs.push(msg);
  });

  const currentTags = profile?.tags ?? selected?.tags ?? [];
  const roomDelivery = selected ? (deliveryStatus[selected.id] ?? 'sent') : 'sent';
  const openCount = conversations.filter(c => c.status === 'open').length;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <MainLayout>
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-[#f0f2f5] dark:bg-slate-900">

        {/* ═══════════════════ LEFT SIDEBAR ════════════════════════════════ */}
        <div className="w-[320px] min-w-[280px] flex flex-col bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 shadow-sm">

          {/* Sidebar header */}
          <div className="px-4 pt-4 pb-3 border-b border-gray-100 dark:border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center">
                  <MessageSquare className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h1 className="font-semibold text-gray-900 dark:text-white text-sm leading-none">WhatsApp Inbox</h1>
                  {openCount > 0 && (
                    <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">{openCount} open conversation{openCount !== 1 ? 's' : ''}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => setShowBroadcastModal(true)}
                  title="Broadcast"
                  className="w-7 h-7 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center justify-center text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 transition-colors"
                >
                  <Megaphone className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={fetchConversations}
                  disabled={loadingConvs}
                  className="w-7 h-7 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center justify-center text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 transition-colors"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingConvs ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 dark:text-slate-500 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by name or phone…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm text-gray-800 dark:text-slate-200 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-green-400 focus:bg-white dark:focus:bg-slate-600 transition-colors placeholder-gray-400 dark:placeholder-slate-500"
              />
            </div>

            {/* Status tabs */}
            <div className="flex gap-1 bg-gray-100 dark:bg-slate-700 p-0.5 rounded-lg">
              {(['open', 'all', 'closed'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`flex-1 py-1 text-xs font-medium rounded-md capitalize transition-colors ${
                    statusFilter === s ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {error && (
              <div className="m-3 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600">{error}</div>
            )}
            {loadingConvs && filtered.length === 0 && (
              <div className="flex items-center justify-center h-24">
                <RefreshCw className="h-4 w-4 animate-spin text-gray-300" />
              </div>
            )}
            {!loadingConvs && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center h-40 text-gray-300 dark:text-slate-600 select-none">
                <MessageSquare className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-xs">No conversations found</p>
              </div>
            )}
            {filtered.map(conv => {
              const isSelected = selected?.id === conv.id;
              return (
                <button
                  key={conv.id}
                  onClick={() => { setSelected(conv); setShowProfile(false); }}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 dark:border-slate-700/50 transition-colors relative ${
                    isSelected
                      ? 'bg-green-50 dark:bg-green-900/20 border-l-[3px] border-l-green-500'
                      : 'hover:bg-gray-50 dark:hover:bg-slate-700 border-l-[3px] border-l-transparent'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar with unread badge */}
                    <div className="relative flex-shrink-0">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                        style={{ background: avatarBg(conv.name) }}
                      >
                        {initial(conv.name)}
                      </div>
                      {conv.unread > 0 && conv.status === 'open' && (
                        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-green-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                          {conv.unread > 99 ? '99+' : conv.unread}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-1 mb-0.5">
                        <span className={`text-sm truncate ${conv.unread > 0 && conv.status === 'open' ? 'font-semibold text-gray-900 dark:text-white' : 'font-medium text-gray-800 dark:text-slate-200'}`}>
                          {conv.name}
                        </span>
                        <span className="text-[10px] text-gray-400 dark:text-slate-500 flex-shrink-0 whitespace-nowrap">
                          {ago(conv.lastMessageAt)}
                        </span>
                      </div>

                      {conv.phone && (
                        <div className="flex items-center gap-1 text-[11px] text-gray-400 mb-0.5">
                          <Phone className="h-2.5 w-2.5" /> {conv.phone}
                        </div>
                      )}

                      <p className={`text-xs truncate ${conv.unread > 0 && conv.status === 'open' ? 'text-gray-700 dark:text-slate-300 font-medium' : 'text-gray-400 dark:text-slate-500'}`}>
                        {previewText(conv.lastMessage)}
                      </p>

                      {/* Tags + closed badge */}
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {conv.status === 'closed' && (
                          <span className="text-[10px] px-1.5 py-0 rounded font-medium bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400">CLOSED</span>
                        )}
                        {conv.tags.slice(0, 2).map(t => (
                          <span key={t} className={`text-[10px] px-1.5 py-0 rounded-full font-medium ${tagCls(t)}`}>{t}</span>
                        ))}
                        {conv.servedBy && (
                          <span className="text-[10px] text-gray-300 dark:text-slate-600 truncate">· {conv.servedBy}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ═══════════════════ CHAT PANE ═══════════════════════════════════ */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {selected ? (
            <>
              {/* Chat header */}
              <div className="flex-shrink-0 px-5 py-3 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                    style={{ background: avatarBg(selected.name) }}
                  >
                    {initial(selected.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h2 className="font-semibold text-gray-900 dark:text-white text-sm truncate">{selected.name}</h2>
                      {selected.tags.slice(0, 3).map(t => (
                        <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${tagCls(t)}`}>{t}</span>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 dark:text-slate-500 flex items-center gap-1">
                      {selected.phone && <><Phone className="h-2.5 w-2.5" />{selected.phone} · </>}
                      <span className={`font-medium ${selected.status === 'open' ? 'text-green-500' : 'text-gray-400'}`}>
                        {selected.status === 'open' ? '● Open' : '○ Closed'}
                      </span>
                      {selected.servedBy && <> · {selected.servedBy}</>}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  {selected.status === 'open' && (
                    <button
                      onClick={handleClose}
                      className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      Close
                    </button>
                  )}
                  <button
                    onClick={() => setShowTemplateModal(true)}
                    title="Templates"
                    className="w-8 h-8 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center justify-center text-amber-500 transition-colors"
                  >
                    <Zap className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setShowProfile(p => !p)}
                    title="Contact info"
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${showProfile ? 'bg-green-50 dark:bg-green-900/20 text-green-600' : 'hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200'}`}
                  >
                    <User className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Messages area */}
              <div className="flex-1 overflow-y-auto px-6 py-4 bg-[#f0f2f5] dark:bg-slate-900">
                {loadingMsgs && messages.length === 0 && (
                  <div className="flex items-center justify-center h-20">
                    <RefreshCw className="h-5 w-5 animate-spin text-gray-300 dark:text-slate-600" />
                  </div>
                )}

                {msgGroups.map(({ label, msgs }) => (
                  <div key={label}>
                    {/* Date separator */}
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px bg-gray-200 dark:bg-slate-600" />
                      <span className="text-[11px] text-gray-400 dark:text-slate-500 font-medium bg-white dark:bg-slate-700 px-2.5 py-1 rounded-full border border-gray-200 dark:border-slate-600 shadow-sm">
                        {label}
                      </span>
                      <div className="flex-1 h-px bg-gray-200 dark:bg-slate-600" />
                    </div>

                    {msgs.map((msg, i) => {
                      const prev = i > 0 ? msgs[i - 1] : null;
                      const next = i < msgs.length - 1 ? msgs[i + 1] : null;
                      const isFirstOfGroup = !prev || prev.isAgent !== msg.isAgent || prev.isNote !== msg.isNote;
                      const isLastOfGroup  = !next || next.isAgent !== msg.isAgent || next.isNote !== msg.isNote;
                      const isVeryLast     = i === msgs.length - 1 && msg.isAgent;

                      // Internal note
                      if (msg.isNote) {
                        return (
                          <div key={msg.id} className="flex justify-center my-2">
                            <div className="max-w-[75%] bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm text-amber-800 shadow-sm">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Lock className="h-3 w-3 text-amber-500" />
                                <span className="text-[11px] font-semibold text-amber-600">Internal note</span>
                                {msg.author && <span className="text-[11px] text-amber-500">· {msg.author}</span>}
                              </div>
                              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                                {msg.text.replace(/^🗒️ \[Note\] /, '')}
                              </p>
                              <p className="text-[10px] text-amber-400 text-right mt-1">{fmtTime(msg.ts)}</p>
                            </div>
                          </div>
                        );
                      }

                      // Regular message
                      const isAgent = msg.isAgent;
                      const mbClass = isLastOfGroup ? 'mb-3' : 'mb-0.5';

                      return (
                        <div key={msg.id} className={`flex ${isAgent ? 'justify-end' : 'justify-start'} ${mbClass}`}>
                          {/* Customer avatar (only on first of group) */}
                          {!isAgent && (
                            <div className="flex-shrink-0 w-7 mr-1.5 flex items-end">
                              {isLastOfGroup && (
                                <div
                                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                                  style={{ background: avatarBg(msg.author || 'U') }}
                                >
                                  {initial(msg.author || 'U')}
                                </div>
                              )}
                            </div>
                          )}

                          <div className="max-w-[65%]">
                            {/* Sender name on first of group */}
                            {isFirstOfGroup && !isAgent && msg.author && (
                              <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 ml-1 mb-0.5">{msg.author}</p>
                            )}

                            <div className={`relative px-3.5 py-2.5 text-sm shadow-sm ${
                              isAgent
                                ? 'bg-[#075E54] text-white rounded-2xl rounded-tr-sm'
                                : 'bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-200 rounded-2xl rounded-tl-sm border border-gray-100 dark:border-slate-600'
                            }`}>
                              {/* Media link */}
                              {msg.mediaUrl && (
                                <a
                                  href={msg.mediaUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={`flex items-center gap-1.5 text-xs mb-1.5 font-medium ${isAgent ? 'text-green-200 hover:text-white' : 'text-blue-500 hover:text-blue-700'}`}
                                >
                                  <Paperclip className="h-3 w-3" /> Attachment
                                </a>
                              )}

                              <p className="leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>

                              {/* Time + delivery indicator */}
                              <div className={`flex items-center justify-end gap-1 mt-1 ${isAgent ? 'text-green-300' : 'text-gray-300 dark:text-slate-500'}`}>
                                <span className="text-[10px]">{fmtTime(msg.ts)}</span>
                                {isAgent && isVeryLast && (
                                  roomDelivery === 'read'
                                    ? <CheckCheck className="h-3 w-3 text-blue-300" />
                                    : roomDelivery === 'delivered'
                                    ? <CheckCheck className="h-3 w-3" />
                                    : <Check className="h-3 w-3" />
                                )}
                                {isAgent && !isVeryLast && <Check className="h-3 w-3 opacity-50" />}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Compose area */}
              <div className="flex-shrink-0 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700">
                {/* Mode bar */}
                <div className="flex items-center px-4 pt-3 pb-1 gap-2">
                  <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-slate-600 text-xs">
                    <button
                      onClick={() => setNoteMode(false)}
                      className={`px-3 py-1 font-medium transition-colors ${!noteMode ? 'bg-green-500 text-white' : 'text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                    >
                      Reply
                    </button>
                    <button
                      onClick={() => setNoteMode(true)}
                      className={`px-3 py-1 flex items-center gap-1 font-medium transition-colors ${noteMode ? 'bg-amber-400 text-amber-900' : 'text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                    >
                      <Lock className="h-3 w-3" /> Note
                    </button>
                  </div>

                  <div className="flex-1" />

                  {/* Action icons */}
                  <div className="flex items-center gap-0.5">
                    {/* Canned */}
                    <div className="relative">
                      <button
                        onClick={() => { setShowCannedPicker(p => !p); setCannedSearch(''); }}
                        title="Canned responses"
                        className="w-7 h-7 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center justify-center text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 transition-colors"
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                      </button>
                      {showCannedPicker && (
                        <div className="absolute bottom-9 right-0 z-50 w-76 w-72 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-slate-700">
                            <span className="text-xs font-semibold text-gray-600 dark:text-slate-400">Canned Responses</span>
                            <button onClick={() => setShowCannedPicker(false)}><X className="h-3.5 w-3.5 text-gray-400 dark:text-slate-500" /></button>
                          </div>
                          <div className="p-2 border-b border-gray-100 dark:border-slate-700">
                            <input
                              autoFocus
                              placeholder="Search…"
                              value={cannedSearch}
                              onChange={e => setCannedSearch(e.target.value)}
                              className="w-full px-2 py-1.5 text-xs text-gray-800 dark:text-slate-200 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-green-400"
                            />
                          </div>
                          <div className="max-h-52 overflow-y-auto">
                            {filteredCanned.length === 0 && (
                              <p className="px-3 py-4 text-xs text-gray-400 dark:text-slate-500 text-center">No canned responses yet</p>
                            )}
                            {filteredCanned.map(cr => (
                              <button key={cr.id} onClick={() => insertCanned(cr)}
                                className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-700 border-b border-gray-50 dark:border-slate-700/50 last:border-0">
                                <p className="text-xs font-semibold text-green-600 mb-0.5">/{cr.shortcut}</p>
                                <p className="text-xs text-gray-500 dark:text-slate-400 line-clamp-1">{cr.text}</p>
                              </button>
                            ))}
                          </div>
                          <div className="px-3 py-2 border-t border-gray-100 dark:border-slate-700">
                            <button
                              onClick={() => { setShowCannedPicker(false); setShowCannedManager(true); }}
                              className="text-xs text-green-600 hover:underline font-medium"
                            >
                              Manage canned responses →
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <button onClick={() => setShowTemplateModal(true)} title="Templates"
                      className="w-7 h-7 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center justify-center text-amber-400 hover:text-amber-600 transition-colors">
                      <Zap className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setShowMediaModal(true)} title="Send media"
                      className="w-7 h-7 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center justify-center text-blue-400 hover:text-blue-600 transition-colors">
                      <Paperclip className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Textarea */}
                <div className="flex items-end gap-2 px-4 pb-3">
                  <textarea
                    ref={textareaRef}
                    rows={2}
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={noteMode ? 'Write an internal note — not sent to the customer…' : 'Type a message…'}
                    className={`flex-1 resize-none rounded-xl text-sm px-3.5 py-2.5 focus:outline-none focus:ring-2 placeholder-gray-300 ${
                      noteMode
                        ? 'bg-amber-50 border border-amber-200 focus:ring-amber-300 text-amber-900'
                        : 'bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 focus:ring-green-400 text-gray-900 dark:text-slate-100'
                    }`}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!replyText.trim() || sending}
                    className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                      noteMode ? 'bg-amber-400 hover:bg-amber-500' : 'bg-[#075E54] hover:bg-[#054d42]'
                    }`}
                  >
                    {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center bg-[#f0f2f5] dark:bg-slate-900">
              <div className="w-20 h-20 rounded-3xl bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center mb-6">
                <MessageSquare className="h-9 w-9 text-green-500" />
              </div>
              <h2 className="text-lg font-semibold text-gray-700 dark:text-slate-200 mb-1">Your inbox</h2>
              <p className="text-sm text-gray-400 dark:text-slate-500 text-center max-w-xs">
                Select a conversation on the left to view messages and reply to your customers.
              </p>
            </div>
          )}
        </div>

        {/* ═══════════════════ CONTACT PROFILE PANEL ═══════════════════════ */}
        {selected && showProfile && (
          <div className="w-[280px] min-w-[250px] flex flex-col bg-white dark:bg-slate-800 border-l border-gray-200 dark:border-slate-700 overflow-y-auto">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
              <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">Contact Info</span>
              <button onClick={() => setShowProfile(false)} className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300">
                <X className="h-4 w-4" />
              </button>
            </div>

            {loadingProfile ? (
              <div className="flex-1 flex items-center justify-center">
                <RefreshCw className="h-5 w-5 animate-spin text-gray-300 dark:text-slate-600" />
              </div>
            ) : (
              <div className="p-4 space-y-5">
                {/* Contact card */}
                <div className="flex flex-col items-center text-center py-2">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-3 shadow-sm"
                    style={{ background: avatarBg(profile?.name || selected.name) }}
                  >
                    {initial(profile?.name || selected.name)}
                  </div>
                  <p className="font-semibold text-gray-900 dark:text-white">{profile?.name || selected.name}</p>
                  {(profile?.phone || selected.phone) && (
                    <p className="text-xs text-gray-400 dark:text-slate-500 flex items-center justify-center gap-1 mt-1">
                      <Phone className="h-3 w-3" />{profile?.phone || selected.phone}
                    </p>
                  )}
                  {profile?.email && <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 truncate max-w-full">{profile.email}</p>}
                  {profile?.createdAt && (
                    <p className="text-[10px] text-gray-300 dark:text-slate-600 mt-1">First contact {ago(profile.createdAt)}</p>
                  )}
                </div>

                <hr className="border-gray-100 dark:border-slate-700" />

                {/* SLA & Metrics */}
                {profile && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 flex items-center gap-1.5 mb-2">
                      <Clock className="h-3.5 w-3.5 text-blue-400" /> Response Metrics
                    </p>
                    {[
                      { label: 'First Response', value: slaFmt(profile.firstResponseMs), color: profile.firstResponseMs === null ? 'text-gray-400' : profile.firstResponseMs < 300000 ? 'text-green-600' : profile.firstResponseMs < 900000 ? 'text-amber-500' : 'text-red-500' },
                      { label: 'Messages', value: String(profile.totalMessages), color: 'text-gray-900' },
                      { label: 'Past Conversations', value: String(profile.pastConversations), color: 'text-gray-900' },
                      ...(profile.lastSeen ? [{ label: 'Last Seen', value: ago(profile.lastSeen), color: 'text-gray-600' }] : []),
                    ].map(row => (
                      <div key={row.label} className="flex justify-between items-center py-1">
                        <span className="text-xs text-gray-400 dark:text-slate-500">{row.label}</span>
                        <span className={`text-xs font-semibold ${row.color}`}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                )}

                <hr className="border-gray-100 dark:border-slate-700" />

                {/* Labels */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 mb-2">Labels</p>
                  <div className="flex flex-wrap gap-1 mb-3 min-h-[20px]">
                    {currentTags.length === 0 && <span className="text-xs text-gray-300 dark:text-slate-600 italic">No labels</span>}
                    {currentTags.map(tag => (
                      <span key={tag} className={`inline-flex items-center gap-0.5 text-[11px] px-2 py-0.5 rounded-full font-medium ${tagCls(tag)}`}>
                        {tag}
                        <button onClick={() => handleTagRemove(tag)} className="ml-0.5 opacity-60 hover:opacity-100">
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1.5 mb-2">
                    <input
                      type="text"
                      placeholder="Add a label…"
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleTagAdd()}
                      className="flex-1 px-2.5 py-1.5 text-xs text-gray-800 dark:text-slate-200 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-green-400 placeholder-gray-300 dark:placeholder-slate-500"
                    />
                    <button
                      onClick={handleTagAdd}
                      disabled={savingTags}
                      className="w-7 h-7 bg-green-500 hover:bg-green-600 text-white rounded-lg flex items-center justify-center disabled:opacity-40 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {['urgent', 'vip', 'followup', 'resolved', 'new'].map(t => (
                      <button
                        key={t}
                        onClick={() => setTagInput(t)}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-opacity hover:opacity-80 ${tagCls(t)}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <hr className="border-gray-100 dark:border-slate-700" />

                {/* Read receipt */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 mb-2">Last Message</p>
                  <div className="flex items-center gap-2">
                    {roomDelivery === 'read'
                      ? <><CheckCheck className="h-4 w-4 text-blue-500" /><span className="text-xs font-medium text-blue-600">Read</span></>
                      : roomDelivery === 'delivered'
                      ? <><CheckCheck className="h-4 w-4 text-green-500" /><span className="text-xs font-medium text-green-600">Delivered</span></>
                      : <><Check className="h-4 w-4 text-gray-400 dark:text-slate-500" /><span className="text-xs text-gray-400 dark:text-slate-500">Sent</span></>
                    }
                    <button onClick={() => refreshDelivery(selected.id)} className="ml-auto text-gray-300 hover:text-gray-500" title="Refresh">
                      <RefreshCw className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════ MODALS ══════════════════════════════ */}

        {/* Broadcast */}
        {showBroadcastModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg">
              <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Megaphone className="h-5 w-5 text-green-500" />
                  <h2 className="font-semibold text-gray-900 dark:text-white">Broadcast Message</h2>
                </div>
                <button onClick={() => { setShowBroadcastModal(false); setBroadcastResult(null); setBroadcastPhones(''); setBroadcastMsg(''); }}
                  className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"><X className="h-5 w-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 mb-1.5">
                    Recipients <span className="font-normal text-gray-400 dark:text-slate-500">— one phone per line or comma-separated</span>
                  </label>
                  <textarea
                    className="w-full border border-gray-200 dark:border-slate-600 rounded-xl p-3 text-sm text-gray-800 dark:text-slate-200 resize-none h-24 focus:outline-none focus:border-green-400 bg-gray-50 dark:bg-slate-700 placeholder-gray-300 dark:placeholder-slate-500"
                    placeholder={`+919876543210\n+919123456789`}
                    value={broadcastPhones} onChange={e => setBroadcastPhones(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 mb-1.5">Message</label>
                  <textarea
                    className="w-full border border-gray-200 dark:border-slate-600 rounded-xl p-3 text-sm text-gray-800 dark:text-slate-200 resize-none h-28 focus:outline-none focus:border-green-400 bg-gray-50 dark:bg-slate-700 placeholder-gray-300 dark:placeholder-slate-500"
                    placeholder="Type your message…"
                    value={broadcastMsg} onChange={e => setBroadcastMsg(e.target.value)}
                  />
                </div>
                {broadcastResult && (
                  <div className={`p-3 rounded-xl text-sm font-medium flex items-center gap-2 ${broadcastResult.failed === 0 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                    <Check className="h-4 w-4" />
                    Sent to {broadcastResult.sent} contacts
                    {broadcastResult.failed > 0 && <span className="ml-auto text-red-500">{broadcastResult.failed} failed</span>}
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => { setShowBroadcastModal(false); setBroadcastResult(null); }}>Cancel</Button>
                  <Button
                    size="sm"
                    onClick={handleBroadcast}
                    disabled={broadcasting || !broadcastMsg.trim() || !broadcastPhones.trim()}
                    className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
                  >
                    {broadcasting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Megaphone className="h-3.5 w-3.5" />}
                    Send Broadcast
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Templates */}
        {showTemplateModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col">
              <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-amber-500" />
                  <h2 className="font-semibold text-gray-900 dark:text-white">Message Templates</h2>
                </div>
                <button onClick={() => { setShowTemplateModal(false); setSelectedTemplate(null); }} className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex flex-1 overflow-hidden">
                <div className="w-44 flex-shrink-0 border-r border-gray-100 dark:border-slate-700 overflow-y-auto py-2">
                  {templates.map(t => (
                    <button
                      key={t.id}
                      onClick={() => openTemplate(t)}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                        selectedTemplate?.id === t.id ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 font-semibold border-r-2 border-amber-400' : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
                <div className="flex-1 p-5 overflow-y-auto">
                  {selectedTemplate ? (
                    <div className="space-y-4">
                      <div className="bg-[#f0f2f5] dark:bg-slate-700 rounded-xl p-4 text-sm text-gray-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed border border-gray-200 dark:border-slate-600">
                        {selectedTemplate.body}
                      </div>
                      {(selectedTemplate.variables || []).length > 0 && (
                        <div className="space-y-3">
                          <p className="text-xs font-semibold text-gray-500 dark:text-slate-400">Fill in placeholders</p>
                          {selectedTemplate.variables!.map(v => (
                            <div key={v}>
                              <label className="block text-xs text-gray-400 dark:text-slate-500 capitalize mb-1">{v.replace(/([A-Z])/g, ' $1').trim()}</label>
                              <Input
                                placeholder={v}
                                value={templateVars[v] || ''}
                                onChange={e => setTemplateVars(prev => ({ ...prev, [v]: e.target.value }))}
                                className="h-8 text-sm"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                      <Button onClick={applyTemplate} className="w-full bg-amber-500 hover:bg-amber-600 text-white">
                        Insert Template
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-300 dark:text-slate-600 text-sm">
                      Select a template
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Canned response manager */}
        {showCannedManager && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
              <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-green-500" />
                  <h2 className="font-semibold text-gray-900 dark:text-white">Canned Responses</h2>
                </div>
                <button onClick={() => setShowCannedManager(false)} className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"><X className="h-5 w-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="border border-dashed border-gray-200 dark:border-slate-600 rounded-xl p-4 space-y-2.5 bg-gray-50 dark:bg-slate-700/50">
                  <p className="text-xs font-semibold text-gray-500 dark:text-slate-400">New canned response</p>
                  <Input
                    placeholder="/shortcut"
                    value={newCanned.shortcut}
                    onChange={e => setNewCanned(p => ({ ...p, shortcut: e.target.value }))}
                    className="h-8 text-sm"
                  />
                  <textarea
                    className="w-full border border-gray-200 dark:border-slate-600 rounded-lg p-2.5 text-sm text-gray-800 dark:text-slate-200 resize-none h-16 bg-white dark:bg-slate-700 focus:outline-none focus:border-green-400 placeholder-gray-300 dark:placeholder-slate-500"
                    placeholder="Response text…"
                    value={newCanned.text}
                    onChange={e => setNewCanned(p => ({ ...p, text: e.target.value }))}
                  />
                  <Button
                    onClick={handleCreateCanned}
                    size="sm"
                    disabled={!newCanned.shortcut.trim() || !newCanned.text.trim()}
                    className="w-full bg-green-500 hover:bg-green-600 text-white gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                </div>

                {cannedResponses.length === 0 && (
                  <p className="text-sm text-gray-300 dark:text-slate-600 text-center py-6">No canned responses yet</p>
                )}
                {cannedResponses.map(cr => (
                  <div key={cr.id} className="flex items-start gap-3 p-3 border border-gray-100 dark:border-slate-700 rounded-xl hover:border-gray-200 dark:hover:border-slate-600 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-green-600">/{cr.shortcut}</p>
                      <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 line-clamp-2">{cr.text}</p>
                    </div>
                    {cr.source === 'custom' && (
                      <button onClick={() => handleDeleteCanned(cr.id)} className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0 mt-0.5">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Media */}
        {showMediaModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md">
              <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Paperclip className="h-5 w-5 text-blue-500" />
                  <h2 className="font-semibold text-gray-900 dark:text-white">Send Media</h2>
                </div>
                <button onClick={() => setShowMediaModal(false)} className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"><X className="h-5 w-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 mb-1.5">Public media URL</label>
                  <Input placeholder="https://example.com/image.jpg" value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} className="text-sm" />
                  <p className="text-[11px] text-gray-300 dark:text-slate-600 mt-1">Supported: images, PDF, audio, video — must be publicly accessible</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 mb-1.5">Caption <span className="font-normal text-gray-300 dark:text-slate-600">(optional)</span></label>
                  <Input placeholder="Describe the file…" value={mediaCaption} onChange={e => setMediaCaption(e.target.value)} className="text-sm" />
                </div>
                <div className="flex gap-2 justify-end pt-1">
                  <Button variant="outline" size="sm" onClick={() => setShowMediaModal(false)}>Cancel</Button>
                  <Button
                    size="sm"
                    onClick={handleSendMedia}
                    disabled={sendingMedia || !mediaUrl.trim()}
                    className="bg-blue-500 hover:bg-blue-600 text-white gap-1.5"
                  >
                    {sendingMedia ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Send
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </MainLayout>
  );
}
