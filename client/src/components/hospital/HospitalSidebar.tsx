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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface SidebarItem {
  icon: React.ElementType;
  label: string;
  href: string;
  badge?: string | number;
}

const mainNavItems: SidebarItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/hospital/dashboard" },
  { icon: BriefcaseMedical, label: "Practice Management", href: "/hospital/practice-management" },
  { icon: CalendarCheck, label: "Appointments", href: "/hospital/appointments" },
  { icon: Bed, label: "Bed Management", href: "/hospital/beds" },
  { icon: Users, label: "Patients", href: "/hospital/patients" },
  { icon: Stethoscope, label: "Doctors", href: "/hospital/doctors" },
  { icon: Network, label: "Branches & Clinics", href: "/hospital/branches" },
  { icon: Ambulance, label: "Ambulance", href: "/hospital/ambulance" },
  { icon: MessageSquare, label: "Communication Hub", href: "/hospital/communication" },
];

const clinicalItems: SidebarItem[] = [
  { icon: FileHeart, label: "EHR", href: "/hospital/ehr" },
  { icon: FolderOpen, label: "MRD", href: "/hospital/mrd" },
  { icon: ClipboardList, label: "OPD/IPD", href: "/hospital/opd-ipd" },
  { icon: ClipboardCheck, label: "IP Sheets", href: "/hospital/ip-sheets" },
  { icon: FileCheck, label: "Discharge Summary", href: "/hospital/discharge-summary" },
  { icon: Pill, label: "Pharmacy", href: "/hospital/pharmacy" },
  { icon: Activity, label: "Lab Reports", href: "/hospital/lab-reports" },
];

const billingItems: SidebarItem[] = [
  { icon: Shield, label: "Insurance Management", href: "/hospital/insurance-billing" },
  { icon: Receipt, label: "Billing & Invoicing", href: "/hospital/billing" },
];

const systemItems: SidebarItem[] = [
  { icon: UserCog, label: "Staff Management", href: "/hospital/staff" },
  { icon: Bell, label: "Notifications", href: "/hospital/notifications", badge: 5 },
  { icon: Settings, label: "Settings", href: "/hospital/settings" },
  { icon: HelpCircle, label: "Help & Support", href: "/hospital/support" },
];

const HospitalSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem("hospitalToken");
    localStorage.removeItem("hospitalData");
    navigate("/hospital/login");
  };

  const NavItem = ({ item }: { item: SidebarItem }) => {
    const isActive = location.pathname === item.href;
    
    return (
      <Link
        to={item.href}
        className={cn(
          "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
          isActive
            ? "bg-gradient-to-r from-teal-500/20 to-teal-600/10 text-teal-400 border border-teal-500/30 shadow-sm"
            : "text-slate-400 hover:bg-slate-800/60 hover:text-white",
          collapsed && "justify-center px-2"
        )}
      >
        <item.icon className={cn(
          "w-5 h-5 flex-shrink-0 transition-colors",
          isActive ? "text-teal-400" : "text-slate-500 group-hover:text-teal-400"
        )} />
        {!collapsed && (
          <>
            <span className="flex-1">{item.label}</span>
            {item.badge && (
              <span className={cn(
                "px-2 py-0.5 text-xs font-bold rounded-full",
                isActive ? "bg-teal-400/20 text-teal-400" : "bg-slate-700 text-slate-300"
              )}>
                {item.badge}
              </span>
            )}
          </>
        )}
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
