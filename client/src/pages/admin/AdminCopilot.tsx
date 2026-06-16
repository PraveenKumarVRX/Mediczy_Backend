import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Bot,
  Send,
  Loader2,
  Shield,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  approveAction,
  extractPendingApproval,
  getCopilotConfig,
  personaToForceAgent,
  processMessage,
  processMessageStream,
  type CopilotMessage,
  type CopilotPersona,
} from '@/services/adminCopilot';

const SESSION_KEY = 'adminCopilotConversationId';

const QUICK_PROMPTS: Record<CopilotPersona, string[]> = {
  ops: [
    'What agents can I invoke?',
    'Summarize pending AI governance changes',
    'Show recent AI agent run history',
    'What is the current system and SIB guard status?',
    'How do I onboard a new corporate tenant?',
  ],
  analytics: [
    'Summarize AI agent telemetry for the last 7 days',
    'What are the top routing tiers used this week?',
    'Show agent run error patterns',
  ],
  revenue: [
    'Summarize insurance-related agent capabilities',
    'What billing tools can the insurance agent access?',
  ],
  quality: [
    'List pending AI governance model changes',
    'What quality gates apply to clinical AI outputs?',
  ],
  clinical: [
    'Explain clinical oversight responsibilities for AI outputs',
    'When must SHAP/LIME explanations be shown to reviewers?',
  ],
};

const PERSONA_LABELS: Record<CopilotPersona, string> = {
  ops: 'Ops (Admin Agent)',
  analytics: 'Analytics',
  revenue: 'Revenue',
  quality: 'Quality',
  clinical: 'Clinical Oversight',
};

const DEEP_LINKS = [
  { label: 'AI Governance', path: '/admin/ai-governance' },
  { label: 'AI Guard', path: '/admin/ai-guard' },
  { label: 'Prompt Manager', path: '/admin/feedback-intelligence/prompts' },
  { label: 'AI Analytics', path: '/admin/ai-analytics' },
];

const TEAM_DEEP_LINKS = [
  { label: 'Team Dashboard', path: '/team/dashboard' },
  { label: 'Reports', path: '/team/reports' },
  { label: 'Activity Logs', path: '/team/activity' },
];

const TEAM_MEMBER_PERSONAS: CopilotPersona[] = ['analytics', 'quality'];
const ALL_PERSONAS: CopilotPersona[] = ['ops', 'analytics', 'revenue', 'quality'];

function readTeamAdminFlag(): boolean {
  try {
    const user = JSON.parse(localStorage.getItem('teamUserData') || 'null');
    if (!user) return false;
    return (
      user.isAdmin === true ||
      ['admin', 'super_admin', 'super admin', 'superadmin'].includes(String(user.role || '').toLowerCase())
    );
  } catch {
    return false;
  }
}

interface ChatEntry extends CopilotMessage {
  id: string;
  meta?: { latencyMs?: number; agentsUsed?: string[] };
  pending?: { actionId: string; summary: string };
}

export interface AdminCopilotProps {
  layout?: 'admin' | 'team';
  defaultPersona?: CopilotPersona;
  clinicalMode?: boolean;
}

