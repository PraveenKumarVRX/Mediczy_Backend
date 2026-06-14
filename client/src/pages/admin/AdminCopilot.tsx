/**
 * AdminCopilot — conversational ops assistant for platform/hospital admins.
 * Wired to POST /api/v3/ai-brain/agents/process (Admin Agent + personas).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Bot, Send, Loader2, Shield, ExternalLink, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, Sparkles, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  processMessage,
  getPendingActions,
  approveAction,
  QUICK_PROMPTS,
  DEEP_LINKS,
  type CopilotPersona,
  type ChatMessage,
  type PendingAction,
  PERSONA_AGENTS,
} from '@/services/adminCopilot';

interface UiMessage extends ChatMessage {
  id: string;
  meta?: { latencyMs?: number; agents?: string[] };
}

const PERSONAS: { id: CopilotPersona; label: string; description: string }[] = [
  { id: 'ops', label: 'Ops Copilot', description: 'Platform & tenant operations' },
  { id: 'analytics', label: 'Analytics', description: 'Data & population insights' },
  { id: 'revenue', label: 'Revenue', description: 'Billing, TPA, insurance' },
  { id: 'quality', label: 'Quality', description: 'Compliance & governance' },
];

const uid = () => Math.random().toString(36).slice(2);

function renderMarkdownLite(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');
}

export default function AdminCopilot({
  defaultPersona = 'ops' as CopilotPersona,
  lockPersona = false,
}: {
  defaultPersona?: CopilotPersona;
  lockPersona?: boolean;
}) {
  const [persona, setPersona] = useState<CopilotPersona>(defaultPersona);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [lastTaskPlan, setLastTaskPlan] = useState<Record<string, unknown> | null>(null);
  const [toolEvents, setToolEvents] = useState<string[]>([]);
  const [useStreaming, setUseStreaming] = useState(true);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [conversationId, setConversationId] = useState<number | undefined>(() => {
    const stored = sessionStorage.getItem('adminCopilotConversationId');
    return stored ? parseInt(stored, 10) : undefined;
  });
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadPending = useCallback(async () => {
    try {
      const actions = await getPendingActions();
      setPendingActions(actions);
    } catch { /* optional */ }
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setError(null);
    setToolEvents([]);
    const userMsg: UiMessage = { id: uid(), role: 'user', content: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const contextMessages: ChatMessage[] = [...messages, userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const result = await processMessage(trimmed, {
        conversationId,
        contextMessages: contextMessages.slice(-10),
        persona,
        stream: useStreaming,
        onEvent: (event) => {
          if (event.type === 'tool_start') {
            setToolEvents(prev => [...prev, `▶ ${event.tool}`]);
          }
          if (event.type === 'tool_result') {
            setToolEvents(prev => [...prev, `✓ ${event.tool}`]);
          }
          if (event.type === 'plan') {
            setLastTaskPlan(event.taskPlan as Record<string, unknown>);
          }
        },
      });

      if (result.taskPlan) setLastTaskPlan(result.taskPlan);

      const agentIds = (result.agentsUsed || []).map(a => (typeof a === 'string' ? a : a.id));
      setMessages(prev => [
        ...prev,
        {
          id: uid(),
          role: 'assistant',
          content: result.response || 'No response.',
          meta: { latencyMs: result.meta?.latencyMs, agents: agentIds },
        },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Request failed';
      setError(msg);
      if (msg.toLowerCase().includes('kill switch') || msg.includes('503')) {
        setError(`${msg} — check AI Guard at /admin/ai-guard`);
      }
    } finally {
      setLoading(false);
      loadPending();
    }
  };

  const handleApproval = async (actionId: string, approve: boolean) => {
    try {
      await approveAction(actionId, approve);
      await loadPending();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Approval failed');
    }
  };

  const agentBadge = PERSONA_AGENTS[persona];

  return (
    <AdminLayout>
      <div className="flex flex-col gap-4 p-4 lg:p-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bot className="h-7 w-7 text-violet-500" />
              Admin Copilot
              <Badge variant="secondary" className="ml-1">{agentBadge} agent</Badge>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              AI-assisted ops tool. Verify critical actions in the governance dashboard.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {DEEP_LINKS.map(link => (
              <Button key={link.path} variant="outline" size="sm" asChild>
                <Link to={link.path}>
                  <ExternalLink className="h-3 w-3 mr-1" />
                  {link.label}
                </Link>
              </Button>
            ))}
          </div>
        </div>

        {defaultPersona === 'clinical' && (
          <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
            <CardContent className="pt-4 flex gap-2 text-amber-800 dark:text-amber-200 text-sm">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              Clinical oversight mode — outputs may surface Class IIb/III AI. Always verify with governance explanations.
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 flex flex-col min-h-[520px]">
            <CardHeader className="pb-2 border-b">
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <Select
                  value={persona}
                  onValueChange={(v) => setPersona(v as CopilotPersona)}
                  disabled={lockPersona}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERSONAS.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useStreaming}
                    onChange={e => setUseStreaming(e.target.checked)}
                    className="rounded"
                  />
                  Stream progress
                </label>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col pt-4 gap-3 overflow-hidden">
              <div className="flex-1 overflow-y-auto space-y-3 min-h-[280px]" aria-live="polite">
                {messages.length === 0 && (
                  <div className="text-center text-muted-foreground py-12">
                    <Sparkles className="h-10 w-10 mx-auto mb-3 text-violet-400" />
                    <p>Ask about agents, audit logs, system status, or governance.</p>
                  </div>
                )}
                {messages.map(m => (
                  <div
                    key={m.id}
                    className={cn(
                      'rounded-lg px-4 py-3 max-w-[90%] text-sm',
                      m.role === 'user'
                        ? 'ml-auto bg-violet-600 text-white'
                        : 'bg-muted'
                    )}
                  >
                    <div dangerouslySetInnerHTML={{ __html: renderMarkdownLite(m.content) }} />
                    {m.meta?.agents && (
                      <p className="text-xs opacity-70 mt-2">
                        {m.meta.agents.join(', ')}
                        {m.meta.latencyMs != null && ` · ${m.meta.latencyMs}ms`}
                      </p>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Thinking…
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {error && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  {error}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                {QUICK_PROMPTS.map(q => (
                  <Button key={q} variant="secondary" size="sm" className="text-xs h-7" onClick={() => send(q)}>
                    {q}
                  </Button>
                ))}
              </div>

              <div className="flex gap-2">
                <Textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Ask the admin copilot…"
                  className="min-h-[44px] resize-none"
                  rows={2}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                />
                <Button onClick={() => send(input)} disabled={loading || !input.trim()} className="shrink-0">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2 cursor-pointer" onClick={() => setInspectorOpen(!inspectorOpen)}>
                <CardTitle className="text-sm flex items-center justify-between">
                  Inspector
                  {inspectorOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </CardTitle>
              </CardHeader>
              {inspectorOpen && (
                <CardContent className="text-xs space-y-3">
                  <div>
                    <p className="font-medium text-muted-foreground mb-1">Agent</p>
                    <Badge>{agentBadge}</Badge>
                  </div>
                  {toolEvents.length > 0 && (
                    <div>
                      <p className="font-medium text-muted-foreground mb-1">Tools</p>
                      <ul className="space-y-1 font-mono">
                        {toolEvents.map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                    </div>
                  )}
                  {lastTaskPlan && (
                    <div>
                      <p className="font-medium text-muted-foreground mb-1">Task plan</p>
                      <pre className="bg-muted p-2 rounded overflow-x-auto max-h-40 text-[10px]">
                        {JSON.stringify(lastTaskPlan, null, 2)}
                      </pre>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>

            {pendingActions.length > 0 && (
              <Card className="border-amber-300">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Pending approvals
                  </CardTitle>
                  <CardDescription>High-risk actions awaiting your confirmation</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {pendingActions.map(a => (
                    <div key={a.action_id} className="border rounded p-2 space-y-2">
                      <p className="text-sm font-medium">{a.summary}</p>
                      <p className="text-xs text-muted-foreground">{a.tool_name}</p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="default" onClick={() => handleApproval(a.action_id, true)}>
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleApproval(a.action_id, false)}>
                          <XCircle className="h-3 w-3 mr-1" /> Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
