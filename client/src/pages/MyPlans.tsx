import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import api from "@/utils/api";
import { useAuth } from "@/auth/AuthProvider";
import { openRazorpayCheckout } from "@/utils/razorpay";
import {
  Crown, CheckCircle2, Loader2, TrendingUp, Zap, Shield, Star, Gem,
  Pill, Home, Ambulance, Stethoscope, Calendar, X, AlertCircle,
  Video, MapPin, FlaskConical, HeartPulse, Syringe, Smile
} from "lucide-react";

// ── Animation variants ──────────────────────────────────────────────────────
const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } }
};
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] } }
};

// ── Tier configuration ───────────────────────────────────────────────────────
const TIERS: Record<number, {
  label: string; Icon: React.FC<{ className?: string }>;
  gradient: string; ring: string; badge: string; accent: string; track: string;
}> = {
  0: { label: "Basic",        Icon: Zap,    gradient: "from-gray-500 to-gray-700",              ring: "#6b7280", badge: "bg-gray-100 text-gray-700 border-gray-300",       accent: "text-gray-600",   track: "#f3f4f6" },
  1: { label: "Silver",       Icon: Shield, gradient: "from-slate-400 to-slate-600",            ring: "#94a3b8", badge: "bg-slate-100 text-slate-700 border-slate-300",   accent: "text-slate-600",  track: "#e2e8f0" },
  2: { label: "Silver Plus",  Icon: Shield, gradient: "from-slate-300 via-blue-300 to-slate-500",ring: "#64748b", badge: "bg-blue-50 text-blue-700 border-blue-300",         accent: "text-blue-600",   track: "#dbeafe" },
  3: { label: "Silver Elite", Icon: Shield, gradient: "from-slate-400 via-indigo-300 to-slate-600",ring: "#4f46e5", badge: "bg-indigo-50 text-indigo-700 border-indigo-300",accent: "text-indigo-600", track: "#e0e7ff" },
  4: { label: "Gold",         Icon: Star,   gradient: "from-amber-500 to-yellow-600",           ring: "#f59e0b", badge: "bg-amber-50 text-amber-700 border-amber-300",    accent: "text-amber-600",  track: "#fef3c7" },
  5: { label: "Platinum",     Icon: Crown,  gradient: "from-sky-500 to-blue-600",               ring: "#0ea5e9", badge: "bg-sky-50 text-sky-700 border-sky-300",            accent: "text-sky-600",    track: "#e0f2fe" },
  6: { label: "Diamond",      Icon: Gem,    gradient: "from-purple-600 to-violet-700",          ring: "#7c3aed", badge: "bg-purple-50 text-purple-700 border-purple-300",  accent: "text-purple-600", track: "#ede9fe" },
};

const TIER_LIST = [0, 1, 2, 3, 4, 5, 6];

// ── Types ────────────────────────────────────────────────────────────────────
interface BenefitLimits { pharmacyLimitINR?: number; homeCareLimitINR?: number; ambulanceLimitINR?: number }
interface TeleConsultLimits { allSpecialties?: number; [k: string]: number | undefined }
interface CoverageItem { limit?: number; limitINR?: number; unit?: string; package?: string }
interface CoverageDetails {
  onlineConsult?: CoverageItem; physicalConsult?: CoverageItem;
  labTests?: CoverageItem; pharmacy?: CoverageItem;
  homeCare?: CoverageItem; ambulance?: CoverageItem;
  healthCheck?: CoverageItem; emergencyConsult?: CoverageItem; dental?: CoverageItem;
}

