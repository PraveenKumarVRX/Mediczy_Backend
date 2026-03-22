import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mail, Star, Trash2, Send, RefreshCw, X, Reply, Ticket as TicketIcon, Zap,
  FileText, Inbox, ChevronLeft, ChevronRight, Loader2, Paperclip,
  Bold, Italic, Underline, Strikethrough, Link2, Quote, PenLine,
  RotateCcw, Maximize2, Minimize2, Plus, Bell, ShieldAlert, Search,
  CheckCircle, Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import { Link as RouterLink } from 'react-router-dom';

// ── Types ──────────────────────────────────────────────────────────
interface Email {
  id: string;
  from: string;
  fromName: string;
  subject: string;
  body: string;
  htmlBody?: string;
  isRead: boolean;
  isStarred: boolean;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  aiIntent: string;
  aiSummary: string;
  aiSentiment: 'positive' | 'neutral' | 'negative';
  receivedAt: string;
  aiProcessed: boolean;
  autoUpdatesApplied: any[];
  ticketId?: string;
  healthReportSaved?: boolean;
}
interface InboxStats {
  total: number;
  unread: number;
  starred: number;
  byIntent: Record<string, number>;
  bySentiment: Record<string, number>;
}
interface Attachment { file: File; id: string; }

// ── Helpers ────────────────────────────────────────────────────────
function parseFromField(raw: string): { name: string; email: string } {
  const m = raw.match(/^.*?"?([^"<>]+)"?\s*<([^>]+)>/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { name: raw.trim(), email: raw.trim() };
}
const PALETTE = ['#3b82f6','#8b5cf6','#10b981','#f97316','#ef4444','#06b6d4','#84cc16','#ec4899'];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
}
function getInitials(name: string): string {
  return (name || '?').split(/\s+/).slice(0, 2).map(n => n[0] || '').join('').toUpperCase() || '?';
}
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}
function timeAgo(date: string): string {
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}
function sanitize(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '');
}
function intentToCategory(intent: string): string {
  const map: Record<string, string> = {
    appointment_request: 'doctor-consultation',
    appointment_cancel: 'appointment-cancellation',
    appointment_reschedule: 'appointment-reschedule',
    test_result: 'health-report',
    prescription: 'prescription',
    billing: 'billing',
    feedback: 'complaint',
    patient_query: 'other',
  };
  return map[intent] || 'other';
}

// ── Constants ──────────────────────────────────────────────────────
const PRIORITY_CLS: Record<string, string> = {
  urgent: 'bg-red-500/15 text-red-600 border-red-400/30',
  high:   'bg-orange-500/15 text-orange-600 border-orange-400/30',
  normal: 'bg-blue-500/10 text-blue-600 border-blue-400/20',
  low:    'bg-muted text-muted-foreground border-border',
};
const SENTIMENT_DOT: Record<string, string> = {
  positive: 'bg-emerald-500',
  neutral:  'bg-amber-400',
  negative: 'bg-red-500',
};
const FOLDERS = [
  { key: 'inbox',         label: 'Inbox',         Icon: Inbox },
  { key: 'sent',          label: 'Sent',           Icon: Send },
  { key: 'draft',         label: 'Drafts',         Icon: FileText },
  { key: 'spam',          label: 'Spam',           Icon: ShieldAlert },
  { key: 'notifications', label: 'Notifications',  Icon: Bell },
];
const SIG_KEY = 'team_email_sig_v2';
const DEFAULT_SIG = '-- \nBest regards,\nMediqzy Team';

// ── FormatButton (outside component to prevent remount) ─────────────
const FormatButton: React.FC<{
  icon: React.ElementType;
  title: string;
  onClick: (e: React.MouseEvent) => void;
}> = ({ icon: Icon, title, onClick }) => (
  <button
    type="button"
    title={title}
    onMouseDown={onClick}
    className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
  >
    <Icon className="w-3.5 h-3.5" />
  </button>
);

