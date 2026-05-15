/**
 * DepartmentDashboards — full-featured dashboard pages for 11 hospital
 * department portals: Asset, Biomedical, Blood Bank, Consent, CSSD, Dietary,
 * Finance, Infection Control, Mortuary, Procurement, Queue Management.
 *
 * All stat values are static placeholders ("0" / "—") until backend API
 * integration is added per department.
 */
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import DeptStaffLayout, { DeptNavSection } from "@/components/hosp-dept/DeptStaffLayout";
import { DeptAuthData } from "@/hooks/useHospDeptAuth";
import {
  Archive, Wrench, Droplets, ClipboardCheck, ShieldCheck, Utensils,
  Banknote, ShieldAlert, HeartPulse, PackageCheck, Activity,
  LayoutDashboard, Boxes, Hammer, BarChart3, Stethoscope, CalendarClock,
  Clipboard, FileCheck, FileText, BookOpen, Utensils as UtensilsAlt,
  CreditCard, TrendingDown, DollarSign, Eye, AlertTriangle, Beaker,
  Users, Timer, MonitorCheck, Clock, CheckCircle2, Truck, ShoppingCart,
  UserCheck, Hash, ArrowRightLeft, History, Layers, Flame,
  CalendarDays, ListChecks, FilePlus, FileBarChart2, Monitor,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StatCard {
  icon: React.ElementType;
  label: string;
  value: string;
  gradient: string;
  iconBg: string;
}

interface QuickAction {
  icon: React.ElementType;
  label: string;
  path: string;
}

interface DeptDashboardConfig {
  deptKey: string;
  deptName: string;
  badgeLabel: string;
  DeptIcon: React.ElementType;
  loginPath: string;
  navSections: DeptNavSection[];
  heroGradient: string;
  stats: StatCard[];
  quickActions: QuickAction[];
}

// ─── Shared dashboard renderer ────────────────────────────────────────────────

const DeptDashboard = ({ config, deptData }: { config: DeptDashboardConfig; deptData: DeptAuthData | null }) => {
  const navigate = useNavigate();
  const displayName = deptData?.name ?? deptData?.email ?? `${config.deptName} Staff`;
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="space-y-6">
      {/* Hero banner */}
      <div className={`relative overflow-hidden rounded-2xl p-6 text-white ${config.heroGradient}`}>
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
              <config.DeptIcon className="h-8 w-8 text-white" />
            </div>
            <div>
              <p className="text-white/80 text-sm font-medium">Welcome back,</p>
              <h2 className="text-2xl font-bold">{displayName}</h2>
              <p className="text-white/70 text-sm mt-0.5">{config.deptName}</p>
            </div>
          </div>
          <div className="hidden md:block text-right">
            <p className="text-3xl font-bold">{timeStr}</p>
            <p className="text-white/70 text-sm mt-1">{dateStr}</p>
          </div>
        </div>
        {/* decorative circles */}
        <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/5 rounded-full" />
        <div className="absolute -bottom-12 -right-4 w-56 h-56 bg-white/5 rounded-full" />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {config.stats.map((stat) => (
          <Card key={stat.label} className="overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide">
                    {stat.label}
                  </p>
                  <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">
                    {stat.value}
                  </p>
                </div>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.iconBg}`}>
                  <stat.icon className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4 text-teal-600" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {config.quickActions.map((action) => (
              <button
                key={action.path}
                onClick={() => navigate(action.path)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-teal-400 hover:bg-teal-50/50 dark:hover:bg-teal-950/30 transition-all duration-200 group"
              >
                <div className="w-10 h-10 bg-teal-50 dark:bg-teal-950 rounded-xl flex items-center justify-center group-hover:bg-teal-100 dark:group-hover:bg-teal-900 transition-colors">
                  <action.icon className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                </div>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 text-center leading-tight">
                  {action.label}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent activity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4 text-teal-600" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-slate-400">
            <CheckCircle2 className="h-10 w-10 opacity-30" />
            <div className="text-center">
              <p className="text-sm font-medium">No recent activity</p>
              <p className="text-xs mt-1 text-slate-400/70">
                Activity feed will appear here once the module is live.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ─── Wrapper that calls DeptStaffLayout + feeds deptData ──────────────────────

const DashboardWrapper = ({ config }: { config: DeptDashboardConfig }) => {
  // We render the layout (which calls useDeptStaffAuth internally) and pass
  // deptData via a render-prop pattern through children.
  // Since DeptStaffLayout doesn't expose deptData, we read it separately via
  // a thin inner component that receives it as a prop.
  return (
    <DeptStaffLayout
      deptKey={config.deptKey}
      deptName={config.deptName}
      badgeLabel={config.badgeLabel}
      loginPath={config.loginPath}
      DeptIcon={config.DeptIcon}
      navSections={config.navSections}
      title="Dashboard"
      subtitle={`${config.deptName} overview`}
    >
      <DeptDashboard config={config} deptData={null} />
    </DeptStaffLayout>
  );
};

// ─── Department configs ───────────────────────────────────────────────────────

// ── Asset Management ──────────────────────────────────────────────────────────
const assetNav: DeptNavSection[] = [
  {
    title: "Overview",
    items: [{ icon: LayoutDashboard, label: "Dashboard", href: "/asset/dashboard" }],
  },
  {
    title: "Operations",
    items: [
      { icon: Boxes,     label: "Inventory",   href: "/asset/inventory" },
      { icon: Hammer,    label: "Maintenance", href: "/asset/maintenance" },
    ],
  },
  {
    title: "Reporting",
    items: [{ icon: BarChart3, label: "Reports", href: "/asset/reports" }],
  },
];

const assetConfig: DeptDashboardConfig = {
  deptKey: "asset",
  deptName: "Asset Management",
  badgeLabel: "ASSET",
  DeptIcon: Archive,
  loginPath: "/asset/login",
  navSections: assetNav,
  heroGradient: "bg-gradient-to-br from-amber-500 to-amber-700",
  stats: [
    { icon: Archive,    label: "Total Assets",       value: "0", gradient: "", iconBg: "bg-amber-100 dark:bg-amber-950 text-amber-600" },
    { icon: Hammer,     label: "Under Maintenance",  value: "0", gradient: "", iconBg: "bg-red-100 dark:bg-red-950 text-red-600" },
    { icon: CheckCircle2, label: "Available",        value: "0", gradient: "", iconBg: "bg-green-100 dark:bg-green-950 text-green-600" },
    { icon: CalendarDays, label: "New This Month",   value: "0", gradient: "", iconBg: "bg-blue-100 dark:bg-blue-950 text-blue-600" },
  ],
  quickActions: [
    { icon: Boxes,     label: "View Inventory",  path: "/asset/inventory" },
    { icon: Hammer,    label: "Maintenance Log", path: "/asset/maintenance" },
    { icon: FilePlus,  label: "Add Asset",       path: "/asset/inventory" },
    { icon: BarChart3, label: "Reports",         path: "/asset/reports" },
  ],
};

// ── Biomedical Engineering ────────────────────────────────────────────────────
const biomedNav: DeptNavSection[] = [
  {
    title: "Overview",
    items: [{ icon: LayoutDashboard, label: "Dashboard", href: "/biomedical/dashboard" }],
  },
  {
    title: "Monitoring",
    items: [{ icon: Monitor, label: "Device Monitoring", href: "/biomedical/monitoring" }],
  },
  {
    title: "Equipment",
    items: [
      { icon: Stethoscope, label: "Equipment",    href: "/biomedical/equipment" },
      { icon: ListChecks,  label: "Work Orders",  href: "/biomedical/work-orders" },
      { icon: CalendarClock, label: "Calibration", href: "/biomedical/calibration" },
    ],
  },
  {
    title: "Reporting",
    items: [{ icon: BarChart3, label: "Reports", href: "/biomedical/reports" }],
  },
];

const biomedConfig: DeptDashboardConfig = {
  deptKey: "biomedical",
  deptName: "Biomedical Engineering",
  badgeLabel: "BIOMED",
  DeptIcon: Wrench,
  loginPath: "/biomedical/login",
  navSections: biomedNav,
  heroGradient: "bg-gradient-to-br from-blue-600 to-blue-800",
  stats: [
    { icon: Stethoscope,  label: "Total Equipment",       value: "0", gradient: "", iconBg: "bg-blue-100 dark:bg-blue-950 text-blue-600" },
    { icon: CalendarClock, label: "Pending Calibration",  value: "0", gradient: "", iconBg: "bg-amber-100 dark:bg-amber-950 text-amber-600" },
    { icon: ListChecks,   label: "Open Work Orders",      value: "0", gradient: "", iconBg: "bg-red-100 dark:bg-red-950 text-red-600" },
    { icon: CheckCircle2, label: "Completed This Month",  value: "0", gradient: "", iconBg: "bg-green-100 dark:bg-green-950 text-green-600" },
  ],
  quickActions: [
    { icon: Monitor,      label: "Device Monitoring", path: "/biomedical/monitoring" },
    { icon: Stethoscope,  label: "Equipment List",    path: "/biomedical/equipment" },
    { icon: ListChecks,   label: "Work Orders",       path: "/biomedical/work-orders" },
    { icon: CalendarClock, label: "Calibration Log",  path: "/biomedical/calibration" },
    { icon: BarChart3,    label: "Reports",           path: "/biomedical/reports" },
  ],
};

// ── Blood Bank ────────────────────────────────────────────────────────────────
const bloodBankNav: DeptNavSection[] = [
  {
    title: "Overview",
    items: [{ icon: LayoutDashboard, label: "Dashboard", href: "/blood-bank/dashboard" }],
  },
  {
    title: "Stock",
    items: [
      { icon: Boxes,         label: "Inventory",     href: "/blood-bank/inventory" },
      { icon: ArrowRightLeft, label: "Requisitions", href: "/blood-bank/requisitions" },
      { icon: Users,         label: "Donors",        href: "/blood-bank/donors" },
    ],
  },
  {
    title: "Reporting",
    items: [{ icon: BarChart3, label: "Reports", href: "/blood-bank/reports" }],
  },
];

const bloodBankConfig: DeptDashboardConfig = {
  deptKey: "blood-bank",
  deptName: "Blood Bank",
  badgeLabel: "BLOOD BANK",
  DeptIcon: Droplets,
  loginPath: "/blood-bank/login",
  navSections: bloodBankNav,
  heroGradient: "bg-gradient-to-br from-red-600 to-red-800",
  stats: [
    { icon: Droplets,       label: "Units Available",   value: "0", gradient: "", iconBg: "bg-red-100 dark:bg-red-950 text-red-600" },
    { icon: AlertTriangle,  label: "Expiring ≤7 Days",  value: "0", gradient: "", iconBg: "bg-amber-100 dark:bg-amber-950 text-amber-600" },
    { icon: ArrowRightLeft, label: "Today's Issues",    value: "0", gradient: "", iconBg: "bg-blue-100 dark:bg-blue-950 text-blue-600" },
    { icon: Clock,          label: "Pending Requests",  value: "0", gradient: "", iconBg: "bg-purple-100 dark:bg-purple-950 text-purple-600" },
  ],
  quickActions: [
    { icon: Boxes,         label: "View Inventory",  path: "/blood-bank/inventory" },
    { icon: ArrowRightLeft, label: "Requisitions",   path: "/blood-bank/requisitions" },
    { icon: Users,         label: "Donors",          path: "/blood-bank/donors" },
    { icon: FilePlus,      label: "New Issue",       path: "/blood-bank/requisitions" },
    { icon: BarChart3,     label: "Reports",         path: "/blood-bank/reports" },
  ],
};

// ── Consent Management ────────────────────────────────────────────────────────
const consentNav: DeptNavSection[] = [
  {
    title: "Overview",
    items: [{ icon: LayoutDashboard, label: "Dashboard", href: "/consent/dashboard" }],
  },
  {
    title: "Consents",
    items: [
      { icon: Clock,       label: "Pending",   href: "/consent/pending" },
      { icon: FileCheck,   label: "Signed",    href: "/consent/signed" },
      { icon: BookOpen,    label: "Templates", href: "/consent/templates" },
    ],
  },
  {
    title: "Reporting",
    items: [{ icon: BarChart3, label: "Reports", href: "/consent/reports" }],
  },
];

const consentConfig: DeptDashboardConfig = {
  deptKey: "consent",
  deptName: "Consent Management",
  badgeLabel: "CONSENT",
  DeptIcon: ClipboardCheck,
  loginPath: "/consent/login",
  navSections: consentNav,
  heroGradient: "bg-gradient-to-br from-purple-600 to-purple-800",
  stats: [
    { icon: Clock,        label: "Pending Consents",  value: "0", gradient: "", iconBg: "bg-amber-100 dark:bg-amber-950 text-amber-600" },
    { icon: FileCheck,    label: "Signed Today",      value: "0", gradient: "", iconBg: "bg-green-100 dark:bg-green-950 text-green-600" },
    { icon: AlertTriangle, label: "Expiring Soon",    value: "0", gradient: "", iconBg: "bg-red-100 dark:bg-red-950 text-red-600" },
    { icon: BookOpen,     label: "Active Templates",  value: "0", gradient: "", iconBg: "bg-purple-100 dark:bg-purple-950 text-purple-600" },
  ],
  quickActions: [
    { icon: Clock,     label: "Pending Consents",  path: "/consent/pending" },
    { icon: FileCheck, label: "Signed Consents",   path: "/consent/signed" },
    { icon: BookOpen,  label: "Templates",         path: "/consent/templates" },
    { icon: BarChart3, label: "Reports",           path: "/consent/reports" },
  ],
};

// ── CSSD ──────────────────────────────────────────────────────────────────────
const cssdNav: DeptNavSection[] = [
  {
    title: "Overview",
    items: [{ icon: LayoutDashboard, label: "Dashboard", href: "/cssd/dashboard" }],
  },
  {
    title: "Operations",
    items: [
      { icon: ListChecks, label: "Jobs",       href: "/cssd/jobs" },
      { icon: Layers,     label: "Equipment",  href: "/cssd/equipment" },
      { icon: Flame,      label: "Cycle Log",  href: "/cssd/cycles" },
    ],
  },
  {
    title: "Reporting",
    items: [{ icon: BarChart3, label: "Reports", href: "/cssd/reports" }],
  },
];

const cssdConfig: DeptDashboardConfig = {
  deptKey: "cssd",
  deptName: "CSSD",
  badgeLabel: "CSSD",
  DeptIcon: ShieldCheck,
  loginPath: "/cssd/login",
  navSections: cssdNav,
  heroGradient: "bg-gradient-to-br from-teal-600 to-teal-800",
  stats: [
    { icon: Flame,        label: "Active Cycles",       value: "0", gradient: "", iconBg: "bg-orange-100 dark:bg-orange-950 text-orange-600" },
    { icon: CheckCircle2, label: "Completed Today",     value: "0", gradient: "", iconBg: "bg-green-100 dark:bg-green-950 text-green-600" },
    { icon: ArrowRightLeft, label: "Pending Returns",   value: "0", gradient: "", iconBg: "bg-amber-100 dark:bg-amber-950 text-amber-600" },
    { icon: Layers,       label: "In Sterilization",    value: "0", gradient: "", iconBg: "bg-teal-100 dark:bg-teal-950 text-teal-600" },
  ],
  quickActions: [
    { icon: ListChecks, label: "Jobs",         path: "/cssd/jobs" },
    { icon: Layers,     label: "Equipment",    path: "/cssd/equipment" },
    { icon: Flame,      label: "Cycle Log",    path: "/cssd/cycles" },
    { icon: FilePlus,   label: "New Job",      path: "/cssd/jobs" },
    { icon: BarChart3,  label: "Reports",      path: "/cssd/reports" },
  ],
};

// ── Dietary Services ──────────────────────────────────────────────────────────
const dietaryNav: DeptNavSection[] = [
  {
    title: "Overview",
    items: [{ icon: LayoutDashboard, label: "Dashboard", href: "/dietary/dashboard" }],
  },
  {
    title: "Diet Management",
    items: [
      { icon: Clipboard,    label: "Diet Orders",       href: "/dietary/orders" },
      { icon: CalendarDays, label: "Meal Plans",        href: "/dietary/plans" },
      { icon: Users,        label: "Patients",          href: "/dietary/patients" },
      { icon: Activity,     label: "Patient Monitoring", href: "/dietary/monitoring" },
    ],
  },
  {
    title: "Reporting",
    items: [{ icon: BarChart3, label: "Reports", href: "/dietary/reports" }],
  },
];

const dietaryConfig: DeptDashboardConfig = {
  deptKey: "dietary",
  deptName: "Dietary Services",
  badgeLabel: "DIETARY",
  DeptIcon: Utensils,
  loginPath: "/dietary/login",
  navSections: dietaryNav,
  heroGradient: "bg-gradient-to-br from-green-600 to-green-800",
  stats: [
    { icon: Clipboard,    label: "Active Diet Orders",    value: "0", gradient: "", iconBg: "bg-green-100 dark:bg-green-950 text-green-600" },
    { icon: CalendarDays, label: "Meals Planned Today",   value: "0", gradient: "", iconBg: "bg-blue-100 dark:bg-blue-950 text-blue-600" },
    { icon: UtensilsAlt,  label: "Special Diets",         value: "0", gradient: "", iconBg: "bg-amber-100 dark:bg-amber-950 text-amber-600" },
    { icon: AlertTriangle, label: "NPO Patients",         value: "0", gradient: "", iconBg: "bg-red-100 dark:bg-red-950 text-red-600" },
  ],
  quickActions: [
    { icon: Clipboard,    label: "Diet Orders",   path: "/dietary/orders" },
    { icon: CalendarDays, label: "Meal Plans",    path: "/dietary/plans" },
    { icon: Users,        label: "Patients",      path: "/dietary/patients" },
    { icon: FilePlus,     label: "New Order",     path: "/dietary/orders" },
    { icon: BarChart3,    label: "Reports",       path: "/dietary/reports" },
  ],
};

// ── Finance ───────────────────────────────────────────────────────────────────
const financeNav: DeptNavSection[] = [
  {
    title: "Overview",
    items: [{ icon: LayoutDashboard, label: "Dashboard", href: "/finance/dashboard" }],
  },
  {
    title: "Finance",
    items: [
      { icon: CreditCard,    label: "Billing",       href: "/finance/billing" },
      { icon: DollarSign,    label: "Collections",   href: "/finance/collections" },
      { icon: TrendingDown,  label: "Expenses",      href: "/finance/expenses" },
    ],
  },
  {
    title: "Reporting",
    items: [{ icon: BarChart3, label: "Reports", href: "/finance/reports" }],
  },
];

const financeConfig: DeptDashboardConfig = {
  deptKey: "finance",
  deptName: "Finance",
  badgeLabel: "FINANCE",
  DeptIcon: Banknote,
  loginPath: "/finance/login",
  navSections: financeNav,
  heroGradient: "bg-gradient-to-br from-emerald-600 to-emerald-800",
  stats: [
    { icon: DollarSign,   label: "Today's Collections",   value: "₹0",  gradient: "", iconBg: "bg-emerald-100 dark:bg-emerald-950 text-emerald-600" },
    { icon: Clock,        label: "Pending Bills",          value: "0",   gradient: "", iconBg: "bg-amber-100 dark:bg-amber-950 text-amber-600" },
    { icon: AlertTriangle, label: "Outstanding",           value: "₹0",  gradient: "", iconBg: "bg-red-100 dark:bg-red-950 text-red-600" },
    { icon: TrendingDown, label: "Expenses This Month",    value: "₹0",  gradient: "", iconBg: "bg-blue-100 dark:bg-blue-950 text-blue-600" },
  ],
  quickActions: [
    { icon: CreditCard,   label: "Billing",        path: "/finance/billing" },
    { icon: DollarSign,   label: "Collections",    path: "/finance/collections" },
    { icon: TrendingDown, label: "Expenses",        path: "/finance/expenses" },
    { icon: FilePlus,     label: "New Bill",       path: "/finance/billing" },
    { icon: BarChart3,    label: "Reports",        path: "/finance/reports" },
  ],
};

// ── Infection Control ─────────────────────────────────────────────────────────
const infectionControlNav: DeptNavSection[] = [
  {
    title: "Overview",
    items: [{ icon: LayoutDashboard, label: "Dashboard", href: "/infection-control/dashboard" }],
  },
  {
    title: "Surveillance",
    items: [
      { icon: Eye,          label: "Surveillance", href: "/infection-control/surveillance" },
      { icon: FileText,     label: "Incidents",    href: "/infection-control/incidents" },
      { icon: AlertTriangle, label: "Alerts",      href: "/infection-control/alerts" },
    ],
  },
  {
    title: "Reporting",
    items: [{ icon: BarChart3, label: "Reports", href: "/infection-control/reports" }],
  },
];

const infectionControlConfig: DeptDashboardConfig = {
  deptKey: "infection-control",
  deptName: "Infection Control",
  badgeLabel: "INF. CTRL",
  DeptIcon: ShieldAlert,
  loginPath: "/infection-control/login",
  navSections: infectionControlNav,
  heroGradient: "bg-gradient-to-br from-orange-600 to-orange-800",
  stats: [
    { icon: Eye,           label: "Active Surveillance",   value: "0", gradient: "", iconBg: "bg-blue-100 dark:bg-blue-950 text-blue-600" },
    { icon: AlertTriangle, label: "HAI Incidents (MTD)",   value: "0", gradient: "", iconBg: "bg-red-100 dark:bg-red-950 text-red-600" },
    { icon: Beaker,        label: "Cultures Pending",      value: "0", gradient: "", iconBg: "bg-amber-100 dark:bg-amber-950 text-amber-600" },
    { icon: ShieldAlert,   label: "Open Alerts",           value: "0", gradient: "", iconBg: "bg-orange-100 dark:bg-orange-950 text-orange-600" },
  ],
  quickActions: [
    { icon: Eye,           label: "Surveillance", path: "/infection-control/surveillance" },
    { icon: FileText,      label: "Incidents",    path: "/infection-control/incidents" },
    { icon: AlertTriangle, label: "Alerts",       path: "/infection-control/alerts" },
    { icon: FilePlus,      label: "New Incident", path: "/infection-control/incidents" },
    { icon: BarChart3,     label: "Reports",      path: "/infection-control/reports" },
  ],
};

// ── Mortuary ──────────────────────────────────────────────────────────────────
const mortuaryNav: DeptNavSection[] = [
  {
    title: "Overview",
    items: [{ icon: LayoutDashboard, label: "Dashboard", href: "/mortuary/dashboard" }],
  },
  {
    title: "Management",
    items: [
      { icon: FileText,      label: "Cases",    href: "/mortuary/cases" },
      { icon: UserCheck,     label: "Releases", href: "/mortuary/releases" },
      { icon: BookOpen,      label: "Records",  href: "/mortuary/records" },
    ],
  },
  {
    title: "Reporting",
    items: [{ icon: BarChart3, label: "Reports", href: "/mortuary/reports" }],
  },
];

const mortuaryConfig: DeptDashboardConfig = {
  deptKey: "mortuary",
  deptName: "Mortuary",
  badgeLabel: "MORTUARY",
  DeptIcon: HeartPulse,
  loginPath: "/mortuary/login",
  navSections: mortuaryNav,
  heroGradient: "bg-gradient-to-br from-slate-600 to-slate-800",
  stats: [
    { icon: HeartPulse,   label: "Current Occupancy",   value: "0", gradient: "", iconBg: "bg-slate-100 dark:bg-slate-950 text-slate-600" },
    { icon: UserCheck,    label: "Pending Release",     value: "0", gradient: "", iconBg: "bg-amber-100 dark:bg-amber-950 text-amber-600" },
    { icon: FileText,     label: "Awaiting Docs",       value: "0", gradient: "", iconBg: "bg-red-100 dark:bg-red-950 text-red-600" },
    { icon: CalendarDays, label: "Today's Admissions",  value: "0", gradient: "", iconBg: "bg-blue-100 dark:bg-blue-950 text-blue-600" },
  ],
  quickActions: [
    { icon: FileText,  label: "Cases",       path: "/mortuary/cases" },
    { icon: UserCheck, label: "Releases",    path: "/mortuary/releases" },
    { icon: BookOpen,  label: "Records",     path: "/mortuary/records" },
    { icon: FilePlus,  label: "New Case",    path: "/mortuary/cases" },
    { icon: BarChart3, label: "Reports",     path: "/mortuary/reports" },
  ],
};

// ── Procurement ───────────────────────────────────────────────────────────────
const procurementNav: DeptNavSection[] = [
  {
    title: "Overview",
    items: [{ icon: LayoutDashboard, label: "Dashboard", href: "/procurement/dashboard" }],
  },
  {
    title: "Purchasing",
    items: [
      { icon: ShoppingCart, label: "Purchase Orders", href: "/procurement/orders" },
      { icon: Truck,        label: "Vendors",         href: "/procurement/vendors" },
      { icon: MonitorCheck, label: "Approvals",       href: "/procurement/approvals" },
    ],
  },
  {
    title: "Reporting",
    items: [{ icon: BarChart3, label: "Reports", href: "/procurement/reports" }],
  },
];

const procurementConfig: DeptDashboardConfig = {
  deptKey: "procurement",
  deptName: "Procurement",
  badgeLabel: "PROCURE",
  DeptIcon: PackageCheck,
  loginPath: "/procurement/login",
  navSections: procurementNav,
  heroGradient: "bg-gradient-to-br from-indigo-600 to-indigo-800",
  stats: [
    { icon: ShoppingCart, label: "Open POs",              value: "0",  gradient: "", iconBg: "bg-indigo-100 dark:bg-indigo-950 text-indigo-600" },
    { icon: MonitorCheck, label: "Pending Approvals",     value: "0",  gradient: "", iconBg: "bg-amber-100 dark:bg-amber-950 text-amber-600" },
    { icon: Truck,        label: "Received This Month",   value: "0",  gradient: "", iconBg: "bg-green-100 dark:bg-green-950 text-green-600" },
    { icon: DollarSign,   label: "Total PO Value",        value: "₹0", gradient: "", iconBg: "bg-blue-100 dark:bg-blue-950 text-blue-600" },
  ],
  quickActions: [
    { icon: ShoppingCart, label: "Purchase Orders", path: "/procurement/orders" },
    { icon: Truck,        label: "Vendors",         path: "/procurement/vendors" },
    { icon: MonitorCheck, label: "Approvals",       path: "/procurement/approvals" },
    { icon: FilePlus,     label: "New PO",          path: "/procurement/orders" },
    { icon: BarChart3,    label: "Reports",         path: "/procurement/reports" },
  ],
};

// ── Queue Management ──────────────────────────────────────────────────────────
const queueNav: DeptNavSection[] = [
  {
    title: "Overview",
    items: [{ icon: LayoutDashboard, label: "Dashboard", href: "/queue/dashboard" }],
  },
  {
    title: "Queue",
    items: [
      { icon: Hash,      label: "Tokens",   href: "/queue/tokens" },
      { icon: Layers,    label: "Counters", href: "/queue/counters" },
      { icon: History,   label: "History",  href: "/queue/history" },
    ],
  },
  {
    title: "Reporting",
    items: [{ icon: BarChart3, label: "Reports", href: "/queue/reports" }],
  },
];

const queueConfig: DeptDashboardConfig = {
  deptKey: "queue",
  deptName: "Queue Management",
  badgeLabel: "QUEUE",
  DeptIcon: Activity,
  loginPath: "/queue/login",
  navSections: queueNav,
  heroGradient: "bg-gradient-to-br from-cyan-600 to-cyan-800",
  stats: [
    { icon: Hash,         label: "Active Tokens",   value: "0", gradient: "", iconBg: "bg-cyan-100 dark:bg-cyan-950 text-cyan-600" },
    { icon: Timer,        label: "Avg Wait Time",   value: "—", gradient: "", iconBg: "bg-amber-100 dark:bg-amber-950 text-amber-600" },
    { icon: MonitorCheck, label: "Serving Now",     value: "0", gradient: "", iconBg: "bg-green-100 dark:bg-green-950 text-green-600" },
    { icon: CheckCircle2, label: "Completed Today", value: "0", gradient: "", iconBg: "bg-blue-100 dark:bg-blue-950 text-blue-600" },
  ],
  quickActions: [
    { icon: Hash,      label: "Tokens",    path: "/queue/tokens" },
    { icon: Layers,    label: "Counters",  path: "/queue/counters" },
    { icon: History,   label: "History",   path: "/queue/history" },
    { icon: FilePlus,  label: "New Token", path: "/queue/tokens" },
    { icon: BarChart3, label: "Reports",   path: "/queue/reports" },
  ],
};

// ─── Public dashboard exports ─────────────────────────────────────────────────

export const AssetDashboard = () => <DashboardWrapper config={assetConfig} />;
export const BiomedicalDashboard = () => <DashboardWrapper config={biomedConfig} />;
export const BloodBankDashboard = () => <DashboardWrapper config={bloodBankConfig} />;
export const ConsentDashboard = () => <DashboardWrapper config={consentConfig} />;
export const CSSDDashboard = () => <DashboardWrapper config={cssdConfig} />;
export const DietaryDashboard = () => <DashboardWrapper config={dietaryConfig} />;
export const FinanceDashboard = () => <DashboardWrapper config={financeConfig} />;
export const InfectionControlDashboard = () => <DashboardWrapper config={infectionControlConfig} />;
export const MortuaryDashboard = () => <DashboardWrapper config={mortuaryConfig} />;
export const ProcurementDashboard = () => <DashboardWrapper config={procurementConfig} />;
export const QueueDashboard = () => <DashboardWrapper config={queueConfig} />;

// Also export nav configs so DepartmentModulePages can re-use them.
export {
  assetNav, biomedNav, bloodBankNav, consentNav, cssdNav,
  dietaryNav, financeNav, infectionControlNav, mortuaryNav,
  procurementNav, queueNav,
};
