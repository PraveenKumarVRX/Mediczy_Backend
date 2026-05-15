import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare, X, Send, Loader2,
  Sparkles, ShieldCheck, FileText, ClipboardCheck,
  CheckCircle2, Copy, RefreshCw, Bot,
  BarChart3, Scale, BookOpen, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

type ActiveTool = "chat" | "draft" | "compliance" | "audit";

// ─── Helpers ───────────────────────────────────────────────────────────────────

const getConsentToken = () =>
  typeof window !== "undefined" ? localStorage.getItem("consentToken") || "" : "";

const consentApi = async (path: string, body: object) => {
  const res = await fetch(`/api/consent${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getConsentToken()}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Request failed");
  return res.json();
};

const uid = () => Math.random().toString(36).slice(2);

const quickPrompts = [
  "When is verbal consent sufficient for a procedure?",
  "What constitutes valid informed consent under Indian law?",
  "Can a family member consent on behalf of an unconscious patient?",
  "NABH requirements for consent documentation?",
  "How long should signed consent forms be retained?",
  "What to do if a patient refuses consent for a life-saving procedure?",
];

// ─── Draft Consent Tool ───────────────────────────────────────────────────────

const DraftConsentTool = () => {
  const [form, setForm] = useState({
    procedureName: "",
    doctorName: "",
    department: "",
    patientName: "Patient",
    language: "English",
  });
  const [result, setResult] = useState<null | { declaration: string; materialRisks: string; purpose: string; raw: string }>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const run = async () => {
    if (!form.procedureName.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await consentApi("/ai/draft-consent", form);
      setResult(data.consent);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    if (result?.raw) {
      navigator.clipboard.writeText(result.raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Generate a NABH-compliant informed consent document for any procedure.</p>

      <div className="grid grid-cols-2 gap-2">
        <input
          className="col-span-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400/30"
          placeholder="Procedure name *"
          value={form.procedureName}
          onChange={e => setForm(f => ({ ...f, procedureName: e.target.value }))}
        />
        <input
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400/30"
          placeholder="Doctor name"
          value={form.doctorName}
          onChange={e => setForm(f => ({ ...f, doctorName: e.target.value }))}
        />
        <input
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400/30"
          placeholder="Department"
          value={form.department}
          onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
        />
        <select
          className="col-span-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400/30"
          value={form.language}
          onChange={e => setForm(f => ({ ...f, language: e.target.value }))}
        >
          <option>English</option>
          <option>Hindi</option>
          <option>Tamil</option>
          <option>Telugu</option>
          <option>Kannada</option>
          <option>Marathi</option>
        </select>
      </div>

      <Button
        onClick={run}
        disabled={!form.procedureName.trim() || loading}
        className="w-full h-8 text-xs bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-90"
      >
        {loading ? <><Loader2 className="h-3 w-3 animate-spin mr-1.5" /> Drafting…</> : <><FileText className="h-3 w-3 mr-1.5" /> Generate Consent Draft</>}
      </Button>

      {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {result && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-purple-700 uppercase tracking-wide">Generated Consent</span>
            <button onClick={copy} className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-700">
              {copied ? <><CheckCircle2 className="h-3 w-3 text-green-500" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
            </button>
          </div>
          {result.purpose && (
            <div className="rounded-lg bg-purple-50 border border-purple-100 p-2.5">
              <p className="text-[10px] font-semibold text-purple-700 mb-1">Purpose & Benefits</p>
              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">{result.purpose}</p>
            </div>
          )}
          {result.materialRisks && (
            <div className="rounded-lg bg-amber-50 border border-amber-100 p-2.5">
              <p className="text-[10px] font-semibold text-amber-700 mb-1">Material Risks</p>
              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">{result.materialRisks}</p>
            </div>
          )}
          {result.declaration && (
            <div className="rounded-lg bg-green-50 border border-green-100 p-2.5">
              <p className="text-[10px] font-semibold text-green-700 mb-1">Patient Declaration</p>
              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">{result.declaration}</p>
            </div>
          )}
          <button onClick={() => setResult(null)} className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600">
            <RefreshCw className="h-2.5 w-2.5" /> Generate new draft
          </button>
        </motion.div>
      )}
    </div>
  );
};

// ─── Compliance Check Tool ────────────────────────────────────────────────────

const ComplianceTool = () => {
  const [form, setForm] = useState({
    procedureName: "",
    consentType: "Informed Consent",
    witnessPresent: true,
    patientCapacityAssessed: true,
    alternativesDiscussed: true,
    risksExplained: true,
    consentLanguage: "English",
    timeBeforeProcedure: "",
  });
  const [result, setResult] = useState<null | { status: string; criticalDeficiencies: string; correctiveActions: string; legalRisk: string; raw: string }>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    if (!form.procedureName.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await consentApi("/ai/compliance-check", form);
      setResult(data.compliance);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const statusColor = (s: string) =>
    s?.toLowerCase().includes("non-compliant") ? "text-red-600 bg-red-50 border-red-200" :
    s?.toLowerCase().includes("partial") ? "text-amber-600 bg-amber-50 border-amber-200" :
    "text-green-600 bg-green-50 border-green-200";

  const riskColor = (r: string) =>
    r?.toLowerCase().includes("high") ? "text-red-600" :
    r?.toLowerCase().includes("medium") ? "text-amber-600" : "text-green-600";

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Evaluate consent documentation against NABH and Indian legal standards.</p>

      <input
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400/30"
        placeholder="Procedure name *"
        value={form.procedureName}
        onChange={e => setForm(f => ({ ...f, procedureName: e.target.value }))}
      />

      <div className="grid grid-cols-2 gap-2">
        {[
          { key: "witnessPresent", label: "Witness Present" },
          { key: "patientCapacityAssessed", label: "Capacity Assessed" },
          { key: "alternativesDiscussed", label: "Alternatives Discussed" },
          { key: "risksExplained", label: "Risks Explained" },
        ].map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={(form as any)[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
              className="rounded accent-purple-600"
            />
            {label}
          </label>
        ))}
      </div>

      <input
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400/30"
        placeholder="Time obtained before procedure (e.g. 30 mins)"
        value={form.timeBeforeProcedure}
        onChange={e => setForm(f => ({ ...f, timeBeforeProcedure: e.target.value }))}
      />

      <Button
        onClick={run}
        disabled={!form.procedureName.trim() || loading}
        className="w-full h-8 text-xs bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-90"
      >
        {loading ? <><Loader2 className="h-3 w-3 animate-spin mr-1.5" /> Evaluating…</> : <><ShieldCheck className="h-3 w-3 mr-1.5" /> Check Compliance</>}
      </Button>

      {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {result && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
          <div className={cn("rounded-lg border px-3 py-2 text-xs font-semibold", statusColor(result.status))}>
            Status: {result.status || "Evaluated"}
          </div>
          {result.legalRisk && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Legal Risk: </span>
              <span className={cn("text-xs font-semibold", riskColor(result.legalRisk))}>{result.legalRisk}</span>
            </div>
          )}
          {result.criticalDeficiencies && (
            <div className="rounded-lg bg-red-50 border border-red-100 p-2.5">
              <p className="text-[10px] font-semibold text-red-700 mb-1">Critical Deficiencies</p>
              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">{result.criticalDeficiencies}</p>
            </div>
          )}
          {result.correctiveActions && (
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-2.5">
              <p className="text-[10px] font-semibold text-blue-700 mb-1">Corrective Actions</p>
              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">{result.correctiveActions}</p>
            </div>
          )}
          <button onClick={() => setResult(null)} className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600">
            <RefreshCw className="h-2.5 w-2.5" /> Check another
          </button>
        </motion.div>
      )}
    </div>
  );
};

// ─── Audit Summary Tool ───────────────────────────────────────────────────────

const AuditTool = () => {
  const [form, setForm] = useState({
    period: "Last 30 days",
    totalConsents: "",
    signedConsents: "",
    pendingConsents: "",
    refusedConsents: "",
    expiringConsents: "",
  });
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await consentApi("/ai/audit-summary", {
        period: form.period,
        totalConsents: parseInt(form.totalConsents) || 0,
        signedConsents: parseInt(form.signedConsents) || 0,
        pendingConsents: parseInt(form.pendingConsents) || 0,
        refusedConsents: parseInt(form.refusedConsents) || 0,
        expiringConsents: parseInt(form.expiringConsents) || 0,
      });
      setResult(data.summary);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fields = [
    { key: "totalConsents", label: "Total Consents" },
    { key: "signedConsents", label: "Signed" },
    { key: "pendingConsents", label: "Pending" },
    { key: "refusedConsents", label: "Refused" },
    { key: "expiringConsents", label: "Expiring Soon" },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Generate an AI consent audit summary for NABH and management reporting.</p>

      <select
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-purple-400 focus:outline-none"
        value={form.period}
        onChange={e => setForm(f => ({ ...f, period: e.target.value }))}
      >
        <option>Last 7 days</option>
        <option>Last 30 days</option>
        <option>Last 90 days</option>
        <option>This month</option>
        <option>This quarter</option>
        <option>This year</option>
      </select>

      <div className="grid grid-cols-3 gap-2">
        {fields.map(({ key, label }) => (
          <div key={key}>
            <p className="text-[10px] text-slate-500 mb-0.5">{label}</p>
            <input
              type="number"
              min="0"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-800 focus:border-purple-400 focus:outline-none"
              value={(form as any)[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      <Button
        onClick={run}
        disabled={loading}
        className="w-full h-8 text-xs bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-90"
      >
        {loading ? <><Loader2 className="h-3 w-3 animate-spin mr-1.5" /> Generating…</> : <><BarChart3 className="h-3 w-3 mr-1.5" /> Generate Audit Summary</>}
      </Button>

      {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {result && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Audit Summary</p>
            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">{result}</p>
          </div>
          <button onClick={() => setResult("")} className="mt-2 flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600">
            <RefreshCw className="h-2.5 w-2.5" /> Regenerate
          </button>
        </motion.div>
      )}
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────────

interface Props {
  defaultOpen?: boolean;
  initialTool?: ActiveTool;
}

export function ConsentAIAssistant({ defaultOpen = false, initialTool = "chat" }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [activeTool, setActiveTool] = useState<ActiveTool>(initialTool);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: uid(),
      role: "assistant",
      content: "Hi, I'm **CLIA** (Consent & Legal Intelligence Assistant). I can help you draft consent forms, check compliance, and answer consent law questions. How can I assist you today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || typing) return;
    const userMsg: ChatMessage = { id: uid(), role: "user", content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setTyping(true);

    try {
      const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));
      const data = await consentApi("/ai/chat", { message: text, history });
      setMessages(prev => [...prev, { id: uid(), role: "assistant", content: data.reply, timestamp: new Date() }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { id: uid(), role: "assistant", content: `Sorry, I'm temporarily unavailable. Please try again. (${e.message})`, timestamp: new Date() }]);
    } finally {
      setTyping(false);
    }
  }, [messages, typing]);

  const tools = [
    { id: "chat" as const,       icon: MessageSquare, label: "Ask CLIA",   color: "text-purple-600" },
    { id: "draft" as const,      icon: FileText,      label: "Draft",      color: "text-blue-600" },
    { id: "compliance" as const, icon: ShieldCheck,   label: "Compliance", color: "text-green-600" },
    { id: "audit" as const,      icon: BarChart3,     label: "Audit",      color: "text-amber-600" },
  ];

  return (
    <>
      {/* FAB */}
      <AnimatePresence>
        {!open && (
          <motion.button
            key="fab"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-700 px-4 py-3 text-white shadow-xl shadow-purple-500/30 hover:shadow-purple-500/50 transition-shadow"
          >
            <div className="relative">
              <Bot className="h-5 w-5" />
              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-green-400 ring-2 ring-white" />
            </div>
            <span className="text-sm font-semibold">CLIA</span>
            <Badge className="bg-white/20 text-white border-0 text-[10px] px-1.5 py-0">AI</Badge>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 340, damping: 32 }}
            className="fixed bottom-6 right-6 z-50 flex flex-col w-[420px] max-h-[80vh] rounded-2xl bg-white shadow-2xl shadow-slate-900/20 ring-1 ring-slate-200 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-700">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                    <Scale className="h-4 w-4 text-white" />
                  </div>
                  <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-400 ring-2 ring-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white leading-none">CLIA</p>
                  <p className="text-[10px] text-purple-200 mt-0.5">Consent & Legal Intelligence Assistant</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 hover:bg-white/20 transition-colors">
                <X className="h-4 w-4 text-white" />
              </button>
            </div>

            {/* Tool tabs */}
            <div className="flex border-b border-slate-100 bg-slate-50">
              {tools.map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTool(t.id)}
                  className={cn(
                    "flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-all border-b-2",
                    activeTool === t.id
                      ? "border-purple-600 text-purple-700 bg-white"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  )}
                >
                  <t.icon className={cn("h-3.5 w-3.5", activeTool === t.id ? t.color : "text-slate-400")} />
                  {t.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {activeTool === "chat" ? (
                <div className="flex flex-col h-full">
                  <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
                    {messages.map(m => (
                      <div key={m.id} className={cn("flex gap-2", m.role === "user" ? "flex-row-reverse" : "flex-row")}>
                        {m.role === "assistant" && (
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-600 to-indigo-700 flex-shrink-0 flex items-center justify-center">
                            <Scale className="h-3.5 w-3.5 text-white" />
                          </div>
                        )}
                        <div className={cn(
                          "max-w-[82%] rounded-2xl px-3 py-2 text-xs leading-relaxed",
                          m.role === "user"
                            ? "bg-gradient-to-br from-purple-600 to-indigo-700 text-white rounded-tr-sm"
                            : "bg-slate-100 text-slate-800 rounded-tl-sm"
                        )}>
                          <p className="whitespace-pre-wrap">{m.content}</p>
                          <p className={cn("text-[9px] mt-1", m.role === "user" ? "text-purple-200" : "text-slate-400")}>
                            {m.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                    ))}
                    {typing && (
                      <div className="flex gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-600 to-indigo-700 flex-shrink-0 flex items-center justify-center">
                          <Scale className="h-3.5 w-3.5 text-white" />
                        </div>
                        <div className="bg-slate-100 rounded-2xl rounded-tl-sm px-3 py-2">
                          <div className="flex gap-1 items-center h-4">
                            {[0, 1, 2].map(i => (
                              <motion.div
                                key={i}
                                className="w-1.5 h-1.5 rounded-full bg-slate-400"
                                animate={{ y: [0, -4, 0] }}
                                transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={bottomRef} />
                  </div>

                  {/* Quick prompts */}
                  {messages.length <= 1 && (
                    <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                      {quickPrompts.map(p => (
                        <button
                          key={p}
                          onClick={() => sendMessage(p)}
                          className="text-[10px] rounded-full bg-purple-50 border border-purple-200 text-purple-700 px-2.5 py-1 hover:bg-purple-100 transition-colors text-left leading-snug"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Input */}
                  <div className="p-3 border-t border-slate-100 bg-white">
                    <form onSubmit={e => { e.preventDefault(); sendMessage(input); }} className="flex gap-2">
                      <Input
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder="Ask about consent management…"
                        className="h-9 text-xs rounded-xl border-slate-200 bg-slate-50 focus:border-purple-400 focus:ring-purple-400/20"
                        disabled={typing}
                      />
                      <Button
                        type="submit"
                        size="sm"
                        disabled={!input.trim() || typing}
                        className="h-9 w-9 p-0 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-700 hover:opacity-90 flex-shrink-0"
                      >
                        {typing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      </Button>
                    </form>
                  </div>
                </div>
              ) : (
                <div className="p-4 overflow-y-auto">
                  {activeTool === "draft" && <DraftConsentTool />}
                  {activeTool === "compliance" && <ComplianceTool />}
                  {activeTool === "audit" && <AuditTool />}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-purple-500" />
                <span className="text-[10px] text-slate-500">Powered by Mediczy AI</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <span className="text-[10px] text-slate-500">CLIA online</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default ConsentAIAssistant;