interface ActiveUserPlan {
  id: number; membershipPlanId: number; startDate: string; endDate: string;
  status: "active" | "expired" | "cancelled"; paidAmount?: number;
  appliedLimits: { benefitLimits?: BenefitLimits; teleConsultLimits?: TeleConsultLimits; healthCheckPackage?: string; priceINR?: number };
  usage?: Record<string, any>;
  plan?: PlanData; MembershipPlan?: PlanData;
}
interface PlanData { id: number; name: string; description?: string; tier?: number; tierName?: string; price?: string | number; discountedPrice?: string | number; durationMonths?: number; features?: string[]; benefits?: string[]; metadata?: { coverageDetails?: CoverageDetails; [k: string]: any } }
interface UpgradeOption { id: number; name: string; description?: string; tier: number; tierName: string; originalPrice: number; proratedRefund: number; amountDue: number; isUpgrade: boolean; features?: string[]; benefits?: string[]; durationMonths?: number; metadata?: { coverageDetails?: CoverageDetails; [k: string]: any } }
interface UpgradeOptionsRes { hasActivePlan: boolean; currentPlan: { id: number; name: string; tier: number; tierName: string; endDate: string; remainingDays: number; proratedRefund: number } | null; upgradeOptions: UpgradeOption[] }
interface UsageRes { active: ActiveUserPlan | null; remaining: BenefitLimits | null }

// ── Coverage config ──────────────────────────────────────────────────────────
const COVERAGE_ROWS: Array<{
  key: keyof CoverageDetails;
  label: string;
  sub: string;
  Icon: React.FC<{ className?: string }>;
  type: "consult" | "money" | "package";
  color: string;
}> = [
  { key: "onlineConsult",    label: "Online Consultation",   sub: "Tele/Video",        Icon: Video,        type: "consult",  color: "#0ea5e9" },
  { key: "physicalConsult",  label: "Physical Consultation", sub: "In-clinic/Offline",  Icon: MapPin,       type: "consult",  color: "#7c3aed" },
  { key: "labTests",         label: "Lab Tests & Diagnostics",sub: "Blood, radiology",  Icon: FlaskConical, type: "money",    color: "#db2777" },
  { key: "pharmacy",         label: "Pharmacy",              sub: "Prescribed medicines",Icon: Pill,         type: "money",    color: "#16a34a" },
  { key: "homeCare",         label: "Home Care",             sub: "Nursing at home",   Icon: Home,         type: "money",    color: "#0891b2" },
  { key: "ambulance",        label: "Ambulance",             sub: "Emergency transport",Icon: Ambulance,    type: "money",    color: "#dc2626" },
  { key: "healthCheck",      label: "Annual Health Check",   sub: "Preventive screening",Icon: HeartPulse,  type: "package", color: "#d97706" },
  { key: "emergencyConsult", label: "Emergency Consultation",sub: "Urgent consultations",Icon: Syringe,     type: "consult",  color: "#ea580c" },
  { key: "dental",           label: "Dental Coverage",       sub: "Dental treatments",  Icon: Smile,        type: "money",    color: "#4f46e5" },
];

function formatCoverageValue(row: typeof COVERAGE_ROWS[0], item?: CoverageItem): { text: string; included: boolean } {
  if (!item) return { text: "Not included", included: false };
  if (row.type === "package") {
    const pkg = item.package ?? "None";
    return { text: pkg === "None" || !pkg ? "Not included" : pkg, included: pkg !== "None" && !!pkg };
  }
  if (row.type === "money") {
    const v = item.limitINR ?? 0;
    return { text: v > 0 ? `₹${v.toLocaleString("en-IN")}` : "Not included", included: v > 0 };
  }
  // consult
  const v = item.limit ?? 0;
  if (v >= 999) return { text: "Unlimited", included: true };
  if (v === 0) return { text: "Not included", included: false };
  return { text: `${v}/month`, included: true };
}

