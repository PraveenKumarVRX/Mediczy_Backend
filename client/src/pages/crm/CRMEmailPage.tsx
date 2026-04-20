import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail, Star, Trash2, Send, RefreshCw, X, Reply, Search,
  ChevronLeft, ChevronRight, Loader2, Paperclip,
  Bold, Italic, Underline, Link2, Quote, RotateCcw,
  Maximize2, Minimize2, Plus, Settings, FileText, Inbox,
  LayoutTemplate, Save, Trash, ChevronDown, CheckCircle,
  Eye, EyeOff, ShieldAlert, Bell, AlertCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';

// ─── Auth helper (same pattern as other CRM pages) ─────────────────────────
function authHeaders() {
  const t = localStorage.getItem('crmToken');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// ─── Types ──────────────────────────────────────────────────────────────────
interface CRMEmail {
  id: string;
  folder: string;
  from_addr: string;
  from_name: string;
  to_addrs: string[];
  subject: string;
  body_preview?: string;
  body_text?: string;
  body_html?: string;
  has_html?: boolean;
  is_read: boolean;
  is_starred: boolean;
  received_at: string;
}

interface EmailSettings {
  id: string;
  display_name: string;
  email: string;
  provider: string;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_username: string;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  imap_username: string;
  is_default: boolean;
  is_active: boolean;
  last_synced_at: string | null;
}

interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
}

interface Stats { total: number; unread: number; }
interface Attachment { file: File; id: string; }

// ─── Helpers ─────────────────────────────────────────────────────────────────
const PALETTE = ['#3b82f6','#8b5cf6','#10b981','#f97316','#ef4444','#06b6d4','#ec4899'];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
}
function getInitials(name: string) {
  return (name || '?').split(/\s+/).slice(0, 2).map(n => n[0] || '').join('').toUpperCase() || '?';
}
function timeAgo(date: string) {
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}
function sanitize(html: string) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '');
}
function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

const FOLDERS = [
  { key: 'inbox', label: 'Inbox', Icon: Inbox },
  { key: 'sent',  label: 'Sent',  Icon: Send },
  { key: 'all',   label: 'All',   Icon: Mail },
];

const PROVIDER_PRESETS: Record<string, { smtp_host: string; smtp_port: number; smtp_secure: boolean; imap_host: string; imap_port: number }> = {
  zoho:    { smtp_host: 'smtp.zoho.in',     smtp_port: 465, smtp_secure: true,  imap_host: 'imap.zoho.in',     imap_port: 993 },
  'zoho-pro': { smtp_host: 'smtppro.zoho.in', smtp_port: 465, smtp_secure: true, imap_host: 'imappro.zoho.in',  imap_port: 993 },
  gmail:   { smtp_host: 'smtp.gmail.com',   smtp_port: 465, smtp_secure: true,  imap_host: 'imap.gmail.com',   imap_port: 993 },
  outlook: { smtp_host: 'smtp-mail.outlook.com', smtp_port: 587, smtp_secure: false, imap_host: 'outlook.office365.com', imap_port: 993 },
};

const SIG_KEY = 'crm_email_sig_v1';
const DEFAULT_SIG = '-- \nBest regards,\nMediqzy CRM';

// ─── FormatButton ────────────────────────────────────────────────────────────
const FormatButton: React.FC<{ icon: React.ElementType; title: string; onClick: (e: React.MouseEvent) => void }> =
  ({ icon: Icon, title, onClick }) => (
    <button type="button" title={title} onMouseDown={onClick}
      className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/[0.08] text-slate-400 hover:text-white transition-colors">
      <Icon className="w-3.5 h-3.5" />
    </button>
  );

