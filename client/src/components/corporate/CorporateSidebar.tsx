import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  Building2,
  HeartPulse,
  Stethoscope,
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
  UserCog,
  UserPlus,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/utils/api";

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
  { icon: UserCog, label: "User Management", href: "/corporate/user-management" },
  { icon: CalendarCheck, label: "Appointments", href: "/corporate/appointments" },
  { icon: CalendarDays, label: "Wellness Calendar", href: "/corporate/wellness-calendar" },
  { icon: HeartPulse, label: "Health Analysis", href: "/corporate/health-analysis" },
  { icon: ShieldAlert, label: "Risk Assessment", href: "/corporate/health-risk-assessment" },
  { icon: Trophy, label: "Challenges", href: "/corporate/gamification" },
  { icon: Building2, label: "Org Structure", href: "/corporate/org-structure" },
];

const managementItems: SidebarItem[] = [
  { icon: Wallet, label: "Benefits & Plans", href: "/corporate/benefits" },
  { icon: FileText, label: "Claims", href: "/corporate/claims" },
  { icon: ShieldCheck, label: "Fitness Certificates", href: "/corporate/fitness-certificates" },
  { icon: Stethoscope, label: "Occupational Health Clinic", href: "/corporate/ohc" },
  { icon: TrendingUp, label: "Reports", href: "/corporate/reports" },
  { icon: FileText, label: "Complaints", href: "/corporate/complaints" },
  { icon: Shield, label: "Compliance", href: "/corporate/compliance" },
];

const systemItems: SidebarItem[] = [
  { icon: UserPlus, label: "HR Team", href: "/corporate/hr-team" },
  { icon: Settings, label: "Settings", href: "/corporate/settings" },
  { icon: HelpCircle, label: "Help & Support", href: "/corporate/help" },
];

const CorporateSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [corporateName, setCorporateName] = useState<string>('');
  // Wellness Calendar is a Team-configured plan feature (features.healthCalendar),
  // not universal -- default true to avoid hiding it for the common case while
  // the real value loads, corrected once the plan's actual features are known.
  const [hasHealthCalendar, setHasHealthCalendar] = useState(true);

  useEffect(() => {
    try {
      const corporateDataStr = localStorage.getItem('corporateData');
      if (corporateDataStr) {
        const corporateData = JSON.parse(corporateDataStr);
        if (corporateData?.name) setCorporateName(corporateData.name);
      }
    } catch (e) {
      // ignore
    }

    api.get('/corporate/my-benefits')
      .then((res) => {
        const platformFeatures = res.data?.data?.plan?.platformFeatures ?? res.data?.plan?.platformFeatures;
        if (platformFeatures && typeof platformFeatures.healthCalendar === 'boolean') {
          setHasHealthCalendar(platformFeatures.healthCalendar);
        }
      })
      .catch(() => {
        // Leave default (visible) on failure -- don't hide a real nav item
        // because of a transient network error.
      });
  }, []);

  const visibleMainNavItems = mainNavItems.filter(
    (item) => item.href !== '/corporate/wellness-calendar' || hasHealthCalendar
  );

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userType");
    localStorage.removeItem("corporateToken");
    localStorage.removeItem("corporateData");
    localStorage.removeItem("userId");
    localStorage.removeItem("refreshToken");
    sessionStorage.clear();
    window.dispatchEvent(new CustomEvent('authChange'));
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
            ? "bg-gradient-to-r from-emerald-500/15 to-emerald-400/5 text-emerald-400 border border-emerald-500/25 shadow-sm shadow-emerald-500/10"
            : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200",
          collapsed && "justify-center px-2.5"
        )}
      >
        <item.icon
          className={cn(
            "w-4 h-4 flex-shrink-0 transition-colors",
            isActive
              ? "text-emerald-400"
              : "text-slate-500 group-hover:text-slate-300"
          )}
        />
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-400">
                {item.badge}
              </span>
            )}
          </>
        )}
        {isActive && !collapsed && (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
        )}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen flex flex-col transition-all duration-300",
        "bg-slate-950 border-r border-slate-800/80",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Subtle top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800/80">
        {!collapsed ? (
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/20">
              <HeartPulse className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight">Mediqzy</h1>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest">Corporate Portal</p>
            </div>
          </div>
        ) : (
          <div className="mx-auto p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/20">
            <HeartPulse className="w-4 h-4 text-white" />
          </div>
        )}
      </div>

      {/* Company badge */}
      {!collapsed && corporateName && (
        <div className="mx-3 mt-3 px-3 py-2 rounded-xl bg-slate-800/50 border border-slate-700/40">
          <p className="text-[10px] text-slate-600 uppercase tracking-wider font-bold">Organization</p>
          <p className="text-xs font-semibold text-slate-200 mt-0.5 truncate">{corporateName}</p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {/* Main */}
        <div>
          {!collapsed && (
            <p className="px-3 mb-2 text-[10px] font-bold text-slate-600 uppercase tracking-widest">
              Main Menu
            </p>
          )}
          <div className="space-y-0.5">
            {visibleMainNavItems.map((item) => (
              <NavItem key={item.href} item={item} />
            ))}
          </div>
        </div>

        {/* Management */}
        <div>
          {!collapsed && (
            <p className="px-3 mb-2 text-[10px] font-bold text-slate-600 uppercase tracking-widest">
              Management
            </p>
          )}
          <div className="space-y-0.5">
            {managementItems.map((item) => (
              <NavItem key={item.href} item={item} />
            ))}
          </div>
        </div>

        {/* System */}
        <div>
          {!collapsed && (
            <p className="px-3 mb-2 text-[10px] font-bold text-slate-600 uppercase tracking-widest">
              System
            </p>
          )}
          <div className="space-y-0.5">
            {systemItems.map((item) => (
              <NavItem key={item.href} item={item} />
            ))}
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-slate-800/80 space-y-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "w-full text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 rounded-xl text-xs",
            collapsed ? "justify-center" : "justify-start"
          )}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4 mr-2" />
              Collapse
            </>
          )}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className={cn(
            "w-full text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl text-xs",
            collapsed ? "justify-center" : "justify-start"
          )}
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && <span className="ml-2">Sign out</span>}
        </Button>
      </div>
    </aside>
  );
};

export default CorporateSidebar;
