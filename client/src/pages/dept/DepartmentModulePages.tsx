/**
 * DepartmentModulePages — sub-module pages for 11 department portals.
 *
 * Each page uses DeptStaffLayout (with the same nav config as the dashboard)
 * and renders a polished empty-state card indicating the feature is coming soon.
 */
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import DeptStaffLayout, { DeptNavSection } from "@/components/hosp-dept/DeptStaffLayout";
import {
  assetNav, biomedNav, bloodBankNav, consentNav, cssdNav,
  dietaryNav, financeNav, infectionControlNav, mortuaryNav,
  procurementNav, queueNav,
} from "./DepartmentDashboards";
import {
  Archive, Wrench, Droplets, ClipboardCheck, ShieldCheck, Utensils,
  Banknote, ShieldAlert, HeartPulse, PackageCheck, Activity,
  Boxes, Hammer, BarChart3, Stethoscope, CalendarClock, ListChecks,
  Clock, FileCheck, BookOpen, Layers, Flame, Clipboard, CalendarDays,
  CreditCard, TrendingDown, DollarSign, Eye, FileText, AlertTriangle,
  UserCheck, ShoppingCart, Truck, MonitorCheck, Hash, History,
  Users, ArrowRightLeft, Beaker, PlusCircle, Download, Construction,
} from "lucide-react";

// ─── Helper types ─────────────────────────────────────────────────────────────

interface EmptyStateAction {
  label: string;
  path: string;
}

interface DeptModulePageProps {
  deptKey: string;
  deptName: string;
  badgeLabel: string;
  loginPath: string;
  DeptIcon: React.ComponentType<any>;
  navSections: DeptNavSection[];
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  emptyStateAction?: EmptyStateAction;
}

// ─── Shared empty-state card ──────────────────────────────────────────────────

