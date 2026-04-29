import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/auth/AuthProvider";
import api from "@/utils/api";
import { openRazorpayCheckout } from "@/utils/razorpay";
import {
  HeartPulse, Shield, Crown, Gem, CheckCircle2, Loader2,
  User, Building2, ArrowRight, ChevronRight, Sparkles, BadgeCheck, Zap, Star,
  ShieldCheck,
} from "lucide-react";

// ── Animations ───────────────────────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42 } },
};
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.09 } } };

// ── Tier visual config ────────────────────────────────────────────────────────
const TIERS: Record<number, {
  label: string;
  Icon: React.FC<{ className?: string }>;
  gradient: string;
  ring: string;
  badge: string;
  popular?: boolean;
}> = {
  0: { label: "Smart Basic", Icon: Zap,    gradient: "from-slate-500 to-slate-700",    ring: "#64748b", badge: "bg-slate-100 text-slate-700 border-slate-300" },
  1: { label: "Silver",      Icon: Shield, gradient: "from-sky-400 to-blue-600",       ring: "#0ea5e9", badge: "bg-sky-50 text-sky-700 border-sky-300" },
  2: { label: "Gold",        Icon: Star,   gradient: "from-amber-500 to-yellow-600",   ring: "#f59e0b", badge: "bg-amber-50 text-amber-700 border-amber-300", popular: true },
  3: { label: "Platinum",    Icon: Crown,  gradient: "from-purple-600 to-violet-700",  ring: "#7c3aed", badge: "bg-purple-50 text-purple-700 border-purple-300" },
  4: { label: "Diamond",     Icon: Gem,    gradient: "from-rose-500 to-pink-700",      ring: "#e11d48", badge: "bg-rose-50 text-rose-700 border-rose-300" },
};

type PlanVariant = 'base' | 'plus' | 'pro';

// ── Static plan definitions ──────────────────────────────────────────────────
// base = healthcare only | plus = + insurance | pro = + insurance + VitalTrack (bundled)
const STATIC_PLANS = [
  {
    tier: 0, slug: "smart-basic", name: "Smart Basic", price: 0, billingLabel: "3 months free",
    plusSlug: null as string | null, plusPrice: null as number | null,
    proSlug: null as string | null,  proPrice: null as number | null,
    members: "Self",
    features: [
      "6 GP teleconsultations/year",
      "3 emergency consultations",
      "HRA & AI health assistant",
      "Pharmacy discounts: 10–15%",
      "Lab discounts: 15–20%",
    ],
  },
  {
    tier: 1, slug: "silver", name: "Silver", price: 1499, billingLabel: "/year",
    plusSlug: "silver-insurance" as string | null, plusPrice: 3699 as number | null,
    proSlug: "silver-pro" as string | null,        proPrice: 11999 as number | null,
    members: "Self",
    features: [
      "10 GP teleconsultations/year",
      "2 specialist consultations/year",
      "1 annual health checkup",
      "OPD network discounts: 20–30%",
      "1 mental health session/year",
    ],
  },
  {
    tier: 2, slug: "gold", name: "Gold", price: 2999, billingLabel: "/year",
    plusSlug: "gold-insurance" as string | null, plusPrice: 7998 as number | null,
    proSlug: "gold-pro" as string | null,        proPrice: 15999 as number | null,
    members: "Couple",
    features: [
      "12 GP teleconsultations/year (1/month cap)",
      "4 specialist consultations/year",
      "₹2,000 OPD subsidy (network only)",
      "2–3 mental health sessions/year",
      "2 annual health checkups",
    ],
  },
  {
    tier: 3, slug: "platinum", name: "Platinum", price: 5999, billingLabel: "/year",
    plusSlug: "platinum-insurance" as string | null, plusPrice: 14998 as number | null,
    proSlug: "platinum-pro" as string | null,        proPrice: 22999 as number | null,
    members: "Family (4)",
    features: [
      "18 GP teleconsultations/year",
      "6 specialist consultations/year",
      "₹4,000 OPD subsidy (network only)",
      "4 mental health sessions/year",
      "4 annual health checkups",
    ],
  },
  {
    tier: 4, slug: "diamond", name: "Diamond", price: 9999, billingLabel: "/year",
    plusSlug: "diamond-insurance" as string | null, plusPrice: 24998 as number | null,
    proSlug: "diamond-pro" as string | null,        proPrice: 32999 as number | null,
    members: "Family (6)",
    features: [
      "24 GP teleconsultations/year",
      "8 specialist consultations/year",
      "₹7,000 OPD subsidy (network only)",
      "Mental health: unlimited (fair usage)",
      "Dedicated care manager",
    ],
  },
];