// ── EmailInbox ─────────────────────────────────────────────────────
const EmailInbox: React.FC = () => {
  const { toast } = useToast();

  // Inbox state
  const [emails, setEmails]               = useState<Email[]>([]);
  const [stats, setStats]                 = useState<InboxStats | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [loading, setLoading]             = useState(false);
  const [syncing, setSyncing]             = useState(false);
  const [page, setPage]                   = useState(1);
  const [unreadOnly, setUnreadOnly]       = useState(false);
  const [searchTerm, setSearchTerm]       = useState('');
  const [folder, setFolder]               = useState('inbox');

  // Composer state
  const [composerOpen, setComposerOpen]         = useState(false);
  const [composerMode, setComposerMode]         = useState<'compose' | 'reply'>('compose');
  const [sendLoading, setSendLoading]           = useState(false);
  const [composerTo, setComposerTo]             = useState('');
  const [composerCc, setComposerCc]             = useState('');
  const [composerBcc, setComposerBcc]           = useState('');
  const [composerSubject, setComposerSubject]   = useState('');
  const [showCcBcc, setShowCcBcc]               = useState(false);
  const [attachments, setAttachments]           = useState<Attachment[]>([]);
  const [signature, setSignature]               = useState(() => localStorage.getItem(SIG_KEY) ?? DEFAULT_SIG);
  const [showSignature, setShowSignature]       = useState(true);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const bodyRef     = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ticket state
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketLoading, setTicketLoading]     = useState(false);
  const [ticketSuccess, setTicketSuccess]     = useState('');
  const [ticketError, setTicketError]         = useState('');
  const [ticketForm, setTicketForm]           = useState({
    title: '', description: '', category: 'other', priority: 'medium',
    requesterName: '', requesterEmail: '',
  });

  // AI state
  const [processing, setProcessing]       = useState(false);
  const [processResult, setProcessResult] = useState<{ ticketsCreated: number; reportsSaved: number } | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────
  const fetchInbox = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/team/emails/inbox', {
        params: { page, limit: 20, unreadOnly, folder, search: searchTerm },
      });
      if (res.data.success) setEmails(res.data.data.emails);
    } catch (err) { console.error('fetchInbox:', err); }
    finally { setLoading(false); }
  }, [page, unreadOnly, folder, searchTerm]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/team/emails/stats');
      if (res.data.success) setStats(res.data.data);
    } catch (err) { console.error('fetchStats:', err); }
  }, []);

  useEffect(() => { fetchInbox(); }, [fetchInbox]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // ── Actions ──────────────────────────────────────────────────────
  const syncEmails = async () => {
    setSyncing(true);
    try {
      const res = await api.post('/team/emails/sync');
      if (res.data.success) {
        await Promise.all([fetchInbox(), fetchStats()]);
        toast({ title: 'Sync complete', description: `${res.data.data.newEmails} new emails received.` });
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Sync failed', description: err?.response?.data?.message || 'Unable to sync.' });
    } finally { setSyncing(false); }
  };

  const processAllEmails = async () => {
    setProcessing(true); setProcessResult(null);
    try {
      const res = await api.post('/team/emails/process-all', { limit: 500 });
      setProcessResult(res.data?.stats);
      fetchInbox(); fetchStats();
    } catch (err) { console.error('AI process failed:', err); }
    finally { setProcessing(false); }
  };

  const markAsRead = async (id: string) => {
    try {
      await api.put(`/team/emails/${id}/mark-read`);
      setEmails(prev => prev.map(e => e.id === id ? { ...e, isRead: true } : e));
    } catch {}
  };

  const toggleStar = async (id: string, ev?: React.MouseEvent) => {
    ev?.stopPropagation();
    try {
      const res = await api.put(`/team/emails/${id}/toggle-star`);
      if (res.data.success) {
        const starred = res.data.data.isStarred;
        setEmails(prev => prev.map(e => e.id === id ? { ...e, isStarred: starred } : e));
        if (selectedEmail?.id === id) setSelectedEmail(p => p ? { ...p, isStarred: starred } : null);
      }
    } catch {}
  };

  const deleteEmail = async (id: string) => {
    try {
      await api.delete(`/team/emails/${id}`);
      setEmails(prev => prev.filter(e => e.id !== id));
      if (selectedEmail?.id === id) { setSelectedEmail(null); setComposerOpen(false); }
    } catch {}
  };

  const selectEmail = async (email: Email) => {
    setSelectedEmail(email);
    setComposerOpen(false);
    if (!email.isRead) await markAsRead(email.id);
  };

  // ── Composer helpers ─────────────────────────────────────────────
  const setBodyContent = (html: string) => {
    if (bodyRef.current) bodyRef.current.innerHTML = html;
  };

  const openCompose = () => {
    setComposerMode('compose');
    setComposerTo(''); setComposerCc(''); setComposerBcc('');
    setComposerSubject(''); setAttachments([]); setShowCcBcc(false);
    setSelectedEmail(null);
    setComposerOpen(true);
    setTimeout(() => { setBodyContent('<p><br/></p>'); bodyRef.current?.focus(); }, 50);
  };

  const startReply = (email: Email) => {
    setComposerMode('reply');
    setComposerTo(email.from);
    setComposerCc(''); setComposerBcc('');
    setComposerSubject(email.subject?.toLowerCase().startsWith('re:') ? email.subject : `Re: ${email.subject}`);
    setAttachments([]); setShowCcBcc(false);
    setComposerOpen(true);
    setTimeout(() => {
      const dateStr = new Date(email.receivedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
      const quoted  = email.htmlBody ? sanitize(email.htmlBody) : (email.body || '').replace(/\n/g, '<br/>');
      setBodyContent(
        `<p><br/></p>` +
        `<div style="border-left:3px solid #94a3b8;padding-left:12px;margin:8px 0;color:#64748b;">` +
        `<p style="font-size:12px;margin:0 0 4px;">On ${dateStr}, <strong>${email.fromName || email.from}</strong> wrote:</p>` +
        quoted + `</div>`
      );
      bodyRef.current?.focus();
      const range = document.createRange();
      if (bodyRef.current) {
        range.setStart(bodyRef.current, 0);
        range.collapse(true);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
    }, 50);
  };

  const execFmt = (cmd: string, val?: string) => { bodyRef.current?.focus(); document.execCommand(cmd, false, val); };
  const insertLink = (e: React.MouseEvent) => {
    e.preventDefault();
    const url = window.prompt('Enter URL:', 'https://');
    if (url) execFmt('createLink', url);
  };

  const handleFileAdd = (files: FileList | null) => {
    if (!files) return;
    const next: Attachment[] = Array.from(files)
      .filter(f => f.size <= 10 * 1024 * 1024)
      .map(f => ({ file: f, id: `${Date.now()}-${Math.random()}` }));
    setAttachments(prev => [...prev, ...next].slice(0, 10));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  const removeAttachment = (id: string) => setAttachments(prev => prev.filter(a => a.id !== id));

  const sendEmail = async () => {
    if (!composerTo.trim() || !composerSubject.trim()) {
      toast({ variant: 'destructive', title: 'Missing fields', description: 'Recipient and subject are required.' });
      return;
    }
    const bodyHtml = bodyRef.current?.innerHTML || '';
    const bodyText = bodyRef.current?.innerText || '';
    if (!bodyText.trim()) {
      toast({ variant: 'destructive', title: 'Empty message', description: 'Please write your message.' });
      return;
    }
    setSendLoading(true);
    try {
      const fullHtml = showSignature
        ? bodyHtml + `<br/><div style="color:#64748b;font-size:13px;">${signature.replace(/\n/g, '<br/>')}</div>`
        : bodyHtml;
      const fd = new FormData();
      fd.append('to', composerTo.trim());
      if (composerCc.trim())  fd.append('cc', composerCc.trim());
      if (composerBcc.trim()) fd.append('bcc', composerBcc.trim());
      fd.append('subject', composerSubject.trim());
      fd.append('htmlContent', fullHtml);
      attachments.forEach(a => fd.append('attachments', a.file));
      const res = await api.post('/team/emails/send', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data.success) {
        setComposerOpen(false); setAttachments([]);
        toast({ title: '✓ Email sent', description: 'Your message was delivered.' });
        fetchInbox();
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Send failed', description: err?.response?.data?.message || 'Unable to send.' });
    } finally { setSendLoading(false); }
  };

  const saveSignature = (val: string) => { setSignature(val); localStorage.setItem(SIG_KEY, val); };

  // ── Ticket ───────────────────────────────────────────────────────
  const openTicketModal = (email: Email) => {
    const s = parseFromField(email.from);
    const raw = email.body || email.htmlBody?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '';
    setTicketForm({
      title: email.subject || 'Email enquiry',
      description: email.aiSummary || raw.slice(0, 500) || `Email from ${s.email}: ${email.subject}`,
      category: intentToCategory(email.aiIntent),
      priority: email.priority === 'urgent' ? 'critical' : email.priority === 'high' ? 'high' : email.priority === 'normal' ? 'medium' : 'low',
      requesterName: email.fromName || s.name,
      requesterEmail: s.email,
    });
    setTicketSuccess(''); setTicketError(''); setShowTicketModal(true);
  };

  const submitTicket = async (e: React.FormEvent) => {
    e.preventDefault(); setTicketLoading(true); setTicketError('');
    try {
      const res = await api.post('/tickets', {
        title: ticketForm.title, description: ticketForm.description,
        category: ticketForm.category, priority: ticketForm.priority,
        source: 'email',
        requester: { name: ticketForm.requesterName, email: ticketForm.requesterEmail, role: 'Customer' },
        tags: ['email', 'team-created'],
      });
      const t = res.data?.ticket || res.data;
      setTicketSuccess(`Ticket ${t?.ticketId || t?.ticketNumber || ''} created successfully!`);
    } catch (err: any) {
      setTicketError(err?.response?.data?.message || 'Failed to create ticket');
    } finally { setTicketLoading(false); }
  };

  // ── Shared sub-components (using closures, stable parent lifecycle) ──
  const FormattingToolbar = () => (
    <div className="shrink-0 flex items-center gap-0.5 px-3 py-1.5 border-b border-border bg-muted/10">
      <FormatButton icon={Bold}          title="Bold"             onClick={e => { e.preventDefault(); execFmt('bold'); }} />
      <FormatButton icon={Italic}        title="Italic"           onClick={e => { e.preventDefault(); execFmt('italic'); }} />
      <FormatButton icon={Underline}     title="Underline"        onClick={e => { e.preventDefault(); execFmt('underline'); }} />
      <FormatButton icon={Strikethrough} title="Strikethrough"    onClick={e => { e.preventDefault(); execFmt('strikeThrough'); }} />
      <div className="w-px h-4 bg-border mx-1" />
      <FormatButton icon={Link2}         title="Insert link"      onClick={insertLink} />
      <FormatButton icon={Quote}         title="Blockquote"       onClick={e => { e.preventDefault(); execFmt('formatBlock', 'blockquote'); }} />
      <FormatButton icon={RotateCcw}     title="Clear formatting" onClick={e => { e.preventDefault(); execFmt('removeFormat'); }} />
    </div>
  );

  const ComposerFooter = ({ compact = false }: { compact?: boolean }) => (
    <>
      {showSignature && (
        <div className={`shrink-0 border-t border-dashed border-border/60 bg-muted/5 ${compact ? 'px-4 py-1.5' : 'px-5 py-2'}`}>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground/40 mb-0.5">Signature</p>
          <textarea
            rows={compact ? 2 : 3}
            value={signature}
            onChange={e => saveSignature(e.target.value)}
            className="w-full text-xs text-muted-foreground bg-transparent focus:outline-none resize-none"
            placeholder="Your signature…"
          />
        </div>
      )}
      {attachments.length > 0 && (
        <div className="shrink-0 flex flex-wrap gap-1.5 px-4 py-1.5 border-t border-border bg-background">
          {attachments.map(a => (
            <div key={a.id} className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-muted border border-border text-[11px]">
              <Paperclip className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
              <span className="max-w-[110px] truncate text-foreground">{a.file.name}</span>
              <span className="text-muted-foreground shrink-0">({formatBytes(a.file.size)})</span>
              <button onClick={() => removeAttachment(a.id)} className="hover:text-red-500 transition-colors shrink-0">
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className={`shrink-0 flex items-center gap-2 border-t border-border bg-muted/10 ${compact ? 'px-3 py-2' : 'px-4 py-2.5'}`}>
        <Button
          size="sm"
          onClick={sendEmail}
          disabled={sendLoading}
          className={`bg-blue-600 hover:bg-blue-700 text-white gap-1.5 ${compact ? 'h-7 text-xs px-3' : 'h-8'}`}
        >
          {sendLoading
            ? <Loader2 className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} animate-spin`} />
            : <Send className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />}
          {sendLoading ? 'Sending…' : compact ? 'Send Reply' : 'Send'}
        </Button>
        <button
          type="button"
          title="Attach files (max 10 MB each)"
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <Paperclip className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        </button>
        <button
          type="button"
          title="Toggle signature"
          onClick={() => setShowSignature(v => !v)}
          className={`p-1.5 rounded hover:bg-muted transition-colors ${showSignature ? 'text-blue-500' : 'text-muted-foreground'}`}
        >
          <PenLine className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        </button>
        <div className="flex-1" />
        <button
          type="button"
          title="Discard"
          onClick={() => setComposerOpen(false)}
          className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
        >
          <Trash2 className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        </button>
      </div>
    </>
  );

  // ── JSX ──────────────────────────────────────────────────────────
  return (
    <>
      {/* Hidden file input – shared between compose & reply */}
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => handleFileAdd(e.target.files)} />

      {/* ── 3-pane layout ── */}
      <div
        className="flex rounded-xl border border-border shadow-sm overflow-hidden bg-background"
        style={{ height: 'calc(100vh - 160px)', minHeight: 640 }}
      >
        {/* ─── SIDEBAR ─── */}
        <aside className="w-56 shrink-0 flex flex-col border-r border-border bg-muted/20 overflow-y-auto">
          {/* Compose button */}
          <div className="p-3 border-b border-border shrink-0">
            <button
              onClick={openCompose}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-sm transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" /> Compose
            </button>
          </div>

          {/* Folder nav */}
          <nav className="py-2 shrink-0">
            {FOLDERS.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => { setFolder(key); setPage(1); setSelectedEmail(null); setComposerOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg mx-1 mb-0.5 transition-colors ${
                  folder === key
                    ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left">{label}</span>
                {key === 'inbox' && (stats?.unread ?? 0) > 0 && (
                  <span className="text-[10px] font-bold bg-blue-500 text-white rounded-full px-1.5 py-0.5 leading-none">
                    {stats!.unread > 99 ? '99+' : stats!.unread}
                  </span>
                )}
              </button>
            ))}
            <div className="mx-3 my-2 border-t border-border" />
            <RouterLink
              to="/team/settings"
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg mx-1 transition-colors"
            >
              <Settings className="w-4 h-4 shrink-0" /> SMTP Settings
            </RouterLink>
          </nav>

          {/* Stats + AI actions */}
          {stats && (
            <div className="px-3 pb-3 mt-auto">
              <div className="border-t border-border pt-3 mb-2">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/60 mb-2">Statistics</p>
                <div className="grid grid-cols-2 gap-1.5 mb-3">
                  <div className="rounded-lg bg-background border border-border p-2 text-center">
                    <div className="text-lg font-bold text-foreground leading-none">{stats.total}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Total</div>
                  </div>
                  <div className="rounded-lg bg-background border border-border p-2 text-center">
                    <div className="text-lg font-bold text-blue-600 leading-none">{stats.unread}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Unread</div>
                  </div>
                </div>
                {Object.keys(stats.bySentiment).length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/60">Sentiment</p>
                    {Object.entries(stats.bySentiment).map(([s, c]) => (
                      <div key={s}>
                        <div className="flex justify-between text-[10px] mb-0.5">
                          <span className="capitalize text-muted-foreground">{s}</span>
                          <span className="font-semibold text-foreground">{c}</span>
                        </div>
                        <div className="h-1 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${SENTIMENT_DOT[s] || 'bg-blue-400'}`}
                            style={{ width: `${Math.min(100, (c / Math.max(stats.total, 1)) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t border-border pt-2 space-y-1">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/60 mb-1">AI Actions</p>
                <button
                  onClick={syncEmails} disabled={syncing}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing…' : 'Sync Emails'}
                </button>
                <button
                  onClick={processAllEmails} disabled={processing}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium text-orange-600 hover:bg-orange-500/10 transition-colors disabled:opacity-50"
                >
                  <Zap className={`w-3.5 h-3.5 shrink-0 ${processing ? 'animate-pulse' : ''}`} />
                  {processing ? 'Processing…' : 'AI Process All'}
                </button>
                {processResult && (
                  <p className="text-[10px] text-emerald-600 font-medium pl-1">
                    ✓ {processResult.ticketsCreated} tickets, {processResult.reportsSaved} reports
                  </p>
                )}
              </div>
            </div>
          )}
        </aside>

        {/* ─── EMAIL LIST ─── */}
        <div className="w-[360px] shrink-0 flex flex-col border-r border-border min-w-0 overflow-hidden">
          {/* Search + filter bar */}
          <div className="shrink-0 p-3 border-b border-border space-y-2 bg-background">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search emails…"
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:bg-background placeholder:text-muted-foreground/60 transition-colors"
              />
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => { setUnreadOnly(!unreadOnly); setPage(1); }}
                className={`flex-1 py-1 rounded-md text-xs font-medium transition-colors ${
                  unreadOnly ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300' : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                Unread {stats?.unread ? `(${stats.unread})` : ''}
              </button>
              <button
                onClick={fetchInbox}
                className="px-2.5 py-1 rounded-md bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : emails.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
                <Mail className="w-8 h-8 opacity-30" />
                <p className="text-sm">No emails found</p>
              </div>
            ) : (
              emails.map(email => {
                const isSelected = selectedEmail?.id === email.id;
                const color = avatarColor(email.fromName || email.from);
                return (
                  <div
                    key={email.id}
                    onClick={() => selectEmail(email)}
                    className={`group relative px-3 py-3 border-b border-border cursor-pointer transition-all select-none ${
                      isSelected
                        ? 'bg-blue-500/10 border-l-[3px] border-l-blue-500'
                        : email.isRead
                        ? 'hover:bg-muted/40'
                        : 'bg-blue-500/5 hover:bg-blue-500/10'
                    }`}
                  >
                    {!email.isRead && !isSelected && (
                      <div className="absolute left-[3px] top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-blue-500" />
                    )}
                    <div className="flex items-start gap-2.5 pl-1">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5"
                        style={{ backgroundColor: color }}
                      >
                        {getInitials(email.fromName || email.from)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className={`text-sm truncate leading-snug ${email.isRead ? 'font-medium text-foreground' : 'font-bold text-foreground'}`}>
                            {email.fromName || email.from}
                          </span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(email.receivedAt)}</span>
                        </div>
                        <p className={`text-xs truncate mb-1 ${email.isRead ? 'text-muted-foreground' : 'text-foreground font-medium'}`}>
                          {email.subject}
                        </p>
                        <div className="flex items-center gap-1 flex-wrap">
                          {email.ticketId && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 border border-blue-400/20 font-medium">
                              <TicketIcon className="w-2.5 h-2.5" />{email.ticketId}
                            </span>
                          )}
                          {email.priority !== 'normal' && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${PRIORITY_CLS[email.priority]}`}>
                              {email.priority}
                            </span>
                          )}
                          {email.aiSentiment && (
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SENTIMENT_DOT[email.aiSentiment] || 'bg-muted-foreground'}`} title={email.aiSentiment} />
                          )}
                        </div>
                      </div>
                      <button
                        onClick={ev => toggleStar(email.id, ev)}
                        className={`shrink-0 mt-0.5 transition-opacity ${email.isStarred ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                      >
                        <Star className={`w-3.5 h-3.5 ${email.isStarred ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination */}
          <div className="shrink-0 flex items-center justify-between px-3 py-2 border-t border-border bg-muted/10">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span className="text-xs text-muted-foreground">Page {page}</span>
            <button
              onClick={() => setPage(p => p + 1)} disabled={emails.length < 20}
              className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ─── DETAIL PANE ─── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* COMPOSE MODE */}
          {composerOpen && !selectedEmail && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-border bg-muted/10">
                <h3 className="font-semibold text-sm text-foreground">New Message</h3>
                <div className="flex items-center gap-1">
                  <button onClick={() => setComposerExpanded(!composerExpanded)}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                    {composerExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => setComposerOpen(false)}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Address fields */}
              <div className="shrink-0 border-b border-border">
                <div className="flex items-center px-5 py-2 border-b border-border/50">
                  <span className="w-10 text-xs font-semibold text-muted-foreground shrink-0">To</span>
                  <input type="text" value={composerTo} onChange={e => setComposerTo(e.target.value)}
                    placeholder="recipient@example.com"
                    className="flex-1 text-sm bg-transparent focus:outline-none text-foreground placeholder:text-muted-foreground/50" />
                  <button onClick={() => setShowCcBcc(!showCcBcc)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-2 shrink-0">Cc / Bcc</button>
                </div>
                {showCcBcc && (
                  <>
                    <div className="flex items-center px-5 py-2 border-b border-border/50">
                      <span className="w-10 text-xs font-semibold text-muted-foreground shrink-0">Cc</span>
                      <input type="text" value={composerCc} onChange={e => setComposerCc(e.target.value)}
                        placeholder="cc@example.com" className="flex-1 text-sm bg-transparent focus:outline-none placeholder:text-muted-foreground/50" />
                    </div>
                    <div className="flex items-center px-5 py-2 border-b border-border/50">
                      <span className="w-10 text-xs font-semibold text-muted-foreground shrink-0">Bcc</span>
                      <input type="text" value={composerBcc} onChange={e => setComposerBcc(e.target.value)}
                        placeholder="bcc@example.com" className="flex-1 text-sm bg-transparent focus:outline-none placeholder:text-muted-foreground/50" />
                    </div>
                  </>
                )}
                <div className="flex items-center px-5 py-2">
                  <span className="w-10 text-xs font-semibold text-muted-foreground shrink-0">Sub</span>
                  <input type="text" value={composerSubject} onChange={e => setComposerSubject(e.target.value)}
                    placeholder="Subject"
                    className="flex-1 text-sm bg-transparent focus:outline-none font-medium placeholder:text-muted-foreground/50" />
                </div>
              </div>

              <FormattingToolbar />
              <div
                ref={bodyRef}
                contentEditable suppressContentEditableWarning
                className="flex-1 px-5 py-4 text-sm text-foreground focus:outline-none overflow-y-auto"
                style={{ minHeight: 120 }}
              />
              <ComposerFooter />
            </div>
          )}

          {/* EMPTY STATE */}
          {!composerOpen && !selectedEmail && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground p-8">
              <div className="w-20 h-20 rounded-full bg-muted/40 flex items-center justify-center">
                <Mail className="w-10 h-10 opacity-20" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground text-base">Select an email to read</p>
                <p className="text-sm mt-1">or start composing a new message</p>
              </div>
              <button
                onClick={openCompose}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 font-medium text-sm transition-colors"
              >
                <Plus className="w-4 h-4" /> Compose Email
              </button>
            </div>
          )}

          {/* EMAIL DETAIL */}
          {selectedEmail && (
            <>
              {/* Header */}
              <div className="shrink-0 px-5 py-4 border-b border-border bg-background">
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{ backgroundColor: avatarColor(selectedEmail.fromName || selectedEmail.from) }}
                  >
                    {getInitials(selectedEmail.fromName || selectedEmail.from)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="font-semibold text-sm text-foreground">
                        {selectedEmail.fromName || parseFromField(selectedEmail.from).name}
                      </span>
                      {selectedEmail.priority !== 'normal' && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0 ${PRIORITY_CLS[selectedEmail.priority]}`}>
                          {selectedEmail.priority}
                        </span>
                      )}
                      {selectedEmail.aiSentiment && (
                        <span className={`w-2 h-2 rounded-full shrink-0 ${SENTIMENT_DOT[selectedEmail.aiSentiment]}`} title={selectedEmail.aiSentiment} />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{selectedEmail.from}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(selectedEmail.receivedAt).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })}
                    </p>
                  </div>
                  {/* Action buttons */}
                  <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                    {selectedEmail.ticketId ? (
                      <span className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/10 text-blue-600 text-xs font-medium border border-blue-400/20">
                        <TicketIcon className="w-3.5 h-3.5" />{selectedEmail.ticketId}
                      </span>
                    ) : (
                      <button
                        onClick={() => openTicketModal(selectedEmail)}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 text-xs font-medium border border-orange-400/20 transition-colors"
                      >
                        <TicketIcon className="w-3.5 h-3.5" /> Raise Ticket
                      </button>
                    )}
                    <button
                      onClick={() => composerOpen ? setComposerOpen(false) : startReply(selectedEmail)}
                      className={`p-1.5 rounded transition-colors ${composerOpen ? 'bg-blue-500/15 text-blue-600' : 'hover:bg-muted text-muted-foreground hover:text-foreground'}`}
                      title="Reply"
                    >
                      <Reply className="w-4 h-4" />
                    </button>
                    <button onClick={() => toggleStar(selectedEmail.id)} className="p-1.5 rounded hover:bg-muted transition-colors">
                      <Star className={`w-4 h-4 ${selectedEmail.isStarred ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
                    </button>
                    <button
                      onClick={() => deleteEmail(selectedEmail.id)}
                      className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <h2 className="font-semibold text-foreground mt-3 text-base leading-snug">{selectedEmail.subject}</h2>
                {selectedEmail.aiProcessed && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {selectedEmail.aiIntent && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 border border-purple-400/20 font-medium">
                        {selectedEmail.aiIntent.replace(/_/g, ' ')}
                      </span>
                    )}
                    {selectedEmail.healthReportSaved && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-400/20 font-medium flex items-center gap-1">
                        <FileText className="w-2.5 h-2.5" /> Report Saved
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Body (scrollable) */}
              <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
                {selectedEmail.aiSummary && (
                  <div className="mb-4 px-3 py-2.5 rounded-lg bg-purple-500/5 border border-purple-400/20 text-xs text-purple-700 dark:text-purple-300 leading-relaxed">
                    <span className="font-semibold">AI Summary: </span>{selectedEmail.aiSummary}
                  </div>
                )}
                <div className="text-sm text-foreground leading-relaxed">
                  {selectedEmail.htmlBody ? (
                    <div
                      className="prose prose-sm max-w-none dark:prose-invert overflow-x-auto"
                      dangerouslySetInnerHTML={{ __html: sanitize(selectedEmail.htmlBody) }}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap font-sans text-sm text-foreground">{selectedEmail.body}</pre>
                  )}
                </div>
                {(selectedEmail.autoUpdatesApplied?.length ?? 0) > 0 && (
                  <div className="mt-6 pt-4 border-t border-border">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">✨ AI Auto Updates Applied</p>
                    <div className="space-y-1">
                      {selectedEmail.autoUpdatesApplied.map((u: any, i: number) => (
                        <div key={i} className="text-xs px-3 py-2 rounded bg-muted border border-border">
                          <span className="font-medium text-foreground">{u.type}: </span>
                          <span className="text-muted-foreground">{u.action}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* REPLY COMPOSER (pinned to bottom) */}
              {composerOpen && (
                <div
                  className="shrink-0 border-t border-border flex flex-col bg-background shadow-[0_-4px_16px_rgba(0,0,0,0.06)] overflow-hidden"
                  style={{ maxHeight: composerExpanded ? '60%' : 'min(340px, 45%)' }}
                >
                  {/* Reply header */}
                  <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/10">
                    <Reply className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="text-xs font-semibold text-foreground flex-1 truncate">
                      Reply to {selectedEmail.fromName || selectedEmail.from}
                    </span>
                    <button onClick={() => setShowCcBcc(!showCcBcc)}
                      className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded hover:bg-muted transition-colors shrink-0">Cc / Bcc</button>
                    <button onClick={() => setComposerExpanded(!composerExpanded)}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                      {composerExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                    </button>
                    <button onClick={() => setComposerOpen(false)}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  {showCcBcc && (
                    <div className="shrink-0 border-b border-border">
                      <div className="flex items-center px-4 py-1.5 border-b border-border/50">
                        <span className="w-8 text-xs font-semibold text-muted-foreground shrink-0">Cc</span>
                        <input type="text" value={composerCc} onChange={e => setComposerCc(e.target.value)}
                          placeholder="cc@example.com" className="flex-1 text-xs bg-transparent focus:outline-none placeholder:text-muted-foreground/40" />
                      </div>
                      <div className="flex items-center px-4 py-1.5">
                        <span className="w-8 text-xs font-semibold text-muted-foreground shrink-0">Bcc</span>
                        <input type="text" value={composerBcc} onChange={e => setComposerBcc(e.target.value)}
                          placeholder="bcc@example.com" className="flex-1 text-xs bg-transparent focus:outline-none placeholder:text-muted-foreground/40" />
                      </div>
                    </div>
                  )}
                  <FormattingToolbar />
                  <div
                    ref={bodyRef}
                    contentEditable suppressContentEditableWarning
                    className="flex-1 px-4 py-2 text-sm text-foreground focus:outline-none overflow-y-auto"
                    style={{ minHeight: 80 }}
                  />
                  <ComposerFooter compact />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ─── Ticket Modal ─── */}
      {showTicketModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background border border-border rounded-xl w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <TicketIcon className="w-4 h-4 text-orange-500" />
                Create Ticket from Email
              </div>
              <button onClick={() => setShowTicketModal(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            {ticketSuccess ? (
              <div className="p-8 text-center">
                <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                <p className="text-emerald-700 dark:text-emerald-400 font-semibold">{ticketSuccess}</p>
                <p className="text-sm text-muted-foreground mt-1">It has been assigned to the team.</p>
                <button onClick={() => setShowTicketModal(false)}
                  className="mt-4 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors">Close</button>
              </div>
            ) : (
              <form onSubmit={submitTicket} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Title</label>
                  <input type="text" required value={ticketForm.title}
                    onChange={e => setTicketForm({ ...ticketForm, title: e.target.value })}
                    className="w-full px-3 py-2 border border-border bg-background text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/50" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Category</label>
                    <select value={ticketForm.category} onChange={e => setTicketForm({ ...ticketForm, category: e.target.value })}
                      className="w-full px-3 py-2 border border-border bg-background text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/50">
                      {[['appointment-cancellation','Appointment Cancellation'],['appointment-reschedule','Reschedule'],
                        ['doctor-consultation','Doctor Consultation'],['health-checkup','Health Checkup'],
                        ['prescription','Prescription'],['health-report','Health Report'],
                        ['billing','Billing'],['complaint','Complaint'],['other','Other']].map(([v,l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Priority</label>
                    <select value={ticketForm.priority} onChange={e => setTicketForm({ ...ticketForm, priority: e.target.value })}
                      className="w-full px-3 py-2 border border-border bg-background text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/50">
                      {[['low','Low'],['medium','Medium'],['high','High'],['critical','Critical']].map(([v,l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Requester Name</label>
                    <input type="text" required value={ticketForm.requesterName}
                      onChange={e => setTicketForm({ ...ticketForm, requesterName: e.target.value })}
                      className="w-full px-3 py-2 border border-border bg-background text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/50" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Requester Email</label>
                    <input type="email" required value={ticketForm.requesterEmail}
                      onChange={e => setTicketForm({ ...ticketForm, requesterEmail: e.target.value })}
                      className="w-full px-3 py-2 border border-border bg-background text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/50" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Description</label>
                  <textarea rows={4} value={ticketForm.description}
                    onChange={e => setTicketForm({ ...ticketForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-border bg-background text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/50 resize-none" />
                </div>
                {ticketError && (
                  <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-3 py-2">{ticketError}</p>
                )}
                <div className="flex gap-2 justify-end pt-2 border-t border-border">
                  <button type="button" onClick={() => setShowTicketModal(false)}
                    className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted text-foreground transition-colors">Cancel</button>
                  <button type="submit" disabled={ticketLoading}
                    className="px-4 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium disabled:opacity-60 flex items-center gap-2 transition-colors">
                    <TicketIcon className="w-3.5 h-3.5" />
                    {ticketLoading ? 'Creating…' : 'Create Ticket'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default EmailInbox;
