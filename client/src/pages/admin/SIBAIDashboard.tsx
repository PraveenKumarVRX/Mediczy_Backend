import { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import api from "@/utils/api";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle, ShieldCheck, ShieldOff, Activity, Zap, Timer,
  RefreshCw, Brain, Eye, FileText, Mic, Bell, Siren, Pill, Loader2,
  CheckCircle2, XCircle,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

// ── Types ──────────────────────────────────────────────────
interface RateLimit {
  key: string;
  count: number;
  limit: number;
  resetsAt: string;
}

interface DashboardData {
  killSwitchActive: boolean;
  aiRequestsLastHour: Record<string, number>;
  aiRequestsByTenant: Record<string, number>;
  rateLimits: RateLimit[];
  circuitBreakers: Record<string, { state: string; failures: number; lastFailure?: string }>;
  pendingApprovals: number;
  totalAIRequests: number;
  decisionTypes: Record<string, string>;
  aiDecisionTypes: Record<string, string>;
}

// ── Icon map for AI decision types ─────────────────────────
const AI_TYPE_ICONS: Record<string, { icon: typeof Brain; color: string; bg: string }> = {
  ai_query:         { icon: Brain, color: "text-violet-500", bg: "bg-violet-500/10" },
  ai_prescription:  { icon: Pill, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  ai_diagnosis:     { icon: Activity, color: "text-blue-500", bg: "bg-blue-500/10" },
  ai_transcription: { icon: Mic, color: "text-orange-500", bg: "bg-orange-500/10" },
  ai_vision:        { icon: Eye, color: "text-cyan-500", bg: "bg-cyan-500/10" },
  ai_report:        { icon: FileText, color: "text-amber-500", bg: "bg-amber-500/10" },
  ai_emergency:     { icon: Siren, color: "text-red-500", bg: "bg-red-500/10" },
  ai_notification:  { icon: Bell, color: "text-pink-500", bg: "bg-pink-500/10" },
};

export default function SIBAIDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [killSwitchModal, setKillSwitchModal] = useState(false);
  const [toggling, setToggling] = useState(false);

  const fetchDashboard = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true);
      else setLoading(true);
      const token = localStorage.getItem("adminToken");
      if (!token) { window.location.href = "/admin/login"; return; }
      const { data: resp } = await api.get("/sib/ai-dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.success) setData(resp.data);
      else setError("Failed to load dashboard");
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  // Auto-refresh every 30s
  useEffect(() => {
    const timer = setInterval(() => fetchDashboard(true), 30000);
    return () => clearInterval(timer);
  }, [fetchDashboard]);

  const toggleKillSwitch = async () => {
    if (!data) return;
    setToggling(true);
    try {
      const token = localStorage.getItem("adminToken");
      const action = data.killSwitchActive ? "deactivate" : "activate";
      await api.post(`/sib/kill-switch/${action}`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchDashboard(true);
      setKillSwitchModal(false);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to toggle kill switch");
    } finally {
      setToggling(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  if (error && !data) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center h-96 gap-4">
          <XCircle className="h-12 w-12 text-destructive" />
          <p className="text-destructive">{error}</p>
          <Button onClick={() => fetchDashboard()}>Retry</Button>
        </div>
      </AdminLayout>
    );
  }

  const totalReqs = data?.totalAIRequests || 0;
  const requestEntries = Object.entries(data?.aiRequestsLastHour || {});
  const tenantEntries = Object.entries(data?.aiRequestsByTenant || {});
  const circuitEntries = Object.entries(data?.circuitBreakers || {});
  const decisionTypeEntries = Object.entries(data?.aiDecisionTypes || {});

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">SIB AI Control Center</h1>
            <p className="text-muted-foreground">
              Real-time monitoring, safety controls & rate limits for all AI operations
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchDashboard(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Kill Switch + Summary Cards */}
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          {/* Kill Switch */}
          <Card className={`border-2 ${data?.killSwitchActive ? "border-destructive bg-destructive/5" : "border-green-500/30 bg-green-500/5"}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">AI Kill Switch</CardTitle>
              {data?.killSwitchActive
                ? <ShieldOff className="h-5 w-5 text-destructive" />
                : <ShieldCheck className="h-5 w-5 text-green-500" />
              }
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Badge variant={data?.killSwitchActive ? "destructive" : "default"} className={!data?.killSwitchActive ? "bg-green-500" : ""}>
                  {data?.killSwitchActive ? "ACTIVE — AI BLOCKED" : "INACTIVE — AI RUNNING"}
                </Badge>
              </div>
              <Button
                variant={data?.killSwitchActive ? "default" : "destructive"}
                size="sm"
                className="mt-3 w-full"
                onClick={() => setKillSwitchModal(true)}
              >
                {data?.killSwitchActive ? "Re-enable AI" : "Emergency Stop"}
              </Button>
            </CardContent>
          </Card>

          {/* Total Requests */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Requests (Last Hour)</CardTitle>
              <Zap className="h-5 w-5 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalReqs}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Across {requestEntries.length} AI type{requestEntries.length !== 1 ? "s" : ""}
              </p>
            </CardContent>
          </Card>

          {/* Pending Approvals */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
              <AlertTriangle className={`h-5 w-5 ${(data?.pendingApprovals || 0) > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{data?.pendingApprovals || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                High-risk AI decisions awaiting review
              </p>
            </CardContent>
          </Card>

          {/* Circuit Breakers */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Circuit Breakers</CardTitle>
              <Activity className="h-5 w-5 text-blue-500" />
            </CardHeader>
            <CardContent>
              {circuitEntries.length === 0 ? (
                <>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span className="text-lg font-semibold text-green-600">All Clear</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">No tripped breakers</p>
                </>
              ) : (
                <>
                  <div className="text-3xl font-bold text-amber-500">{circuitEntries.length}</div>
                  <p className="text-xs text-destructive mt-1">Breakers tripped — check below</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* AI Request Types + Rate Limits */}
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {/* Requests by AI Type */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">AI Requests by Type</CardTitle>
              <CardDescription>Last hour breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              {requestEntries.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4">No AI requests in the last hour</p>
              ) : (
                <div className="space-y-3">
                  {requestEntries.map(([type, count]) => {
                    const meta = AI_TYPE_ICONS[type] || { icon: Brain, color: "text-slate-500", bg: "bg-slate-500/10" };
                    const Icon = meta.icon;
                    return (
                      <div key={type} className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${meta.bg}`}>
                          <Icon className={`h-4 w-4 ${meta.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium capitalize">
                              {type.replace(/_/g, " ")}
                            </span>
                            <span className="text-sm font-bold">{count as number}</span>
                          </div>
                          <Progress
                            value={totalReqs > 0 ? ((count as number) / totalReqs) * 100 : 0}
                            className="h-1.5 mt-1"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rate Limits */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Rate Limits</CardTitle>
              <CardDescription>Current usage vs. limits</CardDescription>
            </CardHeader>
            <CardContent>
              {(data?.rateLimits || []).length === 0 ? (
                <p className="text-muted-foreground text-sm py-4">No active rate limits</p>
              ) : (
                <div className="space-y-4">
                  {data?.rateLimits.map((rl) => {
                    const pct = (rl.count / rl.limit) * 100;
                    const isHigh = pct > 80;
                    const isCritical = pct > 95;
                    return (
                      <div key={rl.key} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{rl.key.replace(/::/g, " → ")}</span>
                          <span className={isCritical ? "text-destructive font-bold" : isHigh ? "text-amber-500 font-semibold" : ""}>
                            {rl.count} / {rl.limit}
                          </span>
                        </div>
                        <Progress
                          value={Math.min(pct, 100)}
                          className={`h-2 ${isCritical ? "[&>div]:bg-destructive" : isHigh ? "[&>div]:bg-amber-500" : ""}`}
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{pct.toFixed(1)}% used</span>
                          <span>Resets: {new Date(rl.resetsAt).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tenant Usage + AI Decision Types */}
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {/* By Tenant */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Usage by Tenant</CardTitle>
              <CardDescription>AI requests per tenant in last hour</CardDescription>
            </CardHeader>
            <CardContent>
              {tenantEntries.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4">No tenant data</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      <TableHead className="text-right">Requests</TableHead>
                      <TableHead className="text-right">Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenantEntries.map(([tenant, count]) => (
                      <TableRow key={tenant}>
                        <TableCell className="font-medium">{tenant}</TableCell>
                        <TableCell className="text-right">{count as number}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {totalReqs > 0 ? (((count as number) / totalReqs) * 100).toFixed(0) : 0}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Registered AI Decision Types */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">AI Decision Types</CardTitle>
              <CardDescription>Registered categories of AI operations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {decisionTypeEntries.map(([key, value]) => {
                  const typeKey = (value as string);
                  const meta = AI_TYPE_ICONS[typeKey] || { icon: Brain, color: "text-slate-500", bg: "bg-slate-500/10" };
                  const Icon = meta.icon;
                  return (
                    <div key={key} className={`flex items-center gap-2 p-2.5 rounded-lg ${meta.bg}`}>
                      <Icon className={`h-4 w-4 ${meta.color} shrink-0`} />
                      <span className="text-xs font-medium capitalize truncate">
                        {typeKey.replace(/_/g, " ")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Circuit Breakers Detail */}
        {circuitEntries.length > 0 && (
          <Card className="border-amber-500/30">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Tripped Circuit Breakers
              </CardTitle>
              <CardDescription>Services with elevated failure rates</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead className="text-right">Failures</TableHead>
                    <TableHead className="text-right">Last Failure</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {circuitEntries.map(([service, info]) => (
                    <TableRow key={service}>
                      <TableCell className="font-medium">{service}</TableCell>
                      <TableCell>
                        <Badge variant={info.state === "open" ? "destructive" : "secondary"}>
                          {info.state}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{info.failures}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {info.lastFailure ? new Date(info.lastFailure).toLocaleString() : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Kill Switch Confirmation */}
        <Dialog open={killSwitchModal} onOpenChange={setKillSwitchModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {data?.killSwitchActive ? (
                  <><ShieldCheck className="h-5 w-5 text-green-500" /> Re-enable AI Operations</>
                ) : (
                  <><ShieldOff className="h-5 w-5 text-destructive" /> Emergency AI Shutdown</>
                )}
              </DialogTitle>
              <DialogDescription>
                {data?.killSwitchActive
                  ? "This will re-enable all AI operations across the platform. Make sure the issue that caused the shutdown has been resolved."
                  : "This will immediately block ALL AI operations across the entire platform. Use this only in emergencies such as AI producing harmful outputs."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setKillSwitchModal(false)} disabled={toggling}>
                Cancel
              </Button>
              <Button
                variant={data?.killSwitchActive ? "default" : "destructive"}
                onClick={toggleKillSwitch}
                disabled={toggling}
              >
                {toggling && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {data?.killSwitchActive ? "Re-enable AI" : "Confirm Emergency Stop"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