// ═════════════════════════════════════════════════════════════════════════════
// Main component
// ═════════════════════════════════════════════════════════════════════════════
const CRMEmailPage: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();

  // Inbox state
  const [emails, setEmails]               = useState<CRMEmail[]>([]);
  const [stats, setStats]                 = useState<Stats>({ total: 0, unread: 0 });
  const [selected, setSelected]           = useState<CRMEmail | null>(null);
  const [loading, setLoading]             = useState(false);
  const [page, setPage]                   = useState(1);
  const [folder, setFolder]               = useState('inbox');
  const [unreadOnly, setUnreadOnly]       = useState(false);
  const [searchTerm, setSearchTerm]       = useState('');
  const [syncing, setSyncing]             = useState(false);
  const [emailMaximized, setEmailMaximized] = useState(false);

  // Composer
  const [composerOpen, setComposerOpen]       = useState(false);
  const [composerMode, setComposerMode]       = useState<'compose' | 'reply'>('compose');
  const [sendLoading, setSendLoading]         = useState(false);
  const [composerTo, setComposerTo]           = useState('');
  const [composerCc, setComposerCc]           = useState('');
  const [composerSubject, setComposerSubject] = useState('');
  const [showCcBcc, setShowCcBcc]             = useState(false);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [attachments, setAttachments]         = useState<Attachment[]>([]);
  const [signature, setSignature]             = useState(() => localStorage.getItem(SIG_KEY) ?? DEFAULT_SIG);
  const [showSignature, setShowSignature]     = useState(true);
  const bodyRef     = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Settings panel
  const [settingsOpen, setSettingsOpen]   = useState(false);
  const [settingsList, setSettingsList]   = useState<EmailSettings[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [editingSettings, setEditingSettings] = useState<Partial<EmailSettings> & { smtp_password?: string; imap_password?: string } | null>(null);
  const [settingsForm, setSettingsForm]   = useState({
    display_name: '', email: '', provider: 'custom',
    smtp_host: '', smtp_port: '465', smtp_secure: true, smtp_username: '', smtp_password: '',
    imap_host: '', imap_port: '993', imap_secure: true, imap_username: '', imap_password: '',
    is_default: true,
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsTesting, setSettingsTesting] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);

  // Templates
  const [showTemplateModal, setShowTemplateModal]   = useState(false);
  const [templates, setTemplates]                   = useState<Template[]>([]);
  const [templateLoading, setTemplateLoading]       = useState(false);
  const [editingTemplate, setEditingTemplate]       = useState<Template | null>(null);
  const [tmplForm, setTmplForm]                     = useState({ name: '', subject: '', body: '', category: 'general' });
  const [tmplSaving, setTmplSaving]                 = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  // ── Fetch ────────────────────────────────────────────────────────
  const fetchInbox = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/crm/emails/inbox', {
        headers: authHeaders(),
        params: { page, limit: 20, folder, unread_only: unreadOnly, search: searchTerm || undefined },
      });
      if (data.success) setEmails(data.data.emails || []);
    } catch (e: any) {
      if (e?.response?.status === 401) { localStorage.removeItem('crmToken'); navigate('/crm/login'); }
    } finally { setLoading(false); }
  }, [page, folder, unreadOnly, searchTerm, navigate]);

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get('/crm/emails/stats', { headers: authHeaders() });
      if (data.success) setStats(data.data);
    } catch { /* ignore */ }
  }, []);

  const fetchSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const { data } = await api.get('/crm/emails/settings', { headers: authHeaders() });
      if (data.success) setSettingsList(data.data);
    } catch { /* ignore */ }
    finally { setSettingsLoading(false); }
  }, []);

  useEffect(() => { fetchInbox(); }, [fetchInbox]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // ── Sync ─────────────────────────────────────────────────────────
  const syncEmails = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post('/crm/emails/sync', { days_back: 30 }, { headers: authHeaders() });
      if (data.success) {
        await Promise.all([fetchInbox(), fetchStats()]);
        toast({ title: 'Sync complete', description: `${data.data?.newEmails ?? 0} new emails.` });
      }
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'Sync failed';
      if (e?.response?.data?.code === 'IMAP_DISABLED') {
        toast({ variant: 'destructive', title: 'IMAP Disabled', description: msg });
      } else {
        toast({ variant: 'destructive', title: 'Sync failed', description: msg });
      }
    } finally { setSyncing(false); }
  };

  // ── Email actions ─────────────────────────────────────────────────
  const selectEmail = async (email: CRMEmail) => {
    setSelected(email);
    setComposerOpen(false);
    if (!email.is_read) {
      await api.put(`/crm/emails/${email.id}/mark-read`, {}, { headers: authHeaders() }).catch(() => {});
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_read: true } : e));
      setStats(s => ({ ...s, unread: Math.max(0, s.unread - 1) }));
    }
    // Fetch full email if needed
    if (!email.body_text && !email.has_html) return;
    try {
      const { data } = await api.get(`/crm/emails/${email.id}`, { headers: authHeaders() });
      if (data.success) setSelected(data.data);
    } catch { /* keep preview */ }
  };

  const toggleStar = async (id: string, ev?: React.MouseEvent) => {
    ev?.stopPropagation();
    try {
      const { data } = await api.put(`/crm/emails/${id}/toggle-star`, {}, { headers: authHeaders() });
      if (data.success) {
        const starred = data.data.isStarred;
        setEmails(prev => prev.map(e => e.id === id ? { ...e, is_starred: starred } : e));
        if (selected?.id === id) setSelected(p => p ? { ...p, is_starred: starred } : null);
      }
    } catch { /* ignore */ }
  };

  const deleteEmail = async (id: string) => {
    try {
      await api.delete(`/crm/emails/${id}`, { headers: authHeaders() });
      setEmails(prev => prev.filter(e => e.id !== id));
      if (selected?.id === id) { setSelected(null); setComposerOpen(false); }
      setStats(s => ({ ...s, total: Math.max(0, s.total - 1) }));
    } catch { /* ignore */ }
  };

  // ── Composer ─────────────────────────────────────────────────────
  const setBodyContent = (html: string) => { if (bodyRef.current) bodyRef.current.innerHTML = html; };
  const execFmt = (cmd: string, val?: string) => { bodyRef.current?.focus(); document.execCommand(cmd, false, val); };
  const insertLink = (e: React.MouseEvent) => {
    e.preventDefault();
    const url = window.prompt('Enter URL:', 'https://');
    if (url) execFmt('createLink', url);
  };

  const openCompose = () => {
    setComposerMode('compose');
    setComposerTo(''); setComposerCc(''); setComposerSubject('');
    setAttachments([]); setShowCcBcc(false); setSelected(null);
    setComposerOpen(true);
    setTimeout(() => { setBodyContent('<p><br/></p>'); bodyRef.current?.focus(); }, 50);
  };

  const startReply = (email: CRMEmail) => {
    setComposerMode('reply');
    setComposerTo(email.from_addr);
    setComposerCc('');
    setComposerSubject(email.subject?.toLowerCase().startsWith('re:') ? email.subject : `Re: ${email.subject}`);
    setAttachments([]); setShowCcBcc(false);
    setComposerOpen(true);
    setTimeout(() => {
      const dateStr = new Date(email.received_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
      const quoted  = email.body_html ? sanitize(email.body_html) : (email.body_text || '').replace(/\n/g, '<br/>');
      setBodyContent(
        `<p><br/></p>` +
        `<div style="border-left:3px solid #334155;padding-left:12px;margin:8px 0;color:#64748b;">` +
        `<p style="font-size:12px;margin:0 0 4px;">On ${dateStr}, <strong>${email.from_name || email.from_addr}</strong> wrote:</p>` +
        quoted + `</div>`
      );
      bodyRef.current?.focus();
    }, 50);
  };

  const handleFileAdd = (files: FileList | null) => {
    if (!files) return;
    const next: Attachment[] = Array.from(files)
      .filter(f => f.size <= 10 * 1024 * 1024)
      .map(f => ({ file: f, id: `${Date.now()}-${Math.random()}` }));
    setAttachments(prev => [...prev, ...next].slice(0, 10));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

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
      if (composerCc.trim()) fd.append('cc', composerCc.trim());
      fd.append('subject', composerSubject.trim());
      fd.append('html_content', fullHtml);
      fd.append('text_content', bodyText);
      attachments.forEach(a => fd.append('attachments', a.file));
      const { data } = await api.post('/crm/emails/send', fd, {
        headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' },
      });
      if (data.success) {
        setComposerOpen(false); setAttachments([]);
        toast({ title: '✓ Email sent' });
        fetchInbox();
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Send failed', description: e?.response?.data?.message || 'Unable to send.' });
    } finally { setSendLoading(false); }
  };

  const saveSignature = (val: string) => { setSignature(val); localStorage.setItem(SIG_KEY, val); };

  // ── SMTP Settings ─────────────────────────────────────────────────
  const openSettings = () => { fetchSettings(); setEditingSettings(null); resetSettingsForm(); setSettingsOpen(true); };

  const resetSettingsForm = () => setSettingsForm({
    display_name: '', email: '', provider: 'custom',
    smtp_host: '', smtp_port: '465', smtp_secure: true, smtp_username: '', smtp_password: '',
    imap_host: '', imap_port: '993', imap_secure: true, imap_username: '', imap_password: '',
    is_default: true,
  });

  const applyProviderPreset = (provider: string) => {
    const preset = PROVIDER_PRESETS[provider];
    if (preset) {
      setSettingsForm(f => ({
        ...f, provider,
        smtp_host: preset.smtp_host, smtp_port: String(preset.smtp_port), smtp_secure: preset.smtp_secure,
        imap_host: preset.imap_host, imap_port: String(preset.imap_port),
      }));
    } else {
      setSettingsForm(f => ({ ...f, provider }));
    }
  };

  const editSettings = (s: EmailSettings) => {
    setEditingSettings(s);
    setSettingsForm({
      display_name: s.display_name || '', email: s.email, provider: s.provider || 'custom',
      smtp_host: s.smtp_host || '', smtp_port: String(s.smtp_port || 465), smtp_secure: s.smtp_secure,
      smtp_username: s.smtp_username || '', smtp_password: '',
      imap_host: s.imap_host || '', imap_port: String(s.imap_port || 993), imap_secure: s.imap_secure,
      imap_username: s.imap_username || '', imap_password: '',
      is_default: s.is_default,
    });
  };

  const saveSettings = async () => {
    if (!settingsForm.email) { toast({ variant: 'destructive', title: 'Email required' }); return; }
    setSettingsSaving(true);
    try {
      const payload = {
        display_name:  settingsForm.display_name || undefined,
        email:         settingsForm.email,
        provider:      settingsForm.provider,
        smtp_host:     settingsForm.smtp_host || undefined,
        smtp_port:     parseInt(settingsForm.smtp_port) || 465,
        smtp_secure:   settingsForm.smtp_secure,
        smtp_username: settingsForm.smtp_username || settingsForm.email,
        smtp_password: settingsForm.smtp_password || undefined,
        imap_host:     settingsForm.imap_host || undefined,
        imap_port:     parseInt(settingsForm.imap_port) || 993,
        imap_secure:   settingsForm.imap_secure,
        imap_username: settingsForm.imap_username || settingsForm.smtp_username || settingsForm.email,
        imap_password: settingsForm.imap_password || undefined,
        is_default:    settingsForm.is_default,
      };
      if (editingSettings?.id) {
        await api.put(`/crm/emails/settings/${editingSettings.id}`, payload, { headers: authHeaders() });
        toast({ title: 'Settings updated' });
      } else {
        await api.post('/crm/emails/settings', payload, { headers: authHeaders() });
        toast({ title: 'Email account added' });
      }
      fetchSettings();
      setEditingSettings(null);
      resetSettingsForm();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: e?.response?.data?.message || 'Unable to save.' });
    } finally { setSettingsSaving(false); }
  };

  const testSettings = async (id: string) => {
    setSettingsTesting(true);
    try {
      const { data } = await api.post(`/crm/emails/settings/${id}/test`, {}, { headers: authHeaders() });
      toast({ title: data.success ? '✓ SMTP Connected' : 'Test failed', description: data.message, variant: data.success ? 'default' : 'destructive' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Test failed', description: e?.response?.data?.message || 'Unable to connect.' });
    } finally { setSettingsTesting(false); }
  };

  const deleteSettings = async (id: string) => {
    try {
      await api.delete(`/crm/emails/settings/${id}`, { headers: authHeaders() });
      setSettingsList(prev => prev.filter(s => s.id !== id));
      toast({ title: 'Account removed' });
    } catch { toast({ variant: 'destructive', title: 'Delete failed' }); }
  };

  // ── Templates ─────────────────────────────────────────────────────
  const fetchTemplates = async () => {
    setTemplateLoading(true);
    try {
      const { data } = await api.get('/crm/emails/templates', { headers: authHeaders() });
      if (data.success) setTemplates(data.data);
    } catch { /* ignore */ }
    finally { setTemplateLoading(false); }
  };

  const openTemplateModal = () => {
    setEditingTemplate(null);
    setTmplForm({ name: '', subject: '', body: '', category: 'general' });
    fetchTemplates();
    setShowTemplateModal(true);
  };

  const editTemplate = (t: Template) => {
    setEditingTemplate(t);
    setTmplForm({ name: t.name, subject: t.subject || '', body: t.body || '', category: t.category || 'general' });
  };

  const saveTemplate = async () => {
    if (!tmplForm.name.trim()) { toast({ variant: 'destructive', title: 'Name required' }); return; }
    setTmplSaving(true);
    try {
      if (editingTemplate) {
        const { data } = await api.put(`/crm/emails/templates/${editingTemplate.id}`, tmplForm, { headers: authHeaders() });
        if (data.success) { setTemplates(prev => prev.map(t => t.id === editingTemplate.id ? data.data : t)); toast({ title: 'Template updated' }); }
      } else {
        const { data } = await api.post('/crm/emails/templates', tmplForm, { headers: authHeaders() });
        if (data.success) { setTemplates(prev => [data.data, ...prev]); toast({ title: 'Template created' }); }
      }
      setEditingTemplate(null);
      setTmplForm({ name: '', subject: '', body: '', category: 'general' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: e?.response?.data?.message || '' });
    } finally { setTmplSaving(false); }
  };

  const deleteTemplate = async (id: string) => {
    try {
      await api.delete(`/crm/emails/templates/${id}`, { headers: authHeaders() });
      setTemplates(prev => prev.filter(t => t.id !== id));
      if (editingTemplate?.id === id) { setEditingTemplate(null); setTmplForm({ name: '', subject: '', body: '', category: 'general' }); }
    } catch { /* ignore */ }
  };

  const applyTemplate = (t: Template) => {
    if (t.subject) setComposerSubject(t.subject);
    if (t.body) setTimeout(() => { setBodyContent(t.body.replace(/\n/g, '<br/>')); }, 30);
    setShowTemplatePicker(false);
    toast({ title: `Template "${t.name}" applied` });
  };

  // ── Sub-components ────────────────────────────────────────────────
  const FormattingToolbar = () => (
    <div className="shrink-0 flex items-center gap-0.5 px-3 py-1.5 border-b border-white/[0.06] bg-white/[0.02]">
      <FormatButton icon={Bold}      title="Bold"      onClick={e => { e.preventDefault(); execFmt('bold'); }} />
      <FormatButton icon={Italic}    title="Italic"    onClick={e => { e.preventDefault(); execFmt('italic'); }} />
      <FormatButton icon={Underline} title="Underline" onClick={e => { e.preventDefault(); execFmt('underline'); }} />
      <div className="w-px h-4 bg-white/[0.08] mx-1" />
      <FormatButton icon={Link2}     title="Link"      onClick={insertLink} />
      <FormatButton icon={Quote}     title="Blockquote" onClick={e => { e.preventDefault(); execFmt('formatBlock', 'blockquote'); }} />
      <FormatButton icon={RotateCcw} title="Clear"     onClick={e => { e.preventDefault(); execFmt('removeFormat'); }} />
    </div>
  );

  const ComposerFooter = ({ compact = false }: { compact?: boolean }) => (
    <>
      {showSignature && (
        <div className={`shrink-0 border-t border-dashed border-white/[0.06] bg-white/[0.01] ${compact ? 'px-4 py-1.5' : 'px-5 py-2'}`}>
          <p className="text-[9px] uppercase tracking-wider text-slate-600 mb-0.5">Signature</p>
          <textarea rows={compact ? 2 : 3} value={signature} onChange={e => saveSignature(e.target.value)}
            className="w-full text-xs text-slate-500 bg-transparent focus:outline-none resize-none" placeholder="Your signature…" />
        </div>
      )}
      {attachments.length > 0 && (
        <div className="shrink-0 flex flex-wrap gap-1.5 px-4 py-1.5 border-t border-white/[0.06]">
          {attachments.map(a => (
            <div key={a.id} className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-[11px]">
              <Paperclip className="w-2.5 h-2.5 text-slate-400 shrink-0" />
              <span className="max-w-[110px] truncate text-slate-300">{a.file.name}</span>
              <span className="text-slate-500">({formatBytes(a.file.size)})</span>
              <button onClick={() => setAttachments(prev => prev.filter(x => x.id !== a.id))} className="hover:text-red-400 transition-colors"><X className="w-2.5 h-2.5" /></button>
            </div>
          ))}
        </div>
      )}
      <div className={`shrink-0 flex items-center gap-2 border-t border-white/[0.06] bg-white/[0.02] ${compact ? 'px-3 py-2' : 'px-4 py-2.5'}`}>
        <button onClick={sendEmail} disabled={sendLoading}
          className={`flex items-center gap-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:opacity-60 ${compact ? 'h-7 text-xs' : 'h-8 text-sm'}`}>
          {sendLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          {sendLoading ? 'Sending…' : compact ? 'Send Reply' : 'Send'}
        </button>
        <button type="button" onClick={() => fileInputRef.current?.click()} title="Attach"
          className="p-1.5 rounded hover:bg-white/[0.06] text-slate-400 hover:text-white transition-colors">
          <Paperclip className="w-4 h-4" />
        </button>
        {/* Template picker */}
        <div className="relative">
          <button type="button" onClick={() => { if (!showTemplatePicker) fetchTemplates(); setShowTemplatePicker(v => !v); }}
            className={`p-1.5 rounded hover:bg-white/[0.06] transition-colors ${showTemplatePicker ? 'text-purple-400' : 'text-slate-400 hover:text-white'}`} title="Templates">
            <LayoutTemplate className="w-4 h-4" />
          </button>
          {showTemplatePicker && (
            <div className="absolute bottom-full mb-2 left-0 w-60 bg-[#0f1117] border border-white/[0.1] rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.08]">
                <span className="text-xs font-semibold text-white">Templates</span>
                <button onClick={() => setShowTemplatePicker(false)}><X className="w-3.5 h-3.5 text-slate-400" /></button>
              </div>
              {templateLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div>
              ) : templates.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-xs text-slate-500">No templates yet</p>
                  <button onClick={() => { setShowTemplatePicker(false); openTemplateModal(); }} className="mt-2 text-xs text-blue-400 hover:underline">Create one</button>
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto">
                  {templates.map(t => (
                    <button key={t.id} onClick={() => applyTemplate(t)}
                      className="w-full text-left px-3 py-2.5 hover:bg-white/[0.05] border-b border-white/[0.04] last:border-0 transition-colors">
                      <p className="text-xs font-semibold text-white truncate">{t.name}</p>
                      {t.subject && <p className="text-[10px] text-slate-500 truncate mt-0.5">Sub: {t.subject}</p>}
                    </button>
                  ))}
                </div>
              )}
              <div className="px-3 py-2 border-t border-white/[0.06]">
                <button onClick={() => { setShowTemplatePicker(false); openTemplateModal(); }} className="text-xs text-purple-400 hover:underline font-medium">+ Manage Templates</button>
              </div>
            </div>
          )}
        </div>
        <div className="flex-1" />
        <button type="button" onClick={() => setComposerOpen(false)}
          className="p-1.5 rounded hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors" title="Discard">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </>
  );

  // ── JSX ───────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col gap-4 p-6 min-h-0">
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => handleFileAdd(e.target.files)} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Email Inbox</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {stats.unread > 0 ? `${stats.unread} unread · ` : ''}{stats.total} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={syncEmails} disabled={syncing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-sm text-slate-300 transition-colors disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync'}
          </button>
          <button onClick={openSettings}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-sm text-slate-300 transition-colors">
            <Settings className="w-3.5 h-3.5" /> SMTP Settings
          </button>
        </div>
      </div>

      {/* 3-pane layout */}
      <div className="flex rounded-xl border border-white/[0.06] overflow-hidden bg-[#0d1120]" style={{ height: 'calc(100vh - 200px)', minHeight: 560 }}>

        {/* ─── Sidebar ─── */}
        <aside className="w-48 shrink-0 flex flex-col border-r border-white/[0.06] bg-white/[0.02] overflow-y-auto">
          <div className="p-3 border-b border-white/[0.06] shrink-0">
            <button onClick={openCompose}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors">
              <Plus className="w-4 h-4" /> Compose
            </button>
          </div>
          <nav className="py-2 shrink-0">
            {FOLDERS.map(({ key, label, Icon }) => (
              <button key={key} onClick={() => { setFolder(key); setPage(1); setSelected(null); setComposerOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg mx-1 mb-0.5 transition-colors ${
                  folder === key ? 'bg-blue-500/15 text-blue-400' : 'text-slate-400 hover:bg-white/[0.05] hover:text-white'
                }`}>
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left">{label}</span>
                {key === 'inbox' && stats.unread > 0 && (
                  <span className="text-[10px] font-bold bg-blue-500 text-white rounded-full px-1.5 py-0.5 leading-none">
                    {stats.unread > 99 ? '99+' : stats.unread}
                  </span>
                )}
              </button>
            ))}
            <div className="mx-3 my-2 border-t border-white/[0.06]" />
            <button onClick={openSettings}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-slate-400 hover:bg-white/[0.05] hover:text-white rounded-lg mx-1 transition-colors">
              <Settings className="w-4 h-4 shrink-0" /> SMTP Settings
            </button>
            <button onClick={openTemplateModal}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-slate-400 hover:bg-white/[0.05] hover:text-white rounded-lg mx-1 transition-colors">
              <LayoutTemplate className="w-4 h-4 shrink-0" /> Templates
            </button>
          </nav>
        </aside>

        {/* ─── Email list ─── */}
        <div className="w-[340px] shrink-0 flex flex-col border-r border-white/[0.06] overflow-hidden">
          <div className="shrink-0 p-3 border-b border-white/[0.06] space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
              <input type="text" placeholder="Search emails…" value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-white/[0.05] border border-white/[0.08] rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-colors" />
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => { setUnreadOnly(!unreadOnly); setPage(1); }}
                className={`flex-1 py-1 rounded-md text-xs font-medium transition-colors ${unreadOnly ? 'bg-blue-500/15 text-blue-400' : 'bg-white/[0.04] text-slate-400 hover:text-white'}`}>
                Unread {stats.unread ? `(${stats.unread})` : ''}
              </button>
              <button onClick={fetchInbox} title="Refresh"
                className="px-2.5 py-1 rounded-md bg-white/[0.04] text-slate-400 hover:text-white transition-colors">
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
            ) : emails.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-500">
                <Mail className="w-8 h-8 opacity-30" />
                <p className="text-sm">No emails found</p>
                {!syncing && (
                  <button onClick={syncEmails} className="text-xs text-blue-400 hover:underline">Sync now</button>
                )}
              </div>
            ) : (
              emails.map(email => {
                const isSelected = selected?.id === email.id;
                const color = avatarColor(email.from_name || email.from_addr);
                return (
                  <div key={email.id} onClick={() => selectEmail(email)}
                    className={`group relative px-3 py-3 border-b border-white/[0.04] cursor-pointer transition-all select-none ${
                      isSelected ? 'bg-blue-500/10 border-l-[3px] border-l-blue-500' : email.is_read ? 'hover:bg-white/[0.03]' : 'bg-blue-500/5 hover:bg-blue-500/10'
                    }`}>
                    {!email.is_read && !isSelected && (
                      <div className="absolute left-[3px] top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-blue-500" />
                    )}
                    <div className="flex items-start gap-2.5 pl-1">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5"
                        style={{ backgroundColor: color }}>
                        {getInitials(email.from_name || email.from_addr)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className={`text-sm truncate ${email.is_read ? 'font-medium text-slate-300' : 'font-bold text-white'}`}>
                            {email.from_name || email.from_addr}
                          </span>
                          <span className="text-[10px] text-slate-500 shrink-0">{timeAgo(email.received_at)}</span>
                        </div>
                        <p className={`text-xs truncate mb-0.5 ${email.is_read ? 'text-slate-500' : 'text-slate-300 font-medium'}`}>
                          {email.subject}
                        </p>
                        {email.body_preview && (
                          <p className="text-[11px] text-slate-600 truncate">{email.body_preview}</p>
                        )}
                      </div>
                      <button onClick={ev => toggleStar(email.id, ev)}
                        className={`shrink-0 mt-0.5 transition-opacity ${email.is_starred ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        <Star className={`w-3.5 h-3.5 ${email.is_starred ? 'fill-yellow-400 text-yellow-400' : 'text-slate-500'}`} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="shrink-0 flex items-center justify-between px-3 py-2 border-t border-white/[0.06] bg-white/[0.01]">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="flex items-center gap-0.5 text-xs text-slate-500 hover:text-white disabled:opacity-40 transition-colors">
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span className="text-xs text-slate-500">Page {page}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={emails.length < 20}
              className="flex items-center gap-0.5 text-xs text-slate-500 hover:text-white disabled:opacity-40 transition-colors">
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ─── Detail pane ─── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Compose */}
          {composerOpen && !selected && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
                <h3 className="font-semibold text-sm text-white">New Message</h3>
                <div className="flex items-center gap-1">
                  <button onClick={() => setComposerExpanded(!composerExpanded)}
                    className="p-1.5 rounded hover:bg-white/[0.06] text-slate-400 hover:text-white transition-colors">
                    {composerExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => setComposerOpen(false)}
                    className="p-1.5 rounded hover:bg-white/[0.06] text-slate-400 hover:text-white transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="shrink-0 border-b border-white/[0.06]">
                <div className="flex items-center px-5 py-2 border-b border-white/[0.04]">
                  <span className="w-10 text-xs font-semibold text-slate-500 shrink-0">To</span>
                  <input type="text" value={composerTo} onChange={e => setComposerTo(e.target.value)}
                    placeholder="recipient@example.com"
                    className="flex-1 text-sm bg-transparent focus:outline-none text-slate-200 placeholder:text-slate-600" />
                  <button onClick={() => setShowCcBcc(!showCcBcc)} className="text-xs text-slate-500 hover:text-white transition-colors ml-2 shrink-0">Cc</button>
                </div>
                {showCcBcc && (
                  <div className="flex items-center px-5 py-2 border-b border-white/[0.04]">
                    <span className="w-10 text-xs font-semibold text-slate-500 shrink-0">Cc</span>
                    <input type="text" value={composerCc} onChange={e => setComposerCc(e.target.value)}
                      placeholder="cc@example.com" className="flex-1 text-sm bg-transparent focus:outline-none text-slate-200 placeholder:text-slate-600" />
                  </div>
                )}
                <div className="flex items-center px-5 py-2">
                  <span className="w-10 text-xs font-semibold text-slate-500 shrink-0">Sub</span>
                  <input type="text" value={composerSubject} onChange={e => setComposerSubject(e.target.value)}
                    placeholder="Subject"
                    className="flex-1 text-sm bg-transparent focus:outline-none text-slate-200 font-medium placeholder:text-slate-600" />
                </div>
              </div>
              <FormattingToolbar />
              <div ref={bodyRef} contentEditable suppressContentEditableWarning
                className="flex-1 px-5 py-4 text-sm text-slate-200 focus:outline-none overflow-y-auto"
                style={{ minHeight: 120 }} />
              <ComposerFooter />
            </div>
          )}

          {/* Empty state */}
          {!composerOpen && !selected && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-500 p-8">
              <div className="w-20 h-20 rounded-full bg-white/[0.03] flex items-center justify-center">
                <Mail className="w-10 h-10 opacity-20" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-white text-base">Select an email to read</p>
                <p className="text-sm mt-1">or compose a new message</p>
              </div>
              <button onClick={openCompose}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 font-medium text-sm transition-colors">
                <Plus className="w-4 h-4" /> Compose Email
              </button>
            </div>
          )}

          {/* Email detail */}
          {selected && (
            <>
              <div className="shrink-0 px-5 py-4 border-b border-white/[0.06]">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{ backgroundColor: avatarColor(selected.from_name || selected.from_addr) }}>
                    {getInitials(selected.from_name || selected.from_addr)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-sm text-white">{selected.from_name || selected.from_addr}</span>
                    </div>
                    <p className="text-xs text-slate-500">{selected.from_addr}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(selected.received_at).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => composerOpen ? setComposerOpen(false) : startReply(selected)}
                      className={`p-1.5 rounded transition-colors ${composerOpen ? 'bg-blue-500/15 text-blue-400' : 'hover:bg-white/[0.06] text-slate-400 hover:text-white'}`} title="Reply">
                      <Reply className="w-4 h-4" />
                    </button>
                    <button onClick={() => toggleStar(selected.id)} className="p-1.5 rounded hover:bg-white/[0.06] transition-colors">
                      <Star className={`w-4 h-4 ${selected.is_starred ? 'fill-yellow-400 text-yellow-400' : 'text-slate-400'}`} />
                    </button>
                    <button onClick={() => setEmailMaximized(true)}
                      className="p-1.5 rounded hover:bg-white/[0.06] text-slate-400 hover:text-white transition-colors" title="Fullscreen">
                      <Maximize2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteEmail(selected.id)}
                      className="p-1.5 rounded hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <h2 className="font-semibold text-white mt-3 text-base leading-snug">{selected.subject}</h2>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
                {selected.body_html ? (
                  <div className="email-html-body overflow-x-auto rounded-lg"
                    style={{ colorScheme: 'light', backgroundColor: '#fff', color: '#111', padding: '1rem' }}
                    dangerouslySetInnerHTML={{ __html: sanitize(selected.body_html) }} />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm text-slate-300 leading-relaxed">
                    {selected.body_text || selected.body_preview || '(No content)'}
                  </pre>
                )}
              </div>

              {/* Reply composer */}
              {composerOpen && (
                <div className="shrink-0 border-t border-white/[0.06] flex flex-col bg-[#0d1120] overflow-hidden"
                  style={{ maxHeight: composerExpanded ? '60%' : 'min(320px, 45%)' }}>
                  <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-white/[0.06]">
                    <Reply className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="text-xs font-semibold text-white flex-1 truncate">
                      Reply to {selected.from_name || selected.from_addr}
                    </span>
                    <button onClick={() => setShowCcBcc(!showCcBcc)}
                      className="text-[11px] text-slate-500 hover:text-white px-2 py-0.5 rounded hover:bg-white/[0.06] transition-colors shrink-0">Cc</button>
                    <button onClick={() => setComposerExpanded(!composerExpanded)}
                      className="p-1 rounded hover:bg-white/[0.06] text-slate-400 hover:text-white transition-colors">
                      {composerExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                    </button>
                    <button onClick={() => setComposerOpen(false)}
                      className="p-1 rounded hover:bg-white/[0.06] text-slate-400 hover:text-white transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  {showCcBcc && (
                    <div className="flex items-center px-4 py-1.5 border-b border-white/[0.04]">
                      <span className="w-8 text-xs font-semibold text-slate-500 shrink-0">Cc</span>
                      <input type="text" value={composerCc} onChange={e => setComposerCc(e.target.value)}
                        placeholder="cc@example.com" className="flex-1 text-xs bg-transparent focus:outline-none text-slate-300 placeholder:text-slate-600" />
                    </div>
                  )}
                  <FormattingToolbar />
                  <div ref={bodyRef} contentEditable suppressContentEditableWarning
                    className="flex-1 px-4 py-2 text-sm text-slate-200 focus:outline-none overflow-y-auto" style={{ minHeight: 80 }} />
                  <ComposerFooter compact />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ═══ Fullscreen email modal ═══ */}
      {emailMaximized && selected && (
        <div className="fixed inset-0 z-[60] bg-[#0d1120] flex flex-col">
          <div className="shrink-0 flex items-start gap-3 px-6 py-4 border-b border-white/[0.06]">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                <span className="font-semibold text-white">{selected.from_name || selected.from_addr}</span>
                {selected.from_name && <span className="truncate hidden sm:inline">&lt;{selected.from_addr}&gt;</span>}
              </div>
              <h2 className="font-bold text-white text-lg">{selected.subject}</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {new Date(selected.received_at).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => composerOpen ? setComposerOpen(false) : startReply(selected)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${composerOpen ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
                <Reply className="w-3.5 h-3.5" /> Reply
              </button>
              <button onClick={() => toggleStar(selected.id)} className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors">
                <Star className={`w-4 h-4 ${selected.is_starred ? 'fill-yellow-400 text-yellow-400' : 'text-slate-400'}`} />
              </button>
              <button onClick={() => { deleteEmail(selected.id); setEmailMaximized(false); }}
                className="p-2 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
              <button onClick={() => setEmailMaximized(false)}
                className="p-2 rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-white transition-colors ml-2">
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {selected.body_html ? (
              <div style={{ colorScheme: 'light', backgroundColor: '#fff', color: '#111', borderRadius: '0.5rem', padding: '1.5rem' }}
                dangerouslySetInnerHTML={{ __html: sanitize(selected.body_html) }} />
            ) : (
              <pre className="whitespace-pre-wrap font-sans text-sm text-slate-300">{selected.body_text || '(No content)'}</pre>
            )}
          </div>
        </div>
      )}

      {/* ═══ SMTP Settings modal ═══ */}
      {settingsOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d1120] border border-white/[0.08] rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] shrink-0">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-400" />
                <span className="font-semibold text-white">Email / SMTP Settings</span>
              </div>
              <button onClick={() => setSettingsOpen(false)}><X className="w-5 h-5 text-slate-400 hover:text-white" /></button>
            </div>

            <div className="flex flex-1 min-h-0 overflow-hidden">
              {/* Left: accounts list */}
              <div className="w-60 shrink-0 border-r border-white/[0.06] flex flex-col">
                <div className="p-3 border-b border-white/[0.06] shrink-0">
                  <button onClick={() => { setEditingSettings(null); resetSettingsForm(); }}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors">
                    <Plus className="w-4 h-4" /> Add Email Account
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {settingsLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
                  ) : settingsList.length === 0 ? (
                    <div className="py-10 text-center text-slate-500">
                      <Mail className="w-8 h-8 opacity-20 mx-auto mb-2" />
                      <p className="text-sm">No accounts yet</p>
                    </div>
                  ) : (
                    settingsList.map(s => (
                      <div key={s.id}
                        className={`group px-3 py-3 border-b border-white/[0.04] cursor-pointer transition-colors ${editingSettings?.id === s.id ? 'bg-blue-500/10 border-l-2 border-l-blue-500' : 'hover:bg-white/[0.04]'}`}
                        onClick={() => editSettings(s)}>
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{s.display_name || s.email}</p>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">{s.email}</p>
                            <div className="flex items-center gap-1 mt-1">
                              {s.is_default && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-medium">Default</span>}
                              {s.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">Active</span>}
                              {s.last_synced_at && <span className="text-[10px] text-slate-600">Synced {timeAgo(s.last_synced_at)}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100">
                            <button onClick={e => { e.stopPropagation(); testSettings(s.id); }} disabled={settingsTesting}
                              className="p-0.5 hover:text-emerald-400 text-slate-500 transition-colors" title="Test">
                              <CheckCircle className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={e => { e.stopPropagation(); deleteSettings(s.id); }}
                              className="p-0.5 hover:text-red-400 text-slate-500 transition-colors" title="Delete">
                              <Trash className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Right: settings form */}
              <div className="flex-1 flex flex-col overflow-y-auto p-5 gap-4">
                <h3 className="font-semibold text-sm text-white">
                  {editingSettings?.id ? `Edit — ${editingSettings.email}` : 'Add New Email Account'}
                </h3>

                {/* Provider quick-select */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-2">Provider</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[['zoho-pro','Zoho Pro'],['gmail','Gmail'],['outlook','Outlook'],['custom','Custom']].map(([v,l]) => (
                      <button key={v} type="button" onClick={() => applyProviderPreset(v)}
                        className={`py-2 rounded-lg text-xs font-semibold border transition-colors ${settingsForm.provider === v ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' : 'bg-white/[0.03] text-slate-400 border-white/[0.06] hover:border-blue-500/20 hover:text-white'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Display Name</label>
                    <input value={settingsForm.display_name} onChange={e => setSettingsForm(f => ({ ...f, display_name: e.target.value }))}
                      placeholder="e.g. John Doe" className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Email Address *</label>
                    <input type="email" value={settingsForm.email} onChange={e => setSettingsForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="you@company.com" className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
                  </div>
                </div>

                {/* SMTP */}
                <div>
                  <p className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5"><Send className="w-3.5 h-3.5 text-blue-400" /> SMTP (Outgoing)</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-slate-500 mb-1">SMTP Host</label>
                      <input value={settingsForm.smtp_host} onChange={e => setSettingsForm(f => ({ ...f, smtp_host: e.target.value }))}
                        placeholder="smtppro.zoho.in" className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Port</label>
                      <input type="number" value={settingsForm.smtp_port} onChange={e => setSettingsForm(f => ({ ...f, smtp_port: e.target.value }))}
                        className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Username</label>
                      <input value={settingsForm.smtp_username} onChange={e => setSettingsForm(f => ({ ...f, smtp_username: e.target.value }))}
                        placeholder="your@email.com" className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Password</label>
                      <div className="relative">
                        <input type={showPasswords ? 'text' : 'password'} value={settingsForm.smtp_password}
                          onChange={e => setSettingsForm(f => ({ ...f, smtp_password: e.target.value }))}
                          placeholder={editingSettings?.id ? '(leave blank to keep)' : 'App password / SMTP password'}
                          className="w-full px-3 py-2 pr-9 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
                        <button type="button" onClick={() => setShowPasswords(v => !v)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                          {showPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input type="checkbox" checked={settingsForm.smtp_secure} onChange={e => setSettingsForm(f => ({ ...f, smtp_secure: e.target.checked }))}
                      className="rounded border-white/[0.15] bg-white/[0.04]" />
                    <span className="text-xs text-slate-400">SSL/TLS (port 465)</span>
                  </label>
                </div>

                {/* IMAP */}
                <div>
                  <p className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5"><Inbox className="w-3.5 h-3.5 text-emerald-400" /> IMAP (Incoming / Sync)</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-slate-500 mb-1">IMAP Host</label>
                      <input value={settingsForm.imap_host} onChange={e => setSettingsForm(f => ({ ...f, imap_host: e.target.value }))}
                        placeholder="imappro.zoho.in" className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Port</label>
                      <input type="number" value={settingsForm.imap_port} onChange={e => setSettingsForm(f => ({ ...f, imap_port: e.target.value }))}
                        className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">IMAP Username</label>
                      <input value={settingsForm.imap_username} onChange={e => setSettingsForm(f => ({ ...f, imap_username: e.target.value }))}
                        placeholder="same as SMTP usually" className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">IMAP Password</label>
                      <div className="relative">
                        <input type={showPasswords ? 'text' : 'password'} value={settingsForm.imap_password}
                          onChange={e => setSettingsForm(f => ({ ...f, imap_password: e.target.value }))}
                          placeholder={editingSettings?.id ? '(leave blank to keep)' : 'Same as SMTP usually'}
                          className="w-full px-3 py-2 pr-9 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
                        <button type="button" onClick={() => setShowPasswords(v => !v)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                          {showPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2 border-t border-white/[0.06]">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={settingsForm.is_default} onChange={e => setSettingsForm(f => ({ ...f, is_default: e.target.checked }))}
                      className="rounded border-white/[0.15] bg-white/[0.04]" />
                    <span className="text-xs text-slate-400">Set as default account</span>
                  </label>
                  <div className="flex-1" />
                  {editingSettings?.id && (
                    <button onClick={() => testSettings(editingSettings.id!)} disabled={settingsTesting}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-medium border border-emerald-500/20 transition-colors disabled:opacity-50">
                      {settingsTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                      Test SMTP
                    </button>
                  )}
                  <button onClick={saveSettings} disabled={settingsSaving}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-60">
                    {settingsSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    {editingSettings?.id ? 'Update' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Template Management Modal ═══ */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d1120] border border-white/[0.08] rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col" style={{ height: '85vh' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] shrink-0">
              <div className="flex items-center gap-2 font-semibold text-white">
                <LayoutTemplate className="w-5 h-5 text-purple-400" /> Email Templates
              </div>
              <button onClick={() => setShowTemplateModal(false)}><X className="w-5 h-5 text-slate-400 hover:text-white" /></button>
            </div>
            <div className="flex flex-1 min-h-0">
              <div className="w-64 shrink-0 border-r border-white/[0.06] flex flex-col">
                <div className="p-3 border-b border-white/[0.06] shrink-0">
                  <button onClick={() => { setEditingTemplate(null); setTmplForm({ name: '', subject: '', body: '', category: 'general' }); }}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors">
                    <Plus className="w-4 h-4" /> New Template
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {templateLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
                  ) : templates.length === 0 ? (
                    <div className="py-10 text-center text-slate-500">
                      <LayoutTemplate className="w-8 h-8 opacity-20 mx-auto mb-2" />
                      <p className="text-sm">No templates yet</p>
                    </div>
                  ) : (
                    templates.map(t => (
                      <div key={t.id} onClick={() => editTemplate(t)}
                        className={`group px-3 py-3 border-b border-white/[0.04] cursor-pointer transition-colors ${editingTemplate?.id === t.id ? 'bg-purple-500/10 border-l-2 border-l-purple-500' : 'hover:bg-white/[0.04]'}`}>
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-sm font-medium text-white truncate flex-1">{t.name}</p>
                          <button onClick={e => { e.stopPropagation(); deleteTemplate(t.id); }}
                            className="shrink-0 opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 text-slate-500 transition-all">
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {t.subject && <p className="text-[11px] text-slate-500 truncate mt-0.5">Sub: {t.subject}</p>}
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-500 mt-1 inline-block">{t.category}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="flex-1 flex flex-col p-5 gap-4 overflow-y-auto">
                <h3 className="font-semibold text-sm text-white">{editingTemplate ? `Edit — ${editingTemplate.name}` : 'Create New Template'}</h3>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Template Name *</label>
                  <input value={tmplForm.name} onChange={e => setTmplForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Quote Follow-up" className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-500/40" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Subject</label>
                    <input value={tmplForm.subject} onChange={e => setTmplForm(p => ({ ...p, subject: e.target.value }))}
                      placeholder="Subject line" className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-500/40" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Category</label>
                    <select value={tmplForm.category} onChange={e => setTmplForm(p => ({ ...p, category: e.target.value }))}
                      className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/40">
                      {[['general','General'],['rfq','RFQ'],['quote','Quote'],['follow-up','Follow-up'],['onboarding','Onboarding'],['billing','Billing'],['other','Other']].map(([v,l]) => (
                        <option key={v} value={v} className="bg-[#0d1120]">{l}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Body</label>
                  <textarea rows={12} value={tmplForm.body} onChange={e => setTmplForm(p => ({ ...p, body: e.target.value }))}
                    placeholder="Write your template body…"
                    className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-500/40 resize-none font-mono" />
                </div>
                <div className="flex items-center gap-2 justify-end pt-2 border-t border-white/[0.06]">
                  {editingTemplate && (
                    <button onClick={() => { setEditingTemplate(null); setTmplForm({ name: '', subject: '', body: '', category: 'general' }); }}
                      className="px-4 py-2 text-sm border border-white/[0.08] rounded-lg hover:bg-white/[0.05] text-slate-300 transition-colors">
                      Cancel
                    </button>
                  )}
                  <button onClick={saveTemplate} disabled={tmplSaving}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium disabled:opacity-60 transition-colors">
                    {tmplSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    {editingTemplate ? 'Update' : 'Save Template'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CRMEmailPage;
