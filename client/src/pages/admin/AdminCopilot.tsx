import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import AdminLayout from '@/components/layout/AdminLayout';
import {
  Bot,
  BrainCircuit,
  BarChart3,
  DollarSign,
  ShieldCheck,
  Send,
  AlertTriangle,
  ChevronDown,
  Loader2,
  Shield,
  Link,
  X,
} from 'lucide-react';
import {
  sendCopilotMessage,
  PERSONA_CONFIG,
  type Persona,
  type ConversationMessage,
  type CopilotResponse,
} from '@/services/adminCopilot';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'error';
  content: string;
  meta?: Pick<CopilotResponse, 'agentsUsed' | 'taskPlan' | 'totalTokens' | 'latencyMs'>;
}

// ── Icon map ──────────────────────────────────────────────────────────────────

const PERSONA_ICONS: Record<Persona, typeof Bot> = {
  ops: Bot,
  analytics: BarChart3,
  revenue: DollarSign,
  quality: ShieldCheck,
};

// ── Approval Modal ────────────────────────────────────────────────────────────

function ApprovalModal({
  pendingAction,
  onApprove,
  onCancel,
}: {
  pendingAction: any;
  onApprove: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-amber-500/40 rounded-xl shadow-2xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div className="flex items-center gap-2 text-amber-400 font-semibold">
            <AlertTriangle className="w-5 h-5" />
            Action Requires Approval
          </div>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-slate-300 text-sm">
            The AI agent wants to execute the following action. Review and approve or cancel.
          </p>
          <pre className="bg-slate-800 rounded-lg p-3 text-xs text-slate-300 overflow-auto max-h-48 whitespace-pre-wrap">
            {JSON.stringify(pendingAction, null, 2)}
          </pre>
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-slate-700 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm text-slate-300 bg-slate-700 hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onApprove}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition-colors"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Message Meta Accordion ────────────────────────────────────────────────────

function MessageMeta({
  meta,
}: {
  meta: Pick<CopilotResponse, 'agentsUsed' | 'taskPlan' | 'totalTokens' | 'latencyMs'>;
}) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-slate-500 hover:text-slate-400 select-none flex items-center gap-1">
        <ChevronDown className="w-3 h-3" />
        Debug info · {meta.totalTokens} tokens · {meta.latencyMs}ms
      </summary>
      <div className="mt-2 space-y-2 pl-2 border-l border-slate-700">
        {meta.agentsUsed && meta.agentsUsed.length > 0 && (
          <div>
            <span className="text-slate-400 font-medium">Agents used: </span>
            <span className="text-slate-300">{meta.agentsUsed.join(', ')}</span>
          </div>
        )}
        {meta.taskPlan && (
          <div>
            <div className="text-slate-400 font-medium mb-1">Task plan:</div>
            <pre className="bg-slate-800 rounded p-2 text-slate-300 overflow-auto max-h-40 whitespace-pre-wrap">
              {JSON.stringify(meta.taskPlan, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </details>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AdminCopilot() {
  const adminToken = localStorage.getItem('adminToken');

  const [persona, setPersona] = useState<Persona>('ops');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [contextMessages, setContextMessages] = useState<ConversationMessage[]>([]);
  const [approvalModal, setApprovalModal] = useState<{
    pendingAction: any;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const msgIdRef = useRef(0);

  const nextId = () => ++msgIdRef.current;

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Switch persona: clear conversation state
  const switchPersona = (p: Persona) => {
    setPersona(p);
    setMessages([]);
    setConversationId(null);
    setContextMessages([]);
    setInput('');
  };

  const appendMessage = (msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  };

  const handleSend = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    setInput('');

    const userMsg: ChatMessage = { id: nextId(), role: 'user', content };
    appendMessage(userMsg);

    const updatedContext: ConversationMessage[] = [
      ...contextMessages,
      { role: 'user', content },
    ].slice(-10);

    setLoading(true);
    try {
      const res = await sendCopilotMessage({
        message: content,
        persona,
        conversationId,
        contextMessages: updatedContext.slice(0, -1), // send history before this message
      });

      if (res.conversationId && conversationId === null) {
        setConversationId(res.conversationId);
      }

      const assistantContent = res.response ?? '(No response)';

      const assistantMsg: ChatMessage = {
        id: nextId(),
        role: 'assistant',
        content: assistantContent,
        meta: {
          agentsUsed: res.agentsUsed ?? [],
          taskPlan: res.taskPlan ?? null,
          totalTokens: res.totalTokens ?? 0,
          latencyMs: res.latencyMs ?? 0,
        },
      };
      appendMessage(assistantMsg);

      // Update context (keep last 10)
      setContextMessages([
        ...updatedContext,
        { role: 'assistant', content: assistantContent },
      ].slice(-10));

      if (res.requiresApproval && res.pendingAction) {
        setApprovalModal({ pendingAction: res.pendingAction });
      }
    } catch (err: any) {
      appendMessage({
        id: nextId(),
        role: 'error',
        content: err?.message ?? 'Unknown error occurred.',
      });
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const ActivePersonaIcon = PERSONA_ICONS[persona];
  const personaCfg = PERSONA_CONFIG[persona];

  if (!adminToken) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center space-y-3">
            <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
            <p className="text-slate-300 font-medium">Not authenticated as admin</p>
            <p className="text-slate-500 text-sm">Please log in with an admin account to use the AI Copilot.</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      {approvalModal && (
        <ApprovalModal
          pendingAction={approvalModal.pendingAction}
          onApprove={() => setApprovalModal(null)}
          onCancel={() => setApprovalModal(null)}
        />
      )}

      <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-slate-950">
        {/* ── Left Sidebar ─────────────────────────────────────────────────── */}
        <aside className="w-64 flex-shrink-0 border-r border-slate-800 flex flex-col bg-slate-900">
          {/* Sidebar header */}
          <div className="px-4 py-4 border-b border-slate-800">
            <div className="flex items-center gap-2 text-violet-400">
              <BrainCircuit className="w-5 h-5" />
              <span className="font-semibold text-sm">AI Copilot</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Select a persona to focus the agent</p>
          </div>

          {/* Persona tabs */}
          <div className="px-3 py-3 space-y-1 border-b border-slate-800">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1 mb-2">
              Persona
            </p>
            {(Object.keys(PERSONA_CONFIG) as Persona[]).map((p) => {
              const cfg = PERSONA_CONFIG[p];
              const Icon = PERSONA_ICONS[p];
              const active = persona === p;
              return (
                <button
                  key={p}
                  onClick={() => switchPersona(p)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
                    active
                      ? 'bg-violet-600/20 text-violet-300 border border-violet-600/40'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-violet-400' : ''}`} />
                  <span className="font-medium">{cfg.label}</span>
                </button>
              );
            })}
          </div>

          {/* Quick prompts */}
          <div className="px-3 py-3 flex-1 overflow-y-auto border-b border-slate-800">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1 mb-2">
              Quick Prompts
            </p>
            <div className="space-y-1.5">
              {personaCfg.quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSend(prompt)}
                  disabled={loading}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Dashboard deep links */}
          <div className="px-3 py-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1 mb-2">
              Dashboards
            </p>
            <div className="space-y-1">
              {[
                { label: 'AI Analytics', path: '/admin/ai-analytics', Icon: BarChart3 },
                { label: 'AI Governance', path: '/admin/ai-governance', Icon: Shield },
                { label: 'AI Guard', path: '/admin/ai-guard', Icon: ShieldCheck },
              ].map(({ label, path, Icon }) => (
                <a
                  key={path}
                  href={path}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                  <Link className="w-3 h-3 ml-auto opacity-50" />
                </a>
              ))}
            </div>
          </div>
        </aside>

        {/* ── Main Chat Area ────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-900 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-violet-600/20">
                <ActivePersonaIcon className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <h1 className="font-semibold text-slate-100 text-sm">
                  Admin AI Copilot
                  <span className="ml-2 text-violet-400 font-normal">— {personaCfg.label}</span>
                </h1>
                <p className="text-xs text-slate-500">{personaCfg.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-full px-3 py-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              Not for clinical decisions
            </div>
          </header>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4 text-slate-500">
                <div className="p-4 rounded-full bg-violet-600/10">
                  <BrainCircuit className="w-10 h-10 text-violet-500" />
                </div>
                <div>
                  <p className="font-medium text-slate-300">Admin AI Copilot</p>
                  <p className="text-sm mt-1">
                    Ask anything about platform operations, analytics, revenue, or quality.
                  </p>
                  <p className="text-xs mt-1 text-slate-600">
                    Use the quick prompts on the left or type below.
                  </p>
                </div>
              </div>
            )}

            {messages.map((msg) => {
              if (msg.role === 'user') {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[70%] bg-violet-600 text-white px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed shadow">
                      {msg.content}
                    </div>
                  </div>
                );
              }

              if (msg.role === 'error') {
                return (
                  <div key={msg.id} className="flex justify-start">
                    <div className="max-w-[80%] bg-red-900/30 border border-red-500/30 text-red-300 px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed shadow">
                      <div className="flex items-center gap-2 font-medium mb-1">
                        <AlertTriangle className="w-4 h-4" />
                        Error
                      </div>
                      {msg.content}
                    </div>
                  </div>
                );
              }

              // assistant
              return (
                <div key={msg.id} className="flex justify-start">
                  <div className="max-w-[80%]">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="p-1 rounded-full bg-violet-600/20">
                        <BrainCircuit className="w-3.5 h-3.5 text-violet-400" />
                      </div>
                      <span className="text-xs text-slate-500">AI Copilot · {personaCfg.label}</span>
                    </div>
                    <div className="bg-slate-800 border border-slate-700 text-slate-200 px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed shadow">
                      <div className="prose prose-sm prose-invert max-w-none">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                      {msg.meta && <MessageMeta meta={msg.meta} />}
                    </div>
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 px-4 py-3 rounded-2xl rounded-tl-sm shadow">
                  <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
                  <span className="text-sm text-slate-400">Thinking…</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex-shrink-0 border-t border-slate-800 bg-slate-900 px-6 py-4">
            <div className="flex items-end gap-3">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                placeholder={`Ask the ${personaCfg.label} agent…`}
                rows={1}
                className="flex-1 resize-none bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors max-h-40 overflow-y-auto"
                style={{ minHeight: '44px' }}
              />
              <button
                onClick={() => handleSend()}
                disabled={loading || !input.trim()}
                className="flex-shrink-0 flex items-center justify-center w-11 h-11 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors shadow"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                ) : (
                  <Send className="w-4 h-4 text-white" />
                )}
              </button>
            </div>
            <p className="text-xs text-slate-600 mt-2">
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
