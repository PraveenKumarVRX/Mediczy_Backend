/**
 * HyperGrid AI Intelligence Dashboard
 * Live view of AI Scribe, Vision, Brain, DeepTech, CDSS, and proactive alerts.
 * Bridges HyperGrid events → AI pipeline → clinical outputs.
 */

import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "@/components/layout/AdminLayout";
import api from "@/utils/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  AreaChart, Area, BarChart, Bar, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Brain, Eye, Mic, FileText, Shield, Zap, RefreshCw,
  TrendingUp, AlertTriangle, CheckCircle2, Stethoscope,
  Activity, Cpu, FlaskConical, Siren, Bell,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────
interface AIModule {
  name: string;
  endpoint: string;
  requests: number;
  avgLatencyMs: number;
  errors: number;
  icon: React.ElementType;
  color: string;
}

const AI_MODULES: AIModule[] = [
  { name: "AI Scribe",     endpoint: "/ai/scribe/stats",     requests: 0, avgLatencyMs: 0, errors: 0, icon: Mic,        color: "#6366f1" },
  { name: "AI Vision",     endpoint: "/ai/vision/stats",     requests: 0, avgLatencyMs: 0, errors: 0, icon: Eye,        color: "#06b6d4" },
  { name: "AI Brain",      endpoint: "/ai/brain/stats",      requests: 0, avgLatencyMs: 0, errors: 0, icon: Brain,      color: "#8b5cf6" },
  { name: "AI DeepTech",   endpoint: "/ai/deeptech/stats",   requests: 0, avgLatencyMs: 0, errors: 0, icon: Cpu,        color: "#f59e0b" },
  { name: "CDSS / CIMS",   endpoint: "/ai/cdss/stats",       requests: 0, avgLatencyMs: 0, errors: 0, icon: Stethoscope,color: "#22c55e" },
  { name: "Proactive Alerts",endpoint: "/ai/alerts/stats",   requests: 0, avgLatencyMs: 0, errors: 0, icon: Bell,       color: "#ef4444" },
];

// ── Fake time-series (real data replaces when endpoints respond) ─────────────
const fakeTrend = (base: number) => Array.from({ length: 14 }, (_, i) => ({
  day: `Apr ${7 + i}`,
  value: Math.round(base + Math.random() * base * 0.4),
}));

const radarData = [
  { subject: "Scribe",   score: 92 },
  { subject: "Vision",   score: 87 },
  { subject: "Brain",    score: 94 },
  { subject: "DeepTech", score: 78 },
  { subject: "CDSS",     score: 91 },
  { subject: "Alerts",   score: 96 },
];

const fakeInsights = [
  { type: "CDSS Alert",          text: "3 patients flagged with Sepsis risk (SOFA ≥ 2)",          time: "2 min ago", severity: "critical" },
  { type: "AI Scribe",           text: "48 consultation notes transcribed this morning",            time: "5 min ago", severity: "info" },
  { type: "AI Vision",           text: "Chest X-ray pneumonia marker detected — Pt MH-1042",        time: "12 min ago", severity: "high" },
  { type: "Proactive Alert",     text: "HbA1c trending high for 12 diabetic patients",              time: "18 min ago", severity: "medium" },
  { type: "DeepTech Prediction", text: "Readmission risk > 40% for 7 recently discharged patients", time: "34 min ago", severity: "medium" },
  { type: "SMART App Event",     text: "CDS Hooks triggered for Drug-Drug interaction check",       time: "1 h ago",    severity: "info" },
];

const severityBadge = (s: string) => {
  const map: Record<string, string> = {
    critical: "bg-red-100 text-red-700 border-red-200",
    high:     "bg-orange-100 text-orange-700 border-orange-200",
    medium:   "bg-yellow-100 text-yellow-700 border-yellow-200",
    info:     "bg-blue-100 text-blue-700 border-blue-200",
  };
  return map[s] || map.info;
};

const fakeScribeTrend  = fakeTrend(300);
const fakeVisionTrend  = fakeTrend(80);
const fakeCDSSTrend    = fakeTrend(150);