// ── Coverage grid (current plan detail) ──────────────────────────────────────
function CoverageGrid({ coverage, tier, remaining, usedConsults }: {
  coverage: CoverageDetails;
  tier: number;
  remaining: BenefitLimits | null;
  usedConsults: number;
}) {
  const cfg = TIERS[tier] ?? TIERS[1];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {COVERAGE_ROWS.map(row => {
        const item = coverage[row.key];
        const { text, included } = formatCoverageValue(row, item);
        const Icon = row.Icon;

        // Live remaining for tracked benefits
        let liveText = text;
        let usedInfo: string | null = null;
        if (included && row.key === "onlineConsult" && (item?.limit ?? 0) < 999) {
          const allowed = item?.limit ?? 0;
          const rem = Math.max(0, allowed - usedConsults);
          liveText = `${rem} remaining`;
          usedInfo = `${usedConsults} used · ${allowed} total`;
        }
        if (included && row.key === "pharmacy" && remaining?.pharmacyLimitINR !== undefined) {
          liveText = `₹${remaining.pharmacyLimitINR.toLocaleString("en-IN")} left`;
          const total = item?.limitINR ?? 0;
          usedInfo = `₹${(total - remaining.pharmacyLimitINR).toLocaleString("en-IN")} used`;
        }
        if (included && row.key === "homeCare" && remaining?.homeCareLimitINR !== undefined) {
          liveText = `₹${remaining.homeCareLimitINR.toLocaleString("en-IN")} left`;
          const total = item?.limitINR ?? 0;
          usedInfo = `₹${(total - remaining.homeCareLimitINR).toLocaleString("en-IN")} used`;
        }
        if (included && row.key === "ambulance" && remaining?.ambulanceLimitINR !== undefined) {
          liveText = `₹${remaining.ambulanceLimitINR.toLocaleString("en-IN")} left`;
          const total = item?.limitINR ?? 0;
          usedInfo = `₹${(total - remaining.ambulanceLimitINR).toLocaleString("en-IN")} used`;
        }

        return (
          <div key={row.key} className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
            included
              ? "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700"
              : "bg-gray-50 dark:bg-gray-900 border-gray-100 dark:border-gray-800 opacity-50"
          }`}>
            <div className="p-2 rounded-lg shrink-0" style={{ background: included ? row.color + "18" : "#f3f4f6" }}>
              <Icon className="w-4 h-4" style={{ color: included ? row.color : "#9ca3af" }} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight">{row.label}</p>
              <p className={`text-sm font-semibold leading-snug mt-0.5 ${
                included ? "text-gray-900 dark:text-white" : "text-gray-400"
              }`}>
                {included && row.type === "package" ? (
                  <span className="text-xs font-medium leading-tight">{liveText}</span>
                ) : liveText}
              </p>
              {usedInfo && <p className="text-[10px] text-gray-400 mt-0.5">{usedInfo}</p>}
              {!usedInfo && included && <p className="text-[10px] text-gray-400 mt-0.5">{row.sub}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Coverage summary chips for upgrade cards ───────────────────────────────────
function CoverageSummary({ coverage }: { coverage?: CoverageDetails }) {
  if (!coverage) return null;
  const rows = COVERAGE_ROWS.map(r => ({ ...r, val: formatCoverageValue(r, coverage[r.key]) }));
  const included = rows.filter(r => r.val.included);
  return (
    <div className="flex flex-wrap gap-1.5 mt-3 mb-4">
      {included.map(r => (
        <div key={r.key} className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-white/15 text-white/90">
          <r.Icon className="w-2.5 h-2.5" />{r.val.text === "Unlimited" ? `${r.label}: ∞` : `${r.label}: ${r.val.text}`}
        </div>
      ))}
    </div>
  );
}

// ── Circular teleconsult ring ─────────────────────────────────────────────────
function TeleconsultRing({ used, allowed, tier }: { used: number; allowed: number; tier: number }) {
  const cfg = TIERS[tier] ?? TIERS[1];
  const unlimited = allowed >= 999;
  const r = 46; const circ = 2 * Math.PI * r;
  const pct = unlimited ? 1 : allowed > 0 ? Math.min(used / allowed, 1) : 0;
  const offset = circ * (1 - pct);
  const remaining = unlimited ? "∞" : Math.max(0, allowed - used);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-28 h-28">
        <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" stroke={cfg.track} strokeWidth="9" />
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" strokeLinecap="round"
            stroke={cfg.ring} strokeDasharray={circ}
            strokeDashoffset={unlimited ? 0 : offset}
            style={{ transition: "stroke-dashoffset 1.2s ease" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black leading-none">{remaining}</span>
          <span className="text-[10px] text-gray-400 mt-0.5">left</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">Teleconsults</p>
        <p className="text-[10px] text-gray-400">{unlimited ? "Unlimited" : `${used} used · ${allowed} total`}</p>
      </div>
    </div>
  );
}

// ── Single benefit bar ────────────────────────────────────────────────────────
function BenefitBar({ label, Icon, used, total, color }: { label: string; Icon: React.FC<{ className?: string }>; used: number; total: number; color: string }) {
  const remaining = Math.max(0, total - used);
  const pct = total > 0 ? Math.min(((total - used) / total) * 100, 100) : 0;
  if (total === 0) return (
    <div className="flex items-center gap-3 py-2 opacity-40">
      <div className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-800"><Icon className="w-4 h-4 text-gray-400" /></div>
      <div className="flex-1">
        <div className="flex justify-between mb-1"><span className="text-sm text-gray-500">{label}</span><span className="text-xs text-gray-400">Not included</span></div>
        <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800" />
      </div>
    </div>
  );
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="p-1.5 rounded-lg" style={{ background: color + "22" }}><Icon className="w-4 h-4" style={{ color }} /></div>
      <div className="flex-1">
        <div className="flex justify-between mb-1.5">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>
          <span className="text-sm font-semibold" style={{ color }}>₹{remaining.toLocaleString("en-IN")} left</span>
        </div>
        <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
          <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${pct}%` }}
            transition={{ duration: 1.1, ease: "easeOut" }} style={{ background: `linear-gradient(90deg, ${color}aa, ${color})` }} />
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5">₹{used.toLocaleString("en-IN")} used of ₹{total.toLocaleString("en-IN")}</p>
      </div>
    </div>
  );
}

