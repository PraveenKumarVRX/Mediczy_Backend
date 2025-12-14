import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Ambulance,
  MapPin,
  Clock,
  Users,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Bell,
  HelpCircle,
  Navigation,
  Activity,
  Truck,
  FileText,
  DollarSign,
  Calendar,
  UserCog,
  Wrench,
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
  { icon: LayoutDashboard, label: "Dashboard", href: "/ambulance/dashboard" },
  { icon: Activity, label: "Active Trips", href: "/ambulance/active-trips" },
  { icon: Navigation, label: "Dispatch", href: "/ambulance/dispatch" },
  { icon: MapPin, label: "Live Tracking", href: "/ambulance/tracking" },
  { icon: Clock, label: "Trip History", href: "/ambulance/history" },
];

const fleetItems: SidebarItem[] = [
  { icon: Truck, label: "Fleet Management", href: "/ambulance/fleet" },
  { icon: Users, label: "Drivers & Staff", href: "/ambulance/staff" },
  { icon: Wrench, label: "Maintenance", href: "/ambulance/maintenance" },
  { icon: Calendar, label: "Schedule", href: "/ambulance/schedule" },
];

const managementItems: SidebarItem[] = [
  { icon: DollarSign, label: "Billing", href: "/ambulance/billing" },
  { icon: FileText, label: "Reports", href: "/ambulance/reports" },
];

const systemItems: SidebarItem[] = [
  { icon: Bell, label: "Alerts", href: "/ambulance/alerts", badge: 5 },
  { icon: Settings, label: "Settings", href: "/ambulance/settings" },
  { icon: HelpCircle, label: "Help & Support", href: "/ambulance/support" },
];

const AmbulanceSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem("ambulanceToken");
    localStorage.removeItem("ambulanceData");
    navigate("/ambulance/login");
  };

  const NavItem = ({ item }: { item: SidebarItem }) => {
    const isActive = location.pathname === item.href;
    
    return (
      <Link
        to={item.href}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
          isActive
            ? "bg-red-600 text-white shadow-md shadow-red-600/20"
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
                isActive ? "bg-white/20 text-white" : "bg-red-100 text-red-600"
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
            <div className="w-9 h-9 bg-gradient-to-br from-red-500 to-orange-600 rounded-lg flex items-center justify-center shadow-lg shadow-red-600/20">
              <Ambulance className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">Mediqzy</h1>
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Ambulance Portal</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="w-9 h-9 mx-auto bg-gradient-to-br from-red-500 to-orange-600 rounded-lg flex items-center justify-center">
            <Ambulance className="w-5 h-5 text-white" />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {/* Main */}
        <div>
          {!collapsed && (
            <p className="px-3 mb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Operations
            </p>
          )}
          <div className="space-y-1">
            {mainNavItems.map((item) => (
              <NavItem key={item.href} item={item} />
            ))}
          </div>
        </div>

        {/* Fleet */}
        <div>
          {!collapsed && (
            <p className="px-3 mb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Fleet
            </p>
          )}
          <div className="space-y-1">
            {fleetItems.map((item) => (
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

export default AmbulanceSidebar;