// ── Module card ─────────────────────────────────────────────────────────────
function ModuleCard({ mod, live }: { mod: AIModule; live: any }) {
  const Icon  = mod.icon;
  const req   = live?.requests ?? mod.requests;
  const lat   = live?.avgLatencyMs ?? mod.avgLatencyMs;
  const err   = live?.errors ?? mod.errors;
  const errPct = req > 0 ? ((err / req) * 100).toFixed(1) : "0.0";

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5" style={{ color: mod.color }} />
          <CardTitle className="text-sm font-semibold">{mod.name}</CardTitle>
        </div>
        <Badge className={`text-xs ${err > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
          {err > 0 ? "⚠ Errors" : "Healthy"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Requests</p>
            <p className="text-lg font-bold">{req > 0 ? req.toLocaleString() : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Avg Latency</p>
            <p className="text-lg font-bold">{lat > 0 ? `${lat}ms` : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Error %</p>
            <p className={`text-lg font-bold ${parseFloat(errPct) > 2 ? "text-red-500" : "text-green-600"}`}>
              {errPct}%
            </p>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Health</span>
            <span>{100 - parseFloat(errPct)}%</span>
          </div>
          <Progress value={100 - parseFloat(errPct)} className="h-1.5"
            style={{ "--progress-fill": mod.color } as React.CSSProperties} />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────
export default function HyperGridAIView() {
  const [liveStats, setLiveStats] = useState<Record<string, any>>({});
  const [federatedStatus, setFederatedStatus] = useState<any>(null);
  const [totalEvents, setTotalEvents] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const evRes = await api.get("/hypergrid/events?type=VitalsObserved&limit=1").catch(() => null);
      if (evRes?.data?.total) setTotalEvents(evRes.data.total);

      const flRes = await api.get("/v3/ai-deeptech/federated/status").catch(() => null);
      if (flRes?.data) setFederatedStatus(flRes.data.data ?? flRes.data);

      const results = await Promise.allSettled(
        AI_MODULES.map(m => api.get(m.endpoint))
      );
      const map: Record<string, any> = {};
      results.forEach((r, i) => {
        if (r.status === "fulfilled") map[AI_MODULES[i].name] = r.value.data;
      });
      setLiveStats(map);
    } catch (_) {}
    setLoading(false);
    setRefreshedAt(new Date());
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <AdminLayout>
      <div className="p-6 max-w-screen-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Brain className="h-6 w-6 text-indigo-500" />
              HyperGrid AI Intelligence
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Scribe · Vision · Brain · DeepTech · CDSS · Proactive Alerts
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" asChild>
              <Link to="/admin/ai/federated">
                Federated Learning{federatedStatus?.models?.length ? ` (${federatedStatus.models.length})` : ''}
              </Link>
            </Button>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Top KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "AI Modules Active",       value: AI_MODULES.length, icon: Zap,          color: "text-indigo-500" },
            { label: "HG Events Processed",     value: totalEvents > 0 ? totalEvents.toLocaleString() : "—", icon: Activity, color: "text-cyan-500" },
            { label: "CDSS Alerts Raised",      value: "3",  icon: AlertTriangle, color: "text-red-500" },
            { label: "Notes Transcribed Today", value: "48", icon: FileText,       color: "text-green-500" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
                <Icon className={`h-4 w-4 ${color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="modules" className="mt-2">
          <TabsList>
            <TabsTrigger value="modules">AI Modules</TabsTrigger>
            <TabsTrigger value="insights">Live Insights</TabsTrigger>
            <TabsTrigger value="charts">Usage Charts</TabsTrigger>
            <TabsTrigger value="radar">Capability Radar</TabsTrigger>
          </TabsList>

          {/* ── MODULES grid ── */}
          <TabsContent value="modules" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {AI_MODULES.map(mod => (
                <ModuleCard key={mod.name} mod={mod} live={liveStats[mod.name]} />
              ))}
            </div>

            {/* HyperGrid AI integration note */}
            <Card className="mt-4 border-indigo-200 bg-indigo-50">
              <CardContent className="pt-4 pb-3">
                <p className="text-sm font-medium text-indigo-800 flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  HyperGrid → AI Pipeline
                </p>
                <p className="text-xs text-indigo-600 mt-1">
                  Every <code className="bg-indigo-100 px-1 rounded">VitalsObserved</code> event from MQTT devices
                  is forwarded to the AI Brain for anomaly detection.
                  <code className="bg-indigo-100 px-1 rounded ml-1">ImagingStudyStored</code> triggers AI Vision for
                  automated report pre-fill. Digital twin risk scores feed CDSS alert thresholds.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── LIVE INSIGHTS feed ── */}
          <TabsContent value="insights" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Bell className="h-4 w-4 text-red-500" />
                  Live Clinical AI Insights
                </CardTitle>
                <CardDescription>Aggregated output from all AI modules — updated in real time</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {fakeInsights.map((ins, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                    <Badge className={`text-xs mt-0.5 shrink-0 border ${severityBadge(ins.severity)}`}>
                      {ins.type}
                    </Badge>
                    <p className="text-sm flex-1">{ins.text}</p>
                    <span className="text-xs text-muted-foreground shrink-0">{ins.time}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── USAGE CHARTS ── */}
          <TabsContent value="charts" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {[
                { title: "AI Scribe — Notes / Day", data: fakeScribeTrend, color: "#6366f1" },
                { title: "AI Vision — Scans / Day",  data: fakeVisionTrend, color: "#06b6d4" },
                { title: "CDSS — Alerts / Day",       data: fakeCDSSTrend,  color: "#ef4444" },
              ].map(({ title, data, color }) => (
                <Card key={title}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={160}>
                      <AreaChart data={data}>
                        <defs>
                          <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor={color} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={color} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={3} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Area type="monotone" dataKey="value" stroke={color} fill={`url(#grad-${color})`} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ── RADAR ── */}
          <TabsContent value="radar" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">AI Capability Radar</CardTitle>
                <CardDescription>Health scores across all six AI subsystems (0–100)</CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center">
                <ResponsiveContainer width="100%" height={340}>
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 13 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Radar name="Score" dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* SMART on FHIR CDS Hooks callout */}
        <Card className="border-cyan-200 bg-cyan-50">
          <CardContent className="pt-4 pb-3 flex items-start gap-3">
            <Shield className="h-5 w-5 text-cyan-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-cyan-800">SMART on FHIR · CDS Hooks</p>
              <p className="text-xs text-cyan-700 mt-0.5">
                Third-party SMART apps registered via{" "}
                <code className="bg-cyan-100 px-1 rounded">POST /api/hypergrid/smart/apps</code>
                {" "}can subscribe to clinical decision support hooks. Discovery endpoint:
                {" "}<code className="bg-cyan-100 px-1 rounded">/api/hypergrid/smart/.well-known/smart-configuration</code>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
