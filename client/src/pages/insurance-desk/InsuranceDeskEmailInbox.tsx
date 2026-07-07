import { useState, useEffect, useCallback } from 'react';
import HospDeptLayout from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Mail, MailOpen, Send, Inbox, RefreshCw, Search,
  Plus, Settings, ShieldCheck, IndianRupee, Link2,
  Reply, Paperclip, Zap, Archive, Loader2, Key,
  FileText, Download, ArrowLeftRight,
} from 'lucide-react';
import api from '@/utils/api';
import { navSections } from './navSections';

interface InboxEmail {
  id: string;
  fromEmail: string;
  fromName?: string | null;
  fromOrg?: string | null;
  toEmail?: string | null;
  subject: string;
  bodyText?: string | null;
  receivedAt: string;
  isRead: boolean;
  isStarred: boolean;
  isArchived: boolean;
  label: 'pre-auth' | 'payment' | 'query' | 'rejection' | 'general';
  aiCategory?: string | null;
  aiSummary?: string | null;
  aiSuggestedAction?: string | null;
  utr?: string | null;
  paymentAmount?: number | null;
  paymentMode?: string | null;
  nmeAmount?: number | null;
  tdsAmount?: number | null;
  discountAmount?: number | null;
  disallowanceAmount?: number | null;
  preAuthStatus?: string | null;
  approvedAmount?: number | null;
  insurerName?: string | null;
  claimNumbers?: string[] | null;
  attachments?: { filename: string }[] | null;
}

interface Capture {
  id: string;
  fromEmail: string;
  insurerName?: string | null;
  utr?: string | null;
  paymentAmount?: number | null;
  paymentMode?: string | null;
  claimNumbers?: string[] | null;
  nmeAmount?: number | null; tdsAmount?: number | null; discountAmount?: number | null; disallowanceAmount?: number | null;
  portalUpdated: boolean;
  receivedAt: string;
}

interface EmailSettings {
  email: string; displayName?: string | null;
  smtpHost?: string | null; smtpPort?: number | null; smtpUsername?: string | null;
  imapHost?: string | null; imapPort?: number | null; imapUsername?: string | null;
  hasSmtpPassword?: boolean; hasImapPassword?: boolean;
}

