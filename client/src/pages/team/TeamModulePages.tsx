import MainLayout from "@/components/layout/MainLayout";
import AdminChatDashboard from "@/pages/admin/AdminChatDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";

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
}

const ModuleShell = ({ title, description, metrics, initiatives, primaryAction, primaryActionHref }: ModuleConfig) => {
  const handlePrimaryAction = () => {
    if (title === "User Management") {
      // Navigate to admin users page
      window.location.href = '/admin/users';
    } else if (title === "Doctor Network") {
      // Navigate to admin doctors page
      window.location.href = '/admin/doctors';
    } else if (primaryActionHref) {
      window.location.href = primaryActionHref;
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
    metrics: [
      { label: "Active users", value: "1,240", trend: "+3.2% vs last week" },
      { label: "Pending invites", value: "18" },
      { label: "Access reviews", value: "4 due" },
      { label: "Support escalations", value: "2 open" },
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
    metrics: [
      { label: "Active doctors", value: "362", trend: "+12 new this month" },
      { label: "Pending verifications", value: "5" },
      { label: "Avg rating", value: "4.86" },
      { label: "Availability gaps", value: "3 specialties" },
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
    metrics: [
      { label: "Active contracts", value: "42" },
      { label: "Renewals this month", value: "6" },
      { label: "Coverage rate", value: "92%" },
      { label: "Open escalations", value: "3" },
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
    metrics: [
      { label: "Hospitals live", value: "58" },
      { label: "Pending vetting", value: "5" },
      { label: "Avg response SLA", value: "1h 12m" },
      { label: "Availability alerts", value: "2" },
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
    metrics: [
      { label: "Clinics onboarded", value: "134" },
      { label: "Daily queue load", value: "482 visits" },
      { label: "Pending payouts", value: "₹3.4L" },
      { label: "Compliance issues", value: "0" },
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
    metrics: [
      { label: "Labs live", value: "76" },
      { label: "Samples today", value: "1,204" },
      { label: "Delayed reports", value: "8" },
      { label: "Automation coverage", value: "68%" },
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
    metrics: [
      { label: "Bookings today", value: "612" },
      { label: "Reschedules", value: "44" },
      { label: "High priority", value: "9" },
      { label: "SLA compliance", value: "97%" },
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
    metrics: [
      { label: "Active pharmacies", value: "127", trend: "+5 this month" },
      { label: "Total medicines", value: "45.2K" },
      { label: "Low stock alerts", value: "12" },
      { label: "Monthly revenue", value: "₹2.4M" },
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
export const TeamAppointmentsPage = createModulePage("appointments");
export const TeamChatDashboardPage = () => <AdminChatDashboard />;
export const TeamHealthPlansPage = createModulePage("healthPlans");
export const TeamActivityLogsPage = createModulePage("activityLogs");
export const TeamSettingsPage = createModulePage("settings");
