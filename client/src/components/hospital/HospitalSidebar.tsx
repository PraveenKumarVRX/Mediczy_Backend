import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  Activity,
  Building2,
  HeartPulse,
  FileText,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Shield,
  Bed,
  Stethoscope,
  FolderOpen,
  FileHeart,
  BriefcaseMedical,
  Receipt,
  Bell,
  HelpCircle,
  ClipboardList,
  UserCog,
  Pill,
  FileCheck,
  ClipboardCheck,
  MessageSquare,
  Ambulance,
  Network,
  BarChart3,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useHospitalAuth } from "@/hooks/useHospitalAuth";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SidebarItem {
  icon: React.ElementType;
  label: string;
  href: string;
  badge?: string | number;
  /** Capability key; if provided and capabilities list omits it, item is disabled */
  capability?: string;
}

interface HospitalSidebarProps {
  /** Optional list of capability slugs granted to this hospital's plan.
   *  When provided, items with a matching `capability` that is NOT in this
   *  list are rendered in a disabled/locked state. */
  capabilities?: string[];
}

const mainNavItems: SidebarItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/hospital/dashboard" },
  { icon: BriefcaseMedical, label: "Practice Management", href: "/hospital/practice-management", capability: "practice_management" },
  { icon: CalendarCheck, label: "Appointments", href: "/hospital/appointments", capability: "appointments" },
  { icon: Bed, label: "Bed Management", href: "/hospital/beds", capability: "bed_management" },
  { icon: Users, label: "Patients", href: "/hospital/patients", capability: "patients" },
  { icon: Stethoscope, label: "Doctors", href: "/hospital/doctors", capability: "doctors" },
  { icon: Network, label: "Branches & Clinics", href: "/hospital/branches", capability: "branches" },
  { icon: Ambulance, label: "Ambulance", href: "/hospital/ambulance", capability: "ambulance" },
  { icon: MessageSquare, label: "Communication Hub", href: "/hospital/communication", capability: "communication" },
];

const clinicalItems: SidebarItem[] = [
  { icon: FileHeart, label: "EHR", href: "/hospital/ehr", capability: "ehr" },
  { icon: FolderOpen, label: "MRD", href: "/hospital/mrd", capability: "mrd" },
  { icon: ClipboardList, label: "OPD/IPD", href: "/hospital/opd-ipd", capability: "opd_ipd" },
  { icon: ClipboardCheck, label: "IP Sheets", href: "/hospital/ip-sheets", capability: "ip_sheets" },
  { icon: FileCheck, label: "Discharge Summary", href: "/hospital/discharge-summary", capability: "discharge_summary" },
  { icon: Pill, label: "Pharmacy", href: "/hospital/pharmacy", capability: "pharmacy" },
  { icon: Activity, label: "Lab Reports", href: "/hospital/lab-reports", capability: "lab_reports" },
];

const billingItems: SidebarItem[] = [
  { icon: Shield, label: "Insurance Claims Cockpit", href: "/hospital/insurance-claims?tab=claims", capability: "insurance_billing" },
  { icon: FileText, label: "Insurance Payer Setup", href: "/hospital/insurance-payer-management", capability: "insurance_billing" },
  { icon: Shield, label: "Insurance Management", href: "/hospital/insurance-claims?tab=claims", capability: "insurance_billing" },
  { icon: Receipt, label: "Billing & Invoicing", href: "/hospital/billing", capability: "billing" },
];

const systemItems: SidebarItem[] = [
  { icon: UserCog, label: "Staff Management", href: "/hospital/staff", capability: "staff_management" },
  { icon: Bell, label: "Notifications", href: "/hospital/notifications" },
  { icon: Settings, label: "Settings", href: "/hospital/settings" },
  { icon: HelpCircle, label: "Help & Support", href: "/hospital/support" },
];

