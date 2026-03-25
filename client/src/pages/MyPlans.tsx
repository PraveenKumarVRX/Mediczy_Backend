import { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import api from "@/utils/api";
import { Crown, CheckCircle, Loader2, TrendingUp, Activity, Zap, RefreshCw, Shield, Star, Sparkles } from "lucide-react";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [.25,.46,.45,.94] } } };

type TeleConsultLimits = Record<string, number> & { allSpecialties?: number };

interface UserPlan {
  id: number;
  membershipPlanId: number;
  startDate: string; // DATEONLY
  endDate: string; // DATEONLY
  status: "active" | "expired" | "cancelled";
  appliedLimits: {
    benefitLimits?: Record<string, number>;
    teleConsultLimits?: TeleConsultLimits;
    healthCheckPackage?: string;
    priceINR?: number;
  };
  usage?: any;
  MembershipPlan?: MembershipPlan; // if included
}

interface MembershipPlan {
  id: number;
  name: string;
  description?: string;
  durationMonths?: number;
  durationDays?: number;
  price?: string | number;
  priceINR?: number;
  isActive: boolean;
  benefitLimits?: Record<string, number>;
  teleConsultLimits?: TeleConsultLimits;
  healthCheckPackage?: string;
  features?: string[];
  benefits?: string[];
  limitations?: Record<string, number>;
}

type TeleAll = { mode: 'all'; allowed: number; used: number; remaining: number };
type TelePerItem = { spec: string; allowed: number; used: number; remaining: number };
type TelePer = { mode: 'per-spec'; items: TelePerItem[] };
type TeleStats = TeleAll | TelePer | null;

interface UpgradeOption {
  id: number;
  name: string;
  description?: string;
  tier: number;
  tierName: string;
  originalPrice: number;
  proratedRefund: number;
  amountDue: number;
  isUpgrade: boolean;
  features?: any;
  benefits?: any;
  durationMonths?: number;
}

interface AddonPlan extends MembershipPlan {
  isSubscribed: boolean;
}