// ── Tier roadmap ──────────────────────────────────────────────────────────────
function TierRoadmap({ currentTier }: { currentTier: number }) {
  return (
    <div className="flex items-center gap-0 w-full">
      {TIER_LIST.map((t, i) => {
        const cfg = TIERS[t];
        const Icon = cfg.Icon;
        const active = t === currentTier;
        const completed = t < currentTier;
        return (
          <div key={t} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                active ? `bg-gradient-to-br ${cfg.gradient} border-transparent shadow-lg` :
                completed ? "bg-emerald-500 border-transparent" : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              }`}>
                <Icon className={`w-5 h-5 ${active || completed ? "text-white" : "text-gray-400"}`} />
              </div>
              <span className={`text-[10px] font-semibold ${active ? cfg.accent : completed ? "text-emerald-600" : "text-gray-400"}`}>{cfg.label}</span>
            </div>
            {i < TIER_LIST.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 ${completed ? "bg-emerald-400" : "bg-gray-200 dark:bg-gray-700"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Upgrade confirmation modal ─────────────────────────────────────────────────
function ConfirmUpgradeModal({ plan, onConfirm, onCancel, isLoading }: {
  plan: UpgradeOption; onConfirm: () => void; onCancel: () => void; isLoading: boolean;
}) {
  const cfg = TIERS[plan.tier] ?? TIERS[2];
  const Icon = cfg.Icon;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }}
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
        <div className={`p-5 bg-gradient-to-br ${cfg.gradient} text-white`}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/15"><Icon className="w-5 h-5" /></div>
            <div><h3 className="font-bold text-lg">Upgrade to {plan.name}</h3><p className="text-white/70 text-xs">{plan.tierName} Plan · {plan.durationMonths || 1} month</p></div>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-gray-500">Plan price</span><span className="font-medium">₹{plan.originalPrice.toLocaleString("en-IN")}</span></div>
            {plan.proratedRefund > 0 && <div className="flex justify-between text-sm"><span className="text-gray-500">Prorated credit</span><span className="text-emerald-600 font-medium">-₹{plan.proratedRefund.toLocaleString("en-IN")}</span></div>}
            <div className="border-t dark:border-gray-700 pt-2 flex justify-between"><span className="font-semibold">Amount due</span><span className="font-bold text-lg" style={{ color: cfg.ring }}>₹{plan.amountDue.toLocaleString("en-IN")}</span></div>
          </div>
          <p className="text-xs text-gray-500 flex items-start gap-1.5"><AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />Your current plan will be cancelled and a prorated refund applied.</p>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onCancel} disabled={isLoading}><X className="w-4 h-4 mr-1.5" />Cancel</Button>
            <Button onClick={onConfirm} disabled={isLoading} className={`flex-1 bg-gradient-to-r ${cfg.gradient} text-white border-0 hover:opacity-90`}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <TrendingUp className="w-4 h-4 mr-1.5" />}
              {plan.amountDue > 0 ? `Pay ₹${plan.amountDue.toLocaleString("en-IN")} & Upgrade` : "Confirm Upgrade"}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Upgrade plan card ──────────────────────────────────────────────────────────
function UpgradeCard({ plan, onRequest, isPopular }: { plan: UpgradeOption; onRequest: () => void; isPopular: boolean }) {
  const cfg = TIERS[plan.tier] ?? TIERS[2];
  const Icon = cfg.Icon;
  const coverage = plan.metadata?.coverageDetails;
  return (
    <motion.div whileHover={{ y: -6 }} transition={{ type: "spring", stiffness: 300 }}
      className={`relative rounded-2xl border-2 overflow-hidden ${isPopular ? "border-amber-400 shadow-xl shadow-amber-100/60 dark:shadow-amber-900/20" : "border-gray-200 dark:border-gray-700"}`}>
      {isPopular && <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400" />}
      {isPopular && <div className="absolute top-3.5 right-3.5"><Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] font-bold uppercase tracking-wide">Most Popular</Badge></div>}
      <div className={`p-5 bg-gradient-to-br ${cfg.gradient} text-white`}>
        <div className="p-2 rounded-xl bg-white/15 w-fit mb-3"><Icon className="w-5 h-5" /></div>
        <h3 className="text-xl font-bold">{plan.name}</h3>
        <p className="text-white/70 text-xs mt-0.5">{plan.description}</p>
        <div className="mt-3 flex items-end gap-1">
          <span className="text-3xl font-black">₹{plan.originalPrice.toLocaleString("en-IN")}</span>
          <span className="text-white/60 text-sm mb-1">/month</span>
        </div>
        {plan.proratedRefund > 0 && <p className="text-[11px] text-white/60 mt-1">After ₹{plan.proratedRefund} credit → pay ₹{plan.amountDue}</p>}
        {/* Coverage chips inside gradient header */}
        {coverage && <CoverageSummary coverage={coverage} />}
      </div>
      <div className="p-5 bg-white dark:bg-gray-900">
        {/* Detailed coverage table */}
        {coverage ? (
          <div className="space-y-2 mb-5">
            {COVERAGE_ROWS.map(row => {
              const { text, included } = formatCoverageValue(row, coverage[row.key]);
              const RowIcon = row.Icon;
              if (!included) return null;
              return (
                <div key={row.key} className="flex items-center gap-2.5 text-sm">
                  <div className="p-1 rounded-md shrink-0" style={{ background: row.color + "18" }}>
                    <RowIcon className="w-3.5 h-3.5" style={{ color: row.color }} />
                  </div>
                  <span className="text-gray-600 dark:text-gray-400 flex-1">{row.label}</span>
                  <span className="font-semibold text-gray-900 dark:text-white text-xs">{text}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <ul className="space-y-2.5 mb-5">
            {(Array.isArray(plan.features) ? plan.features : []).map((f, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${cfg.accent}`} />{f}
              </li>
            ))}
          </ul>
        )}
        <Button onClick={onRequest} className={`w-full bg-gradient-to-r ${cfg.gradient} text-white border-0 hover:opacity-90 font-semibold`}>
          <TrendingUp className="w-4 h-4 mr-2" />Upgrade to {plan.tierName}
        </Button>
      </div>
    </motion.div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
