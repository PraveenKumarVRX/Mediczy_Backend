import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  Building,
  TrendingUp,
  Users,
  DollarSign,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Bell,
  BarChart3,
  Shield,
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
  { icon: LayoutDashboard, label: "Dashboard", href: "/insurance-broker/dashboard" },
  { icon: FileText, label: "Policies", href: "/insurance-broker/policies" },
  { icon: Building, label: "Corporates", href: "/insurance-broker/corporates" },
  { icon: Users, label: "My Profile", href: "/insurance-broker/profile" },
];

const businessItems: SidebarItem[] = [
  { icon: DollarSign, label: "Commissions", href: "/insurance-broker/commissions" },
  { icon: BarChart3, label: "Reports", href: "/insurance-broker/reports" },
  { icon: TrendingUp, label: "Analytics", href: "/insurance-broker/analytics" },
];

const systemItems: SidebarItem[] = [
  { icon: Bell, label: "Notifications", href: "/insurance-broker/notifications", badge: 0 },
  { icon: Settings, label: "Settings", href: "/insurance-broker/settings" },
  { icon: HelpCircle, label: "Help & Support", href: "/insurance-broker/support" },
];

const BrokerSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem("insuranceBrokerToken");
    localStorage.removeItem("insuranceBrokerData");
    localStorage.removeItem("userType");
    navigate("/intermediary/login");
  };

  const NavItem = ({ item }: { item: SidebarItem }) => {
    const isActive = location.pathname === item.href;
    
    return (
      <Link
        to={item.href}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
          isActive
            ? "bg-blue-500 text-white shadow-md shadow-blue-500/20"
            : "text-slate-400 hover:bg-slate-800 hover:text-white",
          collapsed && "justify-center px-2"
        )}
      >
        <item.icon className={cn("w-5 h-5 flex-shrink-0", isActive && "text-white")} />
        {!collapsed && (
          <>
            <span className="flex-1">{item.label}</span>
            {item.badge && item.badge > 0 && (
              <span className={cn(
                "px-2 py-0.5 text-xs font-bold rounded-full",
                isActive ? "bg-white/20 text-white" : "bg-blue-500/20 text-blue-400"
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
        "fixed left-0 top-0 z-40 h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 border-r border-slate-700 flex flex-col transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white">Mediczy</h1>
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Broker Portal</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="w-9 h-9 mx-auto bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
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

        {/* Business */}
        <div>
          {!collapsed && (
            <p className="px-3 mb-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Business
            </p>
          )}
          <div className="space-y-1">
            {businessItems.map((item) => (
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
      <div className="p-3 border-t border-slate-700 space-y-2">
        {/* Collapse Toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "w-full justify-center text-slate-400 hover:text-white hover:bg-slate-800",
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
            "w-full text-red-400 hover:text-red-300 hover:bg-red-900/30",
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

export default BrokerSidebar;
