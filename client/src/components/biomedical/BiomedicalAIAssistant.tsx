/**
 * BiomedicalAIAssistant — floating ARIA panel for the biomedical engineering dept.
 *
 * Tools
 * ─────
 * • Chat               — ask clinical engineering questions
 * • Device Diagnostic  — AI root-cause analysis for faulty devices
 * • Maintenance Planner— AI-generated PPM schedule
 * • Compliance Checker — NABH/NABL compliance evaluation
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare, X, ChevronDown, ChevronUp, Send, Loader2,
  Sparkles, ShieldCheck, Wrench, TrendingUp, AlertTriangle,
  CheckCircle2, FileText, Cpu, Copy, RefreshCw, Zap, Bot,
  Activity, BarChart3,
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

type ActiveTool = "chat" | "diagnostic" | "maintenance" | "compliance";

interface DiagnosticResult {
  rootCause: string;
  riskAssessment: string;
  immediateAction: string;
  diagnosticSteps: string;
  partsNeeded: string;
  estimatedRepairTime: string;
  oemEscalation: string;
  preventiveNote: string;
  raw: string;
  confidence: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const getBiomedToken = () =>
  typeof window !== "undefined" ? localStorage.getItem("biomedicalToken") || "" : "";

const biomedApi = async (path: string, body: object) => {
  const res = await fetch(`/api/biomedical${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getBiomedToken()}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Request failed");
  return res.json();
};

const uid = () => Math.random().toString(36).slice(2);

const quickPrompts = [
  "How do I perform a leakage current test on a patient monitor?",
  "PPM frequency for ICU ventilators as per NABH?",
  "Defibrillator not charging — likely root causes?",
  "What is IEC 60601-1 Class B device classification?",
  "MTTR calculation formula for biomedical equipment?",
  "How to calibrate an infusion pump flow rate?",
];

// ─── Device Diagnostic Tool ───────────────────────────────────────────────────

const DiagnosticTool = () => {
  const [form, setForm] = useState({
    deviceName: "", deviceId: "", manufacturer: "", model: "",
    department: "", yearOfManufacture: "", lastService: "",
    symptoms: "", errorCodes: "",
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const run = async () => {
    if (!form.deviceName || !form.symptoms) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const data = await biomedApi("/ai/device-diagnostic", {
        ...form,
        symptoms: form.symptoms.split(/[,;]/).map(s => s.trim()).filter(Boolean),
        errorCodes: form.errorCodes.split(/[,;]/).map(s => s.trim()).filter(Boolean),
      });
      setResult(data.diagnostic);
    } catch (e: any) { setError(e.message || "Diagnostic failed"); }
    finally { setLoading(false); }
  };

  const copy = () => {
    if (result?.raw) { navigator.clipboard.writeText(result.raw); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  const riskColor = (text: string) => {
    const t = text.toUpperCase();
    if (t.includes("CRITICAL")) return "bg-red-50 border-red-200 text-red-700";
    if (t.includes("HIGH")) return "bg-orange-50 border-orange-200 text-orange-700";
    if (t.includes("MEDIUM")) return "bg-amber-50 border-amber-200 text-amber-700";
    return "bg-green-50 border-green-200 text-green-700";
  };

  return (
    <div className="space-y-3 p-1">
      {!result ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {[
              { k: "deviceName", label: "Device Name *", ph: "e.g. Patient Monitor" },
              { k: "deviceId",   label: "Asset ID",       ph: "BME-1042" },
              { k: "manufacturer", label: "Manufacturer", ph: "Philips" },
              { k: "model",      label: "Model",          ph: "IntelliVue MX450" },
              { k: "department", label: "Department",     ph: "ICU-3" },
              { k: "yearOfManufacture", label: "Year",    ph: "2019" },
              { k: "lastService", label: "Last Service",  ph: "Jan 2026" },
            ].map(({ k, label, ph }) => (
              <div key={k}>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
                <Input value={form[k as keyof typeof form]} onChange={set(k)} placeholder={ph} className="h-8 text-xs mt-0.5" />
              </div>
            ))}
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Symptoms (comma-separated) *</label>
            <textarea value={form.symptoms} onChange={set("symptoms")} rows={2}
              placeholder="e.g. Alarm beeping continuously, display flickering, SpO2 reading inaccurate"
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 mt-0.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Error Codes / Alarm Codes</label>
            <Input value={form.errorCodes} onChange={set("errorCodes")} placeholder="e.g. E-03, ALARM-12, BATT FAIL" className="h-8 text-xs mt-0.5" />
          </div>
          {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg p-2 border border-red-100">{error}</div>}
          <Button onClick={run} disabled={loading || !form.deviceName || !form.symptoms}
            className="w-full h-9 bg-blue-600 hover:bg-blue-700 text-white gap-2">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> ARIA diagnosing…</> : <><Zap className="h-4 w-4" /> Run AI Diagnostic</>}
          </Button>
        </>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-white">AI Diagnostic Report</p>
                <p className="text-[10px] text-slate-400">Confidence: {Math.round(result.confidence * 100)}% · Review with OEM manual</p>
              </div>
            </div>
            <div className="flex gap-1.5">
              <button onClick={copy} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600">
                {copied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </button>
              <button onClick={() => setResult(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {result.riskAssessment && (
            <div className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold ${riskColor(result.riskAssessment)}`}>
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>RISK: {result.riskAssessment}</span>
            </div>
          )}

          {[
            { key: "rootCause",          label: "Likely Root Cause",     color: "red" },
            { key: "immediateAction",    label: "Immediate Action",       color: "orange" },
            { key: "diagnosticSteps",   label: "Diagnostic Steps",       color: "blue" },
            { key: "partsNeeded",        label: "Parts Likely Needed",    color: "purple" },
            { key: "estimatedRepairTime",label: "Est. Repair Time",       color: "slate" },
            { key: "oemEscalation",      label: "OEM Escalation",         color: "amber" },
            { key: "preventiveNote",     label: "Preventive Note",        color: "green" },
          ].filter(s => result[s.key as keyof DiagnosticResult]).map(({ key, label, color }) => (
            <div key={key} className={cn("p-3 rounded-xl border text-xs",
              color === "red" ? "bg-red-50 border-red-100 dark:bg-red-950/20 dark:border-red-900" :
              color === "orange" ? "bg-orange-50 border-orange-100" :
              color === "amber" ? "bg-amber-50 border-amber-100" :
              color === "green" ? "bg-green-50 border-green-100" :
              color === "purple" ? "bg-purple-50 border-purple-100" :
              color === "blue" ? "bg-blue-50 border-blue-100" :
              "bg-slate-50 border-slate-100 dark:bg-slate-800/50 dark:border-slate-700"
            )}>
              <p className="font-bold text-[10px] text-slate-500 uppercase tracking-wide mb-1">{label}</p>
              <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                {result[key as keyof DiagnosticResult] as string}
              </p>
            </div>
          ))}

          <Button size="sm" className="w-full h-8 bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5">
            <FileText className="h-3.5 w-3.5" /> Create Work Order from Diagnosis
          </Button>
          <p className="text-[9px] text-slate-400 text-center">AI diagnostic — verify against OEM documentation before repair</p>
        </div>
      )}
    </div>
  );
};

// ─── Maintenance Planner Tool ─────────────────────────────────────────────────

const MaintenancePlannerTool = () => {
  const [period, setPeriod] = useState("3 months");
  const [engineers, setEngineers] = useState("4");
  const [dept, setDept] = useState("");
  const [devices, setDevices] = useState([
    { name: "Patient Monitor", type: "Monitoring", quantity: "12", pmFrequency: "Monthly" },
    { name: "Ventilator", type: "Respiratory", quantity: "6", pmFrequency: "Monthly" },
    { name: "Infusion Pump", type: "Infusion", quantity: "24", pmFrequency: "Quarterly" },
  ]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const run = async () => {
    setLoading(true); setError(""); setResult("");
    try {
      const data = await biomedApi("/ai/maintenance-plan", {
        devices: devices.map(d => ({ name: d.name, type: d.type, quantity: Number(d.quantity), pmFrequency: d.pmFrequency })),
        planningPeriod: period,
        engineerCount: Number(engineers),
        department: dept,
      });
      setResult(data.plan);
    } catch (e: any) { setError(e.message || "Failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-3 p-1">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Period</label>
          <select value={period} onChange={e => setPeriod(e.target.value)} className="w-full h-8 text-xs border border-slate-200 rounded-lg px-2 mt-0.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20">
            {["1 month","3 months","6 months","1 year"].map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Engineers</label>
          <Input type="number" value={engineers} onChange={e => setEngineers(e.target.value)} className="h-8 text-xs mt-0.5" min="1" />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Department</label>
          <Input value={dept} onChange={e => setDept(e.target.value)} placeholder="All" className="h-8 text-xs mt-0.5" />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Device List</label>
        </div>
        {devices.map((d, i) => (
          <div key={i} className="grid grid-cols-4 gap-1.5 mb-1.5">
            <Input value={d.name} onChange={e => setDevices(ds => ds.map((x,j) => j===i ? {...x,name:e.target.value} : x))} placeholder="Device name" className="h-7 text-xs col-span-2" />
            <Input type="number" value={d.quantity} onChange={e => setDevices(ds => ds.map((x,j) => j===i ? {...x,quantity:e.target.value} : x))} placeholder="Qty" className="h-7 text-xs" />
            <select value={d.pmFrequency} onChange={e => setDevices(ds => ds.map((x,j) => j===i ? {...x,pmFrequency:e.target.value} : x))} className="h-7 text-xs border border-slate-200 rounded-lg px-1.5 bg-white focus:outline-none">
              {["Weekly","Monthly","Quarterly","Biannual","Annual"].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
        ))}
        <button onClick={() => setDevices(ds => [...ds, { name: "", type: "General", quantity: "1", pmFrequency: "Monthly" }])}
          className="text-[10px] text-blue-600 font-semibold hover:text-blue-700 mt-0.5">+ Add device</button>
      </div>
      {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg p-2 border border-red-100">{error}</div>}
      <Button onClick={run} disabled={loading} size="sm" className="w-full h-8 bg-blue-600 hover:bg-blue-700 text-white gap-2">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5" />}
        {loading ? "ARIA planning…" : "Generate PPM Schedule"}
      </Button>
      {result && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
          {result}
        </motion.div>
      )}
    </div>
  );
};

// ─── Compliance Checker Tool ──────────────────────────────────────────────────

const ComplianceCheckerTool = () => {
  const [form, setForm] = useState({
    deviceName: "", model: "", manufacturer: "", deviceClass: "B",
    lastCalibration: "", calibrationDueDate: "", lastElectricalSafety: "", ppmStatus: "Current",
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const run = async () => {
    if (!form.deviceName) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const data = await biomedApi("/ai/compliance-check", form);
      setResult(data.compliance);
    } catch (e: any) { setError(e.message || "Check failed"); }
    finally { setLoading(false); }
  };

  const statusColor = (s: string = "") => {
    if (s.includes("NON-COMPLIANT") || s.includes("NON_COMPLIANT")) return "bg-red-50 border-red-200 text-red-700";
    if (s.includes("PARTIALLY")) return "bg-amber-50 border-amber-200 text-amber-700";
    return "bg-green-50 border-green-200 text-green-700";
  };

  return (
    <div className="space-y-3 p-1">
      <div className="grid grid-cols-2 gap-2">
        {[
          { k: "deviceName", label: "Device Name *", ph: "Patient Monitor" },
          { k: "model",      label: "Model",          ph: "MX450" },
          { k: "manufacturer", label: "Manufacturer", ph: "Philips" },
        ].map(({ k, label, ph }) => (
          <div key={k} className={k === "deviceName" ? "col-span-2" : ""}>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
            <Input value={form[k as keyof typeof form]} onChange={set(k)} placeholder={ph} className="h-8 text-xs mt-0.5" />
          </div>
        ))}
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Device Class</label>
          <select value={form.deviceClass} onChange={set("deviceClass")} className="w-full h-8 text-xs border border-slate-200 rounded-lg px-2 mt-0.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20">
            {["A","B","B+","BF","CF"].map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">PPM Status</label>
          <select value={form.ppmStatus} onChange={set("ppmStatus")} className="w-full h-8 text-xs border border-slate-200 rounded-lg px-2 mt-0.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20">
            {["Current","Overdue","Not Scheduled"].map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        {[
          { k: "lastCalibration",      label: "Last Calibration",      ph: "Jan 2026" },
          { k: "calibrationDueDate",   label: "Calibration Due",        ph: "Jul 2026" },
          { k: "lastElectricalSafety", label: "Last Electrical Safety", ph: "Dec 2025" },
        ].map(({ k, label, ph }) => (
          <div key={k}>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
            <Input value={form[k as keyof typeof form]} onChange={set(k)} placeholder={ph} className="h-8 text-xs mt-0.5" />
          </div>
        ))}
      </div>
      {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg p-2 border border-red-100">{error}</div>}
      <Button onClick={run} disabled={loading || !form.deviceName} size="sm" className="w-full h-8 bg-blue-600 hover:bg-blue-700 text-white gap-2">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
        {loading ? "Checking compliance…" : "Run Compliance Check"}
      </Button>
      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
            {result.status && (
              <div className={`flex items-center gap-2 p-3 rounded-xl border font-bold text-sm ${statusColor(result.status)}`}>
                {result.status.includes("NON") ? <AlertTriangle className="h-5 w-5 shrink-0" /> : <CheckCircle2 className="h-5 w-5 shrink-0" />}
                {result.status}
              </div>
            )}
            {[
              { key: "criticalGaps",      label: "Critical Gaps" },
              { key: "minorGaps",         label: "Minor Gaps" },
              { key: "requiredActions",   label: "Required Actions" },
              { key: "nabhIndicator",     label: "NABH Indicator" },
              { key: "accreditationRisk", label: "Accreditation Risk" },
            ].filter(s => result[s.key]).map(({ key, label }) => (
              <div key={key} className="p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700 text-xs">
                <p className="font-bold text-[10px] text-slate-500 uppercase tracking-wide mb-1">{label}</p>
                <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{result[key]}</p>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

interface BiomedicalAIAssistantProps {
  defaultOpen?: boolean;
  initialTool?: ActiveTool;
}

export const BiomedicalAIAssistant = ({ defaultOpen = false, initialTool }: BiomedicalAIAssistantProps) => {
  const [open, setOpen] = useState(defaultOpen);
  const [minimized, setMinimized] = useState(false);
  const [activeTool, setActiveTool] = useState<ActiveTool>(initialTool || "chat");
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: uid(), role: "assistant", timestamp: new Date(),
    content: "Hello! I'm ARIA (AI Repair & Intelligence Assistant), your clinical engineering AI. Ask me anything — device troubleshooting, PPM protocols, NABH compliance, calibration procedures, or use the tools above.",
  }]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) { setUnread(0); setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100); }
  }, [open, messages]);

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || chatLoading) return;
    setInput("");
    const userMsg: ChatMessage = { id: uid(), role: "user", content: msg, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setChatLoading(true);
    try {
      const history = messages.slice(-8).map(m => ({ role: m.role, content: m.content }));
      const data = await biomedApi("/ai/chat", { message: msg, history, context: "Biomedical engineering department" });
      const aiMsg: ChatMessage = { id: uid(), role: "assistant", content: data.reply || "I'm sorry, I couldn't respond.", timestamp: new Date() };
      setMessages(prev => [...prev, aiMsg]);
      if (!open) setUnread(n => n + 1);
    } catch (e: any) {
      setMessages(prev => [...prev, { id: uid(), role: "assistant", content: `Temporarily unavailable (${e.message}).`, timestamp: new Date() }]);
    } finally { setChatLoading(false); }
  }, [input, chatLoading, messages, open]);

  const tools: Array<{ id: ActiveTool; label: string; icon: React.ComponentType<any>; color: string }> = [
    { id: "chat",        label: "Ask ARIA",     icon: MessageSquare, color: "text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-700" },
    { id: "diagnostic",  label: "Diagnostic",   icon: Zap,           color: "text-red-600 bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-700" },
    { id: "maintenance", label: "PPM Planner",  icon: Wrench,        color: "text-purple-600 bg-purple-50 border-purple-200 dark:bg-purple-950 dark:border-purple-700" },
    { id: "compliance",  label: "Compliance",   icon: ShieldCheck,   color: "text-green-600 bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-700" },
  ];

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 shadow-xl shadow-blue-500/30 hover:shadow-2xl hover:shadow-blue-500/40 flex items-center justify-center transition-shadow"
          >
            <Bot className="h-6 w-6 text-white" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{unread}</span>
            )}
            <span className="absolute -bottom-7 text-[10px] font-semibold text-blue-700 whitespace-nowrap">ARIA AI</span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20, x: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20, x: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed bottom-6 right-6 z-50 w-[420px] max-h-[85vh] rounded-2xl bg-white dark:bg-slate-900 shadow-2xl shadow-slate-900/20 flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-700 to-indigo-700 shrink-0">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-9 h-9 rounded-full bg-white/20 border border-white/30 flex items-center justify-center">
                    <Cpu className="h-4 w-4 text-white" />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-cyan-400 rounded-full border-2 border-white" />
                </div>
                <div>
                  <p className="text-white font-bold text-sm">ARIA</p>
                  <p className="text-white/70 text-[10px]">AI Clinical Engineering · Biomedical Dept</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setMinimized(m => !m)} className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors">
                  {minimized ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <AnimatePresence>
              {!minimized && (
                <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                  className="flex flex-col flex-1 min-h-0 overflow-hidden">
                  {/* Tabs */}
                  <div className="flex gap-1.5 p-3 border-b border-slate-100 dark:border-slate-800 overflow-x-auto shrink-0">
                    {tools.map(t => (
                      <button key={t.id} onClick={() => setActiveTool(t.id)}
                        className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold whitespace-nowrap transition-all shrink-0",
                          activeTool === t.id ? t.color : "text-slate-500 bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-slate-800")}>
                        <t.icon className="h-3 w-3" />{t.label}
                      </button>
                    ))}
                  </div>

                  {/* Content */}
                  <div className="flex-1 overflow-y-auto">
                    {activeTool === "chat" && (
                      <div className="flex flex-col h-full" style={{ minHeight: 400 }}>
                        {messages.length <= 1 && (
                          <div className="p-3 border-b border-slate-100 dark:border-slate-800">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Quick Questions</p>
                            <div className="flex flex-wrap gap-1.5">
                              {quickPrompts.slice(0, 4).map(q => (
                                <button key={q} onClick={() => sendMessage(q)}
                                  className="text-[10px] px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-700 transition-colors text-left">
                                  {q.length > 44 ? q.slice(0, 44) + "…" : q}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="flex-1 overflow-y-auto p-3 space-y-3">
                          {messages.map(msg => (
                            <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                              className={cn("flex gap-2.5", msg.role === "user" ? "justify-end" : "justify-start")}>
                              {msg.role === "assistant" && (
                                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                                  <Cpu className="h-3 w-3 text-white" />
                                </div>
                              )}
                              <div className={cn("max-w-[78%] rounded-2xl px-3 py-2 text-xs leading-relaxed",
                                msg.role === "user"
                                  ? "bg-blue-600 text-white rounded-tr-sm"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-sm")}>
                                <p className="whitespace-pre-wrap">{msg.content}</p>
                                <p className={cn("text-[9px] mt-1.5 opacity-60", msg.role === "user" ? "text-right" : "text-left")}>
                                  {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </p>
                              </div>
                            </motion.div>
                          ))}
                          {chatLoading && (
                            <div className="flex gap-2.5">
                              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shrink-0">
                                <Cpu className="h-3 w-3 text-white" />
                              </div>
                              <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                                {[0, 0.15, 0.3].map(d => (
                                  <motion.div key={d} className="w-1.5 h-1.5 bg-blue-500 rounded-full"
                                    animate={{ y: [0, -4, 0] }} transition={{ duration: 0.7, delay: d, repeat: Infinity }} />
                                ))}
                              </div>
                            </div>
                          )}
                          <div ref={chatEndRef} />
                        </div>
                        <div className="p-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
                          <div className="flex gap-2">
                            <Input ref={undefined} value={input} onChange={e => setInput(e.target.value)}
                              onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
                              placeholder="Ask a clinical engineering question…" className="flex-1 h-9 text-xs" disabled={chatLoading} />
                            <Button onClick={() => sendMessage()} disabled={chatLoading || !input.trim()}
                              size="icon" className="h-9 w-9 bg-blue-600 hover:bg-blue-700 text-white shrink-0">
                              {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeTool === "diagnostic" && (
                      <div className="p-3">
                        <div className="flex items-center gap-2 mb-3 p-2.5 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-100 dark:border-red-800">
                          <Zap className="h-4 w-4 text-red-600 shrink-0" />
                          <p className="text-xs text-red-700 dark:text-red-300">AI analyses device symptoms and generates a root-cause diagnostic report with repair steps.</p>
                        </div>
                        <DiagnosticTool />
                      </div>
                    )}

                    {activeTool === "maintenance" && (
                      <div className="p-3">
                        <div className="flex items-center gap-2 mb-3 p-2.5 bg-purple-50 dark:bg-purple-950/30 rounded-xl border border-purple-100 dark:border-purple-800">
                          <Wrench className="h-4 w-4 text-purple-600 shrink-0" />
                          <p className="text-xs text-purple-700 dark:text-purple-300">Generate an AI-optimised PPM schedule for your device fleet, NABH-compliant with engineer allocation.</p>
                        </div>
                        <MaintenancePlannerTool />
                      </div>
                    )}

                    {activeTool === "compliance" && (
                      <div className="p-3">
                        <div className="flex items-center gap-2 mb-3 p-2.5 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-100 dark:border-green-800">
                          <ShieldCheck className="h-4 w-4 text-green-600 shrink-0" />
                          <p className="text-xs text-green-700 dark:text-green-300">Check NABH, IEC 60601, ISO 13485 compliance status for any device. Identifies gaps and required actions.</p>
                        </div>
                        <ComplianceCheckerTool />
                      </div>
                    )}
                  </div>

                  <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-800/50">
                    <p className="text-[9px] text-slate-400">AI outputs require engineering review</p>
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-pulse" />
                      <p className="text-[9px] font-semibold text-blue-600 dark:text-blue-400">ARIA Online</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default BiomedicalAIAssistant;
