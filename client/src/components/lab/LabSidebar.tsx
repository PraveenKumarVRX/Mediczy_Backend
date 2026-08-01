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
  Clock,
  CreditCard,
  TrendingUp,
  Package,
  CheckCircle,
  FileBarChart,
  BookOpen,
  Beaker,
  ScanLine,
  HardDrive,
  Ticket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface SidebarItem {
  icon: React.ElementType;
  label: string;
  href: string;
  badge?: string | number;
  highlight?: boolean;
}

const mainNavItems: SidebarItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/lab/dashboard" },
  { icon: BookOpen, label: "Test Catalog", href: "/lab/test-catalog", highlight: true },
  { icon: ClipboardList, label: "Test Orders", href: "/lab/orders" },
  { icon: Users, label: "Patients", href: "/lab/patients" },
  { icon: CalendarCheck, label: "Appointments", href: "/lab/appointments" },
  { icon: Clock, label: "Sample Queue", href: "/lab/queue" },
  { icon: Ticket, label: "Patient Queue (QMS)", href: "/lab/qms", highlight: true },
  { icon: ScanLine, label: "RIS / PACS", href: "/lab/ris", highlight: true },
  { icon: HardDrive, label: "PACS Settings", href: "/lab/pacs-settings", highlight: true },
];

const labWorkItems: SidebarItem[] = [
  { icon: Activity, label: "Home Collection Ops", href: "/lab/home-collection", highlight: true },
  { icon: TestTube, label: "Sample Collection", href: "/lab/samples" },
  { icon: Microscope, label: "Processing", href: "/lab/processing" },
  { icon: CheckCircle, label: "Results Entry", href: "/lab/results" },
  { icon: FileBarChart, label: "Reports", href: "/lab/reports" },
];

const managementItems: SidebarItem[] = [
  { icon: Package, label: "Inventory", href: "/lab/inventory" },
  { icon: Receipt, label: "Billing", href: "/lab/billing" },
  { icon: Beaker, label: "Billing Ops", href: "/lab/billing-ops", highlight: true },
  { icon: CreditCard, label: "Payments", href: "/lab/payments" },
  { icon: TrendingUp, label: "Analytics", href: "/lab/analytics" },
];

const systemItems: SidebarItem[] = [
  { icon: UserCog, label: "Staff", href: "/lab/staff" },
  { icon: Bell, label: "Notifications", href: "/lab/notifications", badge: 8 },
  { icon: Settings, label: "Settings", href: "/lab/settings" },
  { icon: HelpCircle, label: "Help & Support", href: "/lab/support" },
];

const canAccessLabBillingOps = (): boolean => {
  const billingHints = ["billing", "finance", "accounts", "revenue", "payment"];
  const hasHint = (value: unknown) => {
    if (typeof value !== "string") return false;
    const normalized = value.toLowerCase();
    return billingHints.some((hint) => normalized.includes(hint));
  };

  let labData: any = null;
  let tokenClaims: any = null;

  try {
    const rawLabData = localStorage.getItem("labData");
    if (rawLabData) labData = JSON.parse(rawLabData);
  } catch {
    labData = null;
  }

  try {
    const token = localStorage.getItem("labToken");
    if (token) tokenClaims = JSON.parse(atob(token.split(".")[1]));
  } catch {
    tokenClaims = null;
  }

  const roles = [
    ...(Array.isArray(labData?.roles) ? labData.roles : []),
    ...(Array.isArray(tokenClaims?.roles) ? tokenClaims.roles : []),
    labData?.role,
    tokenClaims?.role,
    labData?.department,
    tokenClaims?.department,
  ].filter(Boolean);

  const scopes = [
    ...(Array.isArray(labData?.permissions) ? labData.permissions : []),
    ...(Array.isArray(labData?.scopes) ? labData.scopes : []),
    ...(Array.isArray(tokenClaims?.permissions) ? tokenClaims.permissions : []),
    ...(Array.isArray(tokenClaims?.scopes) ? tokenClaims.scopes : []),
    tokenClaims?.scope,
  ]
    .filter(Boolean)
    .flatMap((entry: unknown) =>
      typeof entry === "string" ? entry.split(/[\s,]+/) : [entry]
    )
    .filter((entry): entry is string => typeof entry === "string" && entry.length > 0);

  const hasRoleSignal = roles.some((value) => hasHint(String(value)) || String(value).toLowerCase().includes("admin"));
  const hasScopeSignal = scopes.some((value) => hasHint(value) || value.toLowerCase().includes("lab:billing"));

  // Backward compatibility: when no role/scope metadata is present, keep Billing Ops visible.
  if (roles.length === 0 && scopes.length === 0) return true;

  return hasRoleSignal || hasScopeSignal;
};

const LabSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const allowBillingOps = canAccessLabBillingOps();
  const visibleManagementItems = managementItems.filter(
    (item) => item.href !== "/lab/billing-ops" || allowBillingOps
  );

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
          "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
          isActive
            ? "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-600/20"
            : item.highlight
            ? "text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30"
            : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white",
          collapsed && "justify-center px-2"
        )}
      >
        <item.icon className={cn(
          "w-5 h-5 flex-shrink-0", 
          isActive ? "text-white" : item.highlight ? "text-amber-500" : "dark:text-slate-500 group-hover:dark:text-emerald-400"
        )} />
        {!collapsed && (
          <>
            <span className="flex-1">{item.label}</span>
            {item.highlight && !isActive && (
              <span className="absolute top-1 right-1 flex h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            )}
            {item.badge && (
              <span className={cn(
                "px-2 py-0.5 text-xs font-bold rounded-full",
                isActive ? "bg-white/20 text-white" : "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
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
        "fixed left-0 top-0 z-40 h-screen bg-white dark:bg-gradient-to-b dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700/50">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-600/20">
              <TestTube className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-white">Mediqzy</h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Lab Portal</p>
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

        {/* Lab Work */}
        <div>
          {!collapsed && (
            <p className="px-3 mb-2 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
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
            <p className="px-3 mb-2 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Management
            </p>
          )}
          <div className="space-y-1">
            {visibleManagementItems.map((item) => (
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
            "w-full text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10",
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