const HospitalSidebar = ({ capabilities }: HospitalSidebarProps) => {
  const location = useLocation();
  const { logout } = useHospitalAuth();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => logout();

  /**
   * Returns true if the item should be accessible.
   * - Items with no capability key are always accessible.
   * - If no capabilities list is provided (undefined), all items are accessible (loading / open).
   * - Otherwise the item's capability key must appear in the list.
   */
  const isAccessible = (item: SidebarItem): boolean => {
    if (!item.capability) return true;
    if (!capabilities) return true; // not yet loaded
    return capabilities.includes(item.capability);
  };

  const NavItem = ({ item }: { item: SidebarItem }) => {
    const active = location.pathname === item.href;
    const accessible = isAccessible(item);

    const inner = (
      <span
        className={cn(
          "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
          active && accessible
            ? "bg-gradient-to-r from-teal-500/20 to-teal-600/10 text-teal-400 border border-teal-500/30 shadow-sm"
            : accessible
            ? "text-slate-400 hover:bg-slate-800/60 hover:text-white"
            : "text-slate-600 cursor-not-allowed opacity-50",
          collapsed && "justify-center px-2"
        )}
      >
        <item.icon className={cn(
          "w-5 h-5 flex-shrink-0 transition-colors",
          active && accessible ? "text-teal-400" : accessible ? "text-slate-500 group-hover:text-teal-400" : "text-slate-600"
        )} />
        {!collapsed && (
          <>
            <span className="flex-1">{item.label}</span>
            {!accessible && <Lock className="w-3.5 h-3.5 text-slate-600" />}
            {accessible && item.badge != null && (
              <span className={cn(
                "px-2 py-0.5 text-xs font-bold rounded-full",
                active ? "bg-teal-400/20 text-teal-400" : "bg-slate-700 text-slate-300"
              )}>
                {item.badge}
              </span>
            )}
          </>
        )}
      </span>
    );

    if (!accessible) {
      return (
        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>{inner}</span>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              Not available on your current plan
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <Link to={item.href}>
        {inner}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 flex flex-col transition-all duration-300 shadow-xl",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-teal-500/20">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">Mediqzy</h1>
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Hospital Portal</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="w-9 h-9 mx-auto bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-teal-500/20">
            <Building2 className="w-5 h-5 text-white" />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {/* Main */}
        <div>
          {!collapsed && (
            <p className="px-3 mb-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Main Menu
            </p>
          )}
          <div className="space-y-1">
            {mainNavItems.map((item) => (
              <NavItem key={item.href} item={item} />
            ))}
          </div>
        </div>

        {/* Clinical */}
        <div>
          {!collapsed && (
            <p className="px-3 mb-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Clinical
            </p>
          )}
          <div className="space-y-1">
            {clinicalItems.map((item) => (
              <NavItem key={item.href} item={item} />
            ))}
          </div>
        </div>

        {/* Billing */}
        <div>
          {!collapsed && (
            <p className="px-3 mb-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Billing & Claims
            </p>
          )}
          <div className="space-y-1">
            {billingItems.map((item) => (
              <NavItem key={item.href} item={item} />
            ))}
          </div>
        </div>

        {/* System */}
        <div>
          {!collapsed && (
            <p className="px-3 mb-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              System
            </p>
          )}
          <div className="space-y-1">
            {systemItems.map((item) => (
              <NavItem key={item.href} item={item} />
            ))}
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-slate-700/50 space-y-2">
        {/* Collapse Toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "w-full justify-center text-slate-400 hover:text-white hover:bg-slate-800/60",
            !collapsed && "justify-start"
          )}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4 mr-2" />
              <span>Collapse</span>
            </>
          )}
        </Button>

        {/* Logout */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className={cn(
            "w-full text-red-400 hover:text-red-300 hover:bg-red-500/10",
            collapsed ? "justify-center" : "justify-start"
          )}
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && <span className="ml-2">Logout</span>}
        </Button>
      </div>
    </aside>
  );
};

export default HospitalSidebar;
