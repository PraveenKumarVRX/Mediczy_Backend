/**
 * HospDeptLayout — shared layout for all hospital department portals.
 * Passes nav sections as config so each dept can have its own sidebar items.
 */
import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Bell, HeartPulse, ChevronDown, Sun, Moon, Loader2, LogOut,
  ChevronLeft, ChevronRight, Settings, HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/utils/theme.provider";
import { useDeptAuth, DeptAuthData } from "@/hooks/useHospDeptAuth";

export interface DeptNavItem {
  icon: React.ElementType;
  label: string;
  href: string;
  badge?: string | number;
}

export interface DeptNavSection {
  title: string;
  items: DeptNavItem[];
}

interface HospDeptLayoutProps {
  children: ReactNode;
  deptKey: string;
  deptName: string;
  badgeLabel: string;
  loginPath: string;
  DeptIcon: React.ElementType;
  navSections: DeptNavSection[];
  title?: string;
  subtitle?: string;
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

interface SidebarProps {
  deptKey: string;
  deptName: string;
  DeptIcon: React.ElementType;
  navSections: DeptNavSection[];
  logout: () => void;
}

const Sidebar = ({ deptKey, deptName, DeptIcon, navSections, logout }: SidebarProps) => {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const NavItem = ({ item }: { item: DeptNavItem }) => {
    const active = location.pathname === item.href || location.pathname.startsWith(item.href + "/");
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to={item.href}
              className={cn(
                "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                active
                  ? "bg-teal-500/15 text-teal-700 dark:text-teal-300"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white",
                collapsed && "justify-center px-2"
              )}
            >
              <item.icon className={cn("shrink-0 h-5 w-5", active ? "text-teal-600 dark:text-teal-400" : "")} />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {!collapsed && item.badge !== undefined && (
                <span className="ml-auto text-[10px] font-semibold bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300 px-1.5 py-0.5 rounded-full">
                  {item.badge}
                </span>
              )}
            </Link>
          </TooltipTrigger>
          {collapsed && <TooltipContent side="right">{item.label}</TooltipContent>}
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <aside
      className={cn(
        "fixed top-0 left-0 h-screen bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col z-40 transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className={cn("flex items-center gap-3 px-4 py-5 border-b border-slate-200 dark:border-slate-800", collapsed && "justify-center px-2")}>
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 shadow-sm shrink-0">
          <DeptIcon className="h-5 w-5 text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">Mediqzy</p>
            <p className="text-[11px] text-teal-600 dark:text-teal-400 font-medium truncate">{deptName}</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navSections.map((section) => (
          <div key={section.title} className="mb-1">
            {!collapsed && (
              <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-600">
                {section.title}
              </p>
            )}
            {collapsed && <div className="my-2 border-t border-slate-100 dark:border-slate-800" />}
            {section.items.map((item) => (
              <NavItem key={item.href} item={item} />
            ))}
          </div>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="border-t border-slate-200 dark:border-slate-800 p-2 space-y-0.5">
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={logout}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors",
                  collapsed && "justify-center px-2"
                )}
              >
                <LogOut className="shrink-0 h-5 w-5" />
                {!collapsed && "Logout"}
              </button>
            </TooltipTrigger>
            {collapsed && <TooltipContent side="right">Logout</TooltipContent>}
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-sm hover:shadow-md transition-shadow"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>
    </aside>
  );
};

// ─── Layout ───────────────────────────────────────────────────────────────────

const HospDeptLayout = ({
  children, deptKey, deptName, badgeLabel, loginPath,
  DeptIcon, navSections, title, subtitle,
}: HospDeptLayoutProps) => {
  const navigate = useNavigate();
  const { setTheme, theme } = useTheme();
  const { deptData, isLoading, logout } = useDeptAuth(deptKey, loginPath);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
      </div>
    );
  }

  const displayName = (deptData as DeptAuthData & { name?: string })?.name ?? `${deptName} Staff`;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Sidebar
        deptKey={deptKey}
        deptName={deptName}
        DeptIcon={DeptIcon}
        navSections={navSections}
        logout={logout}
      />

      {/* Main area — offset by sidebar width (transitions match) */}
      <div className="ml-64 transition-all duration-300">
        {/* Header */}
        <header className="sticky top-0 z-30 h-16 bg-white/90 dark:bg-slate-800/90 backdrop-blur border-b border-slate-200 dark:border-slate-700/50 flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 font-semibold">
              <HeartPulse className="h-5 w-5" />
              <span className="text-sm">Mediqzy</span>
              <span className="text-[11px] uppercase bg-teal-500/10 text-teal-600 dark:text-teal-400 px-2 py-0.5 rounded-full">
                {badgeLabel}
              </span>
            </div>
            {title && (
              <div className="pl-3 border-l border-slate-200 dark:border-slate-700">
                <h1 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h1>
                {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "light" ? <Sun className="w-5 h-5 text-slate-600" /> : <Moon className="w-5 h-5 text-slate-600" />}
            </Button>

            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-5 h-5 text-slate-600" />
              <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive text-[10px] text-white px-1">0</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1.5">
                  <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-teal-600 rounded-full flex items-center justify-center">
                    <DeptIcon className="w-4 h-4 text-white" />
                  </div>
                  <div className="hidden md:block text-left">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{displayName}</p>
                    <p className="text-xs text-teal-600 dark:text-teal-400">{badgeLabel}</p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate(`/${deptKey}/settings`)}>
                  <Settings className="mr-2 h-4 w-4" /> Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(`/${deptKey}/support`)}>
                  <HelpCircle className="mr-2 h-4 w-4" /> Help & Support
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-red-600">
                  <LogOut className="mr-2 h-4 w-4" /> Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
};

export default HospDeptLayout;
