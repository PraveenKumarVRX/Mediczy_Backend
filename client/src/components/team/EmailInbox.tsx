import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mail, Star, Trash2, Send, RefreshCw, X, Reply, Ticket as TicketIcon, Zap,
  FileText, Inbox, ChevronLeft, ChevronRight, Loader2, Paperclip,
  Bold, Italic, Underline, Strikethrough, Link2, Quote, PenLine,
  RotateCcw, Maximize2, Minimize2, Plus, Bell, ShieldAlert, Search,
  CheckCircle, Settings, Bot, LayoutTemplate, Wand2, Pencil, Trash, Save, Eye, Code2, Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import { Link as RouterLink } from 'react-router-dom';

// ── Types ──────────────────────────────────────────────────────────
interface Email {
  id: string;
  aiConfidence?: number;
  attachments?: unknown[];
  date?: string;
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
interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
  isShared: boolean;
  createdAt: string;
  attachmentCount?: number;
}
interface TemplateAttachment {
  id: string;
  filename: string;
  contentType: string;
  byteSize: number;
  createdAt: string;
}

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
const TEMPLATE_VARIABLE = /{{\s*([A-Za-z][A-Za-z0-9_.-]{0,79})\s*}}/g;
const templateVariables = (...parts: string[]) => {
  const names = new Set<string>();
  parts.forEach(part => Array.from(String(part || '').matchAll(TEMPLATE_VARIABLE)).forEach(match => names.add(match[1])));
  return [...names];
};
const escapeTemplateValue = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));
const personalizeTemplatePreview = (body: string, values: Record<string, string>) => String(body || '').replace(TEMPLATE_VARIABLE, (_match, key) => key in values ? escapeTemplateValue(values[key] || '') : `{{${key}}}`);
const variableLabel = (key: string) => key.replace(/[_.-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());

// ── FormatButton (outside component to prevent remount) ─────────────
const FormatButton: React.FC<{
  icon: React.ComponentType<any>;
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

  // Template state
  const [showTemplateModal, setShowTemplateModal]     = useState(false);
  const [templates, setTemplates]                     = useState<EmailTemplate[]>([]);
  const [templateLoading, setTemplateLoading]         = useState(false);
  const [editingTemplate, setEditingTemplate]         = useState<EmailTemplate | null>(null);
  const [showTemplatePicker, setShowTemplatePicker]   = useState(false);
  const [tmplForm, setTmplForm]                       = useState({ name: '', subject: '', body: '', category: 'general' });
  const [tmplSaveLoading, setTmplSaveLoading]         = useState(false);
  const [templateStudioMode, setTemplateStudioMode]   = useState<'visual' | 'html'>('visual');
  const templateCanvasRef                              = useRef<HTMLIFrameElement>(null);
  const [showTemplateTest, setShowTemplateTest]       = useState(false);
  const [testRecipient, setTestRecipient]             = useState('');
  const [testVariables, setTestVariables]             = useState<Record<string, string>>({});
  const [testIncludeAttachments, setTestIncludeAttachments] = useState(true);
  const [testSending, setTestSending]                 = useState(false);
  const [templateAttachments, setTemplateAttachments] = useState<TemplateAttachment[]>([]);
  const [attachmentBusy, setAttachmentBusy]           = useState(false);
  const attachmentInputRef                            = useRef<HTMLInputElement>(null);

  // Bot reply state
  const [botReplyLoading, setBotReplyLoading]         = useState(false);

  // AI ticket state
  const [aiTicketLoading, setAiTicketLoading]         = useState(false);

  // Maximize / fullscreen reading pane
  const [emailMaximized, setEmailMaximized]           = useState(false);

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
      const res = await api.post('/team/emails/send', fd);
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

  // ── Templates ────────────────────────────────────────────────────
  const fetchTemplates = async () => {
    setTemplateLoading(true);
    try {
      const res = await api.get('/team/emails/templates');
      if (res.data.success) setTemplates(res.data.data);
    } catch (err) { console.error('fetchTemplates:', err); }
    finally { setTemplateLoading(false); }
  };

  const openTemplateModal = () => {
    setEditingTemplate(null);
    setTemplateAttachments([]);
    setTmplForm({ name: '', subject: '', body: '', category: 'general' });
    setTemplateStudioMode('visual');
    fetchTemplates();
    setShowTemplateModal(true);
  };

  const editTemplate = (t: EmailTemplate) => {
    setEditingTemplate(t);
    setTmplForm({ name: t.name, subject: t.subject || '', body: t.body || '', category: t.category || 'general' });
    setTemplateStudioMode('visual');
    fetchTemplateAttachments(t.id);
  };

  // ── Template attachments ─────────────────────────────────────────
  // A file uploaded here is stored against the template and goes out as a real
  // attachment with every send of it — the test send and the automated welcome
  // email alike. Nothing is generated at send time.
  const fetchTemplateAttachments = async (templateId: string) => {
    setTemplateAttachments([]);
    try {
      const res = await api.get(`/team/emails/templates/${templateId}/attachments`);
      if (res.data.success) setTemplateAttachments(res.data.data || []);
    } catch (err) { console.error('fetchTemplateAttachments:', err); }
  };

  const uploadTemplateAttachment = async (file: File | undefined) => {
    if (!file || !editingTemplate) return;
    setAttachmentBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post(`/team/emails/templates/${editingTemplate.id}/attachments`, form);
      if (res.data.success) {
        await fetchTemplateAttachments(editingTemplate.id);
        setTemplates(prev => prev.map(t => t.id === editingTemplate.id
          ? { ...t, attachmentCount: (t.attachmentCount || 0) + 1 } : t));
        toast({ title: 'File attached', description: res.data.message || `${file.name} will be sent with this template.` });
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Attachment rejected', description: error?.response?.data?.message || 'Unable to attach that file.' });
    } finally {
      setAttachmentBusy(false);
      if (attachmentInputRef.current) attachmentInputRef.current.value = '';
    }
  };

  const removeTemplateAttachment = async (attachmentId: string) => {
    if (!editingTemplate) return;
    setAttachmentBusy(true);
    try {
      await api.delete(`/team/emails/templates/${editingTemplate.id}/attachments/${attachmentId}`);
      setTemplateAttachments(prev => prev.filter(a => a.id !== attachmentId));
      setTemplates(prev => prev.map(t => t.id === editingTemplate.id
        ? { ...t, attachmentCount: Math.max(0, (t.attachmentCount || 1) - 1) } : t));
      toast({ title: 'Attachment removed' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not remove', description: error?.response?.data?.message || 'Unable to remove the attachment.' });
    } finally { setAttachmentBusy(false); }
  };

  const downloadTemplateAttachment = async (attachment: TemplateAttachment) => {
    if (!editingTemplate) return;
    try {
      const res = await api.get(`/team/emails/templates/${editingTemplate.id}/attachments/${attachment.id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const link = document.createElement('a');
      link.href = url; link.download = attachment.filename;
      document.body.appendChild(link); link.click(); link.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({ variant: 'destructive', title: 'Download failed', description: 'Unable to download that attachment.' });
    }
  };

  const readVisualTemplate = () => {
    const document = templateCanvasRef.current?.contentDocument;
    if (!document?.body) return tmplForm.body;
    document.body.removeAttribute('contenteditable');
    const html = `<!doctype html>${document.documentElement.outerHTML}`;
    document.body.setAttribute('contenteditable', 'true');
    return html;
  };

  const switchTemplateStudioMode = (mode: 'visual' | 'html') => {
    if (templateStudioMode === 'visual') setTmplForm(form => ({ ...form, body: readVisualTemplate() }));
    setTemplateStudioMode(mode);
  };

  const openTemplateTest = () => {
    if (!editingTemplate) {
      toast({ variant: 'destructive', title: 'Save the template first', description: 'Save a new template before sending a test email.' });
      return;
    }
    const body = templateStudioMode === 'visual' ? readVisualTemplate() : tmplForm.body;
    const variables = templateVariables(tmplForm.subject, body);
    setTmplForm(form => ({ ...form, body }));
    setTestVariables(existing => Object.fromEntries(variables.map(name => [name, existing[name] || ''])));
    setTestIncludeAttachments(true);
    setShowTemplateTest(true);
  };

  const sendTemplateTest = async () => {
    if (!editingTemplate) return;
    const body = templateStudioMode === 'visual' ? readVisualTemplate() : tmplForm.body;
    const required = templateVariables(tmplForm.subject, body);
    const missing = required.filter(name => !testVariables[name]?.trim());
    if (!testRecipient.trim() || missing.length) {
      toast({ variant: 'destructive', title: 'Complete the test details', description: missing.length ? `Fill: ${missing.map(variableLabel).join(', ')}` : 'Enter a test email address.' });
      return;
    }
    setTestSending(true);
    try {
      const response = await api.post(`/team/emails/templates/${editingTemplate.id}/test`, { to: testRecipient.trim(), variables: testVariables, subject: tmplForm.subject, body, includeAttachments: testIncludeAttachments });
      if (response.data.success) {
        setShowTemplateTest(false);
        const sentFiles = response.data?.data?.attachmentCount ?? 0;
        toast({ title: 'Test email sent', description: `A personalised [TEST] copy${sentFiles ? ` with ${sentFiles} attachment${sentFiles === 1 ? '' : 's'}` : ''} was sent to ${testRecipient.trim()}.` });
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Test send failed', description: error?.response?.data?.message || 'Unable to send the test email.' });
    } finally { setTestSending(false); }
  };

  const saveTemplate = async () => {
    if (!tmplForm.name.trim()) {
      toast({ variant: 'destructive', title: 'Name required', description: 'Please enter a template name.' });
      return;
    }
    setTmplSaveLoading(true);
    try {
      const body = templateStudioMode === 'visual' ? readVisualTemplate() : tmplForm.body;
      const payload = { ...tmplForm, body };
      if (editingTemplate) {
        const res = await api.put(`/team/emails/templates/${editingTemplate.id}`, payload);
        if (res.data.success) {
          setTemplates(prev => prev.map(t => t.id === editingTemplate.id ? res.data.data : t));
          toast({ title: 'Template updated' });
        }
      } else {
        const res = await api.post('/team/emails/templates', payload);
        if (res.data.success) {
          setTemplates(prev => [res.data.data, ...prev]);
          toast({ title: 'Template created' });
        }
      }
      setEditingTemplate(null);
      setTmplForm({ name: '', subject: '', body: '', category: 'general' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: err?.response?.data?.message || 'Unable to save template.' });
    } finally { setTmplSaveLoading(false); }
  };

  const deleteTemplate = async (id: string) => {
    try {
      await api.delete(`/team/emails/templates/${id}`);
      setTemplates(prev => prev.filter(t => t.id !== id));
      if (editingTemplate?.id === id) { setEditingTemplate(null); setTemplateAttachments([]); setTmplForm({ name: '', subject: '', body: '', category: 'general' }); }
      toast({ title: 'Template deleted' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Delete failed', description: err?.response?.data?.message || 'Unable to delete.' });
    }
  };

  const applyTemplate = (t: EmailTemplate) => {
    if (t.subject) setComposerSubject(t.subject);
    if (t.body) setTimeout(() => { setBodyContent(t.body.replace(/\n/g, '<br/>')); }, 30);
    setShowTemplatePicker(false);
    toast({ title: `Template "${t.name}" applied` });
  };

  // ── Bot Reply ────────────────────────────────────────────────────
  const generateBotReply = async () => {
    if (!selectedEmail) return;
    setBotReplyLoading(true);
    try {
      const res = await api.post(`/team/emails/${selectedEmail.id}/bot-reply`);
      if (res.data.success && res.data.data.suggestedReply) {
        const current = bodyRef.current?.innerHTML || '';
        const quoteBlock = current.includes('style="border-left') ? '' : '';
        const suggestion = res.data.data.suggestedReply.replace(/\n/g, '<br/>');
        setBodyContent(`<p>${suggestion}</p>${current ? current : '<p><br/></p>'}`);
        toast({ title: '🤖 AI Reply generated', description: 'Review and edit before sending.' });
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Bot reply failed', description: err?.response?.data?.message || 'Unable to generate reply.' });
    } finally { setBotReplyLoading(false); }
  };

  // ── AI Ticket Suggest ────────────────────────────────────────────
  const generateAITicket = async () => {
    if (!selectedEmail) return;
    setAiTicketLoading(true);
    try {
      const res = await api.post(`/team/emails/${selectedEmail.id}/ai-ticket`);
      if (res.data.success && res.data.data) {
        const d = res.data.data;
        const s = parseFromField(selectedEmail.from);
        setTicketForm(prev => ({
          ...prev,
          title:        d.title       || prev.title,
          description:  d.description || prev.description,
          category:     d.category    || prev.category,
          priority:     d.priority    || prev.priority,
        }));
        toast({ title: '✨ AI filled ticket fields', description: 'Review before submitting.' });
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'AI fill failed', description: err?.response?.data?.message || 'Unable to generate suggestion.' });
    } finally { setAiTicketLoading(false); }
  };

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
        {/* Template picker */}
        <div className="relative">
          <button
            type="button"
            title="Use email template"
            onClick={() => { if (!showTemplatePicker) fetchTemplates(); setShowTemplatePicker(v => !v); }}
            className={`p-1.5 rounded hover:bg-muted transition-colors ${showTemplatePicker ? 'text-purple-500' : 'text-muted-foreground'}`}
          >
            <LayoutTemplate className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
          </button>
          {showTemplatePicker && (
            <div className="absolute bottom-full mb-2 left-0 w-64 bg-background border border-border rounded-xl shadow-xl z-50 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/20">
                <span className="text-xs font-semibold text-foreground">Email Templates</span>
                <button onClick={() => setShowTemplatePicker(false)}><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
              </div>
              {templateLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
              ) : templates.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-xs text-muted-foreground">No templates yet</p>
                  <button onClick={() => { setShowTemplatePicker(false); openTemplateModal(); }}
                    className="mt-2 text-xs text-blue-600 hover:underline">Create one</button>
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto">
                  {templates.map(t => (
                    <button
                      key={t.id}
                      onClick={() => applyTemplate(t)}
                      className="w-full text-left px-3 py-2.5 hover:bg-muted/60 border-b border-border/50 last:border-0 transition-colors"
                    >
                      <p className="text-xs font-semibold text-foreground truncate">{t.name}</p>
                      {t.subject && <p className="text-[10px] text-muted-foreground truncate mt-0.5">Sub: {t.subject}</p>}
                    </button>
                  ))}
                </div>
              )}
              <div className="px-3 py-2 border-t border-border bg-muted/10">
                <button onClick={() => { setShowTemplatePicker(false); openTemplateModal(); }}
                  className="text-xs text-purple-600 hover:underline font-medium">+ Manage Templates</button>
              </div>
            </div>
          )}
        </div>
        {/* AI Bot Reply – only in reply mode */}
        {(compact || composerMode === 'reply') && (
          <button
            type="button"
            title="Generate AI reply suggestion"
            onClick={generateBotReply}
            disabled={botReplyLoading}
            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-emerald-600 disabled:opacity-50"
          >
            {botReplyLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />}
          </button>
        )}
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

      {/* ── Mail workspace ── */}
      <div className="flex min-h-[calc(100dvh-8rem)] flex-col overflow-hidden rounded-[26px] border border-slate-200/80 bg-card shadow-[0_28px_80px_-42px_rgba(15,23,42,0.9)] dark:border-slate-700/70 lg:h-[calc(100vh-10rem)] lg:min-h-[42rem]">
        <header className="flex shrink-0 flex-col gap-4 border-b border-slate-200/80 bg-gradient-to-r from-white via-white to-teal-50/60 px-5 py-4 dark:border-slate-700/70 dark:from-slate-950 dark:via-slate-950 dark:to-teal-950/20 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-lg shadow-teal-500/20">
              <Mail className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">Mail center</h1>
                <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-teal-700 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300">Team workspace</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Triage, respond, and turn important conversations into action.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button onClick={syncEmails} disabled={syncing} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-teal-300 hover:text-teal-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-teal-500/50 dark:hover:text-teal-300">
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing' : 'Sync'}
            </button>
            <button onClick={openTemplateModal} className="hidden h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-teal-300 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 sm:inline-flex">
              <LayoutTemplate className="h-3.5 w-3.5" /> Templates
            </button>
            <button onClick={openCompose} className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 px-4 text-sm font-semibold text-white shadow-lg shadow-teal-600/20 transition hover:from-teal-700 hover:to-cyan-700">
              <Plus className="h-4 w-4" /> Compose
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ─── SIDEBAR ─── */}
        <aside className={`${selectedEmail || composerOpen ? 'hidden lg:flex' : 'flex'} w-full shrink-0 flex-col border-b border-slate-700/70 bg-slate-950 text-slate-300 lg:w-[13rem] lg:border-b-0 lg:border-r lg:overflow-y-auto`}>
          {/* Compose button */}
          <div className="p-3.5 border-b border-slate-800 shrink-0">
            <button
              onClick={openCompose}
              className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-white font-semibold text-sm transition-all shadow-lg shadow-cyan-950/30"
            >
              <Plus className="w-4 h-4" /> Compose
            </button>
          </div>

          {/* Folder nav */}
          <nav className="flex shrink-0 gap-1 overflow-x-auto px-2 py-3 lg:block lg:px-2">
            {FOLDERS.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => { setFolder(key); setPage(1); setSelectedEmail(null); setComposerOpen(false); }}
                className={`flex min-w-max items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors lg:mb-1 lg:w-full ${
                  folder === key
                    ? 'bg-teal-400/15 text-teal-200 ring-1 ring-inset ring-teal-300/15'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left">{label}</span>
                {key === 'inbox' && (stats?.unread ?? 0) > 0 && (
                  <span className="text-[10px] font-bold bg-teal-400 text-slate-950 rounded-full px-1.5 py-0.5 leading-none">
                    {stats!.unread > 99 ? '99+' : stats!.unread}
                  </span>
                )}
              </button>
            ))}
            <div className="mx-2 hidden w-px self-stretch bg-border lg:mx-2 lg:my-3 lg:block lg:h-px lg:w-auto lg:bg-slate-800" />
            <RouterLink
              to="/team/settings"
              className="flex min-w-max items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 lg:w-full"
            >
              <Settings className="w-4 h-4 shrink-0" /> SMTP Settings
            </RouterLink>
            <button
              onClick={openTemplateModal}
              className="flex min-w-max items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 lg:w-full"
            >
              <LayoutTemplate className="w-4 h-4 shrink-0" /> Email Templates
            </button>
          </nav>

          {/* Stats + AI actions */}
          {stats && (
            <div className="mt-auto hidden px-3 pb-3 lg:block">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3">
                <p className="text-[10px] uppercase tracking-[0.14em] font-semibold text-slate-500 mb-2">Mailbox health</p>
                <div className="grid grid-cols-2 gap-1.5 mb-3">
                  <div className="rounded-xl bg-slate-950 border border-slate-800 p-2 text-center">
                    <div className="text-lg font-bold text-slate-100 leading-none">{stats.total}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Total</div>
                  </div>
                  <div className="rounded-xl bg-slate-950 border border-slate-800 p-2 text-center">
                    <div className="text-lg font-bold text-teal-300 leading-none">{stats.unread}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Unread</div>
                  </div>
                </div>
                {Object.keys(stats.bySentiment).length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Sentiment</p>
                    {Object.entries(stats.bySentiment).map(([s, c]) => (
                      <div key={s}>
                        <div className="flex justify-between text-[10px] mb-0.5">
                          <span className="capitalize text-slate-400">{s}</span>
                          <span className="font-semibold text-slate-200">{c}</span>
                        </div>
                        <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
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
              <div className="border-t border-slate-800 mt-3 pt-2 space-y-1">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">Productivity</p>
                <button
                  onClick={syncEmails} disabled={syncing}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing…' : 'Sync Emails'}
                </button>
                <button
                  onClick={processAllEmails} disabled={processing}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium text-amber-300 hover:bg-amber-400/10 transition-colors disabled:opacity-50"
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
        <div className={`${selectedEmail || composerOpen ? 'hidden lg:flex' : 'flex'} w-full shrink-0 flex-col border-b border-slate-200 bg-background min-w-0 overflow-hidden dark:border-slate-800 lg:w-[20rem] xl:w-[22rem] lg:border-b-0 lg:border-r`}>
          {/* Search + filter bar */}
          <div className="shrink-0 space-y-3 border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-base font-semibold tracking-tight text-foreground">{FOLDERS.find(item => item.key === folder)?.label || 'Inbox'}</p>
                <p className="text-xs text-muted-foreground">{stats?.unread ? `${stats.unread.toLocaleString()} conversations need attention` : 'You are all caught up'}</p>
              </div>
              <button onClick={fetchInbox} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-teal-500/40 dark:hover:bg-teal-500/10 dark:hover:text-teal-300" aria-label="Refresh email list">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search emails…"
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-foreground transition-colors placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-slate-700 dark:bg-slate-900/70 dark:placeholder:text-slate-500 dark:focus:bg-slate-900"
              />
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => { setUnreadOnly(!unreadOnly); setPage(1); }}
                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                  unreadOnly ? 'bg-teal-500/15 text-teal-700 dark:text-teal-300' : 'bg-slate-100 text-slate-500 hover:text-slate-900 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                Unread {stats?.unread ? `(${stats.unread})` : ''}
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
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectEmail(email); }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-current={isSelected ? 'true' : undefined}
                    className={`group relative cursor-pointer select-none border-b border-slate-100 px-4 py-4 transition-all dark:border-slate-800 ${
                      isSelected
                        ? 'border-l-[3px] border-l-teal-500 bg-teal-500/[0.08] shadow-[inset_0_1px_0_rgba(20,184,166,.08)]'
                        : email.isRead
                        ? 'hover:bg-slate-50 dark:hover:bg-slate-900/60'
                        : 'bg-teal-500/[0.035] hover:bg-teal-500/[0.08]'
                    }`}
                  >
                    {!email.isRead && !isSelected && (
                      <div className="absolute left-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-teal-500" />
                    )}
                    <div className="flex items-start gap-3 pl-1">
                      <div
                        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white shadow-sm"
                        style={{ backgroundColor: color }}
                      >
                        {getInitials(email.fromName || email.from)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className={`truncate text-sm leading-snug ${email.isRead ? 'font-medium text-foreground' : 'font-bold text-foreground'}`}>
                            {email.fromName || email.from}
                          </span>
                          <span className="shrink-0 text-[10px] font-medium text-muted-foreground">{timeAgo(email.receivedAt)}</span>
                        </div>
                        <p className={`mb-1 truncate text-xs ${email.isRead ? 'text-muted-foreground' : 'font-medium text-foreground'}`}>
                          {email.subject}
                        </p>
                        {(email.aiSummary || email.body) && (
                          <p className="mb-1 truncate text-[11px] leading-relaxed text-muted-foreground/80">
                            {(email.aiSummary || email.body).replace(/\s+/g, ' ').trim()}
                          </p>
                        )}
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
                        aria-label={email.isStarred ? `Remove star from ${email.subject}` : `Star ${email.subject}`}
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
          <div className="shrink-0 flex items-center justify-between border-t border-slate-200 bg-slate-50/80 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-950/60">
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
        <div className={`${!selectedEmail && !composerOpen ? 'hidden lg:flex' : 'flex'} min-w-0 flex-1 flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/30`}>

          {/* COMPOSE MODE */}
          {composerOpen && !selectedEmail && (
            <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-slate-950">
              <div className="shrink-0 flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/50">
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
            <div className="flex-1 flex flex-col items-center justify-center gap-5 text-muted-foreground p-8">
              <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-gradient-to-br from-teal-100 to-cyan-100 text-teal-600 shadow-lg shadow-teal-900/5 dark:from-teal-500/15 dark:to-cyan-500/10 dark:text-teal-300">
                <Mail className="h-9 w-9" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground text-lg">Your mailbox, with room to think</p>
                <p className="text-sm mt-1 max-w-xs">Select a conversation to review its details, or start a new message.</p>
              </div>
              <button
                onClick={openCompose}
                className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-600/20 transition-colors hover:bg-teal-700"
              >
                <Plus className="w-4 h-4" /> Compose Email
              </button>
            </div>
          )}

          {/* EMAIL DETAIL */}
          {selectedEmail && (
            <>
              {/* Header */}
              <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-5 dark:border-slate-800 dark:bg-slate-950 sm:px-6">
                <button onClick={() => { setSelectedEmail(null); setComposerOpen(false); }} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-primary lg:hidden">
                  <ChevronLeft className="h-3.5 w-3.5" /> Back to inbox
                </button>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
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
                  </div>
                  {/* Action buttons */}
                  <div className="flex items-center gap-1 self-end shrink-0 flex-wrap justify-end xl:self-auto">
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
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${composerOpen ? 'bg-blue-500/15 text-blue-600' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                    >
                      <Reply className="w-4 h-4" /> Reply
                    </button>
                    <button onClick={() => toggleStar(selectedEmail.id)} aria-label={selectedEmail.isStarred ? 'Remove star' : 'Star email'} className="p-1.5 rounded hover:bg-muted transition-colors">
                      <Star className={`w-4 h-4 ${selectedEmail.isStarred ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
                    </button>
                    <button
                      onClick={() => setEmailMaximized(true)}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="Open fullscreen"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteEmail(selectedEmail.id)}
                      aria-label="Delete email"
                      className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <h2 className="mt-4 text-lg font-semibold leading-snug tracking-tight text-foreground">{selectedEmail.subject}</h2>
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
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                {selectedEmail.aiSummary && (
                  <div className="mb-5 rounded-2xl border border-violet-200 bg-violet-50/70 px-4 py-3 text-xs leading-relaxed text-violet-800 dark:border-violet-400/20 dark:bg-violet-500/10 dark:text-violet-200">
                    <span className="font-semibold">AI briefing · </span>{selectedEmail.aiSummary}
                  </div>
                )}
                <div className="text-sm text-foreground leading-relaxed">
                  {selectedEmail.htmlBody ? (
                    <div
                      className="email-html-body overflow-x-auto rounded-2xl border border-slate-200 shadow-sm dark:border-slate-700"
                      style={{
                        colorScheme: 'light',
                        backgroundColor: '#ffffff',
                        color: '#111111',
                          borderRadius: '1rem',
                          padding: '1.5rem',
                      }}
                      dangerouslySetInnerHTML={{ __html: sanitize(selectedEmail.htmlBody) }}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap font-sans text-sm text-foreground">{selectedEmail.body}</pre>
                  )}
                </div>
                {/* Attachments in reading pane */}
                {Array.isArray(selectedEmail.attachments) && selectedEmail.attachments.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Paperclip className="w-3.5 h-3.5" />
                      {selectedEmail.attachments.length} Attachment{selectedEmail.attachments.length !== 1 ? 's' : ''}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedEmail.attachments.map((att: any, i: number) => {
                        const name = att.filename || att.fileName || att.name || `Attachment ${i + 1}`;
                        const url = att.downloadUrl || att.url || null;
                        const size = att.size ? `${Math.round(att.size / 1024)} KB` : '';
                        const isPdf = /\.pdf$/i.test(name) || att.mimeType === 'application/pdf';
                        return (
                          <a
                            key={i}
                            href={url || '#'}
                            target={url ? '_blank' : undefined}
                            rel="noopener noreferrer"
                            onClick={!url ? (e) => e.preventDefault() : undefined}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 border border-border text-xs font-medium text-foreground transition-colors max-w-[240px] group"
                            title={name}
                          >
                            <FileText className={`w-4 h-4 shrink-0 ${isPdf ? 'text-red-500' : 'text-blue-500'}`} />
                            <span className="truncate flex-1">{name}</span>
                            {size && <span className="text-muted-foreground shrink-0">{size}</span>}
                            {url && <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0 group-hover:text-foreground" />}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
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
      </div>

      {/* ─── Fullscreen Email Modal ─── */}
      {emailMaximized && selectedEmail && (
        <div className="fixed inset-0 z-[60] bg-background flex flex-col">
          {/* Header */}
          <div className="shrink-0 flex items-start gap-3 px-6 py-4 border-b border-border bg-background/95 backdrop-blur-sm">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <span className="font-semibold text-foreground truncate">{selectedEmail.fromName || selectedEmail.from}</span>
                {selectedEmail.fromName && <span className="truncate hidden sm:inline">&lt;{selectedEmail.from}&gt;</span>}
                <span className="shrink-0 ml-auto">
                  {selectedEmail.date ? new Date(selectedEmail.date).toLocaleString() : ''}
                </span>
              </div>
              <h2 className="font-bold text-foreground text-lg leading-snug truncate">{selectedEmail.subject}</h2>
              {selectedEmail.aiProcessed && (
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {selectedEmail.aiIntent && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 border border-purple-400/20 font-medium">
                      {selectedEmail.aiIntent.replace(/_/g, ' ')}
                    </span>
                  )}
                  {selectedEmail.aiConfidence && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
                      selectedEmail.aiConfidence === 'high' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-400/20' :
                      selectedEmail.aiConfidence === 'medium' ? 'bg-yellow-500/10 text-yellow-600 border-yellow-400/20' :
                      'bg-red-500/10 text-red-600 border-red-400/20'
                    }`}>{selectedEmail.aiConfidence} confidence</span>
                  )}
                </div>
              )}
            </div>
            {/* Action buttons */}
            <div className="shrink-0 flex items-center gap-1">
              <button
                onClick={() => composerOpen ? setComposerOpen(false) : startReply(selectedEmail)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${composerOpen ? 'bg-blue-500/15 text-blue-600' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                title="Reply"
              >
                <Reply className="w-3.5 h-3.5" /> Reply
              </button>
              <button onClick={() => toggleStar(selectedEmail.id)} className="p-2 rounded-lg hover:bg-muted transition-colors">
                <Star className={`w-4 h-4 ${selectedEmail.isStarred ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
              </button>
              <button
                onClick={() => { deleteEmail(selectedEmail.id); setEmailMaximized(false); }}
                className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setEmailMaximized(false)}
                className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors ml-2"
                title="Exit fullscreen"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {selectedEmail.htmlBody ? (
              <div
                style={{
                  colorScheme: 'light',
                  backgroundColor: '#ffffff',
                  color: '#111111',
                  borderRadius: '0.5rem',
                  padding: '1.5rem',
                }}
                dangerouslySetInnerHTML={{ __html: sanitize(selectedEmail.htmlBody) }}
              />
            ) : (
              <pre className="whitespace-pre-wrap font-sans text-sm text-foreground">{selectedEmail.body}</pre>
            )}

            {/* Attachments */}
            {Array.isArray(selectedEmail.attachments) && selectedEmail.attachments.length > 0 && (
              <div className="mt-6 pt-5 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5" />
                  {selectedEmail.attachments.length} Attachment{selectedEmail.attachments.length !== 1 ? 's' : ''}
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedEmail.attachments.map((att: any, i: number) => {
                    const name = att.filename || att.fileName || att.name || `Attachment ${i + 1}`;
                    const url = att.downloadUrl || att.url || null;
                    const size = att.size ? `${Math.round(att.size / 1024)} KB` : '';
                    const isPdf = /\.pdf$/i.test(name) || att.mimeType === 'application/pdf';
                    return (
                      <a
                        key={i}
                        href={url || '#'}
                        target={url ? '_blank' : undefined}
                        rel="noopener noreferrer"
                        onClick={!url ? (e) => e.preventDefault() : undefined}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 border border-border text-xs font-medium text-foreground transition-colors max-w-[280px] group"
                        title={name}
                      >
                        <FileText className={`w-4 h-4 shrink-0 ${isPdf ? 'text-red-500' : 'text-blue-500'}`} />
                        <span className="truncate flex-1">{name}</span>
                        {size && <span className="text-muted-foreground shrink-0">{size}</span>}
                        {url && <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0 group-hover:text-foreground" />}
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Reply composer pinned at bottom */}
          {composerOpen && (
            <div
              className="shrink-0 border-t border-border flex flex-col bg-background shadow-[0_-4px_16px_rgba(0,0,0,0.06)] overflow-hidden"
              style={{ maxHeight: composerExpanded ? '55%' : 'min(380px, 48%)' }}
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
        </div>
      )}

      {/* ─── Ticket Modal ─── */}
      {showTicketModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background border border-border rounded-xl w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <TicketIcon className="w-4 h-4 text-orange-500" />
                Create Ticket from Email
              </div>
              <div className="flex items-center gap-2">
                {selectedEmail && !ticketSuccess && (
                  <button
                    type="button"
                    onClick={generateAITicket}
                    disabled={aiTicketLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 border border-purple-400/20 transition-colors disabled:opacity-50"
                  >
                    {aiTicketLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                    {aiTicketLoading ? 'Analyzing…' : '✨ AI Fill'}
                  </button>
                )}
                <button onClick={() => setShowTicketModal(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
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
      {/* ─── Template Management Modal ─── */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background border border-border rounded-2xl w-full max-w-6xl shadow-2xl flex flex-col" style={{ height: '88vh' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2 font-semibold">
                <LayoutTemplate className="w-5 h-5 text-purple-500" />
                Email Templates
              </div>
              <button onClick={() => setShowTemplateModal(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-1 min-h-0">
              {/* Left — template list */}
              <div className="w-64 shrink-0 border-r border-border flex flex-col">
                <div className="p-3 border-b border-border shrink-0">
                  <button
                    onClick={() => { setEditingTemplate(null); setTemplateAttachments([]); setTmplForm({ name: '', subject: '', body: '', category: 'general' }); }}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors"
                  >
                    <Plus className="w-4 h-4" /> New Template
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {templateLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                  ) : templates.length === 0 ? (
                    <div className="py-10 text-center text-muted-foreground">
                      <LayoutTemplate className="w-8 h-8 opacity-20 mx-auto mb-2" />
                      <p className="text-sm">No templates yet</p>
                    </div>
                  ) : (
                    templates.map(t => (
                      <div
                        key={t.id}
                        className={`group px-3 py-3 border-b border-border cursor-pointer transition-colors ${
                          editingTemplate?.id === t.id ? 'bg-purple-500/10 border-l-2 border-l-purple-500' : 'hover:bg-muted/50'
                        }`}
                        onClick={() => editTemplate(t)}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-sm font-medium text-foreground truncate flex-1">{t.name}</p>
                          <button
                            onClick={e => { e.stopPropagation(); deleteTemplate(t.id); }}
                            className="shrink-0 opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500 text-muted-foreground transition-all"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {t.subject && <p className="text-[11px] text-muted-foreground truncate mt-0.5">Sub: {t.subject}</p>}
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground inline-block">{t.category}</span>
                          {!!t.attachmentCount && (
                            <span className="inline-flex items-center gap-1 rounded bg-teal-50 px-1.5 py-0.5 text-[10px] text-teal-700 dark:bg-teal-500/10 dark:text-teal-200">
                              <Paperclip className="h-2.5 w-2.5" />{t.attachmentCount}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Right — template studio */}
              <div className="flex-1 min-w-0 overflow-y-auto p-5">
                <div className="mb-5 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{editingTemplate ? `Editing ${editingTemplate.name}` : 'New email template'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Edit copy on the canvas, inspect the exact email rendering, or use HTML source for advanced changes.</p>
                  </div>
                  <div className="inline-flex rounded-xl bg-muted p-1">
                    <button onClick={() => switchTemplateStudioMode('visual')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${templateStudioMode === 'visual' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                      <Eye className="h-3.5 w-3.5" /> Visual edit
                    </button>
                    <button onClick={() => switchTemplateStudioMode('html')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${templateStudioMode === 'html' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                      <Code2 className="h-3.5 w-3.5" /> HTML source
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-muted-foreground">Template name *</label>
                      <input type="text" value={tmplForm.name} onChange={e => setTmplForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Appointment Reminder" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-teal-400/50" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-muted-foreground">Subject line</label>
                      <input type="text" value={tmplForm.subject} onChange={e => setTmplForm(p => ({ ...p, subject: e.target.value }))} placeholder="Subject (optional)" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-teal-400/50" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-muted-foreground">Category</label>
                      <select value={tmplForm.category} onChange={e => setTmplForm(p => ({ ...p, category: e.target.value }))} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-teal-400/50">
                        {[['general','General'],['corporate_ahc','Corporate AHC'],['appointment','Appointment'],['billing','Billing'],['health-report','Health Report'],['prescription','Prescription'],['follow-up','Follow-up'],['support','Support'],['other','Other']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <label className="block text-xs font-semibold text-muted-foreground">Attachments</label>
                        <span className="text-[10px] text-muted-foreground">PDF, PNG, JPEG, DOCX, XLSX · up to 10 MB each</span>
                      </div>
                      {editingTemplate ? (
                        <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
                          {templateAttachments.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No file attached. A file added here is sent with every copy of this template — including the automated welcome email.</p>
                          ) : (
                            <ul className="space-y-1.5">
                              {templateAttachments.map(attachment => (
                                <li key={attachment.id} className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2">
                                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-300" />
                                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{attachment.filename}</span>
                                  <span className="shrink-0 text-[10px] text-muted-foreground">{Math.max(1, Math.round(attachment.byteSize / 1024))} KB</span>
                                  <button type="button" onClick={() => downloadTemplateAttachment(attachment)} title="Download" className="shrink-0 p-0.5 text-muted-foreground transition hover:text-teal-600">
                                    <Download className="h-3.5 w-3.5" />
                                  </button>
                                  <button type="button" disabled={attachmentBusy} onClick={() => removeTemplateAttachment(attachment.id)} title="Remove" className="shrink-0 p-0.5 text-muted-foreground transition hover:text-red-500 disabled:opacity-40">
                                    <Trash className="h-3.5 w-3.5" />
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                          <input ref={attachmentInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx" onChange={event => uploadTemplateAttachment(event.target.files?.[0])} className="hidden" />
                          <button type="button" disabled={attachmentBusy} onClick={() => attachmentInputRef.current?.click()} className="flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 transition hover:bg-teal-100 disabled:opacity-50 dark:border-teal-500/25 dark:bg-teal-500/10 dark:text-teal-200">
                            {attachmentBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                            {templateAttachments.length ? 'Attach another file' : 'Attach a file'}
                          </button>
                        </div>
                      ) : (
                        <p className="rounded-xl border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">Save the template first, then attach the file that should go out with it.</p>
                      )}
                    </div>

                    {templateStudioMode === 'html' ? (
                      <div>
                        <div className="mb-1 flex items-center justify-between gap-2"><label className="block text-xs font-semibold text-muted-foreground">HTML source</label><span className="text-[10px] text-muted-foreground">Keep placeholders such as {'{{employee_name}}'} intact.</span></div>
                        <textarea rows={18} value={tmplForm.body} onChange={e => setTmplForm(p => ({ ...p, body: e.target.value }))} placeholder="Paste or write HTML email markup…" className="w-full resize-y rounded-xl border border-border bg-slate-950 px-3 py-3 font-mono text-xs leading-relaxed text-emerald-200 focus:outline-none focus:ring-2 focus:ring-teal-400/50" />
                      </div>
                    ) : (
                      <div>
                        <div className="mb-1 flex items-center justify-between gap-2"><label className="block text-xs font-semibold text-muted-foreground">Visual editor</label><span className="text-[10px] text-teal-600 dark:text-teal-300">Edit wording directly; the email layout is preserved.</span></div>
                        <div className="overflow-hidden rounded-xl border border-teal-200 bg-slate-100 p-2 dark:border-teal-500/20 dark:bg-slate-950">
                          <iframe ref={templateCanvasRef} key={`edit-${editingTemplate?.id || 'new'}-${tmplForm.body.length}`} srcDoc={tmplForm.body || '<p style="font-family:Arial,sans-serif;color:#64748b;padding:24px">Start by adding HTML in the source tab, then return here to edit your copy visually.</p>'} sandbox="allow-same-origin" title="Visual email template editor" onLoad={event => { const body = event.currentTarget.contentDocument?.body; if (body) { body.contentEditable = 'true'; body.style.outline = 'none'; } }} onBlur={() => setTmplForm(form => ({ ...form, body: readVisualTemplate() }))} className="h-[360px] w-full rounded-lg bg-white" />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-col">
                    <div className="mb-1 flex items-center justify-between"><label className="text-xs font-semibold text-muted-foreground">Live email preview</label><span className="text-[10px] text-muted-foreground">Rendered as the recipient sees it</span></div>
                    <div className="flex-1 overflow-hidden rounded-xl border border-border bg-slate-100 p-2 dark:bg-slate-950">
                      <iframe key={`preview-${editingTemplate?.id || 'new'}-${tmplForm.body.length}-${showTemplateTest ? 'personalised' : 'standard'}`} srcDoc={(showTemplateTest ? personalizeTemplatePreview(tmplForm.body, testVariables) : tmplForm.body) || '<p style="font-family:Arial,sans-serif;color:#64748b;padding:24px">Your rendered email preview will appear here.</p>'} sandbox="allow-same-origin" title="Email template preview" className="h-[480px] w-full rounded-lg bg-white" />
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
                  {editingTemplate && <button type="button" onClick={() => { setEditingTemplate(null); setTemplateAttachments([]); setTmplForm({ name: '', subject: '', body: '', category: 'general' }); setTemplateStudioMode('visual'); }} className="rounded-xl border border-border px-4 py-2 text-sm text-foreground transition hover:bg-muted">Cancel</button>}
                  {editingTemplate && <button type="button" onClick={openTemplateTest} className="flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-700 transition hover:bg-teal-100 dark:border-teal-500/25 dark:bg-teal-500/10 dark:text-teal-200 dark:hover:bg-teal-500/15"><Send className="h-3.5 w-3.5" /> Send test</button>}
                  <button onClick={saveTemplate} disabled={tmplSaveLoading} className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-teal-600/15 transition hover:bg-teal-700 disabled:opacity-60">
                    {tmplSaveLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    {editingTemplate ? 'Save changes' : 'Save template'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showTemplateTest && editingTemplate && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
            <div className="flex items-start justify-between border-b border-border bg-gradient-to-r from-teal-50 to-cyan-50 px-5 py-4 dark:from-teal-500/10 dark:to-cyan-500/10">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white shadow-lg shadow-teal-600/20"><Send className="h-4 w-4" /></div>
                <div><h3 className="text-sm font-semibold text-foreground">Send personalised test</h3><p className="mt-0.5 text-xs text-muted-foreground">A clearly marked <strong>[TEST]</strong> copy will be sent using your Team SMTP account.</p></div>
              </div>
              <button onClick={() => setShowTemplateTest(false)} className="rounded-lg p-1 text-muted-foreground transition hover:bg-background hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">Test recipient *</label>
                <input type="email" value={testRecipient} onChange={event => setTestRecipient(event.target.value)} placeholder="you@example.com" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-teal-400/50" />
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Test subject</p>
                <p className="mt-1 text-sm font-medium text-foreground">[TEST] {tmplForm.subject || 'No subject'}</p>
              </div>
              {templateVariables(tmplForm.subject, tmplForm.body).length > 0 ? (
                <div>
                  <div className="mb-2 flex items-center justify-between"><label className="text-xs font-semibold text-muted-foreground">Personalisation values</label><span className="text-[10px] text-teal-600 dark:text-teal-300">Preview updates as you type</span></div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {templateVariables(tmplForm.subject, tmplForm.body).map(variable => (
                      <div key={variable}>
                        <label className="mb-1 block text-xs font-medium text-foreground">{variableLabel(variable)} <span className="font-normal text-muted-foreground">{'{{'}{variable}{'}}'}</span></label>
                        <input value={testVariables[variable] || ''} onChange={event => setTestVariables(values => ({ ...values, [variable]: event.target.value }))} placeholder={`Enter ${variableLabel(variable).toLowerCase()}`} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-teal-400/50" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : <p className="rounded-xl border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">This template has no placeholders. The test will use its current content.</p>}
              {templateAttachments.length > 0 && (
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-teal-200 bg-teal-50/70 p-3 text-sm dark:border-teal-500/25 dark:bg-teal-500/10">
                  <input type="checkbox" checked={testIncludeAttachments} onChange={event => setTestIncludeAttachments(event.target.checked)} className="mt-0.5 h-4 w-4 accent-teal-600" />
                  <span>
                    <span className="block font-semibold text-teal-900 dark:text-teal-100">Include this template's {templateAttachments.length === 1 ? 'attachment' : `${templateAttachments.length} attachments`}</span>
                    <span className="mt-0.5 block text-xs text-teal-700 dark:text-teal-200">{templateAttachments.map(a => a.filename).join(', ')}</span>
                  </span>
                </label>
              )}
              <p className="text-xs leading-relaxed text-muted-foreground">The preview in the template studio now shows these values. Sending a test does not change the saved template or send anything to employees.</p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/20 px-5 py-4">
              <button onClick={() => setShowTemplateTest(false)} className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted">Cancel</button>
              <button onClick={sendTemplateTest} disabled={testSending} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-teal-600/20 transition hover:bg-teal-700 disabled:opacity-60">
                {testSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {testSending ? 'Sending test…' : 'Send test email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default EmailInbox;
