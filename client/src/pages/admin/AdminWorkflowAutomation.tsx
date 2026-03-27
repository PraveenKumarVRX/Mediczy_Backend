import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { formatDistanceToNow } from "date-fns";
import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Activity,
  AlertTriangle,
  Cpu,
  Calendar,
  Video,
  Users,
  CreditCard,
  Stethoscope,
  BarChart3,
  Shield,
  Bot,
  Settings,
  Zap,
} from "lucide-react";

const API_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, "")
    : typeof window !== "undefined"
    ? window.location.origin
    : "");

// ── Types ─────────────────────────────────────────────────────────────────────

interface CronLog {
  ts: string;
  status: "success" | "error";
  details?: Record<string, unknown>;
  errorMessage?: string;
}

interface CronTask {
  key: string;
  name: string;
  schedule: string;
  category: string;
  scheduleDesc: string;
  lastRun: string | null;
  lastStatus: "success" | "error" | "never";
  runCount: number;
  errorCount: number;
  lastError: string | null;
  lastDetails: Record<string, unknown>;
  recentLogs: CronLog[];
}

// ── Category config ───────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  device:      { label: "Device Management",  icon: Cpu,         color: "text-blue-600"   },
  appointment: { label: "Appointments",        icon: Calendar,    color: "text-purple-600" },
  webinar:     { label: "Webinars",            icon: Video,       color: "text-pink-600"   },
  membership:  { label: "Membership",          icon: Users,       color: "text-indigo-600" },
  billing:     { label: "Billing",             icon: CreditCard,  color: "text-green-600"  },
  clinical:    { label: "Clinical Care",       icon: Stethoscope, color: "text-red-600"    },
  analytics:   { label: "Analytics",           icon: BarChart3,   color: "text-orange-600" },
  saas:        { label: "SaaS Operations",     icon: Shield,      color: "text-teal-600"   },
  system:      { label: "System",              icon: Settings,    color: "text-gray-600"   },
  ai:          { label: "AI Services",         icon: Bot,         color: "text-violet-600" },
  compliance:  { label: "Compliance / GDPR",   icon: Shield,      color: "text-yellow-700" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "Unknown";
  }
}

function StatusBadge({ status }: { status: "success" | "error" | "never" }) {
  if (status === "success")
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200 gap-1">
        <CheckCircle2 className="h-3 w-3" /> OK
      </Badge>
    );
  if (status === "error")
    return (
      <Badge className="bg-red-100 text-red-800 border-red-200 gap-1">
        <XCircle className="h-3 w-3" /> Error
      </Badge>
    );
  return (
    <Badge className="bg-gray-100 text-gray-600 border-gray-200 gap-1">
      <Clock className="h-3 w-3" /> Never run
    </Badge>
  );
}

function DetailsChip({ details }: { details: Record<string, unknown> }) {
  const pairs = Object.entries(details).slice(0, 4);
  if (!pairs.length) return null;
  return (
    <span className="text-xs text-muted-foreground ml-2">
      {pairs.map(([k, v]) => `${k}: ${v}`).join(" · ")}
    </span>
  );
}

// ── Task Row ──────────────────────────────────────────────────────────────────