// ── Plan card ─────────────────────────────────────────────────────────────────
function PlanCard({
  plan, onSelect, loading,
}: { plan: typeof STATIC_PLANS[0]; onSelect: (p: typeof STATIC_PLANS[0], variant: PlanVariant) => void; loading: boolean }) {
  const cfg = TIERS[plan.tier];
  const Icon = cfg.Icon;
  const hasPlus = !!plan.plusSlug;
  const hasPro  = !!plan.proSlug;
  const [variant, setVariant] = useState<PlanVariant>('base');

  const displayPrice =
    variant === 'pro'  && plan.proPrice  ? plan.proPrice  :
    variant === 'plus' && plan.plusPrice ? plan.plusPrice  :
    plan.price;

  const variantLabel =
    variant === 'pro'  ? `${plan.name} Pro`  :
    variant === 'plus' ? `${plan.name}+`     :
    plan.name;

  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -6, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 280 }}
      className={`relative rounded-2xl border-2 overflow-hidden shadow-md
        ${cfg.popular
          ? "border-amber-400 shadow-amber-100/60 dark:shadow-amber-900/20"
          : "border-gray-200 dark:border-gray-700"}`}
    >
      {cfg.popular && (
        <>
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400" />
          <div className="absolute top-3 right-3">
            <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-800 border border-amber-300 rounded-full px-2 py-0.5">
              Most Popular
            </span>
          </div>
        </>
      )}
      {/* Header */}
      <div className={`p-5 bg-gradient-to-br ${cfg.gradient} text-white`}>
        <div className="p-2 rounded-xl bg-white/15 w-fit mb-3">
          <Icon className="w-5 h-5" />
        </div>
        <h3 className="text-xl font-bold">{plan.name}</h3>
        <p className="text-white/60 text-xs mb-2">{plan.members}</p>
        <div className="flex items-end gap-1">
          {plan.price === 0 ? (
            <span className="text-3xl font-black">Free</span>
          ) : (
            <>
              <span className="text-sm font-semibold mt-2">₹</span>
              <span className="text-3xl font-black">{displayPrice.toLocaleString("en-IN")}</span>
              <span className="text-white/60 text-sm mb-1">{plan.billingLabel}</span>
            </>
          )}
        </div>
        {withInsurance && (
          <div className="mt-1 text-xs text-white/80 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> Includes insurance cover
          </div>
        )}
      </div>
      {/* Body */}
      <div className="p-5 bg-white dark:bg-gray-900">
        {/* Insurance toggle */}
        {(hasPlus || hasPro) && (
          <div className="flex rounded-full bg-gray-100 dark:bg-gray-800 p-0.5 mb-4 text-xs font-medium">
            {(['base', 'plus', 'pro'] as PlanVariant[]).map(v => {
              const available = v === 'base' || (v === 'plus' && hasPlus) || (v === 'pro' && hasPro);
              if (!available) return null;
              return (
                <button
                  key={v}
                  onClick={() => setVariant(v)}
                  className={`flex-1 py-1 rounded-full capitalize transition-all ${
                    variant === v
                      ? `bg-gradient-to-r ${cfg.gradient} text-white shadow`
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {v === 'plus' ? 'Plus' : v === 'pro' ? 'Pro' : 'Base'}
                </button>
              );
            })}
          </div>
        )}
        {variant === 'plus' && (
          <p className="text-xs text-blue-600 dark:text-blue-400 mb-3 font-medium">
            Includes Health &amp; Accident Insurance
          </p>
        )}
        {variant === 'pro' && (
          <p className="text-xs text-violet-600 dark:text-violet-400 mb-3 font-medium">
            Insurance + VitalTrack monitoring bundle
          </p>
        )}
        <ul className="space-y-2.5 mb-5">
          {plan.features.map((f, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
              {f}
            </li>
          ))}
          {(variant === 'plus' || variant === 'pro') && (
            <li className="flex items-start gap-2.5 text-sm text-blue-700 dark:text-blue-300 font-medium">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
              Health &amp; Accident Insurance included
            </li>
          )}
          {variant === 'pro' && (
            <li className="flex items-start gap-2.5 text-sm text-violet-700 dark:text-violet-300 font-medium">
              <HeartPulse className="w-4 h-4 shrink-0 mt-0.5 text-violet-500" />
              VitalTrack monitoring included
            </li>
          )}
        </ul>
        <Button
          onClick={() => onSelect(plan, variant)}
          disabled={loading}
          className={`w-full bg-gradient-to-r ${cfg.gradient} text-white border-0 hover:opacity-90 font-semibold`}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <ChevronRight className="w-4 h-4 mr-2" />
          )}
          {plan.price === 0 ? "Start Free" : `Get ${variantLabel}`}
        </Button>
      </div>
    </motion.div>
  );
}

// ── Individual tab ────────────────────────────────────────────────────────────
function IndividualTab() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const qc = useQueryClient();
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);

  // Fetch live plans from server (for slugs / IDs); fall back to static list
  const { data: serverPlans } = useQuery({
    queryKey: ["plans", "available", "choose"],
    queryFn: async () => {
      const { data } = await api.get("/membership/plans");
      return (data?.plans ?? []) as Array<{ id: number; slug: string; name: string; tier: number; price?: number; discountedPrice?: number }>;
    },
    staleTime: 60_000,
  });

  const handleSelect = async (plan: typeof STATIC_PLANS[0], variant: PlanVariant) => {
    // Determine the effective slug based on variant
    const effectiveSlug =
      variant === 'pro'  && plan.proSlug  ? plan.proSlug  :
      variant === 'plus' && plan.plusSlug ? plan.plusSlug :
      plan.slug;
    const effectivePrice =
      variant === 'pro'  && plan.proPrice  ? plan.proPrice  :
      variant === 'plus' && plan.plusPrice ? plan.plusPrice :
      plan.price;
    const effectiveName =
      variant === 'pro'  ? `${plan.name} Pro`  :
      variant === 'plus' ? `${plan.name}+`     :
      plan.name;
    setLoadingSlug(effectiveSlug);

    try {
      // Find plan ID from server list
      const serverPlan = serverPlans?.find(p => p.slug === effectiveSlug);
      const planId = serverPlan?.id;

      if (!planId) {
        toast({ title: "Error", description: "Plan not found. Please refresh and try again.", variant: "destructive" });
        setLoadingSlug(null);
        return;
      }

      // Free / Smart Basic plan — subscribe directly, no payment
      if (effectivePrice === 0) {
        await api.post(`/membership/subscribe/${planId}`);
        await qc.invalidateQueries({ queryKey: ["myPlan"] });
        await qc.invalidateQueries({ queryKey: ["user-plan"] });
        toast({ title: "Plan activated!", description: `You're now on ${effectiveName}. Welcome!` });
        navigate("/", { replace: true });
        return;
      }

      // Create Razorpay order
      const { data: orderData } = await api.post("/membership/payment-order", {
        amount: effectivePrice,
        planId,
        planName: effectiveName,
      });

      await openRazorpayCheckout(orderData, {
        prefill: {
          name: currentUser ? `${currentUser.firstName ?? ""} ${currentUser.lastName ?? ""}`.trim() : "",
          email: currentUser?.email ?? "",
          contact: currentUser?.phoneNumber ?? "",
        },
        onSuccess: async (response) => {
          try {
            await api.post(`/membership/subscribe/${planId}`, {
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
            });
            await qc.invalidateQueries({ queryKey: ["myPlan"] });
            await qc.invalidateQueries({ queryKey: ["user-plan"] });
            toast({ title: "Payment successful!", description: `You're now on ${effectiveName}. Welcome!` });
            navigate("/", { replace: true });
          } catch (e: any) {
            toast({ title: "Activation failed after payment", description: e?.response?.data?.message ?? e.message, variant: "destructive" });
          } finally {
            setLoadingSlug(null);
          }
        },
        onFailure: (err) => {
          const msg = (err as any)?.message ?? String(err);
          if (msg !== "Payment cancelled by user") {
            toast({ title: "Payment failed", description: msg, variant: "destructive" });
          }
          setLoadingSlug(null);
        },
      });
    } catch (e: any) {
      toast({ title: "Error", description: e?.response?.data?.message ?? e.message, variant: "destructive" });
      setLoadingSlug(null);
    }
  };

  return (
    <motion.div variants={stagger} initial="hidden" animate="show"
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-5 mt-6">
      {STATIC_PLANS.map(plan => (
        <PlanCard
          key={plan.slug}
          plan={plan}
          onSelect={handleSelect}
          loading={loadingSlug === plan.slug || loadingSlug === plan.plusSlug || loadingSlug === plan.proSlug}
        />
      ))}
    </motion.div>
  );
}

// ── Corporate tab ─────────────────────────────────────────────────────────────
function CorporateTab() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [form, setForm] = useState({ corporateName: "", employeeId: "", officialEmail: "" });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { corporateName, employeeId, officialEmail } = form;
    if (!corporateName.trim() || !employeeId.trim() || !officialEmail.trim()) {
      toast({ title: "All fields required", description: "Please fill in all three fields.", variant: "destructive" });
      return;
    }
    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(officialEmail.trim())) {
      toast({ title: "Invalid email", description: "Please enter a valid official email address.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post("/membership-plans/corporate/self-enroll", {
        corporateName: corporateName.trim(),
        employeeId: employeeId.trim(),
        officialEmail: officialEmail.trim().toLowerCase(),
      });

      if (!data?.success) throw new Error(data?.message ?? "Enrollment failed");

      await qc.invalidateQueries({ queryKey: ["myPlan"] });
      await qc.invalidateQueries({ queryKey: ["user-plan"] });

      setDone(true);
      toast({ title: "Corporate plan linked!", description: data.message });
      setTimeout(() => navigate("/", { replace: true }), 2000);
    } catch (e: any) {
      toast({
        title: "Enrollment failed",
        description: e?.response?.data?.message ?? e.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-4 py-16 text-center"
      >
        <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
          <BadgeCheck className="w-10 h-10 text-emerald-500" />
        </div>
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">All Set!</h3>
        <p className="text-gray-500 max-w-sm">Your corporate health plan has been linked. Redirecting to your dashboard…</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42 }}
      className="max-w-lg mx-auto mt-8"
    >
      {/* Info banner */}
      <div className="mb-6 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 flex gap-3">
        <Sparkles className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700 dark:text-blue-300">
          Your employer has pre-purchased a health plan for you. Enter your details below to activate it —
          no payment needed from your side.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-lg">
        <div>
          <Label htmlFor="corporateName" className="text-sm font-medium">Corporate / Company Name</Label>
          <Input
            id="corporateName"
            placeholder="e.g. Acme Corp India Pvt Ltd"
            className="mt-1.5"
            value={form.corporateName}
            onChange={e => setForm(f => ({ ...f, corporateName: e.target.value }))}
            disabled={loading}
          />
        </div>
        <div>
          <Label htmlFor="employeeId" className="text-sm font-medium">Employee ID</Label>
          <Input
            id="employeeId"
            placeholder="e.g. EMP-00123"
            className="mt-1.5"
            value={form.employeeId}
            onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}
            disabled={loading}
          />
        </div>
        <div>
          <Label htmlFor="officialEmail" className="text-sm font-medium">Official Work Email</Label>
          <Input
            id="officialEmail"
            type="email"
            placeholder="you@company.com"
            className="mt-1.5"
            value={form.officialEmail}
            onChange={e => setForm(f => ({ ...f, officialEmail: e.target.value }))}
            disabled={loading}
          />
          <p className="text-xs text-gray-400 mt-1">Must match the email your HR registered with MediQzy.</p>
        </div>
        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold hover:opacity-90"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin mr-2" />Verifying…</>
          ) : (
            <><ArrowRight className="w-4 h-4 mr-2" />Activate Corporate Plan</>
          )}
        </Button>
      </form>

      <p className="text-center text-xs text-gray-400 mt-4">
        Details not matching?{" "}
        <a href="mailto:support@mediqzy.com" className="text-blue-500 hover:underline">
          Contact support
        </a>
      </p>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ChoosePlan() {
  const [tab, setTab] = useState<"individual" | "corporate">("individual");
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/30 dark:from-gray-950 dark:via-blue-950/10 dark:to-gray-950 px-4 py-10">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8 max-w-2xl mx-auto"
      >
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
            <HeartPulse className="w-5 h-5 text-white" />
          </div>
          <span className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">MediQzy</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-gray-900 dark:text-white leading-tight">
          Choose Your Health Plan
        </h1>
        <p className="mt-2 text-gray-500 dark:text-gray-400 text-base">
          Unlock the full MediQzy experience. Pick a plan to get started — or activate your employer's plan.
        </p>
      </motion.div>

      {/* Tab switcher */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="flex items-center justify-center mb-2"
      >
        <div className="inline-flex rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-1 shadow-sm gap-1">
          <button
            onClick={() => setTab("individual")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              tab === "individual"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            <User className="w-4 h-4" />
            Individual
          </button>
          <button
            onClick={() => setTab("corporate")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              tab === "corporate"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            <Building2 className="w-4 h-4" />
            Corporate Employee
          </button>
        </div>
      </motion.div>

      {/* Tab description */}
      <AnimatePresence mode="wait">
        <motion.p
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className="text-center text-sm text-gray-400 dark:text-gray-500 mb-0"
        >
          {tab === "individual"
            ? "Subscribe to a personal health plan — starting free."
            : "Your company has already paid. Just verify your identity below."}
        </motion.p>
      </AnimatePresence>

      {/* Tab content */}
      <div className="max-w-6xl mx-auto">
        <AnimatePresence mode="wait">
          {tab === "individual" ? (
            <motion.div key="individual" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <IndividualTab />
            </motion.div>
          ) : (
            <motion.div key="corporate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <CorporateTab />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Skip link (for users who already have a plan somehow) */}
      <p className="text-center text-xs text-gray-400 mt-10">
        Already have a plan?{" "}
        <button
          onClick={() => navigate("/", { replace: true })}
          className="text-blue-500 hover:underline"
        >
          Skip to dashboard
        </button>
      </p>
    </div>
  );
}
