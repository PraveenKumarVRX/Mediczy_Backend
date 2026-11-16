import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, Send, Loader2, Bot, User, Flame, Target, Mail,
  BarChart3, Zap, RefreshCw, ChevronRight, Copy, Check,
  Megaphone, TrendingUp, Users, Briefcase,
} from 'lucide-react';
import api from '@/utils/api';
import { CRMLayout } from './CRMModulePages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: CopilotAction[];
  toolResult?: { summary: string; data: unknown };
}

interface CopilotAction {
  id: string;
  label: string;
}

interface MarketingContext {
  leadStats: {
    total?: number;
    new_count?: number;
    contacted?: number;
    qualified?: number;
    converted?: number;
    fb_leads?: number;
    web_leads?: number;
    hot_count?: number;
  };
  dealStats: {
    total?: number;
    active?: number;
    pipeline_value?: number;
    won_count?: number;
  };
  hotLeads: { id: number; name: string; company?: string; score: number; source?: string }[];
  campaigns: { id: number; name: string; status: string; subject?: string }[];
  pipelineHealth?: { healthScore?: number; status?: string };
  forecast?: { weighted?: number; dealCount?: number };
}

const authHeaders = () => {
  const t = localStorage.getItem('crmToken');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const uid = () => Math.random().toString(36).slice(2);

const QUICK_PROMPTS = [
  'What should I focus on today to close more deals?',
  'Which leads should I call first this week?',
  'Draft a WhatsApp follow-up for a warm hospital lead',
  'Suggest subject lines for a health check-up reminder email',
  'How can I improve conversion from Facebook leads?',
  'Create a 7-day nurture plan for new website leads',
  'Summarize my pipeline and biggest risks',
  'Help me plan my next email campaign audience and message',
];

const TOOL_BUTTONS = [
  { id: 'bulk_score', label: 'Score All Leads', icon: Zap },
  { id: 'subject_lines', label: 'Subject Lines', icon: Mail },
  { id: 'pipeline_summary', label: 'Pipeline Summary', icon: BarChart3 },
];

const NAV_ACTIONS: Record<string, string> = {
  open_campaigns: '/crm/campaigns',
  open_leads: '/crm/leads',
  open_hot_leads: '/crm/leads',
  create_campaign: '/crm/campaigns/new',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{label}</p>
      <p className={`text-lg font-bold ${accent || 'text-white'}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
    </div>
  );
}

function MessageBubble({ msg, onAction }: { msg: ChatMessage; onAction: (id: string) => void }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
        isUser ? 'bg-violet-500/20' : 'bg-gradient-to-br from-violet-500/30 to-blue-500/30'
      }`}>
        {isUser ? <User className="h-4 w-4 text-violet-300" /> : <Bot className="h-4 w-4 text-violet-300" />}
      </div>
      <div className={`max-w-[85%] space-y-2 ${isUser ? 'items-end' : ''}`}>
        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-violet-600/20 text-violet-100 border border-violet-500/20'
            : 'bg-white/[0.04] text-slate-300 border border-white/[0.06]'
        }`}>
          {msg.content}
        </div>
        {msg.toolResult && (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-300">
            ✓ {msg.toolResult.summary}
          </div>
        )}
        {msg.actions && msg.actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {msg.actions.map(a => (
              <button key={a.id} onClick={() => onAction(a.id)}
                className="text-xs px-3 py-1.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/25 hover:bg-violet-500/25 transition-colors">
                {a.label} <ChevronRight className="inline h-3 w-3" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function CRMMarketingCopilotPage() {
  const navigate = useNavigate();
  const [context, setContext] = useState<MarketingContext | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: uid(),
    role: 'assistant',
    content: "Hi! I'm your Marketing AI Copilot. I can see your live leads, deals, and campaigns — ask me anything about sales strategy, email copy, lead prioritization, or campaign planning.",
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [toolLoading, setToolLoading] = useState<string | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadContext = useCallback(async () => {
    setContextLoading(true);
    try {
      const { data } = await api.get('/crm/ai/marketing/context', { headers: authHeaders() });
      setContext(data.data);
    } catch {
      /* non-fatal */
    } finally {
      setContextLoading(false);
    }
  }, []);

  useEffect(() => { loadContext(); }, [loadContext]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { id: uid(), role: 'user', content: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    try {
      const { data } = await api.post('/crm/ai/marketing/chat', {
        messages: nextMessages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({
          role: m.role,
          content: m.content,
        })),
      }, { headers: authHeaders() });

      const result = data.data;
      setMessages(prev => [...prev, {
        id: uid(),
        role: 'assistant',
        content: result.reply,
        actions: result.actions,
      }]);
      if (result.context) setContext(prev => ({ ...prev, ...result.context }));
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: uid(),
        role: 'assistant',
        content: err.response?.data?.error || 'Sorry, I could not process that. Please try again.',
      }]);
    } finally {
      setLoading(false);
    }
  };

  const runTool = async (tool: string, params: Record<string, unknown> = {}) => {
    setToolLoading(tool);
    try {
      const { data } = await api.post('/crm/ai/marketing/action', { tool, params }, { headers: authHeaders() });
      const result = data.data;
      setMessages(prev => [...prev, {
        id: uid(),
        role: 'assistant',
        content: formatToolResult(tool, result.data),
        toolResult: { summary: result.summary, data: result.data },
      }]);
      if (tool === 'bulk_score') loadContext();
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: uid(),
        role: 'assistant',
        content: `Tool failed: ${err.response?.data?.error || err.message}`,
      }]);
    } finally {
      setToolLoading(null);
    }
  };

  const handleAction = (actionId: string) => {
    const path = NAV_ACTIONS[actionId];
    if (path) { navigate(path); return; }
    if (actionId === 'bulk_score') runTool('bulk_score');
    if (actionId === 'subject_lines') runTool('subject_lines');
    if (actionId === 'pipeline_summary') runTool('pipeline_summary');
  };

  const copyLastAssistant = () => {
    const last = [...messages].reverse().find(m => m.role === 'assistant');
    if (last) {
      navigator.clipboard.writeText(last.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const ls = context?.leadStats || {};
  const ds = context?.dealStats || {};

  return (
    <CRMLayout title="Marketing Copilot">
      <div className="flex flex-col h-[calc(100vh-4rem)] max-h-[900px]">

        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Marketing AI Copilot</h1>
              <p className="text-xs text-slate-500">Campaigns · Leads · Sales pipeline · Live CRM data</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={copyLastAssistant}
              className="text-slate-400 hover:text-white text-xs h-8">
              {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button variant="ghost" size="sm" onClick={loadContext} disabled={contextLoading}
              className="text-slate-400 hover:text-white text-xs h-8">
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${contextLoading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
        </div>

        <div className="flex flex-1 gap-4 min-h-0">

          {/* Left — Live context */}
          <aside className="hidden lg:flex flex-col w-56 xl:w-64 flex-shrink-0 gap-3 overflow-y-auto">
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="Leads" value={ls.total ?? '—'} sub={`${ls.hot_count ?? 0} hot`} accent="text-violet-300" />
              <StatCard label="Pipeline" value={ds.active ?? '—'} sub={`₹${Math.round(ds.pipeline_value || 0).toLocaleString('en-IN')}`} accent="text-blue-300" />
              <StatCard label="FB Leads" value={ls.fb_leads ?? '—'} />
              <StatCard label="Web Leads" value={ls.web_leads ?? '—'} />
            </div>

            {context?.pipelineHealth && (
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Pipeline Health</p>
                <div className="flex items-center gap-2">
                  <div className="text-2xl font-bold text-white">{context.pipelineHealth.healthScore ?? '—'}</div>
                  <span className="text-xs text-slate-400">{context.pipelineHealth.status}</span>
                </div>
              </div>
            )}

            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                <Flame className="h-3 w-3 text-red-400" /> Hot Leads
              </p>
              <div className="space-y-2">
                {(context?.hotLeads || []).slice(0, 5).map(l => (
                  <button key={l.id} onClick={() => navigate('/crm/leads')}
                    className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-white/[0.04] transition-colors">
                    <p className="text-xs text-white truncate">{l.name}</p>
                    <p className="text-[10px] text-slate-500 truncate">{l.company || l.source} · {l.score}</p>
                  </button>
                ))}
                {!context?.hotLeads?.length && (
                  <p className="text-xs text-slate-600">No hot leads yet — try scoring all leads.</p>
                )}
              </div>
            </div>

            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                <Megaphone className="h-3 w-3" /> Campaigns
              </p>
              <div className="space-y-1.5">
                {(context?.campaigns || []).slice(0, 4).map(c => (
                  <button key={c.id} onClick={() => navigate(`/crm/campaigns/${c.id}`)}
                    className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-white/[0.04] transition-colors">
                    <p className="text-xs text-white truncate">{c.name}</p>
                    <p className="text-[10px] text-slate-500">{c.status}</p>
                  </button>
                ))}
                {!context?.campaigns?.length && (
                  <button onClick={() => navigate('/crm/campaigns/new')}
                    className="text-xs text-violet-400 hover:text-violet-300">+ Create first campaign</button>
                )}
              </div>
            </div>
          </aside>

          {/* Center — Chat */}
          <div className="flex-1 flex flex-col min-w-0 rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map(msg => (
                <MessageBubble key={msg.id} msg={msg} onAction={handleAction} />
              ))}
              {loading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-xl bg-violet-500/20 flex items-center justify-center">
                    <Loader2 className="h-4 w-4 text-violet-400 animate-spin" />
                  </div>
                  <div className="rounded-2xl px-4 py-3 bg-white/[0.04] border border-white/[0.06] text-sm text-slate-500">
                    Analyzing your CRM data…
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Quick prompts */}
            <div className="px-4 pb-2 flex gap-2 overflow-x-auto flex-shrink-0 scrollbar-none">
              {QUICK_PROMPTS.slice(0, 4).map(p => (
                <button key={p} onClick={() => sendMessage(p)} disabled={loading}
                  className="flex-shrink-0 text-[11px] px-3 py-1.5 rounded-full bg-white/[0.04] text-slate-400 border border-white/[0.06] hover:text-violet-300 hover:border-violet-500/30 transition-colors whitespace-nowrap">
                  {p}
                </button>
              ))}
            </div>

            {/* Input */}
            <form onSubmit={e => { e.preventDefault(); sendMessage(input); }}
              className="p-4 border-t border-white/[0.06] flex gap-2 flex-shrink-0">
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask about campaigns, leads, copy, or sales strategy…"
                disabled={loading}
                className="flex-1 h-11 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 rounded-xl focus-visible:ring-violet-500/40"
              />
              <Button type="submit" disabled={loading || !input.trim()}
                className="h-11 px-4 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 rounded-xl">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </div>

          {/* Right — Tools */}
          <aside className="hidden md:flex flex-col w-52 xl:w-56 flex-shrink-0 gap-3 overflow-y-auto">
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">Quick Tools</p>
              <div className="space-y-2">
                {TOOL_BUTTONS.map(({ id, label, icon: Icon }) => (
                  <button key={id} onClick={() => runTool(id)} disabled={!!toolLoading}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium text-slate-300 bg-white/[0.03] border border-white/[0.06] hover:bg-violet-500/10 hover:border-violet-500/25 hover:text-violet-300 transition-all disabled:opacity-50">
                    {toolLoading === id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5 text-violet-400" />}
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">Navigate</p>
              <div className="space-y-1">
                {[
                  { icon: Target, label: 'Leads', path: '/crm/leads' },
                  { icon: Briefcase, label: 'Deals', path: '/crm/deals' },
                  { icon: Mail, label: 'Campaigns', path: '/crm/campaigns' },
                  { icon: Users, label: 'Lists', path: '/crm/lists' },
                  { icon: TrendingUp, label: 'AI Insights', path: '/crm/ai-insights' },
                ].map(({ icon: Icon, label, path }) => (
                  <button key={path} onClick={() => navigate(path)}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors">
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-violet-500/10 border border-violet-500/20 p-3">
              <p className="text-xs text-violet-300 font-medium mb-1">Pro tip</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Ask me to draft WhatsApp messages, email sequences, or ad copy — I'll use your real lead and campaign data.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </CRMLayout>
  );
}

function formatToolResult(tool: string, data: unknown): string {
  if (!data) return 'Done.';
  if (tool === 'bulk_score' && Array.isArray(data)) {
    const lines = data.slice(0, 5).map((l: any) => `• ${l.name}: ${l.score}/100 (${l.tier || '—'})`);
    return `Lead scores updated:\n\n${lines.join('\n')}${data.length > 5 ? `\n…and ${data.length - 5} more` : ''}`;
  }
  if (tool === 'subject_lines' && data && typeof data === 'object') {
    const d = data as { subjectLines?: string[]; preheaders?: string[] };
    const lines = (d.subjectLines || []).map((s, i) => `${i + 1}. ${s}${d.preheaders?.[i] ? ` — ${d.preheaders[i]}` : ''}`);
    return `Subject line ideas:\n\n${lines.join('\n')}`;
  }
  if (tool === 'pipeline_summary' && data && typeof data === 'object') {
    const d = data as { insights?: { insights?: { title: string; body: string }[] }; pipelineHealth?: { status?: string; healthScore?: number } };
    const insights = d.insights?.insights || [];
    const header = `Pipeline: ${d.pipelineHealth?.status || '—'} (score ${d.pipelineHealth?.healthScore ?? '—'})`;
    const body = insights.map(i => `• ${i.title}: ${i.body}`).join('\n');
    return `${header}\n\n${body}`;
  }
  if (tool === 'draft_email' && data && typeof data === 'object') {
    const d = data as { subject?: string; body?: string };
    return `**${d.subject || 'Draft'}**\n\n${d.body || ''}`;
  }
  return JSON.stringify(data, null, 2);
}
