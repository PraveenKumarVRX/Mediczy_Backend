import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  Activity,
  TestTube,
  FileText,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Bell,
  HelpCircle,
  ClipboardList,
  UserCog,
  Microscope,
  Flask,
  Clock,
  CreditCard,
  TrendingUp,
  Package,
  CheckCircle,
  FileBarChart,
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
  { icon: LayoutDashboard, label: "Dashboard", href: "/lab/dashboard" },
  { icon: ClipboardList, label: "Test Orders", href: "/lab/orders" },
  { icon: Users, label: "Patients", href: "/lab/patients" },
  { icon: CalendarCheck, label: "Appointments", href: "/lab/appointments" },
  { icon: Clock, label: "Sample Queue", href: "/lab/queue" },
];

const labWorkItems: SidebarItem[] = [
  { icon: TestTube, label: "Sample Collection", href: "/lab/samples" },
  { icon: Microscope, label: "Processing", href: "/lab/processing" },
  { icon: CheckCircle, label: "Results Entry", href: "/lab/results" },
  { icon: FileBarChart, label: "Reports", href: "/lab/reports" },
];

const managementItems: SidebarItem[] = [
  { icon: Package, label: "Inventory", href: "/lab/inventory" },
  { icon: Receipt, label: "Billing", href: "/lab/billing" },
  { icon: CreditCard, label: "Payments", href: "/lab/payments" },
  { icon: TrendingUp, label: "Analytics", href: "/lab/analytics" },
];

const systemItems: SidebarItem[] = [
  { icon: UserCog, label: "Staff", href: "/lab/staff" },
  { icon: Bell, label: "Notifications", href: "/lab/notifications", badge: 8 },
  { icon: Settings, label: "Settings", href: "/lab/settings" },
  { icon: HelpCircle, label: "Help & Support", href: "/lab/support" },
];

const LabSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userType");
    localStorage.removeItem("userId");
    localStorage.removeItem("labToken");
    localStorage.removeItem("labData");
    window.dispatchEvent(new CustomEvent('authChange'));
    navigate("/lab/login");
  };

  const NavItem = ({ item }: { item: SidebarItem }) => {
    const isActive = location.pathname === item.href;
    
    return (
      <Link
        to={item.href}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
          isActive
            ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
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
                isActive ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-600"
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
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-600/20">
              <TestTube className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">Mediqzy</h1>
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Lab Portal</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="w-9 h-9 mx-auto bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
            <TestTube className="w-5 h-5 text-white" />
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

        {/* Lab Work */}
        <div>
          {!collapsed && (
            <p className="px-3 mb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Lab Work
            </p>
          )}
          <div className="space-y-1">
            {labWorkItems.map((item) => (
              <NavItem key={item.href} item={item} />
            ))}
          </div>
        </div>

        {/* Management */}
        <div>
          {!collapsed && (
            <p className="px-3 mb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Management
            </p>
          )}
          <div className="space-y-1">
            {managementItems.map((item) => (
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

export default LabSidebar;