const MyPlans = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [subscribingId, setSubscribingId] = useState<number | null>(null);
  const [upgradingId, setUpgradingId] = useState<number | null>(null);
  const [showUsageBanner, setShowUsageBanner] = useState(false);

  const { data: currentRes, isLoading: loadingCurrent } = useQuery({
    queryKey: ["myPlan", "current"],
    queryFn: async () => {
      const { data } = await api.get("/membership/my/current");
      return data as { userPlan: UserPlan | null };
    },
  });

  const { data: usageRes, isLoading: loadingUsage } = useQuery({
    queryKey: ["myPlan", "usage"],
    queryFn: async () => {
      const { data } = await api.get("/membership/my/usage");
      return data as { active: UserPlan | null; remaining: Record<string, number> | null };
    },
    refetchInterval: 10000, // Poll every 10s to show live updates
    refetchOnWindowFocus: true,
  });

  const { data: plansRes, isLoading: loadingPlans } = useQuery({
    queryKey: ["plans", "available"],
    queryFn: async () => {
      const { data } = await api.get("/membership/plans");
      return data as { plans: MembershipPlan[] };
    },
  });

  // Fetch upgrade options if user has active plan
  const { data: upgradeRes } = useQuery({
    queryKey: ["plans", "upgrade-options"],
    queryFn: async () => {
      const { data } = await api.get("/membership/upgrade-options");
      return data as { 
        hasActivePlan: boolean; 
        currentPlan: any; 
        upgradeOptions: UpgradeOption[];
      };
    },
    enabled: !!currentRes?.userPlan,
  });

  // Fetch addon plans
  const { data: addonsRes } = useQuery({
    queryKey: ["plans", "addons"],
    queryFn: async () => {
      const { data } = await api.get("/membership/addons");
      return data as { addons: AddonPlan[]; activeAddons: any[] };
    },
  });

  const userPlan = currentRes?.userPlan || null;
  const availablePlans = plansRes?.plans || [];
  const upgradeOptions = upgradeRes?.upgradeOptions || [];
  const addonPlans = addonsRes?.addons || [];
  const remainingMoney = usageRes?.remaining || null;
  const [lastUsageUpdate, setLastUsageUpdate] = useState<string | null>(null);

  // Show banner when usage data updates
  useEffect(() => {
    if (usageRes && userPlan) {
      const currentTimestamp = JSON.stringify(usageRes);
      if (lastUsageUpdate && lastUsageUpdate !== currentTimestamp) {
        setShowUsageBanner(true);
        const timer = setTimeout(() => setShowUsageBanner(false), 8000);
        return () => clearTimeout(timer);
      }
      setLastUsageUpdate(currentTimestamp);
    }
  }, [usageRes, userPlan]);

  const teleConsultStats: TeleStats = useMemo(() => {
    const allowed = (userPlan?.appliedLimits?.teleConsultLimits || {}) as TeleConsultLimits;
    const usage = userPlan?.usage || {};
    const teleUsage = usage.teleConsult || usage.teleConsults || usage.teleConsultCounts || {};

    if (!userPlan) return null;

    // allSpecialties mode
    if (typeof allowed.allSpecialties === "number") {
      const vals = Object.values(teleUsage as Record<string, any>).map((v) => Number(v ?? 0));
      const totalUsed: number = vals.reduce((sum: number, v: number) => sum + v, 0);
      const allowedAll = Number(allowed.allSpecialties) || 0;
      const stats: TeleAll = {
        mode: "all",
        allowed: allowedAll,
        used: totalUsed,
        remaining: Math.max(allowedAll - totalUsed, 0),
      };
      return stats;
    }

    // per-specialty mode
    const perSpec: TelePerItem[] = Object.entries(allowed).map(([spec, count]) => {
      if (spec === "allSpecialties") return null;
      const used = Number(teleUsage?.[spec] || 0);
      const allowedCount = Number(count || 0);
      const item: TelePerItem = {
        spec,
        allowed: allowedCount,
        used,
        remaining: Math.max(allowedCount - used, 0),
      };
      return item;
    }).filter(Boolean) as TelePerItem[];

    const stats: TelePer = { mode: "per-spec", items: perSpec };
    return stats;
  }, [userPlan]);

  const handleSubscribe = async (planId: number) => {
    if (userPlan) {
      toast({
        title: "Already Subscribed",
        description: "You already have an active plan. Please wait for it to expire before subscribing again.",
      });
      return;
    }
    if (!confirm("Subscribe to this plan?")) return;
    setSubscribingId(planId);
    // Optimistic: create a pseudo plan entry to show immediately
    const optimisticKey = ["myPlan", "current"];
    const prev = qc.getQueryData(optimisticKey);
    const chosen = availablePlans.find(p => p.id === planId);
    if (chosen) {
      const startDate = new Date();
      // Support both durationDays and durationMonths
      const durationDays = chosen.durationDays || ((chosen.durationMonths || 1) * 30);
      const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
      qc.setQueryData(optimisticKey, { userPlan: {
        id: -1,
        membershipPlanId: chosen.id,
        startDate: startDate.toISOString().slice(0,10),
        endDate: endDate.toISOString().slice(0,10),
        status: 'active',
        appliedLimits: {
          benefitLimits: chosen.benefitLimits || chosen.limitations,
          teleConsultLimits: chosen.teleConsultLimits,
          healthCheckPackage: chosen.healthCheckPackage,
          priceINR: chosen.priceINR || Number(chosen.price) || 0
        },
        usage: {},
      } as any });
    }
    try {
      await api.post(`/membership/subscribe/${planId}`);
      toast({ title: "Subscription successful" });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["myPlan", "current"] }),
        qc.invalidateQueries({ queryKey: ["myPlan", "usage"] }),
        qc.invalidateQueries({ queryKey: ["plans", "upgrade-options"] }),
        qc.invalidateQueries({ queryKey: ["plans", "addons"] }),
      ]);
    } catch (e: any) {
      // Rollback
      qc.invalidateQueries({ queryKey: ["myPlan", "current"] });
      toast({ title: "Subscription failed", description: e?.response?.data?.message || e.message, variant: "destructive" });
    } finally {
      setSubscribingId(null);
    }
  };

  // Handle plan upgrade
  const handleUpgrade = async (planId: number, planName: string, amountDue: number) => {
    const confirmMsg = amountDue > 0 
      ? `Upgrade to ${planName}? You'll pay ₹${amountDue.toLocaleString('en-IN')} (prorated amount).`
      : `Upgrade to ${planName}? No additional payment required due to prorated refund.`;
    
    if (!confirm(confirmMsg)) return;
    
    setUpgradingId(planId);
    try {
      const { data } = await api.post(`/membership/upgrade/${planId}`);
      toast({ 
        title: "Plan Upgraded Successfully!", 
        description: `You are now on ${data.newPlan.name}. ${data.previousPlan.proratedRefund > 0 ? `Prorated refund: ₹${data.previousPlan.proratedRefund}` : ''}`
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["myPlan", "current"] }),
        qc.invalidateQueries({ queryKey: ["myPlan", "usage"] }),
        qc.invalidateQueries({ queryKey: ["plans", "upgrade-options"] }),
      ]);
    } catch (e: any) {
      toast({ 
        title: "Upgrade Failed", 
        description: e?.response?.data?.message || e.message, 
        variant: "destructive" 
      });
    } finally {
      setUpgradingId(null);
    }
  };

  // Handle addon subscription
  const handleSubscribeAddon = async (planId: number, planName: string) => {
    if (!confirm(`Subscribe to ${planName} addon?`)) return;
    
    setSubscribingId(planId);
    try {
      await api.post(`/membership/subscribe/${planId}`);
      toast({ title: `${planName} addon activated!` });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["plans", "addons"] }),
        qc.invalidateQueries({ queryKey: ["myPlan", "current"] }),
      ]);
    } catch (e: any) {
      toast({ 
        title: "Subscription Failed", 
        description: e?.response?.data?.message || e.message, 
        variant: "destructive" 
      });
    } finally {
      setSubscribingId(null);
    }
  };

  const isLoading = loadingCurrent || loadingUsage || loadingPlans;

  return (
      <motion.div variants={container} initial="hidden" animate="show" className="max-w-7xl mx-auto space-y-6 px-4 md:px-6 py-6">
        {/* Premium Hero Header */}
        <motion.div variants={item} className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 p-6 md:p-8 text-white shadow-2xl">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNiIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48L2c+PC9zdmc+')] opacity-30" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-amber-500/20 to-transparent rounded-full blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 shadow-lg shadow-amber-500/30">
                <Crown className="w-6 h-6" />
              </div>
              <Badge className="bg-white/10 text-white/90 border-white/20 font-medium">Membership</Badge>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mb-2">My Plans</h1>
            <p className="text-slate-300 text-sm md:text-base">Subscribe to a plan and track your remaining benefits</p>
          </div>
        </motion.div>

        {/* Live Usage Update Banner */}
        {userPlan && (
          <motion.div variants={item}>
          <Card className={`p-4 border-2 transition-all duration-500 ${
            showUsageBanner 
              ? "bg-gradient-to-r from-emerald-50 via-blue-50 to-purple-50 border-emerald-400 shadow-lg animate-in slide-in-from-top" 
              : "bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200"
          }`}>
            <div className="flex items-center gap-3">
              {showUsageBanner ? (
                <Zap className="h-6 w-6 text-emerald-600 animate-pulse" />
              ) : (
                <Activity className="h-5 w-5 text-gray-600" />
              )}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className={`font-semibold ${showUsageBanner ? "text-emerald-900" : "text-gray-900"}`}>
                    {showUsageBanner ? "✨ Usage Updated!" : "Live Usage Tracking"}
                  </h3>
                  <Badge variant="outline" className={showUsageBanner ? "bg-emerald-100 text-emerald-700 animate-pulse" : "bg-gray-100 text-gray-700"}>
                    {showUsageBanner ? "Updated" : "Active"}
                  </Badge>
                </div>
                <p className={`text-sm ${showUsageBanner ? "text-emerald-700" : "text-gray-600"}`}>
                  {showUsageBanner 
                    ? "Your consultation was tracked and limits have been updated in real-time" 
                    : "Your plan usage is monitored automatically after each consultation"}
                </p>
              </div>
              {showUsageBanner ? (
                <TrendingUp className="h-6 w-6 text-emerald-600 animate-bounce" />
              ) : (
                <RefreshCw className="h-5 w-5 text-gray-400 animate-spin" style={{ animationDuration: "3s" }} />
              )}
            </div>
            {showUsageBanner && teleConsultStats && (
              <div className="mt-3 pt-3 border-t border-emerald-200">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-emerald-600">
                      {teleConsultStats.mode === 'all' ? teleConsultStats.remaining : 
                       teleConsultStats.items.reduce((sum, it) => sum + it.remaining, 0)}
                    </div>
                    <div className="text-xs text-gray-600">Consultations Left</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-600">
                      ₹{Number(remainingMoney?.pharmacyLimitINR || 0).toLocaleString("en-IN")}
                    </div>
                    <div className="text-xs text-gray-600">Pharmacy Balance</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-purple-600">
                      {userPlan.endDate ? Math.ceil((new Date(userPlan.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 0}
                    </div>
                    <div className="text-xs text-gray-600">Days Remaining</div>
                  </div>
                </div>
              </div>
            )}
          </Card>
          </motion.div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center min-h-[240px]">
            <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
          </div>
        ) : (
          <>
            {/* Current Plan */}
            <motion.div variants={item}>
              <Card className="p-6 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              {!userPlan ? (
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-800 dark:text-white">No Active Plan</h3>
                    <p className="text-gray-600 dark:text-slate-400">Choose a plan below to get started.</p>
                  </div>
                  <Crown className="h-8 w-8 text-amber-500" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-2xl font-semibold">Active Membership</h3>
                        <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>
                      </div>
                      <p className="text-gray-600 mt-1">Valid from {new Date(userPlan.startDate).toLocaleDateString("en-IN")} to {new Date(userPlan.endDate).toLocaleDateString("en-IN")}</p>
                    </div>
                    <Crown className="h-8 w-8 text-amber-500" />
                  </div>

                  {/* Benefits */}
                  <div className="grid md:grid-cols-3 gap-4">
                    <Card className="p-4">
                      <div className="text-sm text-gray-500">Pharmacy</div>
                      <div className="text-lg font-semibold">
                        ₹{Number(remainingMoney?.pharmacyLimitINR ?? userPlan.appliedLimits?.benefitLimits?.pharmacyLimitINR ?? 0).toLocaleString("en-IN")}
                        <span className="text-sm text-gray-500 font-normal"> remaining</span>
                      </div>
                    </Card>
                    <Card className="p-4">
                      <div className="text-sm text-gray-500">Home Care</div>
                      <div className="text-lg font-semibold">
                        ₹{Number(remainingMoney?.homeCareLimitINR ?? userPlan.appliedLimits?.benefitLimits?.homeCareLimitINR ?? 0).toLocaleString("en-IN")}
                        <span className="text-sm text-gray-500 font-normal"> remaining</span>
                      </div>
                    </Card>
                    <Card className="p-4">
                      <div className="text-sm text-gray-500">Ambulance</div>
                      <div className="text-lg font-semibold">
                        ₹{Number(remainingMoney?.ambulanceLimitINR ?? userPlan.appliedLimits?.benefitLimits?.ambulanceLimitINR ?? 0).toLocaleString("en-IN")}
                        <span className="text-sm text-gray-500 font-normal"> remaining</span>
                      </div>
                    </Card>
                  </div>

                  {/* Teleconsult limits */}
                  <Card className="p-4">
                    <div className="text-sm text-gray-500 mb-2">Teleconsults</div>
                    {!teleConsultStats ? (
                      <div className="text-gray-600">No teleconsult limits available for this plan.</div>
                    ) : teleConsultStats.mode === "all" ? (
                      <div className="flex items-center gap-4">
                        <div className="text-lg font-semibold">Allowed: {teleConsultStats.allowed}</div>
                        <div>Used: {teleConsultStats.used}</div>
                        <div className="text-emerald-700">Remaining: {teleConsultStats.remaining}</div>
                      </div>
                    ) : (
                      <div className="grid md:grid-cols-2 gap-2">
                        {teleConsultStats.items.map((it) => (
                          <div key={it.spec} className="flex items-center justify-between border rounded-md p-2">
                            <div className="font-medium">{it.spec}</div>
                            <div className="text-sm">{it.used}/{it.allowed} used</div>
                            <div className="text-sm text-emerald-700">{it.remaining} left</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>

                  {/* Health Check */}
                  <div className="text-sm text-gray-600">
                    <CheckCircle className="inline h-4 w-4 mr-1 text-emerald-600" />
                    Health Check Package: <span className="font-medium">{userPlan.appliedLimits?.healthCheckPackage || "—"}</span>
                  </div>
                </div>
              )}
            </Card>
            </motion.div>

            {/* Available Plans */}
            <motion.div variants={item} className="space-y-3">
              <h2 className="text-xl font-semibold text-slate-800 dark:text-white">Available Plans</h2>
              {availablePlans.length === 0 ? (
                <Card className="p-6 text-center text-gray-600 dark:text-slate-400 dark:bg-slate-800 dark:border-slate-700">No plans available at the moment.</Card>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {availablePlans.map((p) => {
                    const durationDays = p.durationDays || ((p.durationMonths || 1) * 30);
                    const parsedPrice = Number(p.price);
                    const priceValue = p.priceINR ?? (Number.isFinite(parsedPrice) ? parsedPrice : 0);
                    return (
                    <motion.div key={p.id} whileHover={{ y: -6, scale: 1.02 }} transition={{ type: 'spring', stiffness: 300 }}>
                    <Card className="p-6 space-y-3 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:shadow-xl transition-shadow">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-lg font-semibold">{p.name}</h3>
                          <p className="text-sm text-gray-600">{durationDays} days</p>
                        </div>
                        <Badge className={p.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>
                          {p.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <div className="text-2xl font-bold">₹{Number(priceValue).toLocaleString("en-IN")}</div>
                      {p.description && <p className="text-sm text-gray-600 line-clamp-3">{p.description}</p>}
                      {p.healthCheckPackage && (
                        <div className="text-sm"><span className="text-gray-500">Health Check:</span> {p.healthCheckPackage}</div>
                      )}
                      {/* Features list */}
                      {p.features && p.features.length > 0 && (
                        <div className="text-sm text-gray-600">
                          <p className="font-medium mb-1">Features:</p>
                          <ul className="list-disc list-inside space-y-1">
                            {p.features.slice(0, 3).map((f, i) => (
                              <li key={i}>{f}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="text-sm text-gray-600">
                        Teleconsults: {typeof p.teleConsultLimits?.allSpecialties === "number" ? (
                          <span>{p.teleConsultLimits?.allSpecialties} for all specialties</span>
                        ) : p.limitations?.maxConsultations ? (
                          <span>{p.limitations.maxConsultations} consultations included</span>
                        ) : (
                          <span>{Object.keys(p.teleConsultLimits || {}).length || 'Unlimited'} specialties covered</span>
                        )}
                      </div>
                      <Button
                        disabled={!p.isActive || Boolean(userPlan) || subscribingId === p.id}
                        onClick={() => handleSubscribe(p.id)}
                        className="w-full mt-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white"
                      >
                        {subscribingId === p.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Star className="h-4 w-4 mr-2" />}
                        {userPlan ? "Already Subscribed" : "Subscribe"}
                      </Button>
                    </Card>
                    </motion.div>
                  )})}
                </div>
              )}
            </motion.div>

            {/* Upgrade Options - Show when user has active plan */}
            {userPlan && upgradeOptions.length > 0 && (
              <motion.div variants={item} className="space-y-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-amber-500" />
                  <h2 className="text-xl font-semibold text-slate-800 dark:text-white">Upgrade Your Plan</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Upgrade to a higher tier and get prorated credit for your remaining days
                </p>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {upgradeOptions.map((opt) => (
                    <motion.div key={opt.id} whileHover={{ y: -6, scale: 1.02 }} transition={{ type: 'spring', stiffness: 300 }}>
                    <Card className={`p-6 space-y-3 border-2 ${opt.isUpgrade ? 'border-amber-400/50 bg-amber-50/50 dark:bg-amber-900/10 dark:border-amber-500/30' : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800'}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-slate-800 dark:text-white">{opt.name}</h3>
                          <Badge variant={opt.isUpgrade ? "default" : "secondary"} className="mt-1">
                            {opt.tierName} {opt.isUpgrade && '↑'}
                          </Badge>
                        </div>
                        {opt.isUpgrade && <Zap className="h-5 w-5 text-amber-500" />}
                      </div>
                      
                      <div className="space-y-1">
                        <div className="text-sm text-slate-500 dark:text-slate-400 line-through">
                          Original: ₹{opt.originalPrice.toLocaleString('en-IN')}
                        </div>
                        <div className="text-sm text-emerald-600 dark:text-emerald-400">
                          Prorated credit: -₹{opt.proratedRefund.toLocaleString('en-IN')}
                        </div>
                        <div className="text-2xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                          Pay: ₹{opt.amountDue.toLocaleString('en-IN')}
                        </div>
                      </div>
                      
                      {opt.description && (
                        <p className="text-sm text-gray-600 dark:text-slate-400 line-clamp-2">{opt.description}</p>
                      )}
                      
                      <Button
                        disabled={upgradingId === opt.id}
                        onClick={() => handleUpgrade(opt.id, opt.name, opt.amountDue)}
                        className={`w-full ${opt.isUpgrade ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white' : ''}`}
                        variant={opt.isUpgrade ? "default" : "outline"}
                      >
                        {upgradingId === opt.id ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <TrendingUp className="h-4 w-4 mr-2" />
                        )}
                        {opt.isUpgrade ? 'Upgrade Now' : 'Switch Plan'}
                      </Button>
                    </Card>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Addon Plans */}
            {addonPlans.length > 0 && (
              <motion.div variants={item} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-500" />
                  <h2 className="text-xl font-semibold text-slate-800 dark:text-white">Optional Add-ons</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Enhance your membership with additional benefits
                </p>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {addonPlans.map((addon) => {
                    const parsedPrice = Number(addon.price);
                    const priceValue = addon.priceINR ?? (Number.isFinite(parsedPrice) ? parsedPrice : 0);
                    return (
                      <motion.div key={addon.id} whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 300 }}>
                      <Card className={`p-6 space-y-3 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 ${addon.isSubscribed ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/10' : ''}`}>
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-lg font-semibold">{addon.name}</h3>
                            <p className="text-sm text-gray-600">
                              {addon.durationMonths ? `${addon.durationMonths} months` : 'Lifetime'}
                            </p>
                          </div>
                          {addon.isSubscribed ? (
                            <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>
                          ) : (
                            <Badge variant="outline">Add-on</Badge>
                          )}
                        </div>
                        
                        <div className="text-2xl font-bold">₹{Number(priceValue).toLocaleString('en-IN')}</div>
                        
                        {addon.description && (
                          <p className="text-sm text-gray-600 line-clamp-2">{addon.description}</p>
                        )}
                        
                        {addon.features && Array.isArray(addon.features) && addon.features.length > 0 && (
                          <ul className="text-sm text-gray-600 space-y-1">
                            {(addon.features as string[]).slice(0, 3).map((f, i) => (
                              <li key={i} className="flex items-center gap-1">
                                <CheckCircle className="h-3 w-3 text-emerald-500" />
                                {f}
                              </li>
                            ))}
                          </ul>
                        )}
                        
                        <Button
                          disabled={addon.isSubscribed || subscribingId === addon.id || !addon.isActive}
                          onClick={() => handleSubscribeAddon(addon.id, addon.name)}
                          className="w-full"
                          variant={addon.isSubscribed ? "secondary" : "outline"}
                        >
                          {subscribingId === addon.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : addon.isSubscribed ? (
                            <CheckCircle className="h-4 w-4 mr-2" />
                          ) : null}
                          {addon.isSubscribed ? 'Already Added' : 'Add to Plan'}
                        </Button>
                      </Card>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </>
        )}
      </motion.div>
  );
};

export default MyPlans;
