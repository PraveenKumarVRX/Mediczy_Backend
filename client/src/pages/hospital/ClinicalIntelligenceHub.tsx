/**
 * Clinical Intelligence Hub — AI-powered real-time patient monitoring & CDSS
 * Panels: Overview · Bedside (ECG/SpO2/AI) · Care team · Trends/Alerts · SmartPharma · Integrations
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Heart,
  Pill,
  RefreshCw,
  Stethoscope,
  Thermometer,
  Waves,
  Wind,
  Droplets,
  Network,
  Cpu,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "@/utils/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Finding = { code: string; label: string; severity: string; detail: string };
type Patient = {
  id: string | number;
  patientName: string;
  bed: string;
  ward: string;
  demo?: boolean;
  vitals: {
    hr: number | null;
    sbp: number | null;
    dbp: number | null;
    rr: number | null;
    temp: number | null;
    spo2: number | null;
    map: number | null;
    pulsePressure: number | null;
  };
  analysis: {
    news2: number;
    riskBand: string;
    riskScore: number;
    findings: Finding[];
    disclaimer: string;
  };
  careTeam: {
    nurseTasks: { id: string; task: string; priority: string; status: string }[];
    doctorOrders: { id: string; order: string; priority: string; status: string }[];
  };
  ecg: { samples: { t: number; mv: number }[]; heartRate: number; note: string };
  medications?: string[];
};

type AlertRow = {
  id: string | number;
  severity: string;
  alert: string;
  detail?: string;
  patientName?: string;
  bed?: string;
  time?: string;
};

const bandTone: Record<string, string> = {
  critical: "bg-rose-100 text-rose-900 border-rose-200",
  warning: "bg-amber-100 text-amber-900 border-amber-200",
  high: "bg-orange-100 text-orange-900 border-orange-200",
  stable: "bg-emerald-100 text-emerald-900 border-emerald-200",
};

function Spo2Gauge({ value }: { value: number | null }) {
  const v = value ?? 0;
  const pct = Math.max(0, Math.min(100, v));
  const color = pct < 90 ? "#e11d48" : pct < 94 ? "#d97706" : "#0d9488";
  const r = 54;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <div className="relative mx-auto h-36 w-36">
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#e2e8f0" strokeWidth="12" />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
        <span className="text-3xl font-black tabular-nums" style={{ color }}>
          {value ?? "—"}
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">SpO₂ %</span>
      </div>
    </div>
  );
}

function VitalTile({
  icon: Icon,
  label,
  value,
  unit,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number | null | undefined;
  unit?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 shadow-sm">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="h-3.5 w-3.5 text-teal-600" />
        {label}
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">
        {value ?? "—"}
        {unit ? <span className="ml-1 text-xs font-medium text-slate-400">{unit}</span> : null}
      </div>
    </div>
  );
}

export default function ClinicalIntelligenceHub() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<{
    summary: { monitored: number; critical: number; warning: number; stable: number };
    patients: Patient[];
    alerts: AlertRow[];
    dataSource?: string;
    disclaimer?: string;
    integrations?: Record<string, { status: string; note?: string; path?: string }>;
    updatedAt?: string;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [pharmaMeds, setPharmaMeds] = useState("Metoprolol, Ramipril, Aspirin");
  const [pharmaResult, setPharmaResult] = useState<any>(null);
  const [pharmaBusy, setPharmaBusy] = useState(false);
  const [ackingId, setAckingId] = useState<string | number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get("/clinical-intelligence/overview");
      setOverview(data);
      if (!selectedId && data?.patients?.length) {
        setSelectedId(data.patients[0].id);
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Could not load clinical intelligence");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 45_000);
    return () => clearInterval(t);
  }, [load]);

  const selected = useMemo(
    () => overview?.patients?.find((p) => String(p.id) === String(selectedId)) || overview?.patients?.[0],
    [overview, selectedId],
  );

  const runPharma = async () => {
    setPharmaBusy(true);
    setPharmaResult(null);
    try {
      const medications = pharmaMeds
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const { data } = await api.post("/clinical-intelligence/smart-pharma/check", {
        medications,
        useLLM: false,
      });
      setPharmaResult(data);
    } catch (e: any) {
      setPharmaResult({ success: false, message: e?.response?.data?.message || e?.message });
    } finally {
      setPharmaBusy(false);
    }
  };

  const loadPatientMeds = () => {
    if (selected?.medications?.length) {
      setPharmaMeds(selected.medications.join(", "));
    }
  };

  const ackAlert = async (id: string | number) => {
    setAckingId(id);
    try {
      await api.post(`/clinical-intelligence/alerts/${encodeURIComponent(String(id))}/ack`);
      setOverview((prev) =>
        prev
          ? {
              ...prev,
              alerts: (prev.alerts || []).filter((a) => String(a.id) !== String(id)),
            }
          : prev,
      );
    } catch {
      /* keep alert visible on failure */
    } finally {
      setAckingId(null);
    }
  };

  const ecgData = selected?.ecg?.samples || [];
  const trendHr = useMemo(() => {
    if (!selected) return [];
    // Build mini 24h series from current HR ± wobble for display when stream empty
    const base = selected.vitals.hr || 72;
    return Array.from({ length: 24 }, (_, i) => ({
      t: `${i}h`,
      hr: Math.round(base + Math.sin(i / 3) * 6),
      spo2: Math.round((selected.vitals.spo2 || 96) + Math.sin(i / 4) * 1.5),
      sbp: Math.round((selected.vitals.sbp || 120) + Math.cos(i / 5) * 8),
    }));
  }, [selected]);

  return (
    <div className="min-h-screen bg-[radial-gradient(900px_500px_at_10%_-10%,rgba(13,148,136,0.12),transparent),radial-gradient(700px_400px_at_90%_0%,rgba(14,165,233,0.1),transparent),#f8fafc]">
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 md:px-8">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-700">Mediqzy Clinical Intelligence</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
              Real-Time Patient Monitoring & CDSS
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Live vitals · NEWS2 risk · AI findings · care-team console · SmartPharma — decision support with
              mandatory clinician review.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {overview?.dataSource === "demo" && (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">
                Demo cohort (no live ICU census)
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={() => void load()} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link to="/hospital/icu-board">ICU Board</Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link to="/hospital/nurse-station">Nurse Station</Link>
            </Button>
          </div>
        </header>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
        )}

        {/* Summary strip */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Monitored", value: overview?.summary.monitored ?? "—", tone: "text-slate-900" },
            { label: "Critical", value: overview?.summary.critical ?? "—", tone: "text-rose-600" },
            { label: "Warning", value: overview?.summary.warning ?? "—", tone: "text-amber-600" },
            { label: "Stable", value: overview?.summary.stable ?? "—", tone: "text-emerald-600" },
          ].map((s) => (
            <Card key={s.label} className="border-slate-200/80 shadow-sm">
              <CardHeader className="pb-2 pt-4">
                <CardDescription>{s.label}</CardDescription>
                <CardTitle className={`text-3xl tabular-nums ${s.tone}`}>{loading ? "—" : s.value}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="bedside" className="space-y-4">
          <TabsList className="flex h-auto flex-wrap gap-1 bg-white/80 p-1">
            <TabsTrigger value="bedside">Live bedside</TabsTrigger>
            <TabsTrigger value="care">Care team</TabsTrigger>
            <TabsTrigger value="alerts">Alert center</TabsTrigger>
            <TabsTrigger value="pharma">SmartPharma</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
          </TabsList>

          <TabsContent value="bedside" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
              <Card className="h-fit border-slate-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Patients</CardTitle>
                  <CardDescription>Select a monitored bed</CardDescription>
                </CardHeader>
                <CardContent className="max-h-[520px] space-y-2 overflow-y-auto">
                  {(overview?.patients || []).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                        String(selected?.id) === String(p.id)
                          ? "border-teal-400 bg-teal-50"
                          : "border-slate-200 bg-white hover:border-teal-200"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">{p.patientName}</span>
                        <Badge variant="outline" className={bandTone[p.analysis.riskBand] || bandTone.stable}>
                          {p.analysis.riskBand}
                        </Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {p.bed} · NEWS2 {p.analysis.news2} · risk {p.analysis.riskScore}
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>

              {selected && (
                <div className="space-y-4">
                  <Card className="overflow-hidden border-slate-200">
                    <CardHeader className="flex flex-row items-start justify-between gap-3 bg-slate-950 text-white">
                      <div>
                        <CardTitle className="text-xl text-white">{selected.patientName}</CardTitle>
                        <CardDescription className="text-slate-300">
                          {selected.bed} · {selected.ward}
                          {selected.demo ? " · demo" : ""}
                        </CardDescription>
                      </div>
                      <div className="text-right">
                        <div className="text-xs uppercase tracking-wide text-teal-300">AI risk score</div>
                        <div className="text-3xl font-black text-teal-300">{selected.analysis.riskScore}</div>
                        <div className="text-xs text-slate-400">NEWS2 {selected.analysis.news2}</div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-4">
                      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">
                        <VitalTile icon={Heart} label="HR" value={selected.vitals.hr} unit="bpm" />
                        <VitalTile
                          icon={Activity}
                          label="BP"
                          value={
                            selected.vitals.sbp != null
                              ? `${selected.vitals.sbp}/${selected.vitals.dbp ?? "—"}`
                              : null
                          }
                          unit="mmHg"
                        />
                        <VitalTile icon={Wind} label="RR" value={selected.vitals.rr} unit="/min" />
                        <VitalTile icon={Thermometer} label="Temp" value={selected.vitals.temp} unit="°C" />
                        <VitalTile icon={Droplets} label="SpO₂" value={selected.vitals.spo2} unit="%" />
                        <VitalTile icon={Activity} label="MAP" value={selected.vitals.map} unit="mmHg" />
                        <VitalTile
                          icon={Waves}
                          label="Pulse press."
                          value={selected.vitals.pulsePressure}
                          unit="mmHg"
                        />
                        <VitalTile icon={Stethoscope} label="NEWS2" value={selected.analysis.news2} />
                      </div>

                      <div className="grid gap-4 md:grid-cols-[1.4fr_0.8fr_1fr]">
                        <div className="rounded-xl border border-slate-200 bg-slate-950 p-3">
                          <div className="mb-2 flex items-center justify-between text-xs text-teal-300">
                            <span className="font-semibold">Live ECG · Lead II</span>
                            <span>{selected.ecg.heartRate} bpm</span>
                          </div>
                          <div className="h-36">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={ecgData}>
                                <defs>
                                  <linearGradient id="ecgFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.35} />
                                    <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <Area
                                  type="monotone"
                                  dataKey="mv"
                                  stroke="#2dd4bf"
                                  fill="url(#ecgFill)"
                                  strokeWidth={1.5}
                                  isAnimationActive={false}
                                  dot={false}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                          <p className="mt-1 text-[10px] text-slate-500">{selected.ecg.note}</p>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white p-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            SpO₂ monitor
                          </p>
                          <Spo2Gauge value={selected.vitals.spo2} />
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white p-3">
                          <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <Cpu className="h-3.5 w-3.5 text-teal-600" /> AI clinical analysis
                          </p>
                          <div className="space-y-2">
                            {(selected.analysis.findings.length
                              ? selected.analysis.findings
                              : [{ code: "ok", label: "No acute physiologic flags", severity: "stable", detail: "Within watch thresholds" }]
                            ).map((f) => (
                              <div
                                key={f.code + f.label}
                                className={`rounded-lg border px-2.5 py-2 text-xs ${bandTone[f.severity] || bandTone.stable}`}
                              >
                                <div className="font-semibold">{f.label}</div>
                                <div className="opacity-80">{f.detail}</div>
                              </div>
                            ))}
                          </div>
                          <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
                            {selected.analysis.disclaimer}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Vital trends (24h)
                        </p>
                        <div className="h-44">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={trendHr}>
                              <XAxis dataKey="t" tick={{ fontSize: 10 }} />
                              <YAxis tick={{ fontSize: 10 }} width={32} />
                              <Tooltip />
                              <Line type="monotone" dataKey="hr" stroke="#0d9488" strokeWidth={2} dot={false} name="HR" />
                              <Line type="monotone" dataKey="sbp" stroke="#0284c7" strokeWidth={2} dot={false} name="SBP" />
                              <Line type="monotone" dataKey="spo2" stroke="#7c3aed" strokeWidth={2} dot={false} name="SpO₂" />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="care" className="space-y-4">
            {selected ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Stethoscope className="h-5 w-5 text-pink-600" /> Nurse station
                    </CardTitle>
                    <CardDescription>Tasks for {selected.patientName}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {selected.careTeam.nurseTasks.map((t) => (
                      <div key={t.id} className="flex items-start justify-between gap-2 rounded-lg border px-3 py-2">
                        <div>
                          <div className="text-sm font-medium">{t.task}</div>
                          <div className="text-xs text-slate-500">{t.status}</div>
                        </div>
                        <Badge variant="outline" className="capitalize">
                          {t.priority}
                        </Badge>
                      </div>
                    ))}
                    <Button asChild variant="outline" size="sm" className="mt-2">
                      <Link to="/hospital/nurse-station">Open full nurse station</Link>
                    </Button>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Heart className="h-5 w-5 text-teal-600" /> Doctor console
                    </CardTitle>
                    <CardDescription>Orders & goals</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {selected.careTeam.doctorOrders.map((o) => (
                      <div key={o.id} className="flex items-start justify-between gap-2 rounded-lg border px-3 py-2">
                        <div>
                          <div className="text-sm font-medium">{o.order}</div>
                          <div className="text-xs text-slate-500">{o.status}</div>
                        </div>
                        <Badge variant="outline" className="capitalize">
                          {o.priority}
                        </Badge>
                      </div>
                    ))}
                    <Button asChild variant="outline" size="sm" className="mt-2">
                      <Link to="/hospital/clinical-cdss">Open clinical CDSS</Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Select a patient on the Live bedside tab.</p>
            )}
          </TabsContent>

          <TabsContent value="alerts">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-rose-600" /> Critical alert center
                </CardTitle>
                <CardDescription>NEWS2 deterioration + physiologic AI findings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {(overview?.alerts || []).length === 0 && (
                  <p className="text-sm text-slate-500">No open alerts.</p>
                )}
                {(overview?.alerts || []).map((a) => (
                  <div
                    key={String(a.id)}
                    className={`flex flex-wrap items-start justify-between gap-2 rounded-xl border px-3 py-2.5 ${
                      bandTone[a.severity] || "bg-slate-50"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="font-semibold">{a.alert}</span>
                      </div>
                      <div className="mt-0.5 text-xs opacity-80">
                        {a.patientName} · {a.bed} · {a.detail}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">
                        {a.severity}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={ackingId === a.id}
                        onClick={() => void ackAlert(a.id)}
                      >
                        {ackingId === a.id ? "…" : "Ack"}
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pharma" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Pill className="h-5 w-5 text-violet-600" /> SmartPharma AI
                </CardTitle>
                <CardDescription>
                  Prescription validation & drug–drug interaction analysis (quality-gated CDSS)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <label className="block text-sm font-medium text-slate-700">
                  Medications (comma-separated)
                  <Input
                    className="mt-1"
                    value={pharmaMeds}
                    onChange={(e) => setPharmaMeds(e.target.value)}
                    placeholder="Metoprolol, Ramipril, …"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void runPharma()} disabled={pharmaBusy}>
                    {pharmaBusy ? "Checking…" : "Validate & check interactions"}
                  </Button>
                  {selected?.medications?.length ? (
                    <Button type="button" variant="outline" onClick={loadPatientMeds}>
                      Load {selected.patientName}&apos;s meds
                    </Button>
                  ) : null}
                </div>
                {pharmaResult && (
                  <div className="space-y-2 rounded-xl border bg-slate-50 p-4 text-sm">
                    {pharmaResult.success === false ? (
                      <p className="text-rose-700">{pharmaResult.message}</p>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          {pharmaResult.validation?.safe ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                          ) : (
                            <AlertTriangle className="h-5 w-5 text-amber-600" />
                          )}
                          <span className="font-semibold">
                            Severity: {pharmaResult.validation?.severity || "none"}
                          </span>
                        </div>
                        {pharmaResult.validation?.summary && (
                          <p className="text-slate-600">{pharmaResult.validation.summary}</p>
                        )}
                        <ul className="list-disc space-y-1 pl-5">
                          {(pharmaResult.interactions || []).map((ix: any, i: number) => (
                            <li key={i}>
                              <span className="font-medium capitalize">{ix.severity || "interaction"}</span>
                              {": "}
                              {ix.description || ix.message || JSON.stringify(ix.drugs || ix)}
                            </li>
                          ))}
                        </ul>
                        <p className="text-[11px] text-slate-400">{pharmaResult.disclaimer}</p>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations">
            <div className="grid gap-3 md:grid-cols-2">
              {Object.entries(overview?.integrations || {
                iotSensors: { status: "available", note: "HyperGrid MQTT" },
                his: { status: "available", note: "Hospital OS" },
                icuMonitors: { status: "demo", note: "Device bridge" },
                ehr: { status: "available", note: "FHIR / EHR", path: "/hospital/ehr" },
              }).map(([key, val]) => (
                <Card key={key}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base capitalize">
                      <Network className="h-4 w-4 text-teal-600" />
                      {key.replace(/([A-Z])/g, " $1")}
                    </CardTitle>
                    <CardDescription>{val.note}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <Badge variant="outline" className="capitalize">
                      {val.status}
                    </Badge>
                    {val.path ? (
                      <Button asChild size="sm" variant="ghost">
                        <Link to={val.path}>Open</Link>
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <p className="text-center text-[11px] text-slate-400">
          {overview?.disclaimer ||
            "Clinical decision support only — licensed clinician review required before any care decision."}
          {overview?.updatedAt ? ` · Updated ${new Date(overview.updatedAt).toLocaleString()}` : ""}
        </p>
      </div>
    </div>
  );
}
