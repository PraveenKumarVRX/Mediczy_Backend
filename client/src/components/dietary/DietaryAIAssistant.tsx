/**
 * DietaryAIAssistant — floating Dr. iSHA panel for the dietary department.
 *
 * Features:
 *  • Nutritionist chat  — ask clinical nutrition questions
 *  • Smart Order        — AI-generate a complete diet order in seconds
 *  • Allergy Guard      — cross-check a meal against patient allergens
 *  • Kitchen Forecast   — predict tomorrow's volumes
 *  • Meal Narrative     — generate plain-English kitchen brief
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare, X, ChevronDown, ChevronUp, Send, Loader2,
  Sparkles, ShieldCheck, ChefHat, TrendingUp, AlertTriangle,
  CheckCircle2, FileText, Utensils, Copy, ThumbsUp, RefreshCw,
  Zap, Mic, Bot,
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
  liked?: boolean;
}

type ActiveTool = "chat" | "smart-order" | "allergy-guard" | "forecast" | "narrative";

interface AllergyCheckResult {
  safe: boolean;
  verdict: string;
  conflicts: Array<{ allergen: string; source: string; risk: string; substitute: string }>;
  summary: string;
}

interface SmartOrderResult {
  dietType: string;
  dailyCalories: string;
  criticalRestrictions: string;
  mealSchedule: string;
  fluidAllowance: string;
  supplementation: string;
  kitchenNotes: string;
  nutritionistFlags: string;
  raw: string;
  allergyVerified: string[];
  confidence: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const getDietaryToken = () =>
  typeof window !== "undefined" ? localStorage.getItem("dietaryToken") || "" : "";

const dietaryApi = async (path: string, body: object) => {
  const res = await fetch(`/api/dietary${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getDietaryToken()}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Request failed");
  return res.json();
};

const uid = () => Math.random().toString(36).slice(2);

const quickPrompts = [
  "What foods should a CKD Stage 3 patient avoid?",
  "Drug-nutrient interaction: warfarin and green vegetables?",
  "High-protein meal ideas for a post-surgery vegetarian patient",
  "Daily potassium limit for renal diet?",
  "FSSAI rules for hospital kitchen allergen labelling",
  "Soft diet options for a post-stroke dysphagia patient",
];

// ─── Allergy Guard Tool ───────────────────────────────────────────────────────

const AllergyGuardTool = () => {
  const [patientName, setPatientName] = useState("");
  const [allergies, setAllergies] = useState("");
  const [meal, setMeal] = useState("");
  const [mealName, setMealName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AllergyCheckResult | null>(null);
  const [error, setError] = useState("");

  const check = async () => {
    if (!meal.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await dietaryApi("/ai/allergy-check", {
        patientName,
        allergies: allergies.split(",").map(a => a.trim()).filter(Boolean),
        mealDescription: meal,
        mealName,
      });
      setResult(data);
    } catch (e: any) {
      setError(e.message || "Check failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 p-1">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Patient</label>
          <Input value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="Patient name" className="h-8 text-xs mt-0.5" />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Meal Name</label>
          <Input value={mealName} onChange={e => setMealName(e.target.value)} placeholder="e.g. Lunch" className="h-8 text-xs mt-0.5" />
        </div>
      </div>
      <div>
        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Known Allergies (comma-separated)</label>
        <Input value={allergies} onChange={e => setAllergies(e.target.value)} placeholder="e.g. Peanuts, Dairy, Gluten" className="h-8 text-xs mt-0.5" />
      </div>
      <div>
        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Meal Description / Ingredients</label>
        <textarea
          value={meal}
          onChange={e => setMeal(e.target.value)}
          placeholder="Describe the meal or list ingredients..."
          rows={3}
          className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 mt-0.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 resize-none"
        />
      </div>
      <Button onClick={check} disabled={loading || !meal.trim()} size="sm" className="w-full h-8 bg-green-600 hover:bg-green-700 text-white gap-2">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
        {loading ? "Checking…" : "Run Allergy Guard"}
      </Button>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 rounded-lg p-2 border border-red-100">{error}</div>
      )}

      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
            <div className={cn(
              "flex items-center gap-2.5 p-3 rounded-xl border font-semibold text-sm",
              result.safe
                ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-950/40 dark:border-green-700 dark:text-green-300"
                : result.verdict === "REVIEW_NEEDED"
                ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/40 dark:border-amber-700"
                : "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/40 dark:border-red-700"
            )}>
              {result.safe
                ? <CheckCircle2 className="h-5 w-5 shrink-0" />
                : <AlertTriangle className="h-5 w-5 shrink-0" />}
              <div>
                <p className="font-bold">{result.verdict === "SAFE" ? "SAFE TO SERVE" : result.verdict === "REVIEW_NEEDED" ? "REVIEW NEEDED" : "DO NOT SERVE"}</p>
                <p className="text-xs font-normal mt-0.5 opacity-80">{result.summary}</p>
              </div>
            </div>

            {result.conflicts.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Allergen Conflicts</p>
                {result.conflicts.map((c, i) => (
                  <div key={i} className="p-2.5 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-100 dark:border-red-800 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-red-700 dark:text-red-300">⚠ {c.allergen}</span>
                      <Badge className="text-[9px] bg-red-100 text-red-600 border-0 dark:bg-red-900 dark:text-red-300">{c.risk}</Badge>
                    </div>
                    <p className="text-slate-600 dark:text-slate-400">{c.source}</p>
                    {c.substitute && <p className="text-green-700 dark:text-green-400">✓ Substitute: {c.substitute}</p>}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Smart Order Tool ─────────────────────────────────────────────────────────

const SmartOrderTool = ({ onOrderGenerated }: { onOrderGenerated?: (order: SmartOrderResult) => void }) => {
  const [form, setForm] = useState({
    patientName: "", patientId: "", age: "", gender: "male",
    ward: "", bed: "", conditions: "", allergies: "", medications: "",
    weight: "", height: "", dietaryPreference: "vegetarian", cuisineRegion: "north_indian",
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SmartOrderResult | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const generate = async () => {
    if (!form.patientName.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await dietaryApi("/ai/smart-order", {
        ...form,
        age: Number(form.age) || undefined,
        weight: Number(form.weight) || undefined,
        height: Number(form.height) || undefined,
        conditions: form.conditions.split(",").map(s => s.trim()).filter(Boolean),
        allergies: form.allergies.split(",").map(s => s.trim()).filter(Boolean),
        medications: form.medications.split(",").map(s => s.trim()).filter(Boolean),
      });
      setResult(data.order);
      onOrderGenerated?.(data.order);
    } catch (e: any) {
      setError(e.message || "Order generation failed");
    } finally {
      setLoading(false);
    }
  };

  const copyOrder = () => {
    if (result?.raw) {
      navigator.clipboard.writeText(result.raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-3 p-1">
      {!result ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Patient Name *</label>
              <Input value={form.patientName} onChange={set("patientName")} placeholder="Full name" className="h-8 text-xs mt-0.5" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Patient ID</label>
              <Input value={form.patientId} onChange={set("patientId")} placeholder="MRN / ID" className="h-8 text-xs mt-0.5" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Age</label>
              <Input type="number" value={form.age} onChange={set("age")} placeholder="Years" className="h-8 text-xs mt-0.5" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Gender</label>
              <select value={form.gender} onChange={set("gender")} className="w-full h-8 text-xs border border-slate-200 rounded-lg px-2 mt-0.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20">
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Ward</label>
              <Input value={form.ward} onChange={set("ward")} placeholder="e.g. ICU-3" className="h-8 text-xs mt-0.5" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Bed</label>
              <Input value={form.bed} onChange={set("bed")} placeholder="e.g. B4" className="h-8 text-xs mt-0.5" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Weight (kg)</label>
              <Input type="number" value={form.weight} onChange={set("weight")} placeholder="kg" className="h-8 text-xs mt-0.5" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Height (cm)</label>
              <Input type="number" value={form.height} onChange={set("height")} placeholder="cm" className="h-8 text-xs mt-0.5" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Conditions (comma-separated)</label>
            <Input value={form.conditions} onChange={set("conditions")} placeholder="e.g. T2DM, Hypertension, CKD Stage 3" className="h-8 text-xs mt-0.5" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Allergies (comma-separated)</label>
            <Input value={form.allergies} onChange={set("allergies")} placeholder="e.g. Peanuts, Dairy" className="h-8 text-xs mt-0.5" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Medications (comma-separated)</label>
            <Input value={form.medications} onChange={set("medications")} placeholder="e.g. Metformin, Warfarin" className="h-8 text-xs mt-0.5" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Diet Preference</label>
              <select value={form.dietaryPreference} onChange={set("dietaryPreference")} className="w-full h-8 text-xs border border-slate-200 rounded-lg px-2 mt-0.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20">
                <option value="vegetarian">Vegetarian</option>
                <option value="balanced">Non-Vegetarian</option>
                <option value="eggetarian">Eggetarian</option>
                <option value="vegan">Vegan</option>
                <option value="jain">Jain</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Cuisine Region</label>
              <select value={form.cuisineRegion} onChange={set("cuisineRegion")} className="w-full h-8 text-xs border border-slate-200 rounded-lg px-2 mt-0.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20">
                <option value="north_indian">North Indian</option>
                <option value="south_indian">South Indian</option>
                <option value="bengali">Bengali</option>
                <option value="gujarati">Gujarati</option>
                <option value="maharashtrian">Maharashtrian</option>
                <option value="punjabi">Punjabi</option>
                <option value="kerala">Kerala</option>
                <option value="rajasthani">Rajasthani</option>
              </select>
            </div>
          </div>

          {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg p-2 border border-red-100">{error}</div>}

          <Button onClick={generate} disabled={loading || !form.patientName.trim()} className="w-full h-9 bg-green-600 hover:bg-green-700 text-white gap-2">
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Dr. iSHA is drafting order…</>
              : <><Zap className="h-4 w-4" /> Generate Smart Order</>}
          </Button>
        </>
      ) : (
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-white">AI Order Generated</p>
                <p className="text-[10px] text-slate-400">Confidence: {Math.round(result.confidence * 100)}% · Review before applying</p>
              </div>
            </div>
            <div className="flex gap-1.5">
              <button onClick={copyOrder} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 transition-colors">
                {copied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </button>
              <button onClick={() => setResult(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 transition-colors">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Allergy banner */}
          {result.allergyVerified.length > 0 && (
            <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-100 dark:border-red-800">
              <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" />
              <p className="text-[10px] font-semibold text-red-700 dark:text-red-300">
                ALLERGENS FLAGGED: {result.allergyVerified.join(", ")} — all excluded from plan
              </p>
            </div>
          )}

          {/* Order sections */}
          {[
            { key: "dietType", label: "Diet Type", icon: Utensils, color: "green" },
            { key: "dailyCalories", label: "Daily Calories", icon: TrendingUp, color: "blue" },
            { key: "criticalRestrictions", label: "Critical Restrictions", icon: AlertTriangle, color: "red" },
            { key: "mealSchedule", label: "Meal Schedule", icon: ChefHat, color: "amber" },
            { key: "fluidAllowance", label: "Fluid Allowance", icon: TrendingUp, color: "cyan" },
            { key: "supplementation", label: "Supplementation", icon: Sparkles, color: "purple" },
            { key: "kitchenNotes", label: "Kitchen Notes", icon: FileText, color: "slate" },
            { key: "nutritionistFlags", label: "Nutritionist Flags", icon: AlertTriangle, color: "orange" },
          ].filter(s => result[s.key as keyof SmartOrderResult]).map(({ key, label, icon: Icon, color }) => (
            <div key={key} className={cn(
              "p-3 rounded-xl border text-xs",
              color === "red" ? "bg-red-50 border-red-100 dark:bg-red-950/20 dark:border-red-900" :
              color === "amber" ? "bg-amber-50 border-amber-100 dark:bg-amber-950/20 dark:border-amber-900" :
              color === "orange" ? "bg-orange-50 border-orange-100 dark:bg-orange-950/20 dark:border-orange-900" :
              "bg-slate-50 border-slate-100 dark:bg-slate-800/50 dark:border-slate-700"
            )}>
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className="h-3 w-3 text-slate-500 shrink-0" />
                <p className="font-bold text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
              </div>
              <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                {result[key as keyof SmartOrderResult] as string}
              </p>
            </div>
          ))}

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="flex-1 h-8 bg-green-600 hover:bg-green-700 text-white text-xs gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> Apply Order
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1.5" onClick={copyOrder}>
              <Copy className="h-3.5 w-3.5" /> {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
          <p className="text-[9px] text-slate-400 text-center">AI-generated — nutritionist review required before applying to patient record</p>
        </div>
      )}
    </div>
  );
};

