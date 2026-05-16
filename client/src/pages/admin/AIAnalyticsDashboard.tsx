import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/utils/api";
import AdminLayout from "@/components/layout/AdminLayout";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";

// ── Color palette ──────────────────────────────────────────
const COLORS = ["#6366f1","#22c55e","#f59e0b","#ef4444","#06b6d4","#a855f7","#ec4899","#14b8a6"];
const RISK_COLORS: Record<string,string> = { low: "#22c55e", moderate: "#f59e0b", high: "#ef4444", critical: "#7f1d1d" };
const QUALITY_COLORS: Record<string,string> = {
  "Excellent (≥90%)": "#22c55e", "Good (75-89%)": "#6366f1",
  "Fair (60-74%)": "#f59e0b", "Poor (<60%)": "#ef4444",
};

// ── Helpers ────────────────────────────────────────────────
function fmtDate(d: string, period: string) {
  const dt = new Date(d);
  if (period === "24h") return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return dt.toLocaleDateString([], { month: "short", day: "numeric" });
}
function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

// ── Stat Card ──────────────────────────────────────────────
function StatCard({ title, value, subtitle, icon, color = "text-primary" }: {
  title: string; value: string | number; subtitle?: string; icon?: string; color?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {icon && <span className="text-2xl">{icon}</span>}
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${color}`}>{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

// ── Main Dashboard ─────────────────────────────────────────
export default function AIAnalyticsDashboard() {
  const [period, setPeriod] = useState("30d");
  const [activeTab, setActiveTab] = useState("overview");

  // Fetch analytics data based on active tab
  const { data: overview, isLoading: loadingOverview } = useQuery({
    queryKey: ["ai-analytics-overview", period],
    queryFn: () => api.get(`/v3/ai-analytics/overview?period=${period}`).then(r => r.data.overview),
    staleTime: 60_000,
  });

  const { data: llmOps, isLoading: loadingLlm } = useQuery({
    queryKey: ["ai-analytics-llm", period],
    queryFn: () => api.get(`/v3/ai-analytics/llm-ops?period=${period}`).then(r => r.data.llmOps),
    staleTime: 60_000,
    enabled: activeTab === "llm" || activeTab === "overview",
  });

  const { data: convos, isLoading: loadingConvos } = useQuery({
    queryKey: ["ai-analytics-convos", period],
    queryFn: () => api.get(`/v3/ai-analytics/conversations?period=${period}`).then(r => r.data.conversations),
    staleTime: 60_000,
    enabled: activeTab === "conversations",
  });

  const { data: tools, isLoading: loadingTools } = useQuery({
    queryKey: ["ai-analytics-tools", period],
    queryFn: () => api.get(`/v3/ai-analytics/tool-usage?period=${period}`).then(r => r.data.toolUsage),
    staleTime: 60_000,
    enabled: activeTab === "tools",
  });

  const { data: quality, isLoading: loadingQuality } = useQuery({
    queryKey: ["ai-analytics-quality", period],
    queryFn: () => api.get(`/v3/ai-analytics/quality?period=${period}`).then(r => r.data.quality),
    staleTime: 60_000,
    enabled: activeTab === "quality",
  });

  const { data: popHealth, isLoading: loadingHealth } = useQuery({
    queryKey: ["ai-analytics-pop-health"],
    queryFn: () => api.get(`/v3/ai-analytics/population-health`).then(r => r.data.populationHealth),
    staleTime: 120_000,
    enabled: activeTab === "health",
  });

  const { data: notifs, isLoading: loadingNotifs } = useQuery({
    queryKey: ["ai-analytics-notifs", period],
    queryFn: () => api.get(`/v3/ai-analytics/notifications?period=${period}`).then(r => r.data.notifications),
    staleTime: 60_000,
    enabled: activeTab === "notifications",
  });

  const { data: rag, isLoading: loadingRag } = useQuery({
    queryKey: ["ai-analytics-rag", period],
    queryFn: () => api.get(`/v3/ai-analytics/rag?period=${period}`).then(r => r.data.rag),
    staleTime: 60_000,
    enabled: activeTab === "rag",
  });

  const { data: staffing } = useQuery({
    queryKey: ["roadmap-staffing"],
    queryFn: () => api.get('/roadmap-intelligence/staffing/forecast').then(r => r.data.data),
    staleTime: 60_000,
  });
  const { data: rwe = [] } = useQuery({
    queryKey: ["roadmap-rwe"],
    queryFn: () => api.get('/roadmap-intelligence/rwe/aggregate').then(r => r.data.data || []),
    staleTime: 60_000,
  });
  const { data: esg = [] } = useQuery({
    queryKey: ["roadmap-esg"],
    queryFn: () => api.get('/roadmap-intelligence/esg/summary').then(r => r.data.data || []),
    staleTime: 60_000,
  });

  return (
    <AdminLayout>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Analytics</h1>
          <p className="text-muted-foreground">Comprehensive AI operations and intelligence analytics</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="llm">LLM Ops</TabsTrigger>
          <TabsTrigger value="conversations">Conversations</TabsTrigger>
          <TabsTrigger value="tools">Tool Usage</TabsTrigger>
          <TabsTrigger value="quality">Quality</TabsTrigger>
          <TabsTrigger value="health">Population Health</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="rag">RAG</TabsTrigger>
        </TabsList>

        {/* ═══════ OVERVIEW TAB ═══════ */}
        <TabsContent value="overview" className="space-y-6">
          {loadingOverview ? <LoadingSkeleton /> : overview && (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard title="Conversations" value={overview.conversations.total} subtitle={`${overview.conversations.uniqueUsers} unique users`} icon="💬" />
                <StatCard title="LLM Requests" value={fmtNum(overview.llm.totalRequests)} subtitle={`${fmtNum(overview.llm.totalTokens)} tokens`} icon="🤖" />
                <StatCard title="LLM Cost" value={`$${overview.llm.totalCost}`} subtitle={`${overview.llm.avgLatencyMs}ms avg latency`} icon="💰" color="text-green-600" />
                <StatCard title="Error Rate" value={`${overview.llm.errorRate}%`} subtitle={`${overview.llm.errors} errors`} icon="⚠️" color={overview.llm.errorRate > 5 ? "text-red-600" : "text-green-600"} />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard title="Tool Executions" value={overview.tools.totalExecutions} subtitle={`${overview.tools.successRate}% success`} icon="🔧" />
                <StatCard title="AI Quality" value={`${(overview.quality.overallScore * 100).toFixed(0)}%`} subtitle={`${overview.quality.totalScored} responses scored`} icon="⭐" color={overview.quality.overallScore >= 0.75 ? "text-green-600" : "text-amber-600"} />
                <StatCard title="Risk Patients" value={overview.healthRisk.totalPatients} subtitle={`${overview.healthRisk.distribution.high + overview.healthRisk.distribution.critical} high/critical`} icon="🏥" color={overview.healthRisk.distribution.critical > 0 ? "text-red-600" : "text-primary"} />
                <StatCard title="Notifications" value={overview.notifications.total} subtitle={`${overview.notifications.readRate}% read`} icon="🔔" />
              </div>

              <Card>
                <CardHeader><CardTitle className="text-lg">Roadmap Operations Snapshot</CardTitle><CardDescription>Phase 4 and 5 operational intelligence exposed from live services.</CardDescription></CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">Staffing forecast</p><p className="mt-1 text-2xl font-bold">{staffing?.recommendedNurses ?? '—'} nurses</p><p className="text-xs text-muted-foreground">{staffing?.projectedPatients ?? '—'} projected patients</p></div>
                  <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">RWE aggregate</p><p className="mt-1 text-2xl font-bold">{rwe.reduce((sum: number, row: any) => sum + Number(row.noisyPatientCount || 0), 0)}</p><p className="text-xs text-muted-foreground">Noisy patient count only</p></div>
                  <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">ESG emissions</p><p className="mt-1 text-2xl font-bold">{esg.reduce((sum: number, row: any) => sum + Number(row.emissions_kgco2e || 0), 0).toFixed(1)}</p><p className="text-xs text-muted-foreground">kgCO2e captured</p></div>
                </CardContent>
              </Card>

              {/* Overview Charts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Quality Radar */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Response Quality Radar</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <RadarChart data={[
                        { metric: "Relevance", score: overview.quality.avgRelevance * 100 },
                        { metric: "Coherence", score: overview.quality.avgCoherence * 100 },
                        { metric: "Accuracy", score: overview.quality.avgAccuracy * 100 },
                        { metric: "Empathy", score: overview.quality.avgEmpathy * 100 },
                      ]}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="metric" className="text-xs" />
                        <PolarRadiusAxis domain={[0, 100]} />
                        <Radar dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Risk Distribution Pie */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Health Risk Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={Object.entries(overview.healthRisk.distribution)
                            .filter(([, v]) => (v as number) > 0)
                            .map(([k, v]) => ({ name: k, value: v as number }))}
                          cx="50%" cy="50%" outerRadius={100}
                          label={({ name, value }) => `${name}: ${value}`}
                          dataKey="value"
                        >
                          {Object.entries(overview.healthRisk.distribution).map(([k], i) => (
                            <Cell key={k} fill={RISK_COLORS[k] || COLORS[i]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* LLM Token Trend (uses llm-ops data) */}
              {llmOps?.timeSeries?.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">LLM Request & Token Trends</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={llmOps.timeSeries.map((d: any) => ({ ...d, date: fmtDate(d.date, period) }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" className="text-xs" />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip />
                        <Legend />
                        <Area yAxisId="left" type="monotone" dataKey="requests" stroke="#6366f1" fill="#6366f180" name="Requests" />
                        <Area yAxisId="right" type="monotone" dataKey="tokens" stroke="#22c55e" fill="#22c55e40" name="Tokens" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ═══════ LLM OPS TAB ═══════ */}
        <TabsContent value="llm" className="space-y-6">
          {loadingLlm ? <LoadingSkeleton /> : llmOps && (
            <>
              {/* Provider Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Provider Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Provider</th>
                          <th className="text-right p-2">Requests</th>
                          <th className="text-right p-2">Tokens</th>
                          <th className="text-right p-2">Cost</th>
                          <th className="text-right p-2">Avg Latency</th>
                          <th className="text-right p-2">Error Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {llmOps.byProvider.map((p: any) => (
                          <tr key={p.provider} className="border-b hover:bg-muted/50">
                            <td className="p-2 font-medium">{p.provider}</td>
                            <td className="p-2 text-right">{p.requests}</td>
                            <td className="p-2 text-right">{fmtNum(p.tokens)}</td>
                            <td className="p-2 text-right text-green-600">${p.cost}</td>
                            <td className="p-2 text-right">{p.avgLatencyMs}ms</td>
                            <td className="p-2 text-right">
                              <Badge variant={p.errorRate > 5 ? "destructive" : "secondary"}>{p.errorRate}%</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Latency Distribution */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader><CardTitle className="text-lg">Latency Distribution</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={llmOps.latencyDistribution}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="bucket" className="text-xs" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="count" fill="#6366f1" radius={[4,4,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Cost Trend */}
                <Card>
                  <CardHeader><CardTitle className="text-lg">Cost Over Time</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={llmOps.timeSeries.map((d: any) => ({ ...d, date: fmtDate(d.date, period) }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" className="text-xs" />
                        <YAxis />
                        <Tooltip />
                        <Line type="monotone" dataKey="cost" stroke="#22c55e" strokeWidth={2} dot={false} name="Cost ($)" />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Recent Errors */}
              {llmOps.recentErrors?.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Recent Errors</CardTitle>
                    <CardDescription>{llmOps.recentErrors.length} errors</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {llmOps.recentErrors.map((e: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-950/20 rounded text-sm">
                          <Badge variant="destructive" className="shrink-0">{e.provider}</Badge>
                          <span className="text-muted-foreground truncate">{e.error}</span>
                          <span className="text-xs text-muted-foreground shrink-0 ml-auto">
                            {new Date(e.time).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ═══════ CONVERSATIONS TAB ═══════ */}
        <TabsContent value="conversations" className="space-y-6">
          {loadingConvos ? <LoadingSkeleton /> : convos && (
            <>
              {/* Volume Trend */}
              <Card>
                <CardHeader><CardTitle className="text-lg">Conversation Volume</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={convos.timeSeries.map((d: any) => ({ ...d, date: fmtDate(d.date, period) }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" className="text-xs" />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip />
                      <Legend />
                      <Area yAxisId="left" type="monotone" dataKey="conversations" stroke="#6366f1" fill="#6366f140" name="Conversations" />
                      <Area yAxisId="right" type="monotone" dataKey="messages" stroke="#22c55e" fill="#22c55e40" name="Messages" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* By User Type */}
                <Card>
                  <CardHeader><CardTitle className="text-lg">By User Type</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie data={convos.byUserType.map((u: any) => ({ name: u.userType, value: u.conversations }))}
                          cx="50%" cy="50%" outerRadius={90} label dataKey="value">
                          {convos.byUserType.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Engagement Distribution */}
                <Card>
                  <CardHeader><CardTitle className="text-lg">Engagement (Messages/Convo)</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={convos.engagementDistribution}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="bucket" className="text-xs" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="count" fill="#a855f7" radius={[4,4,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Top Conversations */}
              <Card>
                <CardHeader><CardTitle className="text-lg">Most Active Conversations</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b">
                        <th className="text-left p-2">Title</th>
                        <th className="text-left p-2">Type</th>
                        <th className="text-right p-2">Messages</th>
                        <th className="text-right p-2">Tokens</th>
                        <th className="text-right p-2">Tools</th>
                        <th className="text-right p-2">Date</th>
                      </tr></thead>
                      <tbody>
                        {convos.topConversations.map((c: any) => (
                          <tr key={c.id} className="border-b hover:bg-muted/50">
                            <td className="p-2 font-medium truncate max-w-[200px]">{c.title}</td>
                            <td className="p-2"><Badge variant="outline">{c.userType}</Badge></td>
                            <td className="p-2 text-right">{c.messages}</td>
                            <td className="p-2 text-right">{fmtNum(c.tokens)}</td>
                            <td className="p-2 text-right">{c.toolCalls}</td>
                            <td className="p-2 text-right text-muted-foreground">{new Date(c.date).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ═══════ TOOL USAGE TAB ═══════ */}
        <TabsContent value="tools" className="space-y-6">
          {loadingTools ? <LoadingSkeleton /> : tools && (
            <>
              {/* Tool Ranking */}
              <Card>
                <CardHeader><CardTitle className="text-lg">Tool Usage Ranking</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={Math.max(300, tools.ranking.length * 36)}>
                    <BarChart data={tools.ranking} layout="vertical" margin={{ left: 120 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="name" width={120} className="text-xs" />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="successes" stackId="a" fill="#22c55e" name="Success" />
                      <Bar dataKey="failures" stackId="a" fill="#ef4444" name="Failure" radius={[0,4,4,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* By Category */}
                <Card>
                  <CardHeader><CardTitle className="text-lg">By Category</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie data={tools.byCategory.map((c: any) => ({ name: c.category || "uncategorized", value: c.executions }))}
                          cx="50%" cy="50%" outerRadius={90} label dataKey="value">
                          {tools.byCategory.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Tool Performance Table */}
                <Card>
                  <CardHeader><CardTitle className="text-lg">Performance Details</CardTitle></CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto max-h-[300px]">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-background"><tr className="border-b">
                          <th className="text-left p-2">Tool</th>
                          <th className="text-right p-2">Success</th>
                          <th className="text-right p-2">Latency</th>
                        </tr></thead>
                        <tbody>
                          {tools.ranking.map((t: any) => (
                            <tr key={t.name} className="border-b hover:bg-muted/50">
                              <td className="p-2 font-medium text-xs">{t.name}</td>
                              <td className="p-2 text-right">
                                <Badge variant={t.successRate >= 95 ? "default" : t.successRate >= 80 ? "secondary" : "destructive"}>
                                  {t.successRate}%
                                </Badge>
                              </td>
                              <td className="p-2 text-right text-muted-foreground">{t.avgLatencyMs}ms</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        {/* ═══════ QUALITY TAB ═══════ */}
        <TabsContent value="quality" className="space-y-6">
          {loadingQuality ? <LoadingSkeleton /> : quality && (
            <>
              {/* Quality Score Trends */}
              <Card>
                <CardHeader><CardTitle className="text-lg">Quality Score Trends</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={quality.timeSeries.map((d: any) => ({ ...d, date: fmtDate(d.date, period) }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" className="text-xs" />
                      <YAxis domain={[0, 1]} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="relevance" stroke="#6366f1" strokeWidth={2} name="Relevance" />
                      <Line type="monotone" dataKey="coherence" stroke="#22c55e" strokeWidth={2} name="Coherence" />
                      <Line type="monotone" dataKey="accuracy" stroke="#f59e0b" strokeWidth={2} name="Accuracy" />
                      <Line type="monotone" dataKey="empathy" stroke="#ec4899" strokeWidth={2} name="Empathy" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Score Distribution */}
                <Card>
                  <CardHeader><CardTitle className="text-lg">Score Distribution</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie data={quality.scoreDistribution} cx="50%" cy="50%" outerRadius={90} label dataKey="count" nameKey="bucket">
                          {quality.scoreDistribution.map((d: any, i: number) => (
                            <Cell key={i} fill={QUALITY_COLORS[d.bucket] || COLORS[i]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* By Provider */}
                <Card>
                  <CardHeader><CardTitle className="text-lg">Quality by Provider</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={quality.byProvider} margin={{ bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="provider" className="text-xs" />
                        <YAxis domain={[0, 1]} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="relevance" fill="#6366f1" name="Relevance" />
                        <Bar dataKey="coherence" fill="#22c55e" name="Coherence" />
                        <Bar dataKey="accuracy" fill="#f59e0b" name="Accuracy" />
                        <Bar dataKey="empathy" fill="#ec4899" name="Empathy" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Lowest Scored Responses */}
              {quality.lowestScored?.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Lowest Scored Responses (Needs Improvement)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {quality.lowestScored.map((r: any) => (
                        <div key={r.id} className="flex flex-wrap items-center gap-2 p-2 bg-amber-50 dark:bg-amber-950/20 rounded text-sm">
                          <Badge variant="secondary">{(r.overall * 100).toFixed(0)}%</Badge>
                          <span className="truncate max-w-[300px]">{r.query}</span>
                          {r.provider && <Badge variant="outline">{r.provider}</Badge>}
                          <span className="ml-auto text-xs text-muted-foreground">
                            R:{(r.scores.relevance * 100).toFixed(0)} C:{(r.scores.coherence * 100).toFixed(0)} A:{(r.scores.accuracy * 100).toFixed(0)} E:{(r.scores.empathy * 100).toFixed(0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ═══════ POPULATION HEALTH TAB ═══════ */}
        <TabsContent value="health" className="space-y-6">
          {loadingHealth ? <LoadingSkeleton /> : popHealth && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Risk Level Distribution */}
                <Card>
                  <CardHeader><CardTitle className="text-lg">Risk Level Distribution</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie data={popHealth.riskDistribution.map((r: any) => ({ name: r.level, value: r.count }))}
                          cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${value}`} dataKey="value">
                          {popHealth.riskDistribution.map((r: any, i: number) => (
                            <Cell key={i} fill={RISK_COLORS[r.level] || COLORS[i]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Score Histogram */}
                <Card>
                  <CardHeader><CardTitle className="text-lg">Risk Score Distribution</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={popHealth.scoreHistogram}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="bucket" className="text-xs" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="count" radius={[4,4,0,0]}>
                          {popHealth.scoreHistogram.map((_: any, i: number) => (
                            <Cell key={i} fill={[RISK_COLORS.low, RISK_COLORS.low, RISK_COLORS.moderate, RISK_COLORS.high, RISK_COLORS.critical][i] || COLORS[i]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Top Risk Factors */}
              {popHealth.topRiskFactors?.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-lg">Most Common Risk Factors</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={Math.max(250, popHealth.topRiskFactors.length * 30)}>
                      <BarChart data={popHealth.topRiskFactors} layout="vertical" margin={{ left: 150 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis type="category" dataKey="factor" width={150} className="text-xs" />
                        <Tooltip />
                        <Bar dataKey="frequency" fill="#ef4444" radius={[0,4,4,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Clinical Insights Breakdown */}
              {popHealth.clinicalInsights?.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-lg">Clinical Insights by Type</CardTitle></CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b">
                          <th className="text-left p-2">Type</th>
                          <th className="text-left p-2">Severity</th>
                          <th className="text-right p-2">Count</th>
                          <th className="text-right p-2">Actioned</th>
                        </tr></thead>
                        <tbody>
                          {popHealth.clinicalInsights.map((r: any, i: number) => (
                            <tr key={i} className="border-b hover:bg-muted/50">
                              <td className="p-2">{r.type}</td>
                              <td className="p-2">
                                <Badge variant={r.severity === "critical" ? "destructive" : r.severity === "warning" ? "secondary" : "outline"}>
                                  {r.severity}
                                </Badge>
                              </td>
                              <td className="p-2 text-right">{r.count}</td>
                              <td className="p-2 text-right">{r.actioned}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ═══════ NOTIFICATIONS TAB ═══════ */}
        <TabsContent value="notifications" className="space-y-6">
          {loadingNotifs ? <LoadingSkeleton /> : notifs && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard title="Total Sent" value={notifs.byType.reduce((s: number, t: any) => s + t.total, 0)} icon="📨" />
                <StatCard title="Read" value={notifs.byType.reduce((s: number, t: any) => s + t.read, 0)} icon="✅" />
                <StatCard title="Pending" value={notifs.byType.reduce((s: number, t: any) => s + t.pending, 0)} icon="⏳" />
                <StatCard title="Avg Read Time" value={`${notifs.avgHoursToRead}h`} icon="⏱️" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* By Type */}
                <Card>
                  <CardHeader><CardTitle className="text-lg">By Notification Type</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={notifs.byType} margin={{ bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="type" className="text-xs" angle={-25} textAnchor="end" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="total" fill="#6366f1" name="Total" />
                        <Bar dataKey="read" fill="#22c55e" name="Read" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* By Priority */}
                <Card>
                  <CardHeader><CardTitle className="text-lg">By Priority</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie data={notifs.byPriority.map((p: any) => ({ name: p.priority, value: p.total }))}
                          cx="50%" cy="50%" outerRadius={90} label dataKey="value">
                          {notifs.byPriority.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Volume Over Time */}
              {notifs.timeSeries?.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-lg">Notification Volume</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={notifs.timeSeries.map((d: any) => ({ ...d, date: fmtDate(d.date, period) }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" className="text-xs" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Area type="monotone" dataKey="total" stroke="#6366f1" fill="#6366f140" name="Sent" />
                        <Area type="monotone" dataKey="read" stroke="#22c55e" fill="#22c55e40" name="Read" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ═══════ RAG TAB ═══════ */}
        <TabsContent value="rag" className="space-y-6">
          {loadingRag ? <LoadingSkeleton /> : rag && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* RAG Score Distribution */}
                <Card>
                  <CardHeader><CardTitle className="text-lg">Retrieval Quality</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie data={rag.scoreDistribution} cx="50%" cy="50%" outerRadius={90} label dataKey="count" nameKey="bucket">
                          {rag.scoreDistribution.map((d: any, i: number) => (
                            <Cell key={i} fill={QUALITY_COLORS[d.bucket] || COLORS[i]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* RAG Performance Over Time */}
                <Card>
                  <CardHeader><CardTitle className="text-lg">Performance Over Time</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={rag.timeSeries.map((d: any) => ({ ...d, date: fmtDate(d.date, period) }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" className="text-xs" />
                        <YAxis yAxisId="left" domain={[0, 1]} />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip />
                        <Legend />
                        <Line yAxisId="left" type="monotone" dataKey="avgTopScore" stroke="#6366f1" strokeWidth={2} name="Avg Top Score" />
                        <Line yAxisId="right" type="monotone" dataKey="queries" stroke="#22c55e" strokeWidth={2} name="Queries" />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Recent Queries */}
              <Card>
                <CardHeader><CardTitle className="text-lg">Recent RAG Queries</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto max-h-[400px]">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-background"><tr className="border-b">
                        <th className="text-left p-2">Query</th>
                        <th className="text-right p-2">Chunks</th>
                        <th className="text-right p-2">Top Score</th>
                        <th className="text-right p-2">Avg Score</th>
                        <th className="text-right p-2">Latency</th>
                      </tr></thead>
                      <tbody>
                        {rag.recentQueries.map((q: any, i: number) => (
                          <tr key={i} className="border-b hover:bg-muted/50">
                            <td className="p-2 truncate max-w-[300px]">{q.query}</td>
                            <td className="p-2 text-right">{q.chunks}</td>
                            <td className="p-2 text-right">
                              <Badge variant={q.topScore >= 0.7 ? "default" : q.topScore >= 0.5 ? "secondary" : "destructive"}>
                                {q.topScore}
                              </Badge>
                            </td>
                            <td className="p-2 text-right">{q.avgScore}</td>
                            <td className="p-2 text-right text-muted-foreground">{q.latencyMs}ms</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
    </AdminLayout>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => (
          <Card key={i}><CardContent className="p-6"><div className="h-16 bg-muted animate-pulse rounded" /></CardContent></Card>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1,2].map(i => (
          <Card key={i}><CardContent className="p-6"><div className="h-64 bg-muted animate-pulse rounded" /></CardContent></Card>
        ))}
      </div>
    </div>
  );
}
