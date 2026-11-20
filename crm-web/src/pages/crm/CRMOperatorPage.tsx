import { useEffect, useMemo, useState } from 'react';
import { Bot, Check, Clock3, Database, Loader2, Send, ShieldAlert, Trash2 } from 'lucide-react';
import { CRMLayout } from './CRMModulePages';
import api from '@/utils/api';

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type Proposal = { proposalId: string; tool: string; args: Record<string, unknown>; preview: any; expiresAt?: string };

const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('crmToken') || ''}` });

export default function CRMOperatorPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<Proposal[]>([]);
  const [memories, setMemories] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadMemory = async () => {
    try { const { data } = await api.get('/crm/ai/agent/memory', { headers: auth() }); setMemories(data.memories || []); } catch { setMemories([]); }
  };
  useEffect(() => { loadMemory(); }, []);

  const send = async () => {
    const text = input.trim(); if (!text || busy) return;
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next); setInput(''); setBusy(true); setError('');
    try {
      const { data } = await api.post('/crm/ai/agent', { messages: next }, { headers: auth() });
      if (data.reply) setMessages((current) => [...current, { role: 'assistant', content: data.reply }]);
      if (data.pendingActions?.length) setPending((current) => [...current, ...data.pendingActions]);
    } catch (err: any) { setError(err.response?.data?.message || 'The CRM agent is unavailable.'); }
    finally { setBusy(false); }
  };

  const confirm = async (proposal: Proposal) => {
    setBusy(true); setError('');
    try {
      const { data } = await api.post('/crm/ai/agent/confirm', { proposalId: proposal.proposalId, tool: proposal.tool, args: proposal.args }, { headers: auth() });
      setMessages((current) => [...current, { role: 'assistant', content: `${proposal.preview?.summary || proposal.tool}: ${data.applied ? 'applied successfully.' : 'completed.'}` }]);
      setPending((current) => current.filter((item) => item.proposalId !== proposal.proposalId));
      await loadMemory();
    } catch (err: any) { setError(err.response?.data?.message || err.response?.data?.error || 'The proposal could not be applied.'); }
    finally { setBusy(false); }
  };

  const removeMemory = async (key: string) => { try { await api.delete(`/crm/ai/agent/memory/${encodeURIComponent(key)}`, { headers: auth() }); await loadMemory(); } catch { setError('Could not remove that memory.'); } };
  const hasContent = useMemo(() => messages.length > 0, [messages]);

  return <CRMLayout title="Agent Operator">
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-950/40 to-slate-900 p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-violet-500/20 p-3"><Bot className="h-6 w-6 text-violet-300" /></div>
          <div><h1 className="text-xl font-semibold text-white">Agentic CRM operator</h1><p className="mt-1 text-sm text-slate-300">Tenant-scoped lead, deal, task and conversation operations. Administrative CRM only.</p></div>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
          <div className="min-h-[360px] space-y-3">
            {!hasContent && <div className="flex h-[320px] items-center justify-center text-center text-sm text-slate-400">Ask about leads, deals, follow-up tasks, conversations or pipeline status.</div>}
            {messages.map((message, index) => <div key={`${message.role}-${index}`} className={`rounded-xl px-4 py-3 text-sm ${message.role === 'user' ? 'ml-10 bg-blue-500/15 text-blue-100' : 'mr-10 bg-slate-800 text-slate-200'}`}><span className="mb-1 block text-[10px] uppercase tracking-widest text-slate-500">{message.role}</span>{message.content}</div>)}
          </div>
          {error && <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-300"><ShieldAlert className="h-4 w-4" />{error}</div>}
          <div className="flex gap-2"><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder="e.g. Show open high-priority leads" className="min-h-12 flex-1 resize-none rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white outline-none focus:border-violet-400" /><button onClick={send} disabled={busy || !input.trim()} className="self-end rounded-xl bg-violet-600 p-3 text-white disabled:opacity-40"><Send className="h-4 w-4" /></button></div>
        </section>
        <aside className="space-y-5">
          <section className="rounded-2xl border border-amber-500/20 bg-slate-900/70 p-4"><h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Clock3 className="h-4 w-4 text-amber-300" />Pending confirmations</h2><p className="mt-1 text-xs text-slate-400">Writes never run without your confirmation.</p><div className="mt-3 space-y-3">{pending.length === 0 && <p className="text-xs text-slate-500">No pending proposals.</p>}{pending.map((proposal) => <div key={proposal.proposalId} className="rounded-xl border border-slate-700 p-3"><p className="text-sm text-slate-200">{proposal.preview?.summary || proposal.tool}</p><p className="mt-1 text-[11px] text-slate-500">Expires {proposal.expiresAt ? new Date(proposal.expiresAt).toLocaleTimeString() : 'soon'}</p><button onClick={() => confirm(proposal)} disabled={busy} className="mt-3 flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs text-white disabled:opacity-40"><Check className="h-3 w-3" />Confirm</button></div>)}</div></section>
          <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4"><h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Database className="h-4 w-4 text-cyan-300" />Operator memory</h2><p className="mt-1 text-xs text-slate-400">Only non-sensitive workflow preferences are stored.</p><div className="mt-3 space-y-2">{memories.length === 0 && <p className="text-xs text-slate-500">No saved memories.</p>}{memories.map((memory) => <div key={`${memory.category}-${memory.key}`} className="flex items-start justify-between gap-2 rounded-lg bg-slate-800 p-2"><div><p className="text-xs font-medium text-slate-200">{memory.key}</p><p className="mt-1 text-[11px] text-slate-400">{JSON.stringify(memory.value)}</p></div><button onClick={() => removeMemory(memory.key)} aria-label={`Delete ${memory.key}`}><Trash2 className="h-3.5 w-3.5 text-slate-500 hover:text-red-300" /></button></div>)}</div></section>
        </aside>
      </div>
      {busy && <div className="fixed bottom-5 right-5 flex items-center gap-2 rounded-full bg-slate-800 px-4 py-2 text-xs text-slate-200 shadow-xl"><Loader2 className="h-3.5 w-3.5 animate-spin" />Working…</div>}
    </div>
  </CRMLayout>;
}
