import MainLayout from "@/components/layout/MainLayout";
import AdminChatDashboard from "@/pages/admin/AdminChatDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  FlaskConical,
  Calendar,
  RefreshCw,
  User,
  Activity,
  Search,
  Download,
  Filter,
  ChevronDown,
  ChevronRight,
  Shield,
  Database,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import api from "@/utils/api";

interface Metric {
  label: string;
  value: string;
  trend?: string;
}

interface Initiative {
  title: string;
  description: string;
  status?: string;
}

interface ModuleConfig {
  title: string;
  description: string;
  metrics: Metric[];
  initiatives: Initiative[];
  primaryAction?: string;
  primaryActionHref?: string;
  // When provided, ModuleShell fetches this endpoint and merges live values
  // into the static metric list by matching label (case-insensitive substring).
  liveMetrics?: { endpoint: string; extract: (data: any) => Record<string, string | number> };
}

const ModuleShell = ({ title, description, metrics: staticMetrics, initiatives, primaryAction, primaryActionHref, liveMetrics }: ModuleConfig) => {
  const navigate = useNavigate();

  const { data: liveData } = useQuery({
    queryKey: ["module-live-metrics", liveMetrics?.endpoint],
    queryFn: async () => {
      if (!liveMetrics) return null;
      const { data } = await api.get(liveMetrics.endpoint);
      return data;
    },
    enabled: Boolean(liveMetrics),
    staleTime: 60_000,
  });

  const liveValues: Record<string, string | number> = liveData && liveMetrics
    ? liveMetrics.extract(liveData)
    : {};

  // Merge live values into static metrics — live value wins when present
  const metrics = staticMetrics.map((m) => {
    const key = Object.keys(liveValues).find(
      (k) => m.label.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(m.label.toLowerCase())
    );
    return key !== undefined ? { ...m, value: String(liveValues[key]) } : m;
  });

  const handlePrimaryAction = () => {
    if (title === "User Management") {
      navigate('/admin/users');
    } else if (title === "Doctor Network") {
      navigate('/admin/doctors');
    } else if (primaryActionHref) {
      navigate(primaryActionHref);
    }
  };

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in">
        <div className="rounded-2xl border bg-gradient-to-r from-primary/5 to-purple-500/5 p-8 shadow-sm">
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Team Workspace</p>
              <h1 className="text-3xl font-semibold mt-1">{title}</h1>
              <p className="text-muted-foreground mt-2 max-w-2xl">{description}</p>
            </div>
            {primaryAction && (
              <div>
                {primaryActionHref ? (
                  <Button asChild>
                    <Link to={primaryActionHref}>{primaryAction}</Link>
                  </Button>
                ) : (
                  <Button onClick={handlePrimaryAction}>{primaryAction}</Button>
                )}
              </div>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">Snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {metrics.map((metric) => (
                <div key={metric.label} className="rounded-xl border bg-muted/40 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{metric.label}</p>
                  <p className="text-2xl font-semibold mt-1">{metric.value}</p>
                  {metric.trend && <p className="text-xs text-green-600 mt-1">{metric.trend}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">Active initiatives</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {initiatives.map((initiative, index) => (
              <div key={initiative.title}>
                {index > 0 && <Separator className="my-3" />}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <p className="font-medium">{initiative.title}</p>
                    </div>
                    {initiative.status && (
                      <Badge variant="outline">{initiative.status}</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{initiative.description}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

const modules: Record<string, ModuleConfig> = {
  userManagement: {
    title: "User Management",
    description: "Track onboarding, deactivate accounts, and audit permissions without leaving the team workspace.",
    primaryAction: "Invite new member",
    liveMetrics: {
      endpoint: "/team/module-stats",
      extract: (d) => ({
        "Active users": d.stats?.users?.active ?? d.stats?.users?.total,
      }),
    },
    metrics: [
      { label: "Active users", value: "—", trend: "" },
      { label: "Pending invites", value: "—" },
      { label: "Access reviews", value: "—" },
      { label: "Support escalations", value: "—" },
    ],
    initiatives: [
      { title: "De-duplicate legacy accounts", description: "Merge duplicate user records before Q4 close", status: "In Progress" },
      { title: "Role cleanup", description: "Audit admin privileges granted before 2024" },
      { title: "Bulk onboarding toolkit", description: "Template for adding 100+ employees per org" },
    ],
  },
  doctorManagement: {
    title: "Doctor Network",
    description: "Monitor onboarding, credentials, and engagement for every doctor on the platform.",
    primaryAction: "Add doctor",
    liveMetrics: {
      endpoint: "/team/module-stats",
      extract: (d) => ({
        "Active doctors": d.stats?.doctors?.total,
        "Pending verifications": d.stats?.doctors?.pendingVerification,
      }),
    },
    metrics: [
      { label: "Active doctors", value: "—", trend: "" },
      { label: "Pending verifications", value: "—" },
      { label: "Avg rating", value: "—" },
      { label: "Availability gaps", value: "—" },
    ],
    initiatives: [
      { title: "Credential refresh", description: "Revalidate licenses expiring within 45 days", status: "In Progress" },
      { title: "Engagement nudges", description: "Share weekly practice tips to boost replies" },
      { title: "Roster balancing", description: "Fill pulmonology coverage in east zone" },
    ],
  },
  corporateManagement: {
    title: "Corporate Management",
    description: "Maintain enterprise partnerships, track utilization, and surface renewal signals for each corporate client.",
    primaryAction: "Create corporate workspace",
    primaryActionHref: "/admin/corporates",
    liveMetrics: {
      endpoint: "/team/module-stats",
      extract: (d) => ({
        "Active contracts": d.stats?.corporates?.total,
      }),
    },
    metrics: [
      { label: "Active contracts", value: "—" },
      { label: "Renewals this month", value: "—" },
      { label: "Coverage rate", value: "—" },
      { label: "Open escalations", value: "—" },
    ],
    initiatives: [
      { title: "Quarterly business reviews", description: "Schedule QBRs for accounts with >500 employees", status: "Scheduled" },
      { title: "Utilization alerts", description: "Flag companies with <50% plan usage" },
      { title: "Compliance toolkit", description: "Share HIPAA compliance summary with legal POCs" },
    ],
  },
  hospitalManagement: {
    title: "Hospital Management",
    description: "Coordinate hospital onboarding, service catalogs, and allocation of partner specialists.",
    liveMetrics: {
      endpoint: "/team/module-stats",
      extract: (d) => ({ "Hospitals live": d.stats?.hospitals?.total }),
    },
    metrics: [
      { label: "Hospitals live", value: "—" },
      { label: "Pending vetting", value: "—" },
      { label: "Avg response SLA", value: "—" },
      { label: "Availability alerts", value: "—" },
    ],
    initiatives: [
      { title: "Imaging integration", description: "Roll out PACS adapters for tier-1 hospitals", status: "Deploying" },
      { title: "Credential refresh", description: "Auto-expire documents older than 12 months" },
      { title: "Escalation bridge", description: "Align on high-severity contact points" },
    ],
  },
  clinicManagement: {
    title: "Clinic Management",
    description: "Track clinic partners, queue health, and reimbursement readiness from one dashboard.",
    liveMetrics: {
      endpoint: "/team/module-stats",
      extract: (d) => ({ "Clinics onboarded": d.stats?.clinics?.total }),
    },
    metrics: [
      { label: "Clinics onboarded", value: "—" },
      { label: "Daily queue load", value: "—" },
      { label: "Pending payouts", value: "—" },
      { label: "Compliance issues", value: "—" },
    ],
    initiatives: [
      { title: "Faster payouts", description: "Move all clinics to automated billing" },
      { title: "Queue alerts", description: "Ping clinics when wait-time exceeds 25 min" },
      { title: "Partner spotlight", description: "Surface top-rated clinics weekly" },
    ],
  },
  labManagement: {
    title: "Lab Management",
    description: "Orchestrate diagnostics partners, sample pickups, and SLA reporting.",
    liveMetrics: {
      endpoint: "/team/module-stats",
      extract: (d) => ({ "Labs live": d.stats?.labs?.total }),
    },
    metrics: [
      { label: "Labs live", value: "—" },
      { label: "Samples today", value: "—" },
      { label: "Delayed reports", value: "—" },
      { label: "Automation coverage", value: "—" },
    ],
    initiatives: [
      { title: "Chain-of-custody rollout", description: "Digitize tracking for top metro labs", status: "Rolling out" },
      { title: "Panel harmonization", description: "Align test naming across LIMS" },
      { title: "Logistics heatmap", description: "Highlight underserved pincodes" },
    ],
  },
  appointments: {
    title: "Appointments Operations",
    description: "Monitor booking load, triage escalations, and rebalance slots across portals.",
    liveMetrics: {
      endpoint: "/team/module-stats",
      extract: (d) => ({
        "Bookings today": d.stats?.appointments?.today,
      }),
    },
    metrics: [
      { label: "Bookings today", value: "—" },
      { label: "Reschedules", value: "—" },
      { label: "High priority", value: "—" },
      { label: "SLA compliance", value: "—" },
    ],
    initiatives: [
      { title: "Waitlist automation", description: "Auto-upgrade slots when cancellations occur", status: "Beta" },
      { title: "Escalation triage", description: "Color-code bookings stuck >12h" },
      { title: "Slot forecasting", description: "Predict demand per speciality" },
    ],
  },
  chatDashboard: {
    title: "Chat Desk",
    description: "Monitor support queues, coach agents, and resolve clinical escalations collaboratively.",
    metrics: [
      { label: "Live conversations", value: "38" },
      { label: "Avg first response", value: "2m 10s" },
      { label: "Escalations", value: "3" },
      { label: "CSAT", value: "4.7" },
    ],
    initiatives: [
      { title: "Clinical handoffs", description: "Route triage chats to doctors within 60s" },
      { title: "Tone coaching", description: "Nudge agents when sentiment dips" },
      { title: "Unified transcript export", description: "Ship compliance-ready summaries" },
    ],
  },
  healthPlans: {
    title: "Health Plans",
    description: "Maintain catalogues, approvals, and utilization analytics for every wellness plan.",
    metrics: [
      { label: "Active plans", value: "28" },
      { label: "Members covered", value: "32.4K" },
      { label: "Approvals pending", value: "7" },
      { label: "Utilization", value: "71%" },
    ],
    initiatives: [
      { title: "Benefit refresh", description: "Align AYUSH & OPD coverage for FY25" },
      { title: "Claims integration", description: "Sync plan limits with insurer APIs" },
      { title: "Engagement nudges", description: "Send quarterly wellness playbooks" },
    ],
  },
  activityLogs: {
    title: "Activity & Audit",
    description: "Investigate changes, download audit trails, and confirm compliance checkpoints.",
    metrics: [
      { label: "Events today", value: "4,812" },
      { label: "Alerts flagged", value: "6" },
      { label: "Exports", value: "12" },
      { label: "Policy breaches", value: "0" },
    ],
    initiatives: [
      { title: "Just-in-time alerts", description: "Notify security when sensitive roles change" },
      { title: "Immutable exports", description: "Sign every audit download" },
      { title: "Data residency review", description: "Map logs stored outside India" },
    ],
  },
  settings: {
    title: "Team Settings",
    description: "Control authentication, themes, and portal access without leaving the dashboard.",
    metrics: [
      { label: "SSO tenants", value: "3" },
      { label: "Dark mode adoption", value: "68%" },
      { label: "Feature flags", value: "12 live" },
      { label: "Pending approvals", value: "1" },
    ],
    initiatives: [
      { title: "Geo-fencing", description: "Restrict sensitive modules outside India", status: "In Review" },
      { title: "Theme presets", description: "Ship curated palettes per partner" },
      { title: "Session policy", description: "Enforce 12-hour re-auth for admins" },
    ],
  },
  pharmacyManagement: {
    title: "Pharmacy Management",
    description: "Oversee pharmacy network, monitor inventory, and manage medication dispensing across all locations.",
    primaryAction: "Add pharmacy",
    primaryActionHref: "/admin/pharmacies",
    liveMetrics: {
      endpoint: "/team/module-stats",
      extract: (d) => ({ "Active pharmacies": d.stats?.pharmacies?.total }),
    },
    metrics: [
      { label: "Active pharmacies", value: "—", trend: "" },
      { label: "Total medicines", value: "—" },
      { label: "Low stock alerts", value: "—" },
      { label: "Monthly revenue", value: "—" },
    ],
    initiatives: [
      { title: "Inventory optimization", description: "Implement auto-reorder for critical medicines", status: "In Progress" },
      { title: "Quality audits", description: "Schedule quarterly compliance checks", status: "Scheduled" },
      { title: "Digital dispensing", description: "Enable e-prescription verification", status: "Beta" },
    ],
  },
  chatAnalytics: {
    title: "Chat Analytics",
    description: "Monitor chat performance, analyze conversation patterns, and optimize customer support efficiency.",
    primaryAction: "View Reports",
    metrics: [
      { label: "Total conversations", value: "12,847", trend: "+15% this week" },
      { label: "Average response time", value: "2.3 min" },
      { label: "Resolution rate", value: "94%" },
      { label: "Active agents", value: "23" },
    ],
    initiatives: [
      { title: "AI chat routing", description: "Implement intelligent conversation routing", status: "In Development" },
      { title: "Sentiment analysis", description: "Add real-time conversation sentiment tracking", status: "Planning" },
      { title: "Performance dashboards", description: "Create agent-specific performance metrics", status: "Beta" },
    ],
  },
  supportTickets: {
    title: "Support Tickets",
    description: "Manage customer support tickets, track resolution times, and ensure timely issue resolution.",
    primaryAction: "Create Ticket",
    metrics: [
      { label: "Open tickets", value: "156", trend: "-8% this week" },
      { label: "Avg resolution time", value: "4.2 hours" },
      { label: "High priority", value: "12" },
      { label: "SLA compliance", value: "96%" },
    ],
    initiatives: [
      { title: "Ticket categorization", description: "Implement automatic ticket categorization", status: "In Progress" },
      { title: "Priority escalation", description: "Auto-escalate high-priority tickets", status: "Deploying" },
      { title: "Knowledge base", description: "Build searchable FAQ and solution database", status: "Planning" },
    ],
  },
};

const createModulePage = (key: keyof typeof modules) => () => <ModuleShell {...modules[key]} />;

export const TeamUserManagementPage = createModulePage("userManagement");
export const TeamDoctorManagementPage = createModulePage("doctorManagement");
export const TeamCorporateManagementPage = createModulePage("corporateManagement");
export const TeamHospitalManagementPage = createModulePage("hospitalManagement");
export const TeamClinicManagementPage = createModulePage("clinicManagement");
export const TeamLabManagementPage = createModulePage("labManagement");
export const TeamPharmacyManagementPage = createModulePage("pharmacyManagement");
export const TeamChatAnalyticsPage = createModulePage("chatAnalytics");
export const TeamSupportTicketsPage = createModulePage("supportTickets");
export const TeamAppointmentsPage = () => {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["team-appointments"],
    queryFn: async () => {
      const { data } = await api.get("/team/appointments?limit=50");
      return data;
    },
  });

  const appointments: any[] = data?.appointments || [];

  const statusColor = (s: string) => {
    if (s === "scheduled") return "bg-blue-900/30 text-blue-300 border-blue-700";
    if (s === "completed") return "bg-teal-900/30 text-teal-300 border-teal-700";
    if (s === "cancelled") return "bg-red-900/30 text-red-300 border-red-700";
    return "bg-gray-900/30 text-gray-300 border-gray-700";
  };

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Team</p>
            <h1 className="text-3xl font-semibold mt-1">Appointments</h1>
            <p className="text-muted-foreground mt-1">Team-created appointments for your assigned organization</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button asChild className="bg-[#00FFF3] text-[#0B1120] font-bold hover:bg-[#00FFF3]/90" size="sm">
              <Link to="/team/corporate-health-booking">+ Corporate Booking</Link>
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading appointments...</div>
        ) : appointments.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center space-y-3">
              <FlaskConical className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-muted-foreground">No appointments found.</p>
              <p className="text-sm text-muted-foreground">Use Corporate Booking or appointment tools to create new appointments.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {data?.total ?? data?.count ?? appointments.length} appointment{appointments.length !== 1 ? "s" : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5 text-muted-foreground text-xs uppercase">
                      <th className="px-4 py-3 text-left">#</th>
                      <th className="px-4 py-3 text-left">Patient / Employee</th>
                      <th className="px-4 py-3 text-left">Provider</th>
                      <th className="px-4 py-3 text-left">Date &amp; Time</th>
                      <th className="px-4 py-3 text-left">Reason</th>
                      <th className="px-4 py-3 text-left">Created By</th>
                      <th className="px-4 py-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appointments.map((apt) => (
                      <tr key={apt.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground">{apt.id}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <User className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            <div>
                              <p className="font-medium">{apt.patientName || apt.patient_name || "Patient"}</p>
                              {(apt.patientPhone || apt.patient_phone || apt.patient_email) && <p className="text-xs text-muted-foreground">{apt.patientPhone || apt.patient_phone || apt.patient_email}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{apt.doctor_name || apt.doctorName || apt.labName || "Provider"}</p>
                          {apt.doctor_id && <p className="text-xs text-muted-foreground">Doctor ID: {apt.doctor_id}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <p>{apt.appointmentDate || apt.appointment_date}</p>
                          <p className="text-xs text-muted-foreground">{apt.appointmentTime || apt.appointment_time}</p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="text-xs capitalize">
                            {apt.reason || apt.serviceType || "appointment"}
                          </Badge>
                          {apt.notes && <p className="text-xs text-muted-foreground mt-1">{apt.notes}</p>}
                        </td>
                        <td className="px-4 py-3">
                          {apt.created_by ? <span>{apt.created_by}</span> : <span className="text-muted-foreground">-</span>}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-xs capitalize ${statusColor(apt.status)}`}>
                            {apt.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
};
export const TeamChatDashboardPage = () => <AdminChatDashboard />;
export const TeamHealthPlansPage = createModulePage("healthPlans");
export const TeamSettingsPage = createModulePage("settings");

// ─── Activity Logs — full real-time implementation ───────────────────────────

interface ActivityLogEntry {
  id: string;
  timestamp: string;
  userId?: string | number;
  userType: "user" | "doctor" | "admin" | "system" | "team";
  userEmail?: string;
  activity: string;
  action: string;
  resource: string;
  resourceId?: string;
  result: "success" | "failure" | "warning" | "info";
  details: string;
  ipAddress?: string;
  userAgent?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  duration?: number;
  metadata?: Record<string, unknown>;
}

interface ActivityStats {
  total: number;
  last24Hours: number;
  last7Days: number;
  failures24h: number;
  byResult: Record<string, number>;
  byUserType: Record<string, number>;
  topActions: { action: string; count: number }[];
}

type Scope = "all" | "mine" | "users";

const RESULT_META: Record<string, { icon: JSX.Element; cls: string; label: string }> = {
  success: { icon: <CheckCircle className="h-3.5 w-3.5" />, cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", label: "Success" },
  failure: { icon: <XCircle className="h-3.5 w-3.5" />, cls: "bg-red-500/15 text-red-400 border-red-500/30", label: "Failure" },
  warning: { icon: <AlertCircle className="h-3.5 w-3.5" />, cls: "bg-amber-500/15 text-amber-400 border-amber-500/30", label: "Warning" },
  info: { icon: <Clock className="h-3.5 w-3.5" />, cls: "bg-blue-500/15 text-blue-400 border-blue-500/30", label: "Info" },
};

const USER_TYPE_META: Record<string, { icon: JSX.Element; cls: string }> = {
  admin:  { icon: <Shield className="h-3.5 w-3.5" />, cls: "text-purple-400" },
  doctor: { icon: <User className="h-3.5 w-3.5" />, cls: "text-blue-400" },
  user:   { icon: <Users className="h-3.5 w-3.5" />, cls: "text-emerald-400" },
  team:   { icon: <Zap className="h-3.5 w-3.5" />, cls: "text-amber-400" },
  system: { icon: <Database className="h-3.5 w-3.5" />, cls: "text-slate-400" },
};

function fmtTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });
}

function fmtDuration(ms?: number) {
  if (!ms) return null;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function downloadCsv(logs: ActivityLogEntry[]) {
  const cols = ["Timestamp", "User", "Type", "Action", "Resource", "Result", "Details", "IP", "Path"];
  const rows = logs.map(l => [
    l.timestamp, l.userEmail || l.userId || "", l.userType,
    l.action, l.resource, l.result, (l.details || "").replace(/,/g, ";"),
    l.ipAddress || "", l.path || ""
  ]);
  const csv = [cols, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `activity-logs-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export const TeamActivityLogsPage = () => {
  const [scope, setScope] = useState<Scope>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [userTypeFilter, setUserTypeFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce search input
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const buildParams = useCallback(() => {
    const p: Record<string, string> = { page: String(page), limit: "25" };
    if (scope !== "all") p.scope = scope;
    if (userTypeFilter !== "all") p.userType = userTypeFilter;
    if (actionFilter !== "all") p.action = actionFilter;
    if (resultFilter !== "all") p.result = resultFilter;
    if (startDate) p.startDate = startDate;
    if (endDate) p.endDate = endDate;
    if (debouncedSearch) p.search = debouncedSearch;
    return new URLSearchParams(p).toString();
  }, [scope, page, userTypeFilter, actionFilter, resultFilter, startDate, endDate, debouncedSearch]);

  const { data: logsData, isLoading: logsLoading, refetch: refetchLogs, isFetching } = useQuery({
    queryKey: ["team-activity-logs", scope, page, userTypeFilter, actionFilter, resultFilter, startDate, endDate, debouncedSearch],
    queryFn: async () => {
      const { data } = await api.get(`/team/activity-logs?${buildParams()}`);
      return data;
    },
    refetchInterval: autoRefresh ? 30_000 : false,
  });

  const { data: statsData, refetch: refetchStats } = useQuery({
    queryKey: ["team-activity-stats"],
    queryFn: async () => {
      const { data } = await api.get("/team/activity-stats");
      return data;
    },
    refetchInterval: autoRefresh ? 60_000 : false,
  });

  const logs: ActivityLogEntry[] = logsData?.logs || [];
  const pagination = logsData?.pagination;
  const stats: ActivityStats | undefined = statsData?.stats;

  const handleRefresh = useCallback(() => {
    refetchLogs();
    refetchStats();
  }, [refetchLogs, refetchStats]);

  const clearFilters = () => {
    setSearch(""); setUserTypeFilter("all"); setActionFilter("all");
    setResultFilter("all"); setStartDate(""); setEndDate(""); setPage(1);
  };

  const hasFilters = userTypeFilter !== "all" || actionFilter !== "all" || resultFilter !== "all" || startDate || endDate || debouncedSearch;

  const TABS: { key: Scope; label: string; icon: JSX.Element }[] = [
    { key: "all", label: "All Activity", icon: <Activity className="h-3.5 w-3.5" /> },
    { key: "mine", label: "My Activity", icon: <Shield className="h-3.5 w-3.5" /> },
    { key: "users", label: "Users / Patients", icon: <Users className="h-3.5 w-3.5" /> },
  ];

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto space-y-5 animate-in fade-in">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Team / Audit</p>
            <h1 className="text-2xl font-semibold mt-0.5">Activity & Audit Logs</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Real-time record of all platform actions — your activity, users, doctors, and system events.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(v => !v)}
              className={autoRefresh ? "border-primary/50 text-primary" : ""}
            >
              <Zap className={`h-3.5 w-3.5 mr-1.5 ${autoRefresh ? "text-primary" : ""}`} />
              {autoRefresh ? "Live" : "Auto-refresh"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadCsv(logs)}
              disabled={logs.length === 0}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export
            </Button>
          </div>
        </div>

        {/* ── Stats bar ── */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Events (24h)", value: stats.last24Hours.toLocaleString(), icon: <Activity className="h-4 w-4 text-primary" />, sub: `${stats.total.toLocaleString()} total` },
              { label: "Failures (24h)", value: stats.failures24h.toLocaleString(), icon: <XCircle className="h-4 w-4 text-red-400" />, sub: "Needs attention" },
              { label: "User Events", value: stats.byUserType.user?.toLocaleString() || "0", icon: <Users className="h-4 w-4 text-emerald-400" />, sub: "Patients / users" },
              { label: "7-Day Volume", value: stats.last7Days.toLocaleString(), icon: <TrendingUp className="h-4 w-4 text-blue-400" />, sub: "Rolling window" },
            ].map(m => (
              <div key={m.label} className="rounded-xl border bg-muted/40 p-4 flex items-start gap-3">
                <div className="mt-0.5">{m.icon}</div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{m.label}</p>
                  <p className="text-xl font-semibold">{m.value}</p>
                  <p className="text-xs text-muted-foreground">{m.sub}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Scope tabs ── */}
        <div className="flex gap-1 p-1 rounded-lg bg-muted/40 border w-fit">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => { setScope(t.key); setPage(1); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                scope === t.key
                  ? "bg-background border shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* ── Filters ── */}
        <Card>
          <CardContent className="p-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
              <div className="relative lg:col-span-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search activity, email, IP…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>

              <Select value={resultFilter} onValueChange={v => { setResultFilter(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Result" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All results</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="failure">Failure</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>

              <Select value={userTypeFilter} onValueChange={v => { setUserTypeFilter(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="User type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="user">User / Patient</SelectItem>
                  <SelectItem value="doctor">Doctor</SelectItem>
                  <SelectItem value="admin">Admin / Team</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>

              <Select value={actionFilter} onValueChange={v => { setActionFilter(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Action" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  <SelectItem value="login">Login</SelectItem>
                  <SelectItem value="logout">Logout</SelectItem>
                  <SelectItem value="create">Create</SelectItem>
                  <SelectItem value="update">Update</SelectItem>
                  <SelectItem value="delete">Delete</SelectItem>
                  <SelectItem value="view">View</SelectItem>
                  <SelectItem value="export">Export</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="date"
                  value={startDate}
                  onChange={e => { setStartDate(e.target.value); setPage(1); }}
                  className="h-7 rounded border bg-background px-2 text-xs"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => { setEndDate(e.target.value); setPage(1); }}
                  className="h-7 rounded border bg-background px-2 text-xs"
                />
              </div>
              {hasFilters && (
                <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
                  Clear filters
                </button>
              )}
              {pagination && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {pagination.total.toLocaleString()} result{pagination.total !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Log table ── */}
        <Card>
          <CardContent className="p-0">
            {logsLoading ? (
              <div className="py-20 text-center text-muted-foreground">
                <Activity className="h-8 w-8 mx-auto mb-3 animate-pulse" />
                Loading activity logs…
              </div>
            ) : logs.length === 0 ? (
              <div className="py-20 text-center space-y-2">
                <Activity className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-muted-foreground">No activity logs found.</p>
                {hasFilters && (
                  <button onClick={clearFilters} className="text-xs text-primary underline">
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase text-muted-foreground">
                      <th className="px-4 py-3 text-left w-6" />
                      <th className="px-4 py-3 text-left">Time</th>
                      <th className="px-4 py-3 text-left">User</th>
                      <th className="px-4 py-3 text-left">Activity</th>
                      <th className="px-4 py-3 text-left">Resource</th>
                      <th className="px-4 py-3 text-left">Result</th>
                      <th className="px-4 py-3 text-left">IP / Dur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => {
                      const rm = RESULT_META[log.result] || RESULT_META.info;
                      const um = USER_TYPE_META[log.userType] || USER_TYPE_META.system;
                      const isExpanded = expandedId === log.id;
                      return (
                        <>
                          <tr
                            key={log.id}
                            className={`border-b transition-colors cursor-pointer hover:bg-muted/30 ${isExpanded ? "bg-muted/20" : ""}`}
                            onClick={() => setExpandedId(isExpanded ? null : log.id)}
                          >
                            <td className="px-4 py-3">
                              {isExpanded
                                ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                              }
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                              {fmtTime(log.timestamp)}
                            </td>
                            <td className="px-4 py-3">
                              <div className={`flex items-center gap-1.5 ${um.cls}`}>
                                {um.icon}
                                <span className="font-medium truncate max-w-[120px]">
                                  {log.userEmail || (log.userId ? `#${log.userId}` : "—")}
                                </span>
                              </div>
                              <p className="text-[10px] text-muted-foreground capitalize">{log.userType}</p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium">{log.activity}</p>
                              <p className="text-xs text-muted-foreground truncate max-w-[180px]">{log.details}</p>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className="text-[10px] capitalize">{log.resource}</Badge>
                              {log.method && (
                                <p className="text-[10px] text-muted-foreground mt-0.5">{log.method}</p>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={`text-[10px] flex items-center gap-1 w-fit ${rm.cls}`}>
                                {rm.icon}{rm.label}
                              </Badge>
                              {log.statusCode && (
                                <p className="text-[10px] text-muted-foreground mt-0.5">{log.statusCode}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                              {log.ipAddress || "—"}
                              {log.duration && (
                                <p className="text-[10px]">{fmtDuration(log.duration)}</p>
                              )}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${log.id}-detail`} className="border-b bg-muted/10">
                              <td colSpan={7} className="px-6 py-4">
                                <div className="grid sm:grid-cols-2 gap-4 text-xs">
                                  <div className="space-y-1.5">
                                    <p><span className="text-muted-foreground">Log ID:</span> <span className="font-mono">{log.id}</span></p>
                                    <p><span className="text-muted-foreground">Full timestamp:</span> {new Date(log.timestamp).toLocaleString("en-IN")}</p>
                                    <p><span className="text-muted-foreground">Path:</span> <span className="font-mono">{log.path || "—"}</span></p>
                                    <p><span className="text-muted-foreground">Resource ID:</span> {log.resourceId || "—"}</p>
                                  </div>
                                  <div className="space-y-1.5">
                                    <p><span className="text-muted-foreground">User agent:</span> <span className="break-all">{log.userAgent || "—"}</span></p>
                                    <p><span className="text-muted-foreground">Details:</span> {log.details}</p>
                                    {log.metadata && (
                                      <p><span className="text-muted-foreground">Session:</span> {(log.metadata as any).sessionId || "—"}</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Pagination ── */}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <p className="text-muted-foreground text-xs">
              Page {pagination.page} of {pagination.pages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pagination.pages}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}

      </div>
    </MainLayout>
  );
};