const MyPlans = () => {
  const { toast } = useToast();
  const { currentUser } = useAuth();
  const qc = useQueryClient();
  const [upgradePending, setUpgradePending] = useState<UpgradeOption | null>(null);
  const [upgradingId, setUpgradingId] = useState<number | null>(null);
  const [subscribingId, setSubscribingId] = useState<number | null>(null);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: currentRes, isLoading: loadingCurrent } = useQuery({
    queryKey: ["myPlan", "current"],
    queryFn: async () => {
      const { data } = await api.get("/membership/my/current");
      return data as { userPlan: ActiveUserPlan | null };
    },
  });

  const { data: usageRes, isLoading: loadingUsage } = useQuery({
    queryKey: ["myPlan", "usage"],
    queryFn: async () => {
      const { data } = await api.get("/membership/my/usage");
      return data as UsageRes;
    },
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  const { data: upgradeRes, isLoading: loadingUpgrade } = useQuery({
    queryKey: ["plans", "upgrade-options"],
    queryFn: async () => {
      const { data } = await api.get("/membership/upgrade-options");
      return data as UpgradeOptionsRes;
    },
  });

  const { data: plansRes, isLoading: loadingPlans } = useQuery({
    queryKey: ["plans", "available"],
    queryFn: async () => {
      const { data } = await api.get("/membership/plans?type=personal");
      return data as { plans: PlanData[] };
    },
    enabled: !currentRes?.userPlan, // only fetch when no active plan (for subscribe flow)
  });

  // ── Derived data ───────────────────────────────────────────────────────────
  const userPlan = currentRes?.userPlan ?? null;
  const planDetails = userPlan?.plan ?? userPlan?.MembershipPlan ?? null;
  const currentTier = upgradeRes?.currentPlan?.tier ?? planDetails?.tier ?? 1;
  const tierCfg = TIERS[currentTier] ?? TIERS[1];
  const TierIcon = tierCfg.Icon;

  const remaining = usageRes?.remaining ?? null;
  const upgradeOptions = upgradeRes?.upgradeOptions ?? [];
  const availablePlans = plansRes?.plans ?? [];

  const benefitLimits = userPlan?.appliedLimits?.benefitLimits ?? {};
  const teleConsultLimits = userPlan?.appliedLimits?.teleConsultLimits ?? {};
  const teleUsage: Record<string, number> = userPlan?.usage?.teleConsult ?? userPlan?.usage?.teleConsults ?? {};
  const usedConsults = Object.values(teleUsage).reduce((s, v) => s + Number(v ?? 0), 0);
  const allowedConsults = teleConsultLimits.allSpecialties ?? 0;

  const pharmacyTotal = benefitLimits.pharmacyLimitINR ?? 0;
  const homecareTotal = benefitLimits.homeCareLimitINR ?? 0;
  const ambulanceTotal = benefitLimits.ambulanceLimitINR ?? 0;
  const pharmacyUsed = (pharmacyTotal) - (remaining?.pharmacyLimitINR ?? pharmacyTotal);
  const homecareUsed = (homecareTotal) - (remaining?.homeCareLimitINR ?? homecareTotal);
  const ambulanceUsed = (ambulanceTotal) - (remaining?.ambulanceLimitINR ?? ambulanceTotal);

  const remainingDays = userPlan
    ? Math.max(0, Math.ceil((new Date(userPlan.endDate).getTime() - Date.now()) / 864e5))
    : 0;

  const isLoading = loadingCurrent || loadingUsage;

  // ── Handlers ───────────────────────────────────────────────────────────────
  const invalidateAll = () => Promise.all([
    qc.invalidateQueries({ queryKey: ["myPlan", "current"] }),
    qc.invalidateQueries({ queryKey: ["myPlan", "usage"] }),
    qc.invalidateQueries({ queryKey: ["plans", "upgrade-options"] }),
    qc.invalidateQueries({ queryKey: ["plans", "available"] }),
    qc.invalidateQueries({ queryKey: ["user-plan"] }),
    qc.invalidateQueries({ queryKey: ["user-profile"] }),
  ]);

  const handleSubscribe = async (planId: number) => {
    setSubscribingId(planId);
    try {
      await api.post(`/membership/subscribe/${planId}`);
      toast({ title: "Plan activated!", description: "Your subscription is now active." });
      await invalidateAll();
    } catch (e: any) {
      toast({ title: "Subscription failed", description: e?.response?.data?.message ?? e.message, variant: "destructive" });
    } finally { setSubscribingId(null); }
  };

  const handleUpgrade = async () => {
    if (!upgradePending) return;
    const plan = upgradePending;
    setUpgradingId(plan.id);
    try {
      if (plan.amountDue <= 0) {
        // Prorated credit covers full price — no payment needed
        const { data } = await api.post(`/membership/upgrade/${plan.id}`);
        toast({ title: "Plan upgraded!", description: `You're now on ${data.newPlan?.name ?? plan.name}.` });
        setUpgradePending(null);
        await invalidateAll();
        setUpgradingId(null);
        return;
      }

      // Create Razorpay order via backend
      const { data: orderData } = await api.post('/membership/payment-order', {
        amount: plan.amountDue,
        planId: plan.id,
        planName: plan.name
      });

      // Open Razorpay checkout
      await openRazorpayCheckout(orderData, {
        prefill: {
          name: currentUser ? `${currentUser.firstName ?? ''} ${currentUser.lastName ?? ''}`.trim() : '',
          email: currentUser?.email ?? '',
          contact: currentUser?.phoneNumber ?? ''
        },
        onSuccess: async (response) => {
          try {
            const { data } = await api.post(`/membership/upgrade/${plan.id}`, {
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature
            });
            toast({ title: "Payment successful!", description: `You're now on ${data.newPlan?.name ?? plan.name}. Welcome!` });
            setUpgradePending(null);
            await invalidateAll();
          } catch (e: any) {
            toast({ title: "Upgrade failed after payment", description: e?.response?.data?.message ?? e.message, variant: "destructive" });
          } finally {
            setUpgradingId(null);
          }
        },
        onFailure: (error) => {
          const msg = error?.message ?? String(error);
          if (msg !== 'Payment cancelled by user') {
            toast({ title: "Payment failed", description: msg, variant: "destructive" });
          }
          setUpgradingId(null);
        }
      });
    } catch (e: any) {
      toast({ title: "Upgrade failed", description: e?.response?.data?.message ?? e.message, variant: "destructive" });
      setUpgradingId(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <AnimatePresence>
        {upgradePending && (
          <ConfirmUpgradeModal
            plan={upgradePending}
            onConfirm={handleUpgrade}
            onCancel={() => setUpgradePending(null)}
            isLoading={upgradingId === upgradePending.id}
          />
        )}
      </AnimatePresence>

      <motion.div variants={stagger} initial="hidden" animate="show" className="max-w-5xl mx-auto space-y-6 px-4 md:px-6 py-6">

        {/* ── Page header ── */}
        <motion.div variants={fadeUp} className="flex items-center gap-3 mb-2">
          <div className={`p-2.5 rounded-xl bg-gradient-to-br ${tierCfg.gradient} shadow-lg`}>
            <Crown className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Health Plan</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Manage subscription & track your benefits</p>
          </div>
        </motion.div>

        {isLoading ? (
          <div className="flex items-center justify-center min-h-[300px]">
            <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
          </div>
        ) : !userPlan ? (
          /* ── No plan state ─────────────────────────────────────────────── */
          <motion.div variants={fadeUp}>
            <Card className="p-8 text-center space-y-4 border-dashed border-2 border-gray-200 dark:border-gray-700">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/30 dark:to-amber-800/20 flex items-center justify-center">
                <Crown className="w-8 h-8 text-amber-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">No Active Plan</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Choose a plan below to unlock healthcare benefits</p>
              </div>
              {loadingPlans ? <Loader2 className="w-5 h-5 animate-spin mx-auto text-amber-500" /> : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4 text-left">
                  {availablePlans.map(p => {
                    const pTier = p.tier ?? 1;
                    const pCfg = TIERS[pTier] ?? TIERS[1];
                    const PIcon = pCfg.Icon;
                    const price = Number(p.discountedPrice ?? p.price ?? 0);
                    return (
                      <div key={p.id} className={`p-4 rounded-2xl border-2 ${pCfg.badge.replace("text-", "border-").replace(/bg-\S+/, "").trim()} bg-white dark:bg-gray-800 space-y-3`}>
                        <div className={`p-2 rounded-lg w-fit bg-gradient-to-br ${pCfg.gradient}`}><PIcon className="w-4 h-4 text-white" /></div>
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-white">{p.name}</h3>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{p.description}</p>
                        </div>
                        <div className="font-bold text-lg text-gray-900 dark:text-white">
                          {price === 0 ? "Free" : `₹${price.toLocaleString("en-IN")}/mo`}
                        </div>
                        <Button size="sm" className={`w-full bg-gradient-to-r ${pCfg.gradient} text-white border-0 hover:opacity-90`}
                          onClick={() => handleSubscribe(p.id)} disabled={subscribingId === p.id}>
                          {subscribingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                          Subscribe
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </motion.div>
        ) : (
          <>
            {/* ── Active plan hero card ──────────────────────────────────── */}
            <motion.div variants={fadeUp}>
              <Card className={`overflow-hidden border-2 ${tierCfg.badge.split(" ").find(c => c.startsWith("border-")) ?? "border-gray-200"}`}>
                {/* Top gradient header */}
                <div className={`p-6 bg-gradient-to-br ${tierCfg.gradient} text-white relative overflow-hidden`}>
                  <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/5" />
                  <div className="absolute -right-4 top-8 w-24 h-24 rounded-full bg-white/5" />
                  <div className="relative flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className="bg-white/20 text-white border-white/30 text-xs">{tierCfg.label} Plan</Badge>
                        <Badge className="bg-emerald-400/30 text-white border-emerald-300/30 text-xs">Active</Badge>
                      </div>
                      <h2 className="text-2xl font-black">{planDetails?.name ?? "My Plan"}</h2>
                      <p className="text-white/70 text-sm mt-1 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        Valid until {new Date(userPlan.endDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                      </p>
                    </div>
                    {/* Days remaining ring */}
                    <div className="flex flex-col items-center">
                      <div className="relative w-16 h-16">
                        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 60 60">
                          <circle cx="30" cy="30" r="26" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="6" />
                          <circle cx="30" cy="30" r="26" fill="none" strokeWidth="6" strokeLinecap="round"
                            stroke="white" strokeDasharray={2 * Math.PI * 26}
                            strokeDashoffset={2 * Math.PI * 26 * (1 - Math.min(remainingDays / 365, 1))}
                            style={{ transition: "stroke-dashoffset 1.2s ease" }} />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-lg font-black leading-none">{remainingDays}</span>
                          <span className="text-[8px] text-white/70">days</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Coverage breakdown ── */}
                <div className="p-5">
                  {planDetails?.metadata?.coverageDetails ? (
                    <>
                      <div className="flex items-center gap-2 mb-4">
                        <Stethoscope className="w-4 h-4 text-gray-400" />
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Plan Coverage</p>
                      </div>
                      <CoverageGrid
                        coverage={planDetails.metadata.coverageDetails}
                        tier={currentTier}
                        remaining={remaining}
                        usedConsults={usedConsults}
                      />
                    </>
                  ) : (
                    /* Fallback: original bars if no coverageDetails */
                    <div className="grid md:grid-cols-[auto,1fr] gap-6 items-start">
                      <TeleconsultRing used={usedConsults} allowed={allowedConsults} tier={currentTier} />
                      <div className="space-y-1 divide-y dark:divide-gray-800">
                        <BenefitBar label="Pharmacy" Icon={Pill} used={pharmacyUsed} total={pharmacyTotal} color="#16a34a" />
                        <BenefitBar label="Home Care" Icon={Home} used={homecareUsed} total={homecareTotal} color="#0ea5e9" />
                        <BenefitBar label="Ambulance" Icon={Ambulance} used={ambulanceUsed} total={ambulanceTotal} color="#dc2626" />
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>

            {/* ── Tier progress roadmap ──────────────────────────────────── */}
            <motion.div variants={fadeUp}>
              <Card className="p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Your Plan Journey</p>
                <TierRoadmap currentTier={currentTier} />
              </Card>
            </motion.div>

            {/* ── Upgrade options ────────────────────────────────────────── */}
            {(loadingUpgrade || upgradeOptions.length > 0) && (
              <motion.div variants={fadeUp} className="space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30"><Zap className="w-4 h-4 text-amber-600" /></div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">Upgrade Your Plan</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Get more benefits with prorated credit from your current plan</p>
                  </div>
                </div>
                {loadingUpgrade ? (
                  <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-amber-500" /></div>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {upgradeOptions.map((opt, i) => (
                      <motion.div key={opt.id} custom={i} variants={fadeUp}>
                        <UpgradeCard plan={opt} onRequest={() => setUpgradePending(opt)} isPopular={opt.metadata?.badge === 'Most Popular'} />
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </>
        )}
      </motion.div>
    </>
  );
};

export default MyPlans;