// ─── Kitchen Forecast Tool ────────────────────────────────────────────────────

const KitchenForecastTool = () => {
  const [census, setCensus] = useState("308");
  const [admissions, setAdmissions] = useState("12");
  const [discharges, setDischarges] = useState("8");
  const [waste, setWaste] = useState("4.2");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const generate = async () => {
    setLoading(true);
    setError("");
    setResult("");
    try {
      const data = await dietaryApi("/ai/kitchen-forecast", {
        currentCensus: Number(census),
        expectedAdmissions: Number(admissions),
        expectedDischarges: Number(discharges),
        historicalWaste: Number(waste),
      });
      setResult(data.forecast);
    } catch (e: any) {
      setError(e.message || "Forecast failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 p-1">
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Current Census", val: census, set: setCensus, placeholder: "Patients today" },
          { label: "Expected Admissions", val: admissions, set: setAdmissions, placeholder: "+12" },
          { label: "Expected Discharges", val: discharges, set: setDischarges, placeholder: "-8" },
          { label: "Waste Rate (%)", val: waste, set: setWaste, placeholder: "4.2" },
        ].map(({ label, val, set, placeholder }) => (
          <div key={label}>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
            <Input type="number" value={val} onChange={e => set(e.target.value)} placeholder={placeholder} className="h-8 text-xs mt-0.5" />
          </div>
        ))}
      </div>
      <div className="p-2.5 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
        Projected tomorrow's census: <strong>{Math.max(0, Number(census) + Number(admissions) - Number(discharges))}</strong> patients
      </div>
      {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg p-2 border border-red-100">{error}</div>}
      <Button onClick={generate} disabled={loading} size="sm" className="w-full h-8 bg-green-600 hover:bg-green-700 text-white gap-2">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5" />}
        {loading ? "Generating Forecast…" : "Generate Kitchen Forecast"}
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

// ─── Main component ───────────────────────────────────────────────────────────

interface DietaryAIAssistantProps {
  defaultOpen?: boolean;
  initialTool?: ActiveTool;
  onOrderGenerated?: (order: SmartOrderResult) => void;
}

export const DietaryAIAssistant = ({ defaultOpen = false, initialTool, onOrderGenerated }: DietaryAIAssistantProps) => {
  const [open, setOpen] = useState(defaultOpen);
  const [minimized, setMinimized] = useState(false);
  const [activeTool, setActiveTool] = useState<ActiveTool>(initialTool || "chat");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: uid(),
      role: "assistant",
      content: "Hello! I'm Dr. iSHA, your clinical nutrition AI. Ask me anything — drug-nutrient interactions, therapeutic diet protocols, patient meal planning, FSSAI guidelines, or use the tools above for smart order generation and allergy checking.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
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
      const data = await dietaryApi("/ai/chat", { message: msg, history, context: "Dietary department portal" });
      const aiMsg: ChatMessage = { id: uid(), role: "assistant", content: data.reply || "I'm sorry, I couldn't generate a response.", timestamp: new Date() };
      setMessages(prev => [...prev, aiMsg]);
      if (!open) setUnread(n => n + 1);
    } catch (e: any) {
      const errMsg: ChatMessage = { id: uid(), role: "assistant", content: `I'm temporarily unavailable (${e.message}). Please try again.`, timestamp: new Date() };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setChatLoading(false);
    }
  }, [input, chatLoading, messages, open]);

  const tools: Array<{ id: ActiveTool; label: string; icon: React.ComponentType<any>; color: string }> = [
    { id: "chat",         label: "Ask iSHA",     icon: MessageSquare, color: "text-green-600 bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-700" },
    { id: "smart-order",  label: "Smart Order",  icon: Zap,           color: "text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-700" },
    { id: "allergy-guard",label: "Allergy Guard",icon: ShieldCheck,   color: "text-red-600 bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-700" },
    { id: "forecast",     label: "Kitchen Forecast", icon: TrendingUp, color: "text-purple-600 bg-purple-50 border-purple-200 dark:bg-purple-950 dark:border-purple-700" },
  ];

  return (
    <>
      {/* Floating trigger button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 shadow-xl shadow-green-500/30 hover:shadow-2xl hover:shadow-green-500/40 flex items-center justify-center transition-shadow"
          >
            <Bot className="h-6 w-6 text-white" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unread}
              </span>
            )}
            <span className="absolute -bottom-7 text-[10px] font-semibold text-green-700 whitespace-nowrap">Dr. iSHA</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Panel */}
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
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 shrink-0">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-9 h-9 rounded-full bg-white/20 border border-white/30 flex items-center justify-center">
                    <Sparkles className="h-4.5 w-4.5 text-white" />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />
                </div>
                <div>
                  <p className="text-white font-bold text-sm">Dr. iSHA</p>
                  <p className="text-white/70 text-[10px]">AI Clinical Nutritionist · Dietary Services</p>
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
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: "auto" }}
                  exit={{ height: 0 }}
                  className="flex flex-col flex-1 min-h-0 overflow-hidden"
                >
                  {/* Tool tabs */}
                  <div className="flex gap-1.5 p-3 border-b border-slate-100 dark:border-slate-800 overflow-x-auto shrink-0">
                    {tools.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setActiveTool(t.id)}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold whitespace-nowrap transition-all shrink-0",
                          activeTool === t.id ? t.color : "text-slate-500 bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-slate-800"
                        )}
                      >
                        <t.icon className="h-3 w-3" />
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* Tool content */}
                  <div className="flex-1 overflow-y-auto">
                    {activeTool === "chat" && (
                      <div className="flex flex-col h-full" style={{ minHeight: 400 }}>
                        {/* Quick prompts */}
                        {messages.length <= 1 && (
                          <div className="p-3 border-b border-slate-100 dark:border-slate-800">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Quick Questions</p>
                            <div className="flex flex-wrap gap-1.5">
                              {quickPrompts.slice(0, 4).map(q => (
                                <button
                                  key={q}
                                  onClick={() => sendMessage(q)}
                                  className="text-[10px] px-2.5 py-1.5 bg-green-50 hover:bg-green-100 dark:bg-green-950 dark:hover:bg-green-900 text-green-700 dark:text-green-300 rounded-full border border-green-200 dark:border-green-700 transition-colors text-left"
                                >
                                  {q.length > 42 ? q.slice(0, 42) + "…" : q}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-3">
                          {messages.map(msg => (
                            <motion.div
                              key={msg.id}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              className={cn("flex gap-2.5", msg.role === "user" ? "justify-end" : "justify-start")}
                            >
                              {msg.role === "assistant" && (
                                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                                  <Sparkles className="h-3 w-3 text-white" />
                                </div>
                              )}
                              <div className={cn(
                                "max-w-[78%] rounded-2xl px-3 py-2 text-xs leading-relaxed",
                                msg.role === "user"
                                  ? "bg-green-600 text-white rounded-tr-sm"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-sm"
                              )}>
                                <p className="whitespace-pre-wrap">{msg.content}</p>
                                <p className={cn("text-[9px] mt-1.5 opacity-60", msg.role === "user" ? "text-right" : "text-left")}>
                                  {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </p>
                              </div>
                            </motion.div>
                          ))}
                          {chatLoading && (
                            <div className="flex gap-2.5">
                              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shrink-0">
                                <Sparkles className="h-3 w-3 text-white" />
                              </div>
                              <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                                {[0, 0.15, 0.3].map(d => (
                                  <motion.div key={d} className="w-1.5 h-1.5 bg-green-500 rounded-full"
                                    animate={{ y: [0, -4, 0] }} transition={{ duration: 0.7, delay: d, repeat: Infinity }} />
                                ))}
                              </div>
                            </div>
                          )}
                          <div ref={chatEndRef} />
                        </div>

                        {/* Input */}
                        <div className="p-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
                          <div className="flex gap-2">
                            <Input
                              ref={inputRef}
                              value={input}
                              onChange={e => setInput(e.target.value)}
                              onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
                              placeholder="Ask a clinical nutrition question…"
                              className="flex-1 h-9 text-xs"
                              disabled={chatLoading}
                            />
                            <Button
                              onClick={() => sendMessage()}
                              disabled={chatLoading || !input.trim()}
                              size="icon"
                              className="h-9 w-9 bg-green-600 hover:bg-green-700 text-white shrink-0"
                            >
                              {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeTool === "smart-order" && (
                      <div className="p-3">
                        <div className="flex items-center gap-2 mb-3 p-2.5 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-800">
                          <Zap className="h-4 w-4 text-blue-600 shrink-0" />
                          <p className="text-xs text-blue-700 dark:text-blue-300">
                            AI generates a complete, clinician-reviewed diet order from the patient's EHR profile in seconds.
                          </p>
                        </div>
                        <SmartOrderTool onOrderGenerated={onOrderGenerated} />
                      </div>
                    )}

                    {activeTool === "allergy-guard" && (
                      <div className="p-3">
                        <div className="flex items-center gap-2 mb-3 p-2.5 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-100 dark:border-red-800">
                          <ShieldCheck className="h-4 w-4 text-red-600 shrink-0" />
                          <p className="text-xs text-red-700 dark:text-red-300">
                            Cross-check any meal against a patient's allergy profile before serving. Zero allergen errors.
                          </p>
                        </div>
                        <AllergyGuardTool />
                      </div>
                    )}

                    {activeTool === "forecast" && (
                      <div className="p-3">
                        <div className="flex items-center gap-2 mb-3 p-2.5 bg-purple-50 dark:bg-purple-950/30 rounded-xl border border-purple-100 dark:border-purple-800">
                          <TrendingUp className="h-4 w-4 text-purple-600 shrink-0" />
                          <p className="text-xs text-purple-700 dark:text-purple-300">
                            Predict tomorrow's meal volumes from census data. Reduce waste, optimise kitchen prep.
                          </p>
                        </div>
                        <KitchenForecastTool />
                      </div>
                    )}
                  </div>

                  {/* Footer badge */}
                  <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-800/50">
                    <p className="text-[9px] text-slate-400">AI outputs require clinical review</p>
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                      <p className="text-[9px] font-semibold text-green-600 dark:text-green-400">Dr. iSHA Online</p>
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

export default DietaryAIAssistant;