function TaskRow({ task }: { task: CronTask }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="py-3 px-4 font-medium text-sm">{task.name}</td>
        <td className="py-3 px-4 text-sm text-muted-foreground">{task.schedule}</td>
        <td className="py-3 px-4">
          <StatusBadge status={task.lastStatus} />
        </td>
        <td className="py-3 px-4 text-sm text-muted-foreground">
          {relativeTime(task.lastRun)}
          {task.lastStatus === "success" && task.lastDetails && (
            <DetailsChip details={task.lastDetails} />
          )}
          {task.lastStatus === "error" && task.lastError && (
            <span className="ml-2 text-xs text-red-500 truncate max-w-xs inline-block">
              {task.lastError}
            </span>
          )}
        </td>
        <td className="py-3 px-4 text-sm text-center">{task.runCount}</td>
        <td className="py-3 px-4 text-sm text-center">
          {task.errorCount > 0 ? (
            <span className="text-red-600 font-medium">{task.errorCount}</span>
          ) : (
            <span className="text-muted-foreground">0</span>
          )}
        </td>
        <td className="py-3 px-4 text-center">
          {expanded ? (
            <ChevronUp className="h-4 w-4 mx-auto text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 mx-auto text-muted-foreground" />
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/20">
          <td colSpan={7} className="px-4 py-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
              Recent Executions (last {task.recentLogs.length})
            </p>
            {task.recentLogs.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No executions recorded yet.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left py-1 pr-4 font-medium">Time</th>
                    <th className="text-left py-1 pr-4 font-medium">Status</th>
                    <th className="text-left py-1 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {[...task.recentLogs].reverse().map((log, i) => (
                    <tr key={i} className="border-t border-muted/40">
                      <td className="py-1 pr-4 text-muted-foreground whitespace-nowrap">
                        {new Date(log.ts).toLocaleString()}
                      </td>
                      <td className="py-1 pr-4">
                        {log.status === "success" ? (
                          <span className="text-green-700 font-medium">✓ success</span>
                        ) : (
                          <span className="text-red-600 font-medium">✗ error</span>
                        )}
                      </td>
                      <td className="py-1 text-muted-foreground">
                        {log.status === "error" && log.errorMessage
                          ? log.errorMessage
                          : log.details && Object.keys(log.details).length > 0
                          ? Object.entries(log.details)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(" · ")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ── Category Section ──────────────────────────────────────────────────────────

function CategorySection({ category, tasks }: { category: string; tasks: CronTask[] }) {
  const cfg = CATEGORY_CONFIG[category] || {
    label: category,
    icon: Zap,
    color: "text-gray-600",
  };
  const Icon = cfg.icon;
  const errors = tasks.filter((t) => t.lastStatus === "error").length;
  const ok = tasks.filter((t) => t.lastStatus === "success").length;

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className={`h-4 w-4 ${cfg.color}`} />
          {cfg.label}
          <span className="text-xs font-normal text-muted-foreground ml-1">
            ({tasks.length} task{tasks.length !== 1 ? "s" : ""})
          </span>
          {errors > 0 && (
            <Badge className="ml-auto bg-red-100 text-red-700 border-red-200 text-xs">
              {errors} error{errors !== 1 ? "s" : ""}
            </Badge>
          )}
          {errors === 0 && ok > 0 && (
            <Badge className="ml-auto bg-green-100 text-green-700 border-green-200 text-xs">
              All healthy
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full">
          <thead className="bg-muted/40">
            <tr className="text-xs text-muted-foreground">
              <th className="text-left py-2 px-4 font-medium">Task</th>
              <th className="text-left py-2 px-4 font-medium">Schedule</th>
              <th className="text-left py-2 px-4 font-medium">Status</th>
              <th className="text-left py-2 px-4 font-medium">Last Run</th>
              <th className="text-center py-2 px-4 font-medium">Runs</th>
              <th className="text-center py-2 px-4 font-medium">Errors</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <TaskRow key={task.key} task={task} />
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL = 30; // seconds

export default function AdminWorkflowAutomation() {
  const token =
    localStorage.getItem("adminToken") || localStorage.getItem("token");

  const [tasks, setTasks] = useState<CronTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);

  const fetchJobs = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/admin/automation/jobs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTasks(data.data || data.tasks || (Array.isArray(data) ? data : []));
      setLastUpdated(new Date());
      setError(null);
      setCountdown(REFRESH_INTERVAL);
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Failed to load automation jobs");
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Initial load + polling
  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, REFRESH_INTERVAL * 1000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  // Countdown ticker
  useEffect(() => {
    const tick = setInterval(
      () => setCountdown((c) => (c <= 1 ? REFRESH_INTERVAL : c - 1)),
      1000
    );
    return () => clearInterval(tick);
  }, [lastUpdated]);

  // Group tasks by category
  const grouped = tasks.reduce<Record<string, CronTask[]>>((acc, task) => {
    const cat = task.category || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(task);
    return acc;
  }, {});

  // Summary stats
  const total = tasks.length;
  const healthy = tasks.filter((t) => t.lastStatus === "success").length;
  const errored = tasks.filter((t) => t.lastStatus === "error").length;
  const neverRun = tasks.filter((t) => t.lastStatus === "never").length;

  // Category order
  const categoryOrder = [
    "device", "appointment", "webinar", "membership", "billing",
    "clinical", "analytics", "saas", "ai", "compliance", "system",
  ];
  const sortedCategories = [
    ...categoryOrder.filter((c) => grouped[c]),
    ...Object.keys(grouped).filter((c) => !categoryOrder.includes(c)),
  ];

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              Automation Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Live cron job execution status — refreshes every {REFRESH_INTERVAL}s
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-muted-foreground">
                Updated {relativeTime(lastUpdated.toISOString())} · next in {countdown}s
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchJobs}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Activity className="h-8 w-8 text-primary opacity-80" />
              <div>
                <p className="text-2xl font-bold">{total}</p>
                <p className="text-xs text-muted-foreground">Total Tasks</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold text-green-700">{healthy}</p>
                <p className="text-xs text-muted-foreground">Healthy</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <XCircle className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-2xl font-bold text-red-600">{errored}</p>
                <p className="text-xs text-muted-foreground">Errored</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold text-yellow-600">{neverRun}</p>
                <p className="text-xs text-muted-foreground">Never Run</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Error state */}
        {error && (
          <Card className="mb-4 border-red-200 bg-red-50">
            <CardContent className="p-4 flex items-center gap-2 text-red-700">
              <XCircle className="h-4 w-4" />
              {error}
            </CardContent>
          </Card>
        )}

        {/* Loading state */}
        {loading && tasks.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-primary" />
            Loading automation status…
          </div>
        )}

        {/* Task groups */}
        {sortedCategories.map((category) => (
          <CategorySection
            key={category}
            category={category}
            tasks={grouped[category]}
          />
        ))}

        {!loading && tasks.length === 0 && !error && (
          <div className="text-center py-16 text-muted-foreground">
            <Activity className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>No automation tasks found. The server may still be starting up.</p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