const LABEL_STYLES: Record<string, string> = {
  'pre-auth': 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  payment: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  query: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  rejection: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  general: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

const FOLDERS = [
  { key: 'all', label: 'All Mail', icon: Mail },
  { key: 'pre-auth', label: 'Pre-Auth', icon: ShieldCheck },
  { key: 'payment', label: 'Payments', icon: IndianRupee },
  { key: 'query', label: 'Queries', icon: Search },
  { key: 'rejection', label: 'Rejections', icon: FileText },
  { key: 'archived', label: 'Archived', icon: Archive },
];

const inr = (v?: number | null) => `₹${(Number(v) || 0).toLocaleString('en-IN')}`;
const fmtDate = (d?: string) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

const emptySettings: EmailSettings = { email: '', smtpHost: '', smtpPort: 465, smtpUsername: '', imapHost: '', imapPort: 993, imapUsername: '' };

const InsuranceDeskEmailInbox = () => {
  const [activeTab, setActiveTab] = useState('inbox');
  const [emails, setEmails] = useState<InboxEmail[]>([]);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [stats, setStats] = useState({ total: 0, unread: 0, payments: 0, preauths: 0, queries: 0, captures: 0 });
  const [selected, setSelected] = useState<InboxEmail | null>(null);
  const [search, setSearch] = useState('');
  const [labelFilter, setLabelFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showCompose, setShowCompose] = useState(false);
  const [compose, setCompose] = useState({ to: '', subject: '', body: '' });
  const [sending, setSending] = useState(false);
  const [sendMessage, setSendMessage] = useState<string | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [aiDraftLoading, setAiDraftLoading] = useState(false);
  const [reparsing, setReparsing] = useState(false);

  const [settings, setSettings] = useState<EmailSettings>(emptySettings);
  const [smtpPasswordInput, setSmtpPasswordInput] = useState('');
  const [imapPasswordInput, setImapPasswordInput] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const fetchInbox = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params: Record<string, string> = { limit: '50' };
      if (labelFilter !== 'all') params.label = labelFilter;
      if (search) params.search = search;
      const { data } = await api.get('/hospital/insurance/emails/inbox', { params });
      setEmails(data.data || []);
    } catch (err: any) {
      setLoadError(err?.response?.data?.message || 'Could not load email inbox.');
    } finally {
      setLoading(false);
    }
  }, [labelFilter, search]);

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get('/hospital/insurance/emails/stats');
      if (data.success) setStats(data.data);
    } catch { /* non-fatal */ }
  }, []);

  const fetchCaptures = useCallback(async () => {
    try {
      const { data } = await api.get('/hospital/insurance/emails/captures');
      if (data.success) setCaptures(data.data || []);
    } catch { /* non-fatal */ }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const { data } = await api.get('/hospital/insurance/emails/settings');
      if (data.success && data.data) setSettings(data.data);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => { fetchInbox(); }, [fetchInbox]);
  useEffect(() => { fetchStats(); fetchCaptures(); fetchSettings(); }, [fetchStats, fetchCaptures, fetchSettings]);

  const openEmail = async (email: InboxEmail) => {
    setSelected(email);
    if (!email.isRead) {
      setEmails((prev) => prev.map((e) => (e.id === email.id ? { ...e, isRead: true } : e)));
      try { await api.get(`/hospital/insurance/emails/${email.id}`); } catch { /* ignore */ }
    }
  };

  const toggleStar = async (id: string) => {
    setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, isStarred: !e.isStarred } : e)));
    try { await api.put(`/hospital/insurance/emails/${id}/star`); } catch { /* ignore */ }
  };

  const toggleArchive = async (email: InboxEmail) => {
    try {
      await api.put(`/hospital/insurance/emails/${email.id}/archive`);
      setSelected(null);
      fetchInbox();
    } catch { /* ignore */ }
  };

  const reparseSelected = async () => {
    if (!selected) return;
    setReparsing(true);
    try {
      const { data } = await api.post(`/hospital/insurance/emails/${selected.id}/ai-parse`);
      if (data.success) { setSelected(data.data); fetchInbox(); }
    } catch { /* ignore */ } finally { setReparsing(false); }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const { data } = await api.post('/hospital/insurance/emails/sync', {});
      if (data.success) {
        setSyncMessage(`Synced ${data.synced ?? 0} new emails.`);
        fetchInbox(); fetchStats(); fetchCaptures();
      } else {
        setSyncMessage(data.message || 'Sync failed.');
      }
    } catch (err: any) {
      setSyncMessage(err?.response?.data?.message || 'Sync failed — configure IMAP in Settings first.');
    } finally {
      setSyncing(false);
    }
  };

  const handleAiReply = async () => {
    if (!selected) return;
    setAiDraftLoading(true);
    try {
      const { data } = await api.post(`/hospital/insurance/emails/${selected.id}/ai-reply`);
      const draft = data.data?.draft || '';
      setCompose({ to: selected.fromEmail, subject: `Re: ${selected.subject}`, body: draft });
      setShowCompose(true);
    } catch { /* ignore */ } finally { setAiDraftLoading(false); }
  };

  const handleSend = async () => {
    if (!compose.to || !compose.subject) { setSendMessage('Recipient and subject are required.'); return; }
    setSending(true);
    setSendMessage(null);
    try {
      const { data } = await api.post('/hospital/insurance/emails/send', { ...compose, replyToId: selected?.id });
      if (data.success) {
        setSendMessage(null);
        setShowCompose(false);
        setCompose({ to: '', subject: '', body: '' });
      } else {
        setSendMessage(data.message || 'Failed to send.');
      }
    } catch (err: any) {
      setSendMessage(err?.response?.data?.message || 'Failed to send — check SMTP settings.');
    } finally {
      setSending(false);
    }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    setSettingsMessage(null);
    try {
      const { data } = await api.put('/hospital/insurance/emails/settings', {
        ...settings,
        ...(smtpPasswordInput ? { smtpPassword: smtpPasswordInput } : {}),
        ...(imapPasswordInput ? { imapPassword: imapPasswordInput } : {}),
      });
      if (data.success) {
        setSettings(data.data);
        setSmtpPasswordInput('');
        setImapPasswordInput('');
        setSettingsMessage('Saved.');
      }
    } catch (err: any) {
      setSettingsMessage(err?.response?.data?.message || 'Could not save settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data } = await api.post('/hospital/insurance/emails/smtp-test', {
        smtpHost: settings.smtpHost, smtpPort: settings.smtpPort,
        email: settings.smtpUsername, password: smtpPasswordInput,
      });
      setTestResult({ ok: data.success, msg: data.message });
    } catch (err: any) {
      setTestResult({ ok: false, msg: err?.response?.data?.message || 'Test failed.' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <HospDeptLayout deptKey="insurance-desk" deptName="Insurance Desk" badgeLabel="Ins. Desk"
      loginPath="/insurance-desk/login" DeptIcon={ShieldCheck} navSections={navSections}
      title="Email Inbox" subtitle="TPA/insurer emails — AI-parsed into folders and linked to claims" copilotModule="insurance">
      <div className="flex items-center justify-end gap-2 mb-3">
        <Button variant="outline" size="sm" className="gap-1" onClick={reparseSelected} disabled={!selected || reparsing}>
          {reparsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Re-parse
        </Button>
        <Button variant="outline" size="sm" className="gap-1" onClick={handleSync} disabled={syncing}>
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {syncing ? 'Syncing…' : 'Sync Inbox'}
        </Button>
        <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={() => { setCompose({ to: '', subject: '', body: '' }); setShowCompose(true); }}>
          <Plus className="h-4 w-4" /> Compose
        </Button>
      </div>
      {syncMessage && <p className="text-sm text-muted-foreground mb-3">{syncMessage}</p>}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {[
          { label: 'Unread', value: stats.unread, icon: Mail },
          { label: 'Pre-Auth', value: stats.preauths, icon: ShieldCheck },
          { label: 'Payments', value: stats.payments, icon: IndianRupee },
          { label: 'Queries', value: stats.queries, icon: Search },
          { label: 'Auto-Captured', value: stats.captures, icon: Zap },
        ].map((s) => (
          <Card key={s.label}><CardContent className="p-3 flex items-center gap-3">
            <s.icon className="h-6 w-6 text-teal-600 opacity-80" />
            <div><p className="text-lg font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
          </CardContent></Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="inbox" className="gap-1"><Inbox className="h-3.5 w-3.5" /> Inbox</TabsTrigger>
          <TabsTrigger value="capture" className="gap-1"><Zap className="h-3.5 w-3.5" /> Payment Capture</TabsTrigger>
          <TabsTrigger value="settings" className="gap-1"><Settings className="h-3.5 w-3.5" /> SMTP / IMAP</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-4">
          <div className="flex gap-4">
            <div className="w-44 shrink-0 space-y-1">
              {FOLDERS.map((f) => (
                <button key={f.key} onClick={() => setLabelFilter(f.key)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    labelFilter === f.key ? 'bg-teal-100 text-teal-700 font-medium dark:bg-teal-900/40 dark:text-teal-300' : 'hover:bg-muted text-muted-foreground'
                  }`}>
                  <f.icon className="h-4 w-4" /> {f.label}
                </button>
              ))}
            </div>

            <div className="flex-1 min-w-0">
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9 h-9" placeholder="Search emails…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') fetchInbox(); }} />
              </div>
              {loadError && <p className="text-sm text-red-600 mb-2">{loadError}</p>}

              <div className="grid md:grid-cols-5 gap-3">
                <div className="md:col-span-2 space-y-1 overflow-y-auto max-h-[600px]">
                  {loading ? (
                    <div className="h-32 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
                  ) : emails.length === 0 ? (
                    <p className="text-center py-12 text-muted-foreground text-sm">No emails in this folder.</p>
                  ) : emails.map((email) => (
                    <div key={email.id} onClick={() => openEmail(email)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        selected?.id === email.id ? 'bg-teal-500/10 border-teal-300 dark:border-teal-700' : 'hover:bg-muted/40 border-transparent'
                      } ${!email.isRead ? 'bg-card' : 'bg-muted/20'}`}>
                      <div className="flex items-start justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {!email.isRead && <div className="w-2 h-2 rounded-full bg-teal-500 shrink-0 mt-1" />}
                          <span className={`text-xs truncate ${!email.isRead ? 'font-semibold' : ''}`}>{email.fromName || email.fromEmail}</span>
                        </div>
                        <button onClick={(ev) => { ev.stopPropagation(); toggleStar(email.id); }} className={`text-xs ${email.isStarred ? 'text-amber-400' : 'text-muted-foreground'}`}>★</button>
                      </div>
                      <p className={`text-xs mt-0.5 leading-tight line-clamp-2 ${!email.isRead ? 'font-medium' : 'text-muted-foreground'}`}>{email.subject}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge className={`text-[10px] px-1.5 py-0 ${LABEL_STYLES[email.label] || LABEL_STYLES.general}`}>{email.label}</Badge>
                        {email.utr && <Zap className="h-3 w-3 text-purple-500" />}
                        <span className="text-[10px] text-muted-foreground ml-auto">{fmtDate(email.receivedAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="md:col-span-3">
                  {!selected ? (
                    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border rounded-lg">
                      <MailOpen className="h-10 w-10 mb-2 opacity-30" /><p className="text-sm">Select an email to read</p>
                    </div>
                  ) : (
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <CardTitle className="text-sm font-semibold leading-snug">{selected.subject}</CardTitle>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <Badge className={`text-[10px] px-2 py-0.5 ${LABEL_STYLES[selected.label] || LABEL_STYLES.general}`}>{selected.label}</Badge>
                              {selected.claimNumbers?.[0] && <Badge variant="outline" className="text-[10px] font-mono">{selected.claimNumbers[0]}</Badge>}
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={handleAiReply} disabled={aiDraftLoading}>
                              {aiDraftLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />} AI Reply
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => { setCompose({ to: selected.fromEmail, subject: `Re: ${selected.subject}`, body: '' }); setShowCompose(true); }}>
                              <Reply className="h-3 w-3" /> Reply
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => toggleArchive(selected)}>
                              <Archive className="h-3 w-3" /> Archive
                            </Button>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                          <div><span className="font-medium">From:</span> {selected.fromName || ''} &lt;{selected.fromEmail}&gt;</div>
                          <div><span className="font-medium">Date:</span> {fmtDate(selected.receivedAt)}</div>
                        </div>
                        {selected.aiSummary && (
                          <div className="mt-2 rounded-md bg-teal-50 border border-teal-100 px-3 py-2 text-xs text-teal-800 dark:bg-teal-900/20 dark:text-teal-300">
                            <span className="font-semibold">AI Summary: </span>{selected.aiSummary}
                            {selected.aiSuggestedAction && <span className="ml-2">→ <span className="font-medium">{selected.aiSuggestedAction}</span></span>}
                          </div>
                        )}
                      </CardHeader>
                      <CardContent>
                        <pre className="text-xs leading-relaxed font-sans whitespace-pre-wrap bg-muted/40 rounded-lg p-4 max-h-64 overflow-y-auto">{selected.bodyText}</pre>
                        {(selected.attachments?.length || 0) > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selected.attachments!.map((a, i) => (
                              <div key={i} className="flex items-center gap-1.5 text-xs border rounded px-2 py-1 bg-muted/40"><Paperclip className="h-3 w-3" />{a.filename}<Download className="h-3 w-3 text-teal-500 ml-1" /></div>
                            ))}
                          </div>
                        )}
                        {selected.utr && (
                          <div className="mt-3 rounded-lg p-3 text-xs flex items-start gap-2 bg-emerald-50 border border-emerald-200 dark:bg-emerald-900/20">
                            <Zap className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
                            <div>
                              <p className="font-semibold text-emerald-700">Payment Auto-Captured</p>
                              <p className="text-emerald-700">UTR: <span className="font-mono font-bold">{selected.utr}</span>{selected.paymentAmount ? ` — ${inr(selected.paymentAmount)}` : ''}{selected.insurerName ? ` from ${selected.insurerName}` : ''}</p>
                              {(selected.nmeAmount || selected.tdsAmount || selected.discountAmount || selected.disallowanceAmount) && (
                                <p className="text-emerald-600 mt-0.5">Deductions — NME {inr(selected.nmeAmount)} · TDS {inr(selected.tdsAmount)} · Discount {inr(selected.discountAmount)} · Disallowance {inr(selected.disallowanceAmount)}</p>
                              )}
                              <p className="text-emerald-600 mt-0.5">Linked claim auto-updated to reflect this settlement.</p>
                            </div>
                          </div>
                        )}
                        {!selected.utr && selected.preAuthStatus && (
                          <div className="mt-3 rounded-lg p-3 text-xs flex items-start gap-2 bg-blue-50 border border-blue-200 dark:bg-blue-900/20">
                            <Zap className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
                            <div>
                              <p className="font-semibold text-blue-700">Pre-Auth Status Captured</p>
                              <p className="text-blue-700">
                                {selected.claimNumbers?.[0] && <>Claim <span className="font-mono font-bold">{selected.claimNumbers[0]}</span> → </>}
                                Status: <span className="font-semibold capitalize">{selected.preAuthStatus}</span>{selected.approvedAmount ? ` — Approved: ${inr(selected.approvedAmount)}` : ''}
                              </p>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="capture" className="mt-4 space-y-4">
          <Card className="border-purple-200 bg-purple-50 dark:bg-purple-900/10">
            <CardContent className="p-4 flex items-start gap-3">
              <Zap className="h-7 w-7 text-purple-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-purple-800 dark:text-purple-300">Automatic Payment Capture</p>
                <p className="text-sm text-purple-700 dark:text-purple-400 mt-0.5">Every synced email is AI-parsed for UTR/amount/deductions and, when it matches a claim number on file, the claim's settlement status is updated automatically.</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><IndianRupee className="h-4 w-4 text-emerald-600" /> Auto-Captured Payments — {captures.length}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50"><tr>
                    <th className="py-2 px-4 text-left font-medium">UTR</th>
                    <th className="py-2 px-4 text-right font-medium">Amount</th>
                    <th className="py-2 px-4 text-left font-medium">Insurer</th>
                    <th className="py-2 px-4 text-left font-medium">Date</th>
                    <th className="py-2 px-4 text-left font-medium">Claims Linked</th>
                    <th className="py-2 px-4 text-left font-medium">Status</th>
                  </tr></thead>
                  <tbody>
                    {captures.length === 0 ? (
                      <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No payment advices captured yet.</td></tr>
                    ) : captures.map((c) => (
                      <tr key={c.id} className="border-t">
                        <td className="py-2 px-4 font-mono text-xs">{c.utr}</td>
                        <td className="py-2 px-4 text-right font-semibold text-emerald-700">{inr(c.paymentAmount)}</td>
                        <td className="py-2 px-4">{c.insurerName || '—'}</td>
                        <td className="py-2 px-4">{fmtDate(c.receivedAt)}</td>
                        <td className="py-2 px-4 font-mono text-xs">{c.claimNumbers?.join(', ') || '—'}</td>
                        <td className="py-2 px-4">
                          {c.portalUpdated
                            ? <Badge className="bg-emerald-100 text-emerald-700 gap-1"><Link2 className="h-3 w-3" /> Linked</Badge>
                            : <Badge variant="outline" className="text-muted-foreground">Not linked</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><ArrowLeftRight className="h-4 w-4" /> SMTP &amp; IMAP Configuration</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="grid md:grid-cols-2 gap-4">
                <div><Label className="text-xs">Insurance Desk Email</Label><Input value={settings.email} onChange={(e) => setSettings((s) => ({ ...s, email: e.target.value }))} /></div>
                <div><Label className="text-xs">Display Name</Label><Input value={settings.displayName || ''} onChange={(e) => setSettings((s) => ({ ...s, displayName: e.target.value }))} /></div>
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="font-medium text-sm flex items-center gap-2"><Send className="h-4 w-4 text-teal-500" /> Outgoing (SMTP)</h4>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2"><Label className="text-xs">SMTP Host</Label><Input value={settings.smtpHost || ''} onChange={(e) => setSettings((s) => ({ ...s, smtpHost: e.target.value }))} className="font-mono" /></div>
                    <div><Label className="text-xs">Port</Label><Input type="number" value={settings.smtpPort || ''} onChange={(e) => setSettings((s) => ({ ...s, smtpPort: parseInt(e.target.value) || null }))} className="font-mono" /></div>
                  </div>
                  <div><Label className="text-xs">SMTP Username</Label><Input value={settings.smtpUsername || ''} onChange={(e) => setSettings((s) => ({ ...s, smtpUsername: e.target.value }))} /></div>
                  <div><Label className="text-xs">SMTP Password {settings.hasSmtpPassword && <span className="text-muted-foreground">(saved — leave blank to keep)</span>}</Label><Input type="password" value={smtpPasswordInput} onChange={(e) => setSmtpPasswordInput(e.target.value)} /></div>
                </div>
                <div className="space-y-3">
                  <h4 className="font-medium text-sm flex items-center gap-2"><Inbox className="h-4 w-4 text-emerald-500" /> Incoming (IMAP)</h4>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2"><Label className="text-xs">IMAP Host</Label><Input value={settings.imapHost || ''} onChange={(e) => setSettings((s) => ({ ...s, imapHost: e.target.value }))} className="font-mono" /></div>
                    <div><Label className="text-xs">Port</Label><Input type="number" value={settings.imapPort || ''} onChange={(e) => setSettings((s) => ({ ...s, imapPort: parseInt(e.target.value) || null }))} className="font-mono" /></div>
                  </div>
                  <div><Label className="text-xs">IMAP Username</Label><Input value={settings.imapUsername || ''} onChange={(e) => setSettings((s) => ({ ...s, imapUsername: e.target.value }))} /></div>
                  <div><Label className="text-xs">IMAP Password {settings.hasImapPassword && <span className="text-muted-foreground">(saved — leave blank to keep)</span>}</Label><Input type="password" value={imapPasswordInput} onChange={(e) => setImapPasswordInput(e.target.value)} /></div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={testConnection} disabled={testing} className="gap-1">
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />} Test Connection
                </Button>
                <Button className="bg-teal-600 hover:bg-teal-700 gap-1" onClick={saveSettings} disabled={savingSettings}>
                  {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save Configuration
                </Button>
                {testResult && <span className={`text-sm ${testResult.ok ? 'text-emerald-600' : 'text-red-600'}`}>{testResult.msg}</span>}
                {settingsMessage && <span className="text-sm text-muted-foreground">{settingsMessage}</span>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showCompose} onOpenChange={setShowCompose}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Send className="h-4 w-4" /> Compose Email</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">To</Label><Input placeholder="claims@insurer.com" value={compose.to} onChange={(e) => setCompose((c) => ({ ...c, to: e.target.value }))} /></div>
            <div><Label className="text-xs">Subject</Label><Input value={compose.subject} onChange={(e) => setCompose((c) => ({ ...c, subject: e.target.value }))} /></div>
            <div><Label className="text-xs">Body</Label><Textarea rows={10} value={compose.body} onChange={(e) => setCompose((c) => ({ ...c, body: e.target.value }))} className="font-sans text-sm" /></div>
            {sendMessage && <p className="text-sm text-red-600">{sendMessage}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompose(false)}>Cancel</Button>
            <Button className="bg-teal-600 hover:bg-teal-700 gap-1" onClick={handleSend} disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HospDeptLayout>
  );
};

export default InsuranceDeskEmailInbox;
