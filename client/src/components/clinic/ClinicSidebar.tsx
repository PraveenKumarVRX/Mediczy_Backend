import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  Activity,
  Building,
  HeartPulse,
  FileText,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Stethoscope,
  Receipt,
  Bell,
  HelpCircle,
  ClipboardList,
  UserCog,
  Pill,
  Clock,
  CreditCard,
  TrendingUp,
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
  { icon: LayoutDashboard, label: "Dashboard", href: "/clinic/dashboard" },
  { icon: CalendarCheck, label: "Appointments", href: "/clinic/appointments" },
  { icon: Users, label: "Patients", href: "/clinic/patients" },
  { icon: Clock, label: "Queue Management", href: "/clinic/queue" },
  { icon: Stethoscope, label: "Doctors", href: "/clinic/doctors" },
];

const clinicalItems: SidebarItem[] = [
  { icon: ClipboardList, label: "Consultations", href: "/clinic/consultations" },
  { icon: FileText, label: "Prescriptions", href: "/clinic/prescriptions" },
  { icon: Pill, label: "Pharmacy", href: "/clinic/pharmacy" },
  { icon: Activity, label: "Lab Tests", href: "/clinic/lab-tests" },
];

const billingItems: SidebarItem[] = [
  { icon: Receipt, label: "Billing", href: "/clinic/billing" },
  { icon: CreditCard, label: "Payments", href: "/clinic/payments" },
  { icon: TrendingUp, label: "Reports", href: "/clinic/reports" },
];

const systemItems: SidebarItem[] = [
  { icon: UserCog, label: "Staff", href: "/clinic/staff" },
  { icon: Bell, label: "Notifications", href: "/clinic/notifications", badge: 3 },
  { icon: Settings, label: "Settings", href: "/clinic/settings" },
  { icon: HelpCircle, label: "Help & Support", href: "/clinic/support" },
];

const ClinicSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem("clinicToken");
    localStorage.removeItem("clinicData");
    navigate("/clinic/login");
  };

  const NavItem = ({ item }: { item: SidebarItem }) => {
    const isActive = location.pathname === item.href;
    
    return (
      <Link
        to={item.href}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
          isActive
            ? "bg-pink-600 text-white shadow-md shadow-pink-600/20"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
          collapsed && "justify-center px-2"
        )}
      >
        <item.icon className={cn("w-5 h-5 flex-shrink-0", isActive && "text-white")} />
        {!collapsed && (
          <>
            <span className="flex-1">{item.label}</span>
            {item.badge && (
              <span className={cn(
                "px-2 py-0.5 text-xs font-bold rounded-full",
                isActive ? "bg-white/20 text-white" : "bg-pink-100 text-pink-600"
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
        "fixed left-0 top-0 z-40 h-screen bg-white border-r border-slate-200 flex flex-col transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-gradient-to-br from-pink-500 to-rose-600 rounded-lg flex items-center justify-center shadow-lg shadow-pink-600/20">
              <Building className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">Mediqzy</h1>
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Clinic Portal</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="w-9 h-9 mx-auto bg-gradient-to-br from-pink-500 to-rose-600 rounded-lg flex items-center justify-center">
            <Building className="w-5 h-5 text-white" />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {/* Main */}
        <div>
          {!collapsed && (
            <p className="px-3 mb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
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
            <p className="px-3 mb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
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
            <p className="px-3 mb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Billing & Reports
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
            <p className="px-3 mb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
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
      <div className="p-3 border-t border-slate-200 space-y-2">
        {/* Collapse Toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "w-full justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100",
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
            "w-full text-red-600 hover:text-red-700 hover:bg-red-50",
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

export default ClinicSidebar;
