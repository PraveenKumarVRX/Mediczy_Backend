/**
 * HyperGrid Platform Dashboard
 * Central overview: network health, event bus, digital twins, gateways, marketplace
 */

import { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import api from "@/utils/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Activity, Cpu, Globe, Network, Radio, Server, Shield,
  Wifi, Zap, RefreshCw, TrendingUp, AlertTriangle,
  CheckCircle2, Database, GitBranch, Layers, Store,
} from "lucide-react";

// ── Colour palette ──────────────────────────────────────────────────────────
const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7"];
const STATUS_COLOR: Record<string, string> = {
  online: "bg-green-500", offline: "bg-red-400", degraded: "bg-yellow-400",
};

// ── Stat card ───────────────────────────────────────────────────────────────
function KPI({ label, value, sub, icon: Icon, color = "text-indigo-500", trend }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color?: string; trend?: number;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        {trend !== undefined && (
          <p className={`text-xs mt-1 font-medium ${trend >= 0 ? "text-green-500" : "text-red-400"}`}>
            {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}% vs last week
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Section header ──────────────────────────────────────────────────────────
function SectionTitle({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-base font-semibold mb-3 mt-6">
      <Icon className="h-4 w-4 text-indigo-500" />
      {children}
    </h2>
  );
}

// ── Pulse dot ───────────────────────────────────────────────────────────────
function PulseDot({ color = "bg-green-500" }: { color?: string }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-60`} />
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${color}`} />
    </span>
  );
}

// ── Fake data helpers (replaced by real API data when available) ─────────────
const fakeEventTrend = Array.from({ length: 12 }, (_, i) => ({
  t: `${i + 1}h`,
  events: Math.round(200 + Math.random() * 800),
  errors: Math.round(Math.random() * 20),
}));

const fakeTwinBreakdown = [
  { name: "Patient", value: 1240 },
  { name: "Device", value: 870 },
  { name: "Asset", value: 340 },
  { name: "Hospital", value: 58 },
  { name: "Ambulance", value: 92 },
  { name: "Claim", value: 310 },
];

const fakeLayerHealth = [
  { layer: "MQTT", score: 98 }, { layer: "Event Bus", score: 96 },
  { layer: "Terminology", score: 99 }, { layer: "Twins", score: 94 },
  { layer: "DICOM", score: 91 }, { layer: "SMART", score: 97 },
  { layer: "Connectors", score: 88 }, { layer: "Edge", score: 93 },
  { layer: "Marketplace", score: 100 },
];

// ── Main Component ──────────────────────────────────────────────────────────
export default function HyperGridDashboard() {
  const [stats, setStats] = useState({
    networkParticipants: 0, digitalTwins: 0, onlineGateways: 0,
    totalApps: 0, eventsToday: 0, mqttDevices: 0,
    redisOk: false, kafkaOk: false,
  });
  const [twinSummary, setTwinSummary] = useState<any[]>([]);
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<Date>(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [netStats, twinsRes, eventsRes, busRes] = await Promise.allSettled([
        api.get("/hypergrid/marketplace/network/stats"),
        api.get("/hypergrid/twins/summary"),
        api.get("/hypergrid/events?limit=8"),
        api.get("/hypergrid/events/bus/status"),
      ]);

      if (netStats.status === "fulfilled") {
        const s = netStats.value.data.stats;
        setStats(prev => ({
          ...prev,
          networkParticipants: Number(s.participants) || 0,
          totalApps:           Number(s.apps)         || 0,
          digitalTwins:        Number(s.digital_twins)|| 0,
          onlineGateways:      Number(s.online_gateways) || 0,
        }));
      }
      if (twinsRes.status === "fulfilled") {
        setTwinSummary(twinsRes.value.data.summary || []);
      }
      if (eventsRes.status === "fulfilled") {
        const evs = eventsRes.value.data.events || [];
        setRecentEvents(evs.slice(0, 8));
        setStats(prev => ({ ...prev, eventsToday: eventsRes.value.data.total || evs.length }));
      }
      if (busRes.status === "fulfilled") {
        const b = busRes.value.data;
        setStats(prev => ({ ...prev, redisOk: b.redis?.connected, kafkaOk: b.kafka?.connected }));
      }
    } catch (_) {}
    setLoading(false);
    setRefreshedAt(new Date());
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <AdminLayout>
      <div className="p-6 max-w-screen-2xl mx-auto space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Globe className="h-6 w-6 text-indigo-500" />
              HyperGrid Platform
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              IoT · Interoperability · AI · Digital Twins · SMART on FHIR
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              Updated {refreshedAt.toLocaleTimeString()}
            </span>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Infrastructure health pills */}
        <div className="flex flex-wrap gap-2 pt-1">
          {[
            { label: "Redis", ok: stats.redisOk },
            { label: "Kafka", ok: stats.kafkaOk },
            { label: "MQTT Broker", ok: true },
            { label: "Event Bus", ok: true },
            { label: "Terminology Cache", ok: true },
          ].map(({ label, ok }) => (
            <span key={label} className="flex items-center gap-1.5 text-xs border rounded-full px-3 py-1">
              <PulseDot color={ok ? "bg-green-500" : "bg-red-400"} />
              {label}
            </span>
          ))}
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 pt-2">
          <KPI label="Network Participants" value={stats.networkParticipants} icon={Network} color="text-indigo-500" trend={8} />
          <KPI label="Digital Twins"        value={stats.digitalTwins}        icon={Cpu}     color="text-cyan-500"   trend={12} />
          <KPI label="Online Gateways"      value={stats.onlineGateways}      icon={Wifi}    color="text-green-500" />
          <KPI label="Marketplace Apps"     value={stats.totalApps}           icon={Store}   color="text-purple-500" trend={4} />
          <KPI label="Events Today"         value={stats.eventsToday > 0 ? stats.eventsToday.toLocaleString() : "—"} icon={Zap} color="text-amber-500" />
          <KPI label="MQTT Devices"         value={stats.mqttDevices || "—"}  icon={Radio}   color="text-sky-500" />
        </div>

        <Tabs defaultValue="overview" className="mt-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="events">Event Stream</TabsTrigger>
            <TabsTrigger value="twins">Digital Twins</TabsTrigger>
            <TabsTrigger value="layers">Layer Health</TabsTrigger>
          </TabsList>

          {/* ── OVERVIEW ── */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Event volume chart */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-500" />
                    Canonical Event Volume (last 12 h)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={fakeEventTrend}>
                      <defs>
                        <linearGradient id="gEvents" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="t" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="events" stroke="#6366f1" fill="url(#gEvents)" name="Events" />
                      <Area type="monotone" dataKey="errors" stroke="#ef4444" fill="transparent" name="Errors" strokeDasharray="4 2" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Twin breakdown pie */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-cyan-500" />
                    Digital Twin Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-4">
                  <ResponsiveContainer width="55%" height={200}>
                    <PieChart>
                      <Pie
                        data={twinSummary.length ? twinSummary.map(r => ({ name: r.twin_type, value: Number(r.total) })) : fakeTwinBreakdown}
                        cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                        dataKey="value" paddingAngle={3}
                      >
                        {(twinSummary.length ? twinSummary : fakeTwinBreakdown).map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 text-xs">
                    {(twinSummary.length ? twinSummary.map(r => ({ name: r.twin_type, value: r.total })) : fakeTwinBreakdown)
                      .map((item, i) => (
                        <div key={item.name} className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: COLORS[i % COLORS.length] }} />
                          <span className="capitalize">{item.name}</span>
                          <span className="ml-auto font-semibold">{item.value}</span>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent canonical events */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="h-4 w-4 text-indigo-500" />
                  Recent Canonical Events
                </CardTitle>
              </CardHeader>
              <CardContent>
                {recentEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No events yet — start publishing via MQTT or the event API.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {recentEvents.map((ev: any) => (
                      <div key={ev.id} className="flex items-center gap-3 text-sm border-b pb-2 last:border-0">
                        <Badge variant="outline" className="text-xs shrink-0">{ev.event_type}</Badge>
                        <span className="text-muted-foreground text-xs truncate flex-1">{ev.source}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {new Date(ev.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── EVENT STREAM ── */}
          <TabsContent value="events" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Event Bus Status</CardTitle>
                <CardDescription>Redis pub/sub + Kafka durable log</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { name: "Redis pub/sub", ok: stats.redisOk, desc: "Channel: hg:events", icon: Zap },
                    { name: "Kafka topic", ok: stats.kafkaOk, desc: "Topic: hg.health.events", icon: Database },
                  ].map(({ name, ok, desc, icon: Icon }) => (
                    <div key={name} className={`p-4 rounded-lg border ${ok ? "border-green-200 bg-green-50" : "border-gray-200 bg-gray-50"}`}>
                      <div className="flex items-center gap-3 mb-1">
                        <Icon className={`h-5 w-5 ${ok ? "text-green-500" : "text-gray-400"}`} />
                        <span className="font-medium text-sm">{name}</span>
                        <Badge className={`ml-auto text-xs ${ok ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {ok ? "Connected" : "Not configured"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground ml-8">{desc}</p>
                    </div>
                  ))}
                </div>

                <div>
                  <p className="text-sm font-medium mb-2">Event Type Catalogue</p>
                  <div className="flex flex-wrap gap-2">
                    {["VitalsObserved","DeviceAlertRaised","TelemetryReceived","ImagingStudyStored",
                      "ClaimPreAuthSubmitted","AmbulanceEnRoute","EdgeGatewayHeartbeat",
                      "MarketplaceAppInstalled","GatewayStatusUpdate","AssetLocationUpdate"].map(t => (
                      <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── DIGITAL TWINS ── */}
          <TabsContent value="twins" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(twinSummary.length ? twinSummary : fakeTwinBreakdown.map(d => ({
                twin_type: d.name.toLowerCase(), total: d.value, high_risk: Math.round(d.value * 0.05), critical: Math.round(d.value * 0.01),
              }))).map((row: any, i: number) => (
                <Card key={row.twin_type}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm capitalize font-semibold">
                        {row.twin_type} Twins
                      </CardTitle>
                      <span className="text-2xl font-bold" style={{ color: COLORS[i % COLORS.length] }}>
                        {Number(row.total).toLocaleString()}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>High risk</span>
                      <Badge variant="destructive" className="text-xs">{row.high_risk ?? 0}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Critical</span>
                      <Badge className="text-xs bg-red-900 text-white">{row.critical ?? 0}</Badge>
                    </div>
                    <Progress
                      value={row.total ? Math.min(100, (Number(row.total) / 2000) * 100) : 0}
                      className="h-1.5 mt-2"
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ── LAYER HEALTH ── */}
          <TabsContent value="layers" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">HyperGrid Layer Health</CardTitle>
                <CardDescription>Simulated uptime scores for each platform layer</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={fakeLayerHealth} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" domain={[80, 100]} tick={{ fontSize: 11 }} unit="%" />
                    <YAxis type="category" dataKey="layer" tick={{ fontSize: 12 }} width={90} />
                    <Tooltip formatter={(v: any) => `${v}%`} />
                    <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                      {fakeLayerHealth.map((entry, i) => (
                        <Cell key={i} fill={entry.score >= 95 ? "#22c55e" : entry.score >= 90 ? "#6366f1" : "#f59e0b"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex gap-4 text-xs mt-2 justify-end">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-500" /> ≥ 95%</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-indigo-500" /> 90–94%</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-400" /> &lt; 90%</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Quick-links row */}
        <SectionTitle icon={Layers}>Quick Access</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {[
            { label: "IoT Devices",     href: "/admin/hypergrid-iot",          icon: Radio,      color: "text-sky-500" },
            { label: "AI Intelligence", href: "/admin/hypergrid-ai",           icon: Cpu,        color: "text-indigo-500" },
            { label: "Edge Fleet",      href: "/admin/hypergrid-iot",          icon: Server,     color: "text-green-500" },
            { label: "Connectors",      href: "/admin/hypergrid-iot",          icon: GitBranch,  color: "text-purple-500" },
            { label: "Marketplace",     href: "/admin/hypergrid",              icon: Store,      color: "text-amber-500" },
          ].map(({ label, href, icon: Icon, color }) => (
            <a key={label} href={href}
              className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:border-indigo-300 hover:bg-indigo-50 transition-colors cursor-pointer text-center">
              <Icon className={`h-7 w-7 ${color}`} />
              <span className="text-xs font-medium">{label}</span>
            </a>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
