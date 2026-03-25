import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  Building2,
  HeartPulse,
  FileText,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Shield,
  TrendingUp,
  Wallet,
  Bell,
  HelpCircle,
  ShieldAlert,
  Trophy,
  CalendarDays,
  Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

interface SidebarItem {
  icon: React.ElementType;
  label: string;
  href: string;
  badge?: string | number;
}

const mainNavItems: SidebarItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/corporate/dashboard" },
  { icon: Gauge, label: "Command Center", href: "/corporate/command-center" },
  { icon: Bell, label: "Notifications", href: "/corporate/notifications", badge: 3 },
  { icon: Users, label: "Employees", href: "/corporate/employees" },
  { icon: CalendarCheck, label: "Appointments", href: "/corporate/appointments" },
  { icon: CalendarDays, label: "Wellness Calendar", href: "/corporate/wellness-calendar" },
  { icon: HeartPulse, label: "Health Analysis", href: "/corporate/health-analysis" },
  { icon: ShieldAlert, label: "Health Risk Assessment", href: "/corporate/health-risk-assessment" },
  { icon: Trophy, label: "Challenges & Leaderboards", href: "/corporate/gamification" },
  { icon: Building2, label: "Departments", href: "/corporate/departments" },
];

const managementItems: SidebarItem[] = [
  { icon: Wallet, label: "Benefits & Plans", href: "/corporate/benefits" },
  { icon: FileText, label: "Claims", href: "/corporate/claims" },
  { icon: TrendingUp, label: "Reports", href: "/corporate/reports" },
  { icon: FileText, label: "Complaints", href: "/corporate/complaints" },
  { icon: Shield, label: "Compliance", href: "/corporate/compliance" },
];

const systemItems: SidebarItem[] = [
  { icon: Settings, label: "Settings", href: "/corporate/settings" },
  { icon: HelpCircle, label: "Help & Support", href: "/corporate/help" },
];

const CorporateSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [corporateName, setCorporateName] = useState<string>('');

  // Load corporate name from stored data
  useEffect(() => {
    try {
      const corporateDataStr = localStorage.getItem('corporateData');
      if (corporateDataStr) {
        const corporateData = JSON.parse(corporateDataStr);
        if (corporateData?.name) {
          setCorporateName(corporateData.name);
        }
      }
    } catch (e) {
      console.error('Error loading corporate data:', e);
    }
  }, []);

  const handleLogout = () => {
    // Clear all auth-related storage
    localStorage.removeItem("token");
    localStorage.removeItem("userType");
    localStorage.removeItem("corporateToken");
    localStorage.removeItem("corporateData");
    localStorage.removeItem("userId");
    localStorage.removeItem("refreshToken");
    sessionStorage.clear();
    window.dispatchEvent(new CustomEvent('authChange'));
    // Force navigation to login page
    window.location.href = "/corporate/login";
  };

  const NavItem = ({ item }: { item: SidebarItem }) => {
    const isActive = location.pathname === item.href;
    
    return (
      <Link
        to={item.href}
        className={cn(
          "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
          isActive
            ? "bg-gradient-to-r from-emerald-500/20 to-emerald-600/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-sm"
            : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white",
          collapsed && "justify-center px-2"
        )}
      >
        <item.icon className={cn(
          "w-5 h-5 flex-shrink-0 transition-colors",
          isActive ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 group-hover:text-emerald-500 dark:group-hover:text-emerald-400"
        )} />
        {!collapsed && (
          <>
            <span className="flex-1">{item.label}</span>
            {item.badge && (
              <span className={cn(
                "px-2 py-0.5 text-xs font-bold rounded-full",
                isActive ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-300" : "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
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
        "fixed left-0 top-0 z-40 h-screen bg-white dark:bg-gradient-to-b dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 border-r border-slate-200 dark:border-slate-700/50 flex flex-col transition-all duration-300 shadow-sm dark:shadow-xl",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700/50">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/20">
              <HeartPulse className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Mediqzy</h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Corporate Portal</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="p-2 mx-auto rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/20">
            <HeartPulse className="w-5 h-5 text-white" />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {/* Main */}
        <div>
          {!collapsed && (
            <p className="px-3 mb-2 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Main Menu
            </p>
          )}
          <div className="space-y-1">
            {mainNavItems.map((item) => (
              <NavItem key={item.href} item={item} />
            ))}
          </div>
        </div>

        {/* Management */}
        <div>
          {!collapsed && (
            <p className="px-3 mb-2 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
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
            <p className="px-3 mb-2 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
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
      <div className="p-3 border-t border-slate-200 dark:border-slate-700/50 space-y-2">
        {/* Collapse Toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "w-full justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60",
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
            "w-full text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20",
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

export default CorporateSidebar;
