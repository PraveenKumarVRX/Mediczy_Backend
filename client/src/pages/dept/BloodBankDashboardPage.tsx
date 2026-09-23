import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlaceholderBanner } from "@/components/ui/placeholder-banner";
import DeptStaffLayout from "@/components/hosp-dept/DeptStaffLayout";
import { bloodBankNav } from "./DepartmentDashboards";
import {
  Droplets, AlertTriangle, Users, ArrowRightLeft,
  Thermometer, RefreshCw, ChevronRight,
  ShieldCheck, FlaskConical, HeartPulse, Timer, BarChart3,
  ArrowRight, Bell, Archive, Syringe, UserCheck,
  TriangleAlert, Loader2,
} from "lucide-react";

// WP-0.3b: this dashboard used to be entirely hardcoded (blood group inventory, component stock,
// cross-match queue, donors, storage temperatures, a 7-day trend chart, alerts) with a fake "refresh"
// that just delayed a timestamp update. Wired to the real server/routes/dept/bloodBank.route.js
// endpoints below. Two things genuinely have no backend yet and are left as an honest placeholder
// rather than invented, per the plan: the 7-day trend and cold-chain storage temperatures (the
// latter belongs to WP-1.7's CMMS/cold-chain work).

const getToken = () => {
  const raw = localStorage.getItem("blood-bankAuth");
  try { return JSON.parse(raw || "{}").token || ""; } catch { return ""; }
};
const authH = () => ({ Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" });

const BLOOD_GROUP_ORDER = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];

interface SummaryData {
  available_units: number;
  expiring_soon: number;
  issued_today: number;
  pending_requests: number;
  byGroup: { blood_group: string; units: number }[];
}

interface AlertsData {
  shortages: { blood_group: string; available_units: number }[];
  expiring: { id: number; unit_number: string; blood_group: string; component: string; expires_at: string }[];
}

interface InventoryUnit {
  id: number;
  unit_number: string;
  blood_group: string;
  component: string;
  status: string;
  expires_at: string;
}

interface Requisition {
  id: number;
  requisition_number: string;
  patient_name: string;
  ward: string | null;
  blood_group: string;
  component: string;
  units_requested: number;
  urgency: string;
  status: string;
  created_at: string;
}

interface Donor {
  id: number;
  donor_id: string;
  name: string;
  blood_group: string;
  donor_type: string;
  last_donation_date: string | null;
  created_at: string;
}

const COMPONENT_COLOR: Record<string, string> = {
  whole_blood: "#059669",
  packed_rbc: "#dc2626",
  prbc: "#dc2626",
  ffp: "#2563eb",
  fresh_frozen_plasma: "#2563eb",
  platelets: "#d97706",
  cryoprecipitate: "#7c3aed",
};
const componentColor = (name: string) => COMPONENT_COLOR[name.toLowerCase().replace(/\s+/g, "_")] || "#64748b";
const componentLabel = (name: string) => name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const urgencyBadge: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  routine: "bg-sky-100 text-sky-700 border-sky-200",
};
const reqStatusBadge: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  issued: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-slate-100 text-slate-600",
};

// ─── Animated clock ───────────────────────────────────────────────────────────

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="text-right hidden md:block">
      <p className="text-3xl font-bold tabular-nums">
        {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </p>
      <p className="text-red-100 text-sm mt-0.5">
        {time.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
      </p>
    </div>
  );
}

// ─── Blood-bag meter (real unit count; no fabricated capacity/fill %) ─────────

function BloodBagMeter({ group, units, isShortage }: { group: string; units: number; isShortage: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border cursor-default ${
        isShortage ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-100"
      }`}
    >
      {isShortage && (
        <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600" />
        </span>
      )}
      <span className="font-black text-base text-slate-800 tracking-tight">{group}</span>
      <div className={`flex h-14 w-14 items-center justify-center rounded-full ${isShortage ? "bg-red-100" : "bg-emerald-100"}`}>
        <Droplets className={`h-6 w-6 ${isShortage ? "text-red-500" : "text-emerald-500"}`} />
      </div>
      <p className={`text-lg font-extrabold leading-none ${isShortage ? "text-red-600" : "text-emerald-600"}`}>{units}</p>
      <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full text-white ${isShortage ? "bg-red-600" : "bg-emerald-500"}`}>
        {isShortage ? "shortage" : "available"}
      </span>
    </motion.div>
  );
}

// ─── Temp indicator (placeholder — no cold-chain backend until WP-1.7) ────────

