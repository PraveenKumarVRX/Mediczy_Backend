import { useEffect, useState, useCallback } from 'react';
import HospDeptLayout from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ShieldCheck, RefreshCw, Loader2, MessageSquare, Bell, Send, AlertTriangle, X,
} from 'lucide-react';
import api from '@/utils/api';
import { navSections } from './navSections';

interface Message { id: string; from: string; sender: string; text: string; time: string }
interface Thread {
  id: string; claimNo?: string; patientName?: string; insurer?: string; tpa?: string; subject: string;
  lastMsg?: string; unread?: number; timestamp?: string; priority: string; status: string; messages: Message[];
}
interface Notification { id: string; type: string; title: string; message: string; priority: string; read: boolean; time: string }

const PRIORITY_STYLES: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  high: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  normal: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

const formatTime = (v?: string) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

const InsuranceDeskMessages = () => {
  const [tab, setTab] = useState('threads');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selected, setSelected] = useState<Thread | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const loadThreads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/hospital/insurance/portal/messages');
      setThreads(data.threads || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load messages.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/hospital/insurance/portal/notifications');
      setNotifications(data.notifications || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (tab === 'threads') loadThreads(); else loadNotifications(); }, [tab, loadThreads, loadNotifications]);

  const openThread = async (thread: Thread) => {
    setSelected(thread);
    if (thread.unread) {
      try { await api.post(`/hospital/insurance/portal/messages/${thread.id}/read`); loadThreads(); } catch { /* ignore */ }
    }
  };

  const sendReply = async () => {
    if (!selected || !replyText.trim()) return;
    setSending(true);
    try {
      await api.post(`/hospital/insurance/portal/messages/${selected.id}/reply`, { text: replyText.trim() });
      setReplyText('');
      loadThreads();
      const { data } = await api.get('/hospital/insurance/portal/messages');
      const updated = (data.threads || []).find((t: Thread) => t.id === selected.id);
      if (updated) setSelected(updated);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not send reply.');
    } finally {
      setSending(false);
    }
  };

  const escalate = async (thread: Thread) => {
    if (!window.confirm(`Escalate thread "${thread.subject}"?`)) return;
    try {
      await api.post(`/hospital/insurance/portal/messages/${thread.id}/escalate`);
      loadThreads();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not escalate.');
    }
  };

  const markAllRead = async () => {
    try {
      await api.post('/hospital/insurance/portal/notifications/mark-all-read');
      loadNotifications();
    } catch { /* ignore */ }
  };

  return (
    <HospDeptLayout deptKey="insurance-desk" deptName="Insurance Desk" badgeLabel="Ins. Desk"
      loginPath="/insurance-desk/login" DeptIcon={ShieldCheck} navSections={navSections}
      title="Messages & Notifications" subtitle="Payer/TPA communication threads and system alerts" copilotModule="insurance">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Messages</CardTitle>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => (tab === 'threads' ? loadThreads() : loadNotifications())}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-amber-600 mb-3">{error}</p>}
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="threads" className="gap-1"><MessageSquare className="h-3.5 w-3.5" /> Threads</TabsTrigger>
              <TabsTrigger value="notifications" className="gap-1"><Bell className="h-3.5 w-3.5" /> Notifications</TabsTrigger>
            </TabsList>

            <TabsContent value="threads" className="mt-4">
              {loading ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…</div>
              ) : (
                <div className="grid md:grid-cols-5 gap-3">
                  <div className="md:col-span-2 space-y-1 overflow-y-auto max-h-[500px]">
                    {threads.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-10">No message threads yet.</p>
                    ) : threads.map((t) => (
                      <div key={t.id} onClick={() => openThread(t)}
                        className={`p-3 rounded-lg border cursor-pointer ${selected?.id === t.id ? 'bg-teal-500/10 border-teal-300' : 'hover:bg-muted/40 border-transparent'}`}>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-medium truncate">{t.patientName || t.subject}</span>
                          {!!t.unread && <Badge className="bg-teal-600 text-white text-[10px]">{t.unread}</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{t.lastMsg || t.subject}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge className={`text-[10px] px-1.5 py-0 ${PRIORITY_STYLES[t.priority] || PRIORITY_STYLES.normal}`}>{t.priority}</Badge>
                          <span className="text-[10px] text-muted-foreground ml-auto">{formatTime(t.timestamp)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="md:col-span-3">
                    {!selected ? (
                      <div className="h-48 flex items-center justify-center text-muted-foreground border rounded-lg"><p className="text-sm">Select a thread</p></div>
                    ) : (
                      <Card>
                        <CardHeader className="pb-3 flex flex-row items-center justify-between">
                          <div>
                            <CardTitle className="text-sm">{selected.subject}</CardTitle>
                            <p className="text-xs text-muted-foreground mt-1">{selected.patientName} {selected.claimNo ? `· ${selected.claimNo}` : ''} {selected.insurer ? `· ${selected.insurer}` : ''}</p>
                          </div>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => escalate(selected)}>
                              <AlertTriangle className="h-3 w-3" /> Escalate
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setSelected(null)}><X className="h-3.5 w-3.5" /></Button>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2 max-h-64 overflow-y-auto mb-3">
                            {(selected.messages || []).map((m) => (
                              <div key={m.id} className={`p-2 rounded-lg text-sm max-w-[85%] ${m.from === 'hospital' ? 'bg-teal-50 dark:bg-teal-950/30 ml-auto text-right' : 'bg-muted/50'}`}>
                                <p>{m.text}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">{m.sender} · {formatTime(m.time)}</p>
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <Textarea rows={2} value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Type a reply…" className="text-sm" />
                            <Button size="sm" className="bg-teal-600 hover:bg-teal-700 gap-1 self-end" onClick={sendReply} disabled={sending || !replyText.trim()}>
                              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="notifications" className="mt-4">
              <div className="flex justify-end mb-2">
                <Button size="sm" variant="outline" onClick={markAllRead}>Mark all read</Button>
              </div>
              {loading ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…</div>
              ) : notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">No notifications.</p>
              ) : (
                <div className="space-y-2">
                  {notifications.map((n) => (
                    <div key={n.id} className={`flex items-start gap-2 p-3 rounded-lg border ${n.read ? 'opacity-60' : ''}`}>
                      <Bell className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{n.title}</p>
                          <Badge className={`text-[10px] px-1.5 py-0 ${PRIORITY_STYLES[n.priority] || PRIORITY_STYLES.normal}`}>{n.priority}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{n.message}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{formatTime(n.time)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </HospDeptLayout>
  );
};

export default InsuranceDeskMessages;
