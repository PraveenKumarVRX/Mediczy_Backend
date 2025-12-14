import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import api from "@/utils/api";
import { Crown, CheckCircle, Loader2, TrendingUp, Activity, Zap, RefreshCw } from "lucide-react";

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
  durationDays: number;
  priceINR: number;
  isActive: boolean;
  benefitLimits: Record<string, number>;
  teleConsultLimits: TeleConsultLimits;
  healthCheckPackage?: string;
}

type TeleAll = { mode: 'all'; allowed: number; used: number; remaining: number };
type TelePerItem = { spec: string; allowed: number; used: number; remaining: number };
type TelePer = { mode: 'per-spec'; items: TelePerItem[] };
type TeleStats = TeleAll | TelePer | null;

const MyPlans = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [subscribingId, setSubscribingId] = useState<number | null>(null);
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

  const userPlan = currentRes?.userPlan || null;
  const availablePlans = plansRes?.plans || [];
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
      const endDate = new Date(startDate.getTime() + chosen.durationDays * 24 * 60 * 60 * 1000);
      qc.setQueryData(optimisticKey, { userPlan: {
        id: -1,
        membershipPlanId: chosen.id,
        startDate: startDate.toISOString().slice(0,10),
        endDate: endDate.toISOString().slice(0,10),
        status: 'active',
        appliedLimits: {
          benefitLimits: chosen.benefitLimits,
          teleConsultLimits: chosen.teleConsultLimits,
          healthCheckPackage: chosen.healthCheckPackage,
          priceINR: chosen.priceINR
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
      ]);
    } catch (e: any) {
      // Rollback
      qc.invalidateQueries({ queryKey: ["myPlan", "current"] });
      toast({ title: "Subscription failed", description: e?.response?.data?.message || e.message, variant: "destructive" });
    } finally {
      setSubscribingId(null);
    }
  };

  const isLoading = loadingCurrent || loadingUsage || loadingPlans;

  return (
    <MainLayout>
      <div className="space-y-6 animate-in">
        <div>
          <h1 className="primary-grad text-3xl font-bold">My Plans</h1>
          <p className="text-muted-foreground">Subscribe to a plan and track your remaining benefits</p>
        </div>

        {/* Live Usage Update Banner */}
        {userPlan && (
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
        )}

        {isLoading ? (
          <div className="flex items-center justify-center min-h-[240px]">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            {/* Current Plan */}
            <Card className="p-6">
              {!userPlan ? (
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-semibold">No Active Plan</h3>
                    <p className="text-gray-600">Choose a plan below to get started.</p>
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

            {/* Available Plans */}
            <div className="space-y-3">
              <h2 className="text-xl font-semibold">Available Plans</h2>
              {availablePlans.length === 0 ? (
                <Card className="p-6 text-center text-gray-600">No plans available at the moment.</Card>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {availablePlans.map((p) => (
                    <Card key={p.id} className="p-6 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-lg font-semibold">{p.name}</h3>
                          <p className="text-sm text-gray-600">{p.durationDays} days</p>
                        </div>
                        <Badge className={p.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>
                          {p.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <div className="text-2xl font-bold">₹{Number(p.priceINR).toLocaleString("en-IN")}</div>
                      {p.description && <p className="text-sm text-gray-600 line-clamp-3">{p.description}</p>}
                      {p.healthCheckPackage && (
                        <div className="text-sm"><span className="text-gray-500">Health Check:</span> {p.healthCheckPackage}</div>
                      )}
                      <div className="text-sm text-gray-600">
                        Teleconsults: {typeof p.teleConsultLimits?.allSpecialties === "number" ? (
                          <span>{p.teleConsultLimits?.allSpecialties} for all specialties</span>
                        ) : (
                          <span>{Object.keys(p.teleConsultLimits || {}).length} specialties covered</span>
                        )}
                      </div>
                      <Button
                        disabled={!p.isActive || Boolean(userPlan) || subscribingId === p.id}
                        onClick={() => handleSubscribe(p.id)}
                        className="w-full mt-2"
                      >
                        {subscribingId === p.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {userPlan ? "Already Subscribed" : "Subscribe"}
                      </Button>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
};

export default MyPlans;