function ColdChainPlaceholder() {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border bg-slate-50 border-slate-100">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-200">
        <Thermometer className="h-4 w-4 text-slate-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-600">Cold-chain monitoring not connected yet</p>
        <p className="text-[10px] text-slate-400 mt-0.5">Storage temperature tracking is planned for the CMMS/cold-chain work package.</p>
      </div>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

interface KpiProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  pulse?: boolean;
}

function KpiCard({ icon: Icon, label, value, sub, color, pulse }: KpiProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <Card className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow">
        <CardContent className="p-4">
          <div className={`relative flex h-11 w-11 items-center justify-center rounded-xl ${color}`}>
            <Icon className="h-5 w-5 text-white" />
            {pulse && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
            )}
          </div>
          <p className="mt-3 text-2xl font-extrabold text-slate-900 tabular-nums">{value}</p>
          <p className="text-xs font-medium text-slate-500 mt-0.5">{label}</p>
          {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Component bar (derived from real inventory, grouped client-side) ─────────

function ComponentBar({ name, units, max }: { name: string; units: number; max: number }) {
  const fill = max > 0 ? Math.round((units / max) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-700">{componentLabel(name)}</span>
        <span className="tabular-nums font-bold text-slate-900">{units} units</span>
      </div>
      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${fill}%` }}
          transition={{ duration: 1, ease: "easeOut", delay: 0.1 }}
          className="h-full rounded-full"
          style={{ backgroundColor: componentColor(name) }}
        />
      </div>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export function BloodBankDashboard() {
  const navigate = useNavigate();
  const [activeAlert, setActiveAlert] = useState<number | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [xmFilter, setXmFilter] = useState<string>("all");

  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [alertsData, setAlertsData] = useState<AlertsData | null>(null);
  const [inventory, setInventory] = useState<InventoryUnit[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [donors, setDonors] = useState<Donor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const deptData = (() => {
    try { return JSON.parse(localStorage.getItem("blood-bankAuth") || "{}"); } catch { return {}; }
  })();
  const staffName = deptData?.name ?? deptData?.email ?? "Blood Bank Staff";

  const loadAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const [summaryRes, alertsRes, inventoryRes, requisitionsRes, donorsRes] = await Promise.all([
        fetch("/api/blood-bank/summary", { headers: authH() }),
        fetch("/api/blood-bank/alerts", { headers: authH() }),
        fetch("/api/blood-bank/inventory?status=available", { headers: authH() }),
        fetch("/api/blood-bank/requisitions", { headers: authH() }),
        fetch("/api/blood-bank/donors?limit=5", { headers: authH() }),
      ]);
      const [summaryJson, alertsJson, inventoryJson, requisitionsJson, donorsJson] = await Promise.all([
        summaryRes.json(), alertsRes.json(), inventoryRes.json(), requisitionsRes.json(), donorsRes.json(),
      ]);
      if (!summaryJson.success) throw new Error(summaryJson.message || "Failed to load summary");
      setSummary(summaryJson.data);
      setAlertsData(alertsJson.success ? alertsJson.data : { shortages: [], expiring: [] });
      setInventory(inventoryJson.success ? inventoryJson.data : []);
      setRequisitions(requisitionsJson.success ? requisitionsJson.data : []);
      setDonors(donorsJson.success ? donorsJson.data : []);
      setLoadError(null);
      setLastRefreshed(new Date());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load blood bank data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const shortageGroups = new Set((alertsData?.shortages ?? []).map((s) => s.blood_group));
  const byGroupMap = new Map((summary?.byGroup ?? []).map((g) => [g.blood_group, g.units]));
  const bloodGroups = BLOOD_GROUP_ORDER.map((group) => ({
    group,
    units: byGroupMap.get(group) ?? 0,
    isShortage: shortageGroups.has(group),
  }));
  const criticalCount = bloodGroups.filter((b) => b.isShortage).length;

  const componentTotals = new Map<string, number>();
  for (const unit of inventory) {
    componentTotals.set(unit.component, (componentTotals.get(unit.component) ?? 0) + 1);
  }
  const componentBreakdown = [...componentTotals.entries()].map(([name, units]) => ({ name, units }));
  const maxComponentUnits = Math.max(1, ...componentBreakdown.map((c) => c.units));

  const filteredXM = xmFilter === "all" ? requisitions : requisitions.filter((r) => r.status === xmFilter);

  const alertItems = [
    ...(alertsData?.shortages ?? []).map((s, i) => ({
      id: `shortage-${i}`,
      type: "critical" as const,
      msg: `${s.blood_group} stock low — only ${s.available_units} unit${s.available_units === 1 ? "" : "s"} remaining`,
    })),
    ...(alertsData?.expiring ?? []).map((e) => ({
      id: `expiring-${e.id}`,
      type: "warning" as const,
      msg: `Unit ${e.unit_number} (${e.blood_group}, ${componentLabel(e.component)}) expires ${new Date(e.expires_at).toLocaleDateString()}`,
    })),
  ];

  if (loading) {
    return (
      <DeptStaffLayout deptKey="blood-bank" deptName="Blood Bank" badgeLabel="BLOOD BANK" DeptIcon={Droplets}
        loginPath="/blood-bank/login" navSections={bloodBankNav} copilotModule="bloodbank">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-red-600" />
        </div>
      </DeptStaffLayout>
    );
  }

  return (
    <DeptStaffLayout
      deptKey="blood-bank"
      deptName="Blood Bank"
      badgeLabel="BLOOD BANK"
      DeptIcon={Droplets}
      loginPath="/blood-bank/login"
      navSections={bloodBankNav}
      copilotModule="bloodbank"
    >
      <div className="space-y-5 pb-8">

        {loadError && (
          <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {loadError} — showing the last successfully loaded data.
            <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={loadAll}>Retry</Button>
          </div>
        )}

        {/* ── Hero banner ──────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-700 via-red-600 to-rose-700 p-6 text-white shadow-xl"
        >
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-10 -right-10 h-48 w-48 rounded-full bg-white/5" />
            <div className="absolute -bottom-12 -left-8 h-40 w-40 rounded-full bg-white/5" />
            <div className="absolute top-4 right-32 h-24 w-24 rounded-full bg-white/5" />
          </div>

          <div className="relative z-10 flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm shadow-inner">
                <Droplets className="h-9 w-9 text-white" />
              </div>
              <div>
                <p className="text-red-100 text-sm font-medium">Welcome back,</p>
                <h2 className="text-2xl font-bold">{staffName}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">
                    <HeartPulse className="h-3 w-3" /> Blood Bank
                  </span>
                  {criticalCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-900/60 px-2.5 py-0.5 text-xs font-bold animate-pulse">
                      <TriangleAlert className="h-3 w-3" /> {criticalCount} Shortage{criticalCount > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <LiveClock />
          </div>

          <div className="relative z-10 mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total Units", value: summary?.available_units ?? 0, icon: Archive },
              { label: "Pending Requests", value: summary?.pending_requests ?? 0, icon: FlaskConical },
              { label: "Expiring ≤7 Days", value: summary?.expiring_soon ?? 0, icon: Timer },
              { label: "Recent Donors", value: donors.length, icon: Users },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-xl bg-white/15 backdrop-blur-sm p-3 flex items-center gap-3">
                <Icon className="h-5 w-5 text-white/70 shrink-0" />
                <div>
                  <p className="text-xl font-extrabold tabular-nums">{value}</p>
                  <p className="text-[11px] text-red-100">{label}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="relative z-10 mt-4 flex items-center justify-between text-xs text-red-100">
            <span>Last updated: {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            <button
              onClick={loadAll}
              className="flex items-center gap-1 rounded-lg bg-white/15 px-2.5 py-1 hover:bg-white/25 transition-colors font-medium"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </motion.div>

        {/* ── KPI row ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard icon={Droplets} label="Units Available" value={summary?.available_units ?? 0} sub="across all groups" color="bg-red-500" />
          <KpiCard icon={TriangleAlert} label="Shortage Groups" value={criticalCount} sub="below 5 units" color="bg-rose-600" pulse={criticalCount > 0} />
          <KpiCard icon={ArrowRightLeft} label="Issued Today" value={summary?.issued_today ?? 0} sub="units" color="bg-blue-600" />
          <KpiCard icon={FlaskConical} label="Pending Requisitions" value={summary?.pending_requests ?? 0} color="bg-violet-600" />
        </div>

        {/* ── Blood group inventory + Components ───────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Droplets className="h-4 w-4 text-red-500" /> Blood Group Inventory
                </CardTitle>
                <div className="flex items-center gap-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-600" /> shortage (&lt;5)</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> available</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                {bloodGroups.map((bg) => (
                  <BloodBagMeter key={bg.group} group={bg.group} units={bg.units} isShortage={bg.isShortage} />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-violet-500" /> Component Stock
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {componentBreakdown.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No available units on record</p>
              ) : (
                componentBreakdown.map((c) => <ComponentBar key={c.name} name={c.name} units={c.units} max={maxComponentUnits} />)
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Trend placeholder + Alerts ──────────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-500" /> 7-Day Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PlaceholderBanner
                title="Trend data isn't available yet."
                reason="Daily collection/issue/cross-match history isn't tracked by the backend yet — this chart isn't wired to anything until that exists."
              />
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Bell className="h-4 w-4 text-rose-500" /> Live Alerts
                </CardTitle>
                <Badge variant="outline" className="text-[10px] font-bold border-rose-200 text-rose-600">
                  {alertsData?.shortages.length ?? 0} shortage
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
              {alertItems.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-4 justify-center">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" /> No active alerts
                </div>
              ) : (
                <AnimatePresence>
                  {alertItems.map((a) => (
                    <motion.div
                      key={a.id}
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      onClick={() => setActiveAlert(activeAlert === (a.id as unknown as number) ? null : (a.id as unknown as number))}
                      className={`flex gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        a.type === "critical" ? "bg-red-50 border-red-100 hover:bg-red-100" : "bg-amber-50 border-amber-100 hover:bg-amber-100"
                      }`}
                    >
                      {a.type === "critical"
                        ? <TriangleAlert className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                        : <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />}
                      <p className="text-[11px] font-semibold text-slate-800 leading-snug">{a.msg}</p>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Requisition queue + Donors + Cold chain ───────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-violet-500" /> Requisition Queue
                </CardTitle>
                <div className="flex items-center gap-1.5">
                  {["all", "pending", "issued", "cancelled"].map((f) => (
                    <button
                      key={f}
                      onClick={() => setXmFilter(f)}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors capitalize ${
                        xmFilter === f ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredXM.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">No requisitions{xmFilter !== "all" ? ` with status "${xmFilter}"` : ""}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        {["Req #", "Patient", "Ward", "Group", "Component", "Units", "Urgency", "Status", "Requested"].map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wide text-[10px] whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredXM.map((row, i) => (
                        <motion.tr key={row.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }} className="hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-2.5 font-mono font-bold text-slate-700">{row.requisition_number}</td>
                          <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">{row.patient_name}</td>
                          <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{row.ward || "—"}</td>
                          <td className="px-3 py-2.5"><span className="font-extrabold text-red-600">{row.blood_group}</span></td>
                          <td className="px-3 py-2.5 text-slate-600">{componentLabel(row.component)}</td>
                          <td className="px-3 py-2.5 font-bold text-slate-700">{row.units_requested}</td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold capitalize ${urgencyBadge[row.urgency] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                              {row.urgency}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${reqStatusBadge[row.status] || "bg-slate-100 text-slate-600"}`}>
                              {row.status}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{new Date(row.created_at).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}</td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="p-3 border-t border-slate-100 flex items-center justify-between">
                <p className="text-[11px] text-slate-400">{filteredXM.length} requisition{filteredXM.length !== 1 ? "s" : ""} shown</p>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => navigate("/blood-bank/requisitions")}>
                  All Requisitions <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Users className="h-4 w-4 text-emerald-500" /> Recent Donors
                  </CardTitle>
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-emerald-700" onClick={() => navigate("/blood-bank/donors")}>
                    View all <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {donors.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">No donors registered yet</p>
                ) : (
                  donors.map((d) => (
                    <div key={d.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                      <div className="h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-extrabold text-white shrink-0 bg-emerald-500">
                        {d.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{d.name}</p>
                        <p className="text-[10px] text-slate-400 capitalize">{d.donor_type} · registered {new Date(d.created_at).toLocaleDateString()}</p>
                      </div>
                      <span className="text-[10px] font-extrabold text-red-600 shrink-0">{d.blood_group}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Thermometer className="h-4 w-4 text-blue-500" /> Storage Temps
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ColdChainPlaceholder />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Quick actions ─────────────────────────────────────────────────── */}
        <Card className="shadow-sm border-0 bg-gradient-to-r from-slate-50 to-red-50">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Quick Actions</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "View Inventory", path: "/blood-bank/inventory", color: "bg-red-600 hover:bg-red-700", icon: Archive },
                { label: "New Requisition", path: "/blood-bank/requisitions", color: "bg-blue-600 hover:bg-blue-700", icon: ArrowRightLeft },
                { label: "Register Donor", path: "/blood-bank/donors", color: "bg-emerald-600 hover:bg-emerald-700", icon: UserCheck },
                { label: "Issue Blood", path: "/blood-bank/requisitions", color: "bg-violet-600 hover:bg-violet-700", icon: Syringe },
                { label: "Reports", path: "/blood-bank/reports", color: "bg-slate-700 hover:bg-slate-800", icon: BarChart3 },
              ].map((a) => (
                <button
                  key={a.label}
                  onClick={() => navigate(a.path)}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all shadow-sm hover:shadow-md active:scale-95 ${a.color}`}
                >
                  <a.icon className="h-4 w-4" />
                  {a.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>
    </DeptStaffLayout>
  );
}

export default BloodBankDashboard;