export default function AdminCopilot({
  layout = 'admin',
  defaultPersona = 'ops',
  clinicalMode = false,
}: AdminCopilotProps) {
  const Layout = layout === 'team' ? MainLayout : AdminLayout;
  const teamAdmin = layout === 'team' ? readTeamAdminFlag() : true;
  const availablePersonas =
    layout === 'team' && !teamAdmin ? TEAM_MEMBER_PERSONAS : ALL_PERSONAS;
  const deepLinks = layout === 'team' ? TEAM_DEEP_LINKS : DEEP_LINKS;
  const [persona, setPersona] = useState<CopilotPersona>(() => {
    if (clinicalMode) return 'clinical';
    if (layout === 'team' && !teamAdmin) return 'analytics';
    return defaultPersona;
  });
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [lastMeta, setLastMeta] = useState<Record<string, unknown> | null>(null);
  const [lastAgents, setLastAgents] = useState<string[]>([]);
  const [config, setConfig] = useState({ enabled: true, streaming: true, writeActions: false });
  const [approval, setApproval] = useState<{ actionId: string; summary: string } | null>(null);
  const [conversationId, setConversationId] = useState<number | undefined>(() => {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? Number.parseInt(raw, 10) : undefined;
  });
  const bottomRef = useRef<HTMLDivElement>(null);

  const forceAgent = personaToForceAgent(persona);
  const prompts = QUICK_PROMPTS[persona] || QUICK_PROMPTS.ops;

  useEffect(() => {
    getCopilotConfig().then(setConfig).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const contextMessages = useMemo(
    () => messages.slice(-12).map((m) => ({ role: m.role, content: m.content })),
    [messages]
  );

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userEntry: ChatEntry = { id: `u-${Date.now()}`, role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userEntry]);
    setInput('');
    setLoading(true);

    const payload = {
      message: trimmed,
      conversationId,
      contextMessages,
      forceAgent,
      copilotType: persona,
      persona,
    };

    try {
      let responseText = '';
      let meta: Record<string, unknown> = {};
      let agents: string[] = [];

      if (config.streaming) {
        setStreaming(true);
        let streamBuffer = '';
        await processMessageStream(payload, (event) => {
          if (event.type === 'token' && event.content) {
            streamBuffer += event.content;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === 'assistant' && last.id.startsWith('stream-')) {
                return [...prev.slice(0, -1), { ...last, content: streamBuffer }];
              }
              return [...prev, { id: 'stream-live', role: 'assistant', content: streamBuffer }];
            });
          }
          if (event.type === 'response' && event.response) {
            responseText = event.response;
            meta = event.meta || {};
            agents = (event.agentsUsed || []).map((a: { id: string }) => a.id);
            if (event.taskPlan) setLastMeta(event.taskPlan as Record<string, unknown>);
          }
        });
        setStreaming(false);
      }

      if (!responseText) {
        const result = await processMessage(payload);
        if (!result.success) {
          throw new Error(result.error || 'Request failed');
        }
        responseText = result.response;
        meta = result.meta || {};
        agents = (result.agentsUsed || []).map((a) => a.id);
        setLastMeta((result.taskPlan as Record<string, unknown>) || null);
      }

      const pending = extractPendingApproval(responseText);
      const assistant: ChatEntry = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: responseText,
        meta: { latencyMs: meta.latencyMs as number, agentsUsed: agents },
        pending: pending || undefined,
      };

      setMessages((prev) => {
        const withoutStream = prev.filter((m) => m.id !== 'stream-live');
        return [...withoutStream, assistant];
      });
      setLastAgents(agents);
      if (pending) setApproval(pending);
    } catch (error: unknown) {
      const err = error as { response?: { status?: number; data?: { error?: string; code?: string } }; message?: string };
      const status = err.response?.status;
      const msg = err.response?.data?.error || err.message || 'Copilot request failed';

      if (status === 403) {
        toast.error('Insufficient permissions — contact platform admin');
      } else if (status === 503 || err.response?.data?.code === 'COPILOT_DISABLED') {
        toast.error('Admin Copilot is disabled', {
          description: 'Enable ADMIN_COPILOT_ENABLED or check AI Guard kill switch.',
        });
      } else {
        toast.error(msg);
      }

      setMessages((prev) => [
        ...prev,
        { id: `e-${Date.now()}`, role: 'assistant', content: `Error: ${msg}` },
      ]);
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  }, [loading, conversationId, contextMessages, forceAgent, persona, config.streaming]);

  const handleApprove = async (reject = false) => {
    if (!approval) return;
    try {
      const result = await approveAction(approval.actionId, reject);
      toast.success(reject ? 'Action rejected' : 'Action approved and executed');
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          role: 'assistant',
          content: reject
            ? `Rejected pending action ${approval.actionId}.`
            : `Approved action ${approval.actionId}. Result: ${JSON.stringify(result.result || result, null, 2)}`,
        },
      ]);
      setApproval(null);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      toast.error(err.response?.data?.error || err.message || 'Approval failed');
    }
  };

  if (!config.enabled) {
    return (
      <Layout>
        <div className="p-8 max-w-2xl mx-auto text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
          <h1 className="text-2xl font-bold">Admin Copilot Disabled</h1>
          <p className="text-muted-foreground">Set ADMIN_COPILOT_ENABLED=true on the server or contact engineering.</p>
          <Button asChild variant="outline">
            <Link to="/admin/ai-guard">Open AI Guard</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col lg:flex-row gap-4 p-4 lg:p-6 min-h-[calc(100vh-4rem)]">
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Bot className="h-7 w-7 text-violet-500" />
                <h1 className="text-2xl font-bold">
                  {clinicalMode ? 'Clinical Oversight Copilot' : 'Admin Copilot'}
                </h1>
                <Badge className="bg-violet-500/10 text-violet-600 border-violet-500/30">
                  {PERSONA_LABELS[persona]}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {layout === 'team' && !teamAdmin
                  ? 'AI assistant for team workflows — analytics and quality insights.'
                  : 'AI-assisted ops tool. Verify critical actions in the governance dashboard.'}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {!clinicalMode && (
                <Select value={persona} onValueChange={(v) => setPersona(v as CopilotPersona)}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Persona" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePersonas.includes('ops') && <SelectItem value="ops">Ops</SelectItem>}
                    {availablePersonas.includes('analytics') && <SelectItem value="analytics">Analytics</SelectItem>}
                    {availablePersonas.includes('revenue') && <SelectItem value="revenue">Revenue</SelectItem>}
                    {availablePersonas.includes('quality') && <SelectItem value="quality">Quality</SelectItem>}
                  </SelectContent>
                </Select>
              )}
              {layout !== 'team' && (
                <Button variant="outline" size="sm" asChild>
                  <Link to="/admin/ai-governance">
                    <Shield className="h-4 w-4 mr-1" /> Governance
                  </Link>
                </Button>
              )}
            </div>
          </div>

          {clinicalMode && (
            <Card className="mb-4 border-amber-500/30 bg-amber-500/5">
              <CardContent className="py-3 text-sm text-amber-800 dark:text-amber-200">
                Clinical oversight mode — Class III / IIb outputs require physician review, quality gates, and SHAP/LIME via AI Governance.
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-2 mb-3">
            {prompts.map((p) => (
              <Button key={p} variant="outline" size="sm" className="text-xs" onClick={() => sendMessage(p)} disabled={loading}>
                <Sparkles className="h-3 w-3 mr-1" />
                {p.length > 48 ? `${p.slice(0, 48)}…` : p}
              </Button>
            ))}
          </div>

          <Card className="flex-1 flex flex-col min-h-[420px] border-violet-500/20">
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4" aria-live="polite">
              {messages.length === 0 && (
                <p className="text-center text-muted-foreground py-12">
                  {layout === 'team' && !teamAdmin
                    ? 'Ask about reports, analytics, or team workflows.'
                    : 'Ask about agents, governance, audit logs, or system health.'}
                </p>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-violet-600 text-white'
                        : 'bg-muted border border-border'
                    }`}
                  >
                    {m.content}
                    {m.pending && (
                      <div className="mt-2 pt-2 border-t border-amber-500/30">
                        <p className="text-xs text-amber-700">Pending approval: {m.pending.summary}</p>
                        <Button size="sm" className="mt-2 mr-2" onClick={() => setApproval(m.pending!)}>
                          Review
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {streaming ? 'Streaming response…' : 'Thinking…'}
                </div>
              )}
              <div ref={bottomRef} />
            </CardContent>
            <div className="p-4 border-t flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Admin Copilot…"
                rows={2}
                className="resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(input);
                  }
                }}
              />
              <Button
                className="bg-violet-600 hover:bg-violet-700 shrink-0"
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </Card>

          <p className="text-xs text-muted-foreground mt-2 text-center">
            Not for autonomous clinical decisions. Human approval required for write/system tools.
          </p>
        </div>

        <div className={`lg:w-80 shrink-0 ${inspectorOpen ? '' : 'hidden lg:block'}`}>
          <Card className="border-violet-500/20 sticky top-4">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Inspector</CardTitle>
              <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setInspectorOpen(!inspectorOpen)}>
                {inspectorOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Agents used</p>
                <div className="flex flex-wrap gap-1">
                  {lastAgents.length ? lastAgents.map((a) => (
                    <Badge key={a} variant="secondary">{a}</Badge>
                  )) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </div>
              {lastMeta && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Task plan</p>
                  <pre className="text-[10px] bg-muted p-2 rounded max-h-40 overflow-auto">
                    {JSON.stringify(lastMeta, null, 2)}
                  </pre>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Quick links</p>
                <div className="flex flex-col gap-1">
                  {deepLinks.map((l) => (
                    <Link key={l.path} to={l.path} className="text-violet-600 hover:underline flex items-center gap-1 text-xs">
                      <ExternalLink className="h-3 w-3" /> {l.label}
                    </Link>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!approval} onOpenChange={(open) => !open && setApproval(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve write action?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{approval?.summary}</p>
          <p className="text-xs font-mono text-muted-foreground">{approval?.actionId}</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => handleApprove(true)}>Reject</Button>
            <Button className="bg-violet-600" onClick={() => handleApprove(false)}>Approve & run</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