const EmptyStateCard = ({
  title,
  description,
  icon: Icon,
  emptyStateAction,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  emptyStateAction?: EmptyStateAction;
}) => {
  const navigate = useNavigate();
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950">
            <Icon className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1">
            <Download className="h-4 w-4" />
            Export
          </Button>
          {emptyStateAction && (
            <Button
              size="sm"
              className="gap-1 bg-teal-600 hover:bg-teal-700"
              onClick={() => navigate(emptyStateAction.path)}
            >
              <PlusCircle className="h-4 w-4" />
              {emptyStateAction.label}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64 flex flex-col items-center justify-center gap-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-slate-400">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center">
            <Construction className="h-8 w-8 text-slate-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{title}</p>
            <p className="text-xs mt-1 text-slate-400 max-w-xs">
              This module is under active development. Check back soon for full functionality.
            </p>
          </div>
          {emptyStateAction && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 mt-1"
              onClick={() => navigate(emptyStateAction.path)}
            >
              <PlusCircle className="h-4 w-4" />
              {emptyStateAction.label}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Module page renderer ─────────────────────────────────────────────────────

const DeptModulePage = ({
  deptKey,
  deptName,
  badgeLabel,
  loginPath,
  DeptIcon,
  navSections,
  title,
  description,
  icon,
  emptyStateAction,
}: DeptModulePageProps) => (
  <DeptStaffLayout
    deptKey={deptKey}
    deptName={deptName}
    badgeLabel={badgeLabel}
    loginPath={loginPath}
    DeptIcon={DeptIcon}
    navSections={navSections}
    title={title}
    subtitle={description}
  >
    <EmptyStateCard
      title={title}
      description={description}
      icon={icon}
      emptyStateAction={emptyStateAction}
    />
  </DeptStaffLayout>
);

// ─── Factory helpers ──────────────────────────────────────────────────────────

const assetPage = (
  title: string,
  desc: string,
  icon: React.ComponentType<any>,
  action?: EmptyStateAction
) =>
  () => (
    <DeptModulePage
      deptKey="asset" deptName="Asset Management" badgeLabel="ASSET"
      loginPath="/asset/login" DeptIcon={Archive} navSections={assetNav}
      title={title} description={desc} icon={icon} emptyStateAction={action}
    />
  );

const biomedPage = (
  title: string,
  desc: string,
  icon: React.ComponentType<any>,
  action?: EmptyStateAction
) =>
  () => (
    <DeptModulePage
      deptKey="biomedical" deptName="Biomedical Engineering" badgeLabel="BIOMED"
      loginPath="/biomedical/login" DeptIcon={Wrench} navSections={biomedNav}
      title={title} description={desc} icon={icon} emptyStateAction={action}
    />
  );

const bloodBankPage = (
  title: string,
  desc: string,
  icon: React.ComponentType<any>,
  action?: EmptyStateAction
) =>
  () => (
    <DeptModulePage
      deptKey="blood-bank" deptName="Blood Bank" badgeLabel="BLOOD BANK"
      loginPath="/blood-bank/login" DeptIcon={Droplets} navSections={bloodBankNav}
      title={title} description={desc} icon={icon} emptyStateAction={action}
    />
  );

const consentPage = (
  title: string,
  desc: string,
  icon: React.ComponentType<any>,
  action?: EmptyStateAction
) =>
  () => (
    <DeptModulePage
      deptKey="consent" deptName="Consent Management" badgeLabel="CONSENT"
      loginPath="/consent/login" DeptIcon={ClipboardCheck} navSections={consentNav}
      title={title} description={desc} icon={icon} emptyStateAction={action}
    />
  );

const cssdPage = (
  title: string,
  desc: string,
  icon: React.ComponentType<any>,
  action?: EmptyStateAction
) =>
  () => (
    <DeptModulePage
      deptKey="cssd" deptName="CSSD" badgeLabel="CSSD"
      loginPath="/cssd/login" DeptIcon={ShieldCheck} navSections={cssdNav}
      title={title} description={desc} icon={icon} emptyStateAction={action}
    />
  );

const dietaryPage = (
  title: string,
  desc: string,
  icon: React.ComponentType<any>,
  action?: EmptyStateAction
) =>
  () => (
    <DeptModulePage
      deptKey="dietary" deptName="Dietary Services" badgeLabel="DIETARY"
      loginPath="/dietary/login" DeptIcon={Utensils} navSections={dietaryNav}
      title={title} description={desc} icon={icon} emptyStateAction={action}
    />
  );

const financePage = (
  title: string,
  desc: string,
  icon: React.ComponentType<any>,
  action?: EmptyStateAction
) =>
  () => (
    <DeptModulePage
      deptKey="finance" deptName="Finance" badgeLabel="FINANCE"
      loginPath="/finance/login" DeptIcon={Banknote} navSections={financeNav}
      title={title} description={desc} icon={icon} emptyStateAction={action}
    />
  );

const infectionPage = (
  title: string,
  desc: string,
  icon: React.ComponentType<any>,
  action?: EmptyStateAction
) =>
  () => (
    <DeptModulePage
      deptKey="infection-control" deptName="Infection Control" badgeLabel="INF. CTRL"
      loginPath="/infection-control/login" DeptIcon={ShieldAlert} navSections={infectionControlNav}
      title={title} description={desc} icon={icon} emptyStateAction={action}
    />
  );

const mortuaryPage = (
  title: string,
  desc: string,
  icon: React.ComponentType<any>,
  action?: EmptyStateAction
) =>
  () => (
    <DeptModulePage
      deptKey="mortuary" deptName="Mortuary" badgeLabel="MORTUARY"
      loginPath="/mortuary/login" DeptIcon={HeartPulse} navSections={mortuaryNav}
      title={title} description={desc} icon={icon} emptyStateAction={action}
    />
  );

const procurementPage = (
  title: string,
  desc: string,
  icon: React.ComponentType<any>,
  action?: EmptyStateAction
) =>
  () => (
    <DeptModulePage
      deptKey="procurement" deptName="Procurement" badgeLabel="PROCURE"
      loginPath="/procurement/login" DeptIcon={PackageCheck} navSections={procurementNav}
      title={title} description={desc} icon={icon} emptyStateAction={action}
    />
  );

const queuePage = (
  title: string,
  desc: string,
  icon: React.ComponentType<any>,
  action?: EmptyStateAction
) =>
  () => (
    <DeptModulePage
      deptKey="queue" deptName="Queue Management" badgeLabel="QUEUE"
      loginPath="/queue/login" DeptIcon={Activity} navSections={queueNav}
      title={title} description={desc} icon={icon} emptyStateAction={action}
    />
  );

// ─── Asset Management ─────────────────────────────────────────────────────────
export const AssetInventory   = assetPage("Inventory",   "Browse and manage all hospital assets",            Boxes,   { label: "Add Asset",       path: "/asset/inventory" });
export const AssetMaintenance = assetPage("Maintenance", "Track asset maintenance schedules and history",    Hammer,  { label: "New Request",     path: "/asset/maintenance" });
export const AssetReports     = assetPage("Reports",     "Asset utilization and maintenance analytics",      BarChart3);

// ─── Biomedical Engineering ───────────────────────────────────────────────────
export const BiomedicalEquipment    = biomedPage("Equipment",    "Register and manage all biomedical equipment",       Stethoscope,   { label: "Add Equipment",  path: "/biomedical/equipment" });
export const BiomedicalWorkOrders   = biomedPage("Work Orders",  "Create and track biomedical work orders",            ListChecks,    { label: "New Work Order", path: "/biomedical/work-orders" });
export const BiomedicalCalibration  = biomedPage("Calibration",  "Schedule and log equipment calibration records",     CalendarClock, { label: "Schedule",       path: "/biomedical/calibration" });
export const BiomedicalReports      = biomedPage("Reports",      "Equipment performance and maintenance reports",       BarChart3);

// ─── Blood Bank ───────────────────────────────────────────────────────────────
export { BloodBankInventory, BloodBankRequisitions, BloodBankDonors, BloodBankReports } from "./BloodBankModulePages";

// ─── Consent Management ───────────────────────────────────────────────────────
export const ConsentPending   = consentPage("Pending Consents",  "Review and process outstanding consent forms",   Clock,     { label: "Process Consent", path: "/consent/pending" });
export const ConsentSigned    = consentPage("Signed Consents",   "Browse archive of completed consent documents",  FileCheck);
export const ConsentTemplates = consentPage("Templates",         "Create and manage reusable consent templates",   BookOpen,  { label: "New Template", path: "/consent/templates" });
export const ConsentReports   = consentPage("Reports",           "Consent audit trail and compliance analytics",   BarChart3);

// ─── CSSD ─────────────────────────────────────────────────────────────────────
export { CSSDJobs, CSSDEquipment, CSSDCycles, CSSDReports } from './CSSDModulePages';

// ─── Dietary Services ─────────────────────────────────────────────────────────
export const DietaryOrders   = dietaryPage("Diet Orders",  "Manage patient diet orders and restrictions",    Clipboard,    { label: "New Order", path: "/dietary/orders" });
export const DietaryPlans    = dietaryPage("Meal Plans",   "Create and schedule daily meal plans",           CalendarDays, { label: "New Plan",  path: "/dietary/plans" });
export const DietaryPatients = dietaryPage("Patients",     "View dietary profiles for admitted patients",    Users);
export const DietaryReports  = dietaryPage("Reports",      "Nutrition compliance and diet analytics",        BarChart3);

// ─── Finance ──────────────────────────────────────────────────────────────────
export const FinanceBilling     = financePage("Billing",     "Generate and manage patient bills",             CreditCard,  { label: "New Bill",    path: "/finance/billing" });
export const FinanceCollections = financePage("Collections", "Track payment collections and receipts",        DollarSign,  { label: "New Receipt", path: "/finance/collections" });
export const FinanceExpenses    = financePage("Expenses",    "Record and approve departmental expenses",      TrendingDown, { label: "New Expense", path: "/finance/expenses" });
export const FinanceReports     = financePage("Reports",     "Financial summary, P&L and audit reports",      BarChart3);

// ─── Infection Control ────────────────────────────────────────────────────────
export const InfectionControlSurveillance = infectionPage("Surveillance", "Monitor active HAI surveillance activities",     Eye,           { label: "New Surveillance", path: "/infection-control/surveillance" });
export const InfectionControlIncidents    = infectionPage("Incidents",    "Report and investigate infection incidents",      FileText,      { label: "Report Incident",  path: "/infection-control/incidents" });
export const InfectionControlReports      = infectionPage("Reports",      "Infection control audit and trend reports",       BarChart3);
export const InfectionControlAlerts       = infectionPage("Alerts",       "Active outbreak alerts and containment actions",  AlertTriangle, { label: "New Alert",        path: "/infection-control/alerts" });

// ─── Mortuary ─────────────────────────────────────────────────────────────────
export const MortiaryCases    = mortuaryPage("Cases",    "Register and manage mortuary admissions",    FileText,  { label: "New Case",    path: "/mortuary/cases" });
export const MortuaryReleases = mortuaryPage("Releases", "Process and document body release requests", UserCheck, { label: "New Release", path: "/mortuary/releases" });
export const MortuaryRecords  = mortuaryPage("Records",  "Search and view historical mortuary records", BookOpen);
export const MortuaryReports  = mortuaryPage("Reports",  "Occupancy trends and administrative reports", BarChart3);

// ─── Procurement ──────────────────────────────────────────────────────────────
export { ProcurementOrders, ProcurementVendors, ProcurementApprovals, ProcurementReports } from './ProcurementModulePages';

// ─── Queue Management ─────────────────────────────────────────────────────────
export const QueueTokens   = queuePage("Tokens",   "Issue and manage queue tokens for patients", Hash,    { label: "Issue Token", path: "/queue/tokens" });
export const QueueCounters = queuePage("Counters", "Configure and monitor service counters",     Layers);
export const QueueHistory  = queuePage("History",  "Browse historical queue and wait-time data", History);
export const QueueReports  = queuePage("Reports",  "Queue throughput and efficiency analytics",  BarChart3);
