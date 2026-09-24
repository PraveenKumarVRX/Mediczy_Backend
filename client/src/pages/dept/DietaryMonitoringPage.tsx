/**
 * DietaryMonitoringPage — patient diet monitoring dashboard backed by real
 * dietary orders (GET /dietary/stats).
 *
 * Per-meal intake, macros and 7-day compliance trends have no recorded source
 * yet, so those widgets show explicit unavailable states instead of fabricated
 * data (WP-0.3d).
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DeptStaffLayout from "@/components/hosp-dept/DeptStaffLayout";
import { dietaryNav } from "./DepartmentDashboards";
import { DietaryAIAssistant } from "@/components/dietary/DietaryAIAssistant";
import api from "@/utils/api";
import {
  Utensils, Users, AlertTriangle, Search, X,
  Activity, ShieldCheck, Info, BarChart3,
} from "lucide-react";

// ─── Types & status config ─────────────────────────────────────────────────────

interface PatientMonitor {
  id: string;
  name: string;
  ward: string;
  bed: string;
  dietType: string;
  targetCalories: number | null;
  restrictions: string | null;
  allergies: string[];
  physician: string;
  npo: boolean;
  status: string;
  priority: string;
  lastUpdated: string;
}

const statusConfig: Record<string, { label: string; cls: string }> = {
  delivered: { label: "Delivered", cls: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" },
  pending:   { label: "Pending",   cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
  preparing: { label: "Preparing", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400" },
  cancelled: { label: "Cancelled", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
};


// ─── Main monitoring content (real data from GET /dietary/stats) ──────────────

const DietaryMonitoringContent = () => {
  const [search, setSearch] = useState("");
  const [wardFilter, setWardFilter] = useState("all");
  const [patients, setPatients] = useState<PatientMonitor[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientMonitor | null>(null);

  useEffect(() => {
    api.get("/dietary/stats", {
      headers: { Authorization: `Bearer ${localStorage.getItem("dietaryToken") || ""}` },
    })
      .then(({ data }) => {
        setPatients(((data.data?.patients || []) as any[]).map((p) => ({
          id: p.patient_id || p.order_number,
          name: p.patient_name,
          ward: p.ward || "—",
          bed: p.bed || "—",
          dietType: p.diet_type,
          targetCalories: p.calories ?? null,
          restrictions: p.restrictions ?? null,
          allergies: p.allergies || [],
          physician: p.physician || "—",
          npo: String(p.diet_type || "").toUpperCase().includes("NPO"),
          status: p.status,
          priority: p.priority,
          lastUpdated: String(p.updated_at || "").slice(11, 16) || "—",
        })));
        setLoaded(true);
      })
      .catch((err) => {
        console.error("[Dietary] failed to load monitoring data:", err?.message);
        setLoaded(true);
        setLoadError(true);
      });
  }, []);

  const wards = Array.from(new Set(patients.map((p) => p.ward))).sort();
  const allergyPatients = patients.filter((p) => p.allergies.length > 0);
  const npoCount = patients.filter((p) => p.npo).length;
  const filtered = patients.filter((p) => {
    const matchWard = wardFilter === "all" || p.ward === wardFilter;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      p.name.toLowerCase().includes(q) ||
      p.ward.toLowerCase().includes(q) ||
      p.bed.toLowerCase().includes(q) ||
      p.dietType.toLowerCase().includes(q) ||
      String(p.id).toLowerCase().includes(q);
    return matchWard && matchSearch;
  });

  return (
    <>
      <div className="space-y-5">
        {loadError && (
          <div className="p-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-sm text-red-700 dark:text-red-300">
            Couldn’t load monitoring data from the server — figures show “—” until the connection recovers.
          </div>
        )}

        {/* ── Hero KPIs ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl p-6 text-white"
          style={{ background: "linear-gradient(135deg, #052e16 0%, #166534 40%, #15803d 70%, #16a34a 100%)" }}
        >
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-1">
              <Badge className="bg-white/15 text-white border-white/25 text-[10px] font-semibold">Diet Monitoring</Badge>
              <Badge className="bg-green-400/20 text-green-200 border-green-400/30 text-[10px] font-semibold">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full mr-1.5 animate-pulse" />
                Live
              </Badge>
            </div>
            <h2 className="text-2xl font-bold">Patient Diet Monitoring</h2>
            <p className="text-white/60 text-sm mt-0.5">Latest diet order per patient, straight from dietary records</p>
          </div>
          <div className="relative z-10 mt-5 pt-5 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { icon: Users,         label: "Patients",         value: loaded ? String(patients.length) : "—" },
              { icon: ShieldCheck,   label: "Wards",            value: loaded ? String(wards.length) : "—" },
              { icon: AlertTriangle, label: "Allergy Patients", value: loaded ? String(allergyPatients.length) : "—" },
              { icon: Info,          label: "NPO",              value: loaded ? String(npoCount) : "—" },
            ].map(({ icon: Ic, label, value }) => (
              <div key={label} className="flex items-center gap-3">
                <Ic className="h-5 w-5 text-green-300 shrink-0" />
                <div>
                  <p className="text-white font-bold text-xl leading-none">{value}</p>
                  <p className="text-white/50 text-xs mt-0.5">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Allergy flag strip (real) ── */}
        {loaded && allergyPatients.length > 0 && (
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-red-700 dark:text-red-300">
                {allergyPatients.length} Patient{allergyPatients.length > 1 ? "s" : ""} with Active Allergy Flags
              </p>
              <p className="text-xs text-red-600/80 dark:text-red-400/80 truncate">
                {allergyPatients.map((p) => `${p.name} (${p.allergies.join(", ")})`).join(" • ")}
              </p>
            </div>
          </motion.div>
        )}

        {/* ── Ward summary cards (real counts) ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {wards.map((w) => {
            const inWard = patients.filter((p) => p.ward === w);
            const allergy = inWard.filter((p) => p.allergies.length > 0).length;
            return (
              <Card key={w} className="py-3 px-4 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setWardFilter(w)}>
                <p className="text-xs font-bold text-slate-600 dark:text-slate-400">{w}</p>
                <p className="text-2xl font-bold mt-1 text-slate-900 dark:text-white">{inWard.length}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">patient{inWard.length === 1 ? "" : "s"}</p>
                {allergy > 0 && (
                  <div className="flex items-center gap-1 mt-1">
                    <div className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                    <span className="text-[10px] text-amber-600 font-semibold">{allergy} allergy flag{allergy === 1 ? "" : "s"}</span>
                  </div>
                )}
              </Card>
            );
          })}
          {loaded && wards.length === 0 && (
            <p className="col-span-full text-sm text-slate-400">No diet orders recorded yet.</p>
          )}
        </div>

        {/* ── Controls ── */}
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Search patient, ward, bed..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm" />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {[{ key: "all", label: "All" }, ...wards.map((w) => ({ key: w, label: w }))].map(({ key, label }) => (
              <Button key={key} size="sm" variant={wardFilter === key ? "default" : "outline"}
                className="h-8 text-xs" onClick={() => setWardFilter(key)}>
                {label}
              </Button>
            ))}
          </div>
        </div>

        {/* ── Patient roster (real) ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-green-600" />
              Patients on Diet Orders
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-6 py-3">Patient</th>
                    <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Ward / Bed</th>
                    <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Diet</th>
                    <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Status</th>
                    <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Priority</th>
                    <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Allergies</th>
                    <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {!loaded && (
                    <tr><td colSpan={7} className="px-6 py-6 text-center text-xs text-slate-400">Loading patients…</td></tr>
                  )}
                  {loaded && filtered.length === 0 && (
                    <tr><td colSpan={7} className="px-6 py-6 text-center text-xs text-slate-400">No patients match your filters.</td></tr>
                  )}
                  {filtered.map((p) => (
                    <tr key={p.id} onClick={() => setSelectedPatient(p)}
                      className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer">
                      <td className="px-6 py-3">
                        <p className="font-medium text-slate-800 dark:text-white text-xs">{p.name}</p>
                        <p className="text-[10px] text-slate-400">{p.id}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">{p.ward} · {p.bed}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{p.dietType}</span>
                          {p.npo && (
                            <Badge className="text-[9px] bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400 border-0 px-1.5 py-0">NPO</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`text-[10px] border-0 font-medium ${(statusConfig[p.status] || statusConfig.pending).cls}`}>
                          {(statusConfig[p.status] || statusConfig.pending).label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">{p.priority}</td>
                      <td className="px-4 py-3">
                        {p.allergies.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {p.allergies.map((a) => (
                              <Badge key={a} className="text-[9px] bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 border-0 font-semibold">⚠ {a}</Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{p.lastUpdated}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* ── Intake-dependent widgets: honest unavailable states ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-green-600" />
                Meal Compliance Heatmap
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Not available yet — per-meal intake (consumed / partial / refused) isn’t recorded in any connected system (dataAvailable: false).
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-green-600" />
                Today’s Calorie Intake vs. Target
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Not available yet — actual intake calories aren’t recorded (dataAvailable: false). Target calories appear per patient above.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Patient Drawer */}
      <AnimatePresence>
        {selectedPatient && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 z-40" onClick={() => setSelectedPatient(null)} />
            <motion.div
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 35 }}
              className="fixed right-0 top-0 h-full w-full max-w-md bg-white dark:bg-slate-900 z-50 shadow-2xl flex flex-col overflow-y-auto"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">{selectedPatient.name}</h3>
                  <p className="text-xs text-slate-500">{selectedPatient.id} · {selectedPatient.ward} · Bed {selectedPatient.bed}</p>
                </div>
                <button onClick={() => setSelectedPatient(null)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
                  <X className="h-5 w-5 text-slate-500" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Ward", value: selectedPatient.ward },
                    { label: "Bed", value: selectedPatient.bed },
                    { label: "Diet Type", value: selectedPatient.dietType },
                    { label: "Physician", value: selectedPatient.physician },
                    { label: "Target kcal", value: selectedPatient.targetCalories ? `${selectedPatient.targetCalories} kcal` : "—" },
                    { label: "Last Updated", value: selectedPatient.lastUpdated },
                  ].map(({ label, value }) => (
                    <div key={label} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-white mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-green-50 dark:bg-green-950/40 rounded-xl border border-green-100 dark:border-green-800">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide">Order Status</p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-white mt-0.5">
                      {(statusConfig[selectedPatient.status] || statusConfig.pending).label}
                    </p>
                  </div>
                  <div className="p-3 bg-green-50 dark:bg-green-950/40 rounded-xl border border-green-100 dark:border-green-800">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide">Priority</p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-white mt-0.5">{selectedPatient.priority}</p>
                  </div>
                </div>

                {selectedPatient.allergies.length > 0 && (
                  <div className="p-4 bg-red-50 dark:bg-red-950/40 rounded-xl border border-red-200 dark:border-red-800">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <p className="text-xs font-bold text-red-700 dark:text-red-300">ALLERGEN ALERT</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedPatient.allergies.map((a) => (
                        <Badge key={a} className="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 border-0 font-semibold">{a}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Dietary Restrictions</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {selectedPatient.restrictions || "No restrictions recorded on the current order."}
                  </p>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Meal intake & trends</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Not recorded yet — per-meal consumption, macros and 7-day compliance have no data source (dataAvailable: false).
                  </p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <DietaryAIAssistant />
    </>
  );
};


// ─── Exported page ─────────────────────────────────────────────────────────────

export const DietaryMonitoring = () => (
  <DeptStaffLayout
    deptKey="dietary"
    deptName="Dietary Services"
    badgeLabel="DIETARY"
    loginPath="/dietary/login"
    DeptIcon={Utensils}
    navSections={dietaryNav}
    title="Patient Monitoring"
    subtitle="Diet orders, allergies & nutrition flags"
  >
    <DietaryMonitoringContent />
  </DeptStaffLayout>
);
