import { useEffect, useMemo, useRef, useState } from 'react';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  escalatePortalMessage,
  fetchPortalMessages,
  formatRelativePortalTime,
  markPortalMessageRead,
  replyToPortalMessage,
} from '@/utils/hospitalInsurancePortalApi';
import {
  MessageSquare, Send, Search, AlertCircle,
  FileText, Upload, Phone, RefreshCw, User,
} from 'lucide-react';

type PortalMessage = {
  id: string;
  from: 'hospital' | 'tpa';
  sender: string;
  text: string;
  time: string;
  attachments?: string[];
};

type PortalThread = {
  id: string;
  claimNo: string;
  patientName: string;
  insurer: string;
  tpa: string;
  subject: string;
  lastMsg: string;
  timestamp: string;
  unread: number;
  priority: string;
  status: string;
  messages: PortalMessage[];
};

const priorityColors: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-amber-100 text-amber-700',
  normal: 'bg-blue-100 text-blue-700',
};

const statusColors: Record<string, string> = {
  query: 'bg-amber-100 text-amber-700',
  pending: 'bg-blue-100 text-blue-700',
  settled: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

const InsuranceMessagesPage = () => {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [threads, setThreads] = useState<PortalThread[]>([]);
  const [filterPriority, setFilterPriority] = useState('all');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadThreads = async () => {
      try {
        setLoading(true);
        const response = await fetchPortalMessages();
        const nextThreads = response.threads || [];
        setThreads(nextThreads);
        setActiveThreadId((current) => current || nextThreads[0]?.id || null);
      } catch (error: any) {
        toast({ title: 'Unable to load messages', description: error?.response?.data?.message || 'Try again shortly.', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    loadThreads();
  }, [toast]);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) || null,
    [activeThreadId, threads],
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeThread?.messages]);

  const filtered = threads.filter((t) => {
    const matchSearch = !searchTerm || t.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.claimNo.toLowerCase().includes(searchTerm.toLowerCase()) || t.insurer.toLowerCase().includes(searchTerm.toLowerCase());
    const matchPriority = filterPriority === 'all' || t.priority === filterPriority;
    return matchSearch && matchPriority;
  });

  const handleSelectThread = async (thread: PortalThread) => {
    setActiveThreadId(thread.id);
    if (thread.unread > 0) {
      setThreads((prev) => prev.map((item) => item.id === thread.id ? { ...item, unread: 0 } : item));
      try {
        await markPortalMessageRead(thread.id);
      } catch {
        setThreads((prev) => prev.map((item) => item.id === thread.id ? { ...item, unread: thread.unread } : item));
      }
    }
  };

  const handleSend = async () => {
    if (!replyText.trim() || !activeThread) return;
    try {
      setSending(true);
      const response = await replyToPortalMessage(activeThread.id, { text: replyText.trim() });
      const updatedThread = response.thread;
      setThreads((prev) => prev.map((thread) => thread.id === updatedThread.id ? updatedThread : thread));
      setReplyText('');
      toast({ title: 'Reply Sent', description: `Message sent to ${activeThread.tpa}` });
    } catch (error: any) {
      toast({ title: 'Reply failed', description: error?.response?.data?.message || 'Unable to send reply.', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handleEscalate = async () => {
    if (!activeThread) return;
    try {
      const response = await escalatePortalMessage(activeThread.id);
      const updatedThread = response.thread;
      setThreads((prev) => prev.map((thread) => thread.id === updatedThread.id ? updatedThread : thread));
      toast({ title: 'Thread escalated', description: `Escalation flagged for ${activeThread.claimNo}.` });
    } catch (error: any) {
      toast({ title: 'Escalation failed', description: error?.response?.data?.message || 'Unable to escalate thread.', variant: 'destructive' });
    }
  };

  return (
    <InsurancePortalLayout title="TPA Messages" subtitle="Query replies & insurer communication">
      <div className="flex h-[calc(100vh-180px)] gap-4">
        {/* Thread list */}
        <div className="w-80 flex-shrink-0 flex flex-col border border-border rounded-xl overflow-hidden bg-card shadow-sm">
          <div className="p-3 border-b border-border space-y-2 bg-gradient-to-r from-purple-500/5 to-blue-500/5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8 h-8 text-sm" placeholder="Search claims, patients..." value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <div className="flex gap-1">
              {['all', 'urgent', 'high', 'normal'].map(p => (
                <button key={p} onClick={() => setFilterPriority(p)}
                  className={`text-xs px-2 py-1 rounded-full capitalize ${filterPriority === p ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y">
            {loading ? (
              <div className="p-6 text-center text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Loading message threads...</p>
              </div>
            ) : filtered.map(t => (
              <div key={t.id}
                className={`p-3 cursor-pointer transition-colors ${activeThread?.id === t.id ? 'bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-l-4 border-purple-500' : 'hover:bg-muted/40'}`}
                onClick={() => { void handleSelectThread(t); }}>
                <div className="flex items-start justify-between gap-1">
                  <span className="font-mono text-xs font-bold text-indigo-600">{t.claimNo}</span>
                  <div className="flex items-center gap-1">
                    <Badge className={`text-xs py-0 ${priorityColors[t.priority]}`}>{t.priority}</Badge>
                    {t.unread > 0 && <span className="bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{t.unread}</span>}
                  </div>
                </div>
                <p className="text-sm font-medium mt-0.5">{t.patientName}</p>
                <p className="text-xs text-muted-foreground">{t.insurer} / {t.tpa}</p>
                <p className="text-xs text-muted-foreground mt-1 truncate">{t.lastMsg}</p>
                <div className="flex justify-between items-center mt-1">
                  <Badge className={`text-xs py-0 ${statusColors[t.status]}`}>{t.status}</Badge>
                  <span className="text-xs text-muted-foreground">{formatRelativePortalTime(t.timestamp)}</span>
                </div>
              </div>
            ))}
            {!loading && filtered.length === 0 && (
              <div className="p-6 text-center text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No messages found</p>
              </div>
            )}
          </div>
        </div>

        {/* Chat area */}
        {activeThread ? (
          <div className="flex-1 flex flex-col border border-border rounded-xl overflow-hidden bg-card shadow-sm">
            {/* Header */}
            <div className="p-4 border-b border-border bg-gradient-to-r from-purple-500/5 to-blue-500/5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{activeThread.subject}</span>
                  <Badge className={statusColors[activeThread.status]}>{activeThread.status}</Badge>
                  <Badge className={priorityColors[activeThread.priority]}>{activeThread.priority}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{activeThread.claimNo} | {activeThread.patientName} | {activeThread.insurer}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline"><Phone className="h-3 w-3 mr-1" />Call TPA</Button>
                <Button size="sm" variant="outline" onClick={() => { void handleEscalate(); }}><RefreshCw className="h-3 w-3 mr-1" />Escalate</Button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {activeThread.messages.map((m) => (
                <div key={m.id} className={`flex ${m.from === 'hospital' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-md rounded-xl p-3 ${m.from === 'hospital' ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white' : 'bg-muted text-foreground border border-border'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <User className="h-3 w-3" />
                      <span className="text-xs font-semibold">{m.sender}</span>
                      <span className="text-xs opacity-70">{formatRelativePortalTime(m.time)}</span>
                    </div>
                    <p className="text-sm">{m.text}</p>
                    {m.attachments?.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {m.attachments.map((a, i) => (
                          <Badge key={i} className="text-xs bg-white/20"><FileText className="h-3 w-3 mr-1" />{a}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Query info banner for queries */}
            {activeThread.status === 'query' && (
              <div className="mx-4 mb-2 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-2 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-200">
                <AlertCircle className="h-3 w-3 flex-shrink-0" />
                Query raised by TPA. Respond within 24h to avoid claim delay. Attach relevant documents.
              </div>
            )}

            {/* Reply box */}
            <div className="p-4 border-t">
              <div className="flex gap-2">
                <Textarea
                  placeholder={`Reply to ${activeThread.tpa}...`}
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  rows={2}
                  className="flex-1 resize-none"
                  onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleSend(); }}
                />
                <div className="flex flex-col gap-2">
                  <Button size="sm" variant="outline" title="Attach Document">
                    <Upload className="h-4 w-4" />
                  </Button>
                  <Button size="sm" onClick={() => { void handleSend(); }} disabled={!replyText.trim() || sending}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Ctrl+Enter to send</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center border border-border rounded-xl bg-card shadow-sm">
            <div className="text-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Select a conversation</p>
              <p className="text-sm">Choose a TPA message thread from the left panel</p>
            </div>
          </div>
        )}
      </div>
    </InsurancePortalLayout>
  );
};

export default InsuranceMessagesPage;
