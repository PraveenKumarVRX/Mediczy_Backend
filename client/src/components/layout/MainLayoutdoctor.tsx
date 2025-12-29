import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { 
  Menu, 
  Moon, 
  Sun, 
  LogOut, 
  Home, 
  Calendar, 
  Users, 
  Activity,
  FileText,
  MessageSquare,
  Clock,
  Phone,
  AlertTriangle,
  Settings,
  Video,
  Pill,
  BarChart3,
  FileSearch,
  X,
  FilePlus2,
  Radio,
  BrainCircuit,
  HeartPulse,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  PanelLeftClose,
  PanelLeft,
  Stethoscope,
  ClipboardList,
  UserCircle,
  Bell,
  Wallet,
  Building2,
  Shield,
  Briefcase
} from "lucide-react";
import { memo, useEffect, useState, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/utils/theme.provider";
import { useLogout } from "@/hooks/auth";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import VoiceNavigation from '../VoiceNavigation';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import ChatApplet from '@/components/chat/ChatApplet';

interface NavItem {
  icon: React.ComponentType<any>;
  label: string;
  path: string;
  category: string;
  highlight?: boolean;
  subItems?: { label: string; path: string }[];
}

const doctorNavItems: NavItem[] = [
  // Main
  { icon: Home, label: "Dashboard", path: "/doctor/dashboard", category: "Main" },
  { icon: UserCircle, label: "My Profile", path: "/doctor/settings", category: "Main" },
  { icon: Bell, label: "Notifications", path: "/doctor/alerts", category: "Main" },
  
  // Patient Care
  { icon: Users, label: "My Patients", path: "/doctor/patients", category: "Patient Care" },
  { icon: Calendar, label: "Appointments", path: "/doctor/appointments", category: "Patient Care" },
  { icon: FileText, label: "Health Records", path: "/doctor/health-records", category: "Patient Care" },
  { icon: AlertTriangle, label: "Emergency Triage", path: "/doctor/triage", category: "Patient Care", highlight: true },
  
  // Clinical Tools
  { icon: Pill, label: "Write Prescription", path: "/doctor/prescription-writer", category: "Clinical Tools" },
  { icon: FileText, label: "Prescriptions", path: "/doctor/prescriptions", category: "Clinical Tools" },
  { 
    icon: FilePlus2, 
    label: "Document Templates", 
    path: "/doctor/templates",
    category: "Clinical Tools",
    subItems: [
      { label: "All Templates", path: "/doctor/templates" },
      { label: "Specialty Templates", path: "/doctor/specialty-templates" },
      { label: "Template Settings", path: "/doctor/template-settings" }
    ]
  },
  { icon: BrainCircuit, label: "AI Doctor Assist", path: "/doctor/assist", category: "Clinical Tools", highlight: true },
  
  // Communication
  { icon: MessageSquare, label: "Patient Chat", path: "/doctor/chat", category: "Communication" },
  { icon: Video, label: "Video Consultation", path: "/doctor/video", category: "Communication" },
  { icon: Phone, label: "Contact", path: "/doctor/contact", category: "Communication" },
  
  // Monitoring
  { icon: Radio, label: "Remote Monitoring", path: "/doctor/remote-monitoring", category: "Monitoring", highlight: true },
  { icon: HeartPulse, label: "Vital Alerts", path: "/doctor/alerts", category: "Monitoring" },
  
  // Management
  { icon: Briefcase, label: "Services", path: "/doctor/services", category: "Management", highlight: true },
  { icon: Wallet, label: "Billing & Payments", path: "/doctor/billing", category: "Management" },
  { icon: Clock, label: "Availability", path: "/doctor/availability", category: "Management" },
  { icon: BarChart3, label: "Analytics", path: "/doctor/analytics", category: "Management" },
  { icon: FileSearch, label: "Reports", path: "/doctor/reports", category: "Management" },
  { icon: Settings, label: "Settings", path: "/doctor/settings", category: "Management" },
];

const MainLayoutdoctor = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('doctor-sidebar-collapsed');
    return saved === 'true';
  });
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
  const location = useLocation();
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Persist collapsed state
  useEffect(() => {
    localStorage.setItem('doctor-sidebar-collapsed', String(isCollapsed));
  }, [isCollapsed]);
  
  // Track viewport for responsive open/close
  useEffect(() => {
    const updateViewport = () => {
      const desktop = typeof window !== 'undefined' && window.innerWidth >= 768;
      setIsDesktop(desktop);
      setIsOpen(desktop);
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  // Preserve sidebar scroll position on route change
  useEffect(() => {
    const scrollViewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (scrollViewport) {
      const savedScrollTop = sessionStorage.getItem('doctorSidebarScrollTop');
      if (savedScrollTop) {
        scrollViewport.scrollTop = parseInt(savedScrollTop, 10);
      }
    }
  }, [location.pathname]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/serviceWorker.js');
      });
    }
  }, []);

  const { toast } = useToast();
  const { setTheme, theme } = useTheme();
  const navigate = useNavigate();
  const { currentDoctor } = useAuth();
  const logoutFun = useLogout();

  const toggleSidebar = () => {
    setIsOpen(prev => !prev);
  };

  const toggleCollapse = () => {
    setIsCollapsed(prev => !prev);
  };

  // Save scroll position before navigation
  const handleNavClick = () => {
    const scrollViewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (scrollViewport) {
      sessionStorage.setItem('doctorSidebarScrollTop', scrollViewport.scrollTop.toString());
    }
    if (window.innerWidth < 768) {
      toggleSidebar();
    }
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const getDoctorInitials = () => {
    const first = (currentDoctor?.firstName || "D").trim().charAt(0);
    const last = (currentDoctor?.lastName || "R").trim().charAt(0);
    return `${first}${last}`.toUpperCase();
  };

  const handleLogout = () => {
    logoutFun.mutate(undefined, {
      onSuccess: () => {
        navigate("/doctor/login");
        toast({
          title: "Logged out",
          description: "You have been successfully logged out",
        });
      },
    });
  };

  const toggleSubMenu = (path: string) => {
    setExpandedMenus(prev => 
      prev.includes(path) 
        ? prev.filter(p => p !== path)
        : [...prev, path]
    );
  };

  // Group items by category
  const categories = ['Main', 'Patient Care', 'Clinical Tools', 'Communication', 'Monitoring', 'Management'];

  const renderNavItem = (item: NavItem) => {
    const hasSubItems = item.subItems && item.subItems.length > 0;
    const isExpanded = expandedMenus.includes(item.path);
    const isActive = location.pathname === item.path || 
      item.subItems?.some(sub => location.pathname === sub.path);

    // Collapsed mode - show only icons with tooltips
    if (isCollapsed && isDesktop) {
      return (
        <Tooltip key={item.path}>
          <TooltipTrigger asChild>
            <Link
              to={hasSubItems ? '#' : item.path}
              onClick={(e) => {
                if (hasSubItems) {
                  e.preventDefault();
                  setIsCollapsed(false);
                  toggleSubMenu(item.path);
                } else {
                  handleNavClick();
                }
              }}
              className={cn(
                "group flex items-center justify-center rounded-xl p-2.5 transition-all duration-200",
                isActive
                  ? "bg-gradient-to-r from-teal-500/20 to-teal-600/10 text-teal-400 border border-teal-500/30"
                  : item.highlight
                    ? "text-amber-400 hover:bg-amber-500/10 border border-amber-500/20"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
              )}
            >
              <item.icon className={cn(
                "h-5 w-5",
                isActive ? "text-teal-400" : item.highlight ? "text-amber-400" : "text-slate-500 group-hover:text-teal-400"
              )} />
              {item.highlight && !isActive && (
                <span className="absolute top-1 right-1 flex h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              )}
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" className="flex items-center gap-2">
            {item.label}
            {hasSubItems && <ChevronRight className="h-3 w-3" />}
          </TooltipContent>
        </Tooltip>
      );
    }

    // Expanded mode - full menu

    if (hasSubItems) {
      return (
        <div key={item.path}>
          <button
            onClick={() => toggleSubMenu(item.path)}
            className={cn(
              "group flex items-center justify-between w-full gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
              isActive
                ? "bg-gradient-to-r from-teal-500/20 to-teal-600/10 text-teal-400 border border-teal-500/30 shadow-sm"
                : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
            )}
          >
            <div className="flex items-center gap-3">
              <item.icon className={cn(
                "h-4 w-4 transition-colors",
                isActive ? "text-teal-400" : "text-slate-500 group-hover:text-teal-400"
              )} />
              <span>{item.label}</span>
            </div>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-slate-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-slate-500" />
            )}
          </button>
          {isExpanded && (
            <div className="ml-7 mt-1 space-y-1 border-l border-slate-700/50 pl-3">
              {item.subItems!.map((subItem) => (
                <Link
                  key={subItem.path}
                  to={subItem.path}
                  onClick={handleNavClick}
                  className={cn(
                    "block rounded-lg px-3 py-2 text-sm transition-all duration-200",
                    location.pathname === subItem.path
                      ? "bg-teal-500/20 text-teal-400"
                      : "text-slate-500 hover:bg-slate-800/40 hover:text-slate-300"
                  )}
                >
                  {subItem.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={handleNavClick}
        className={cn(
          "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
          location.pathname === item.path
            ? "bg-gradient-to-r from-teal-500/20 to-teal-600/10 text-teal-400 border border-teal-500/30 shadow-sm"
            : item.highlight
              ? "text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 border border-amber-500/20"
              : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
        )}
      >
        <item.icon className={cn(
          "h-4 w-4 transition-colors",
          location.pathname === item.path 
            ? "text-teal-400" 
            : item.highlight 
              ? "text-amber-400 group-hover:text-amber-300"
              : "text-slate-500 group-hover:text-teal-400"
        )} />
        <span>{item.label}</span>
        {item.highlight && location.pathname !== item.path && (
          <span className="ml-auto flex h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
        )}
      </Link>
    );
  };

  return (
    <div className="flex min-h-screen w-full">
      {/* Mobile toggle button - outside the sidebar */}
      <button
        onClick={toggleSidebar}
        className="fixed top-4 left-4 z-50 p-2 rounded-md bg-primary text-white md:hidden"
        aria-expanded={isOpen}
        aria-controls="sidebar"
        aria-label="Toggle navigation menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Sidebar */}
      <div
        id="sidebar"
        className={cn(
          "fixed inset-y-0 left-0 flex flex-col bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 transform transition-all duration-300 ease-in-out z-40 shadow-xl",
          isCollapsed && isDesktop ? "w-16" : "w-64",
          (isDesktop || isOpen) ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Close button - visible only on mobile */}
        <button
          onClick={toggleSidebar}
          className="absolute top-4 right-4 p-1 rounded-md text-slate-400 hover:text-white md:hidden"
          aria-label="Close navigation menu"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Logo */}
        <div className={cn(
          "flex items-center border-b border-slate-700/50 py-5",
          isCollapsed && isDesktop ? "justify-center px-2" : "gap-3 px-6"
        )}>
          <div className="p-2 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 shadow-lg shadow-teal-500/20">
            <Stethoscope className="h-5 w-5 text-white" />
          </div>
          {!(isCollapsed && isDesktop) && (
            <div>
              <span className="text-lg font-bold text-white tracking-tight">Mediqzy</span>
              <p className="text-xs text-slate-500">Doctor Portal</p>
            </div>
          )}
        </div>

        {/* Doctor Quick Info */}
        <div className={cn(
          "border-b border-slate-700/50",
          isCollapsed && isDesktop ? "px-2 py-3" : "px-4 py-3"
        )}>
          {isCollapsed && isDesktop ? (
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex justify-center">
                    <Avatar className="h-9 w-9 ring-2 ring-teal-500/30">
                      <AvatarFallback className="bg-gradient-to-br from-teal-500 to-teal-600 text-white text-sm font-medium">
                        {getDoctorInitials()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="font-medium">Dr. {currentDoctor?.firstName} {currentDoctor?.lastName}</p>
                  <p className="text-xs text-muted-foreground">{currentDoctor?.specialization || 'General Physician'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 ring-2 ring-teal-500/30">
                <AvatarFallback className="bg-gradient-to-br from-teal-500 to-teal-600 text-white text-sm font-medium">
                  {getDoctorInitials()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  Dr. {currentDoctor?.firstName} {currentDoctor?.lastName}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {currentDoctor?.specialization || 'General Physician'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Links */}
        <ScrollArea ref={scrollAreaRef} className={cn("flex-1 py-4", isCollapsed && isDesktop ? "px-2" : "px-3")}>
          <TooltipProvider delayDuration={0}>
            <div className="space-y-1">
              {categories.map((category, idx) => {
                const categoryItems = doctorNavItems.filter(item => item.category === category);
                if (categoryItems.length === 0) return null;
                
                return (
                  <div key={category}>
                    {idx > 0 && !(isCollapsed && isDesktop) && (
                      <div className="px-3 py-2 mt-4">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{category}</p>
                      </div>
                    )}
                    {isCollapsed && isDesktop && idx > 0 && (
                      <div className="my-2 border-t border-slate-700/30" />
                    )}
                    {categoryItems.map(item => renderNavItem(item))}
                  </div>
                );
              })}
            </div>
          </TooltipProvider>
        </ScrollArea>

        {/* Collapse Toggle - Desktop only */}
        <div className="hidden md:block border-t border-slate-700/50 p-2">
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleCollapse}
                  className={cn(
                    "flex items-center w-full rounded-xl p-2 text-slate-400 hover:bg-slate-800/60 hover:text-white transition-all duration-200",
                    isCollapsed ? "justify-center" : "gap-3 px-3"
                  )}
                  aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  {isCollapsed ? (
                    <PanelLeft className="h-5 w-5" />
                  ) : (
                    <>
                      <PanelLeftClose className="h-4 w-4" />
                      <span className="text-sm">Collapse</span>
                    </>
                  )}
                </button>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right">
                  Expand sidebar
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Bottom Actions */}
        <div className={cn(
          "border-t border-slate-700/50",
          isCollapsed && isDesktop ? "p-2" : "p-3"
        )}>
          {isCollapsed && isDesktop ? (
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleLogout}
                    className="flex items-center justify-center w-full rounded-xl p-2.5 text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all duration-200"
                  >
                    <LogOut className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  Logout
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all duration-200"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </button>
          )}
        </div>
      </div>

      {/* Overlay for mobile */}
      {isOpen && !isDesktop && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Main content */}
      <main className={cn(
        "flex-1 transition-all duration-300",
        isCollapsed && isDesktop ? "md:ml-16" : "md:ml-64"
      )}>
        <div className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="container flex h-16 items-center px-4">
            <div className="ml-auto flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={toggleTheme} className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
                {theme === "light" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-gradient-to-br from-teal-500 to-teal-600 text-white text-sm">
                        {getDoctorInitials()}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        Dr. {currentDoctor?.firstName} {currentDoctor?.lastName}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {currentDoctor?.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/doctor/settings">Settings</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" /> Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        <div className="container mx-auto p-6 pb-20 md:pb-6 bg-slate-50 dark:bg-slate-950 min-h-[calc(100vh-4rem)]">{children}</div>
      </main>
      <VoiceNavigation />
      <OfflineIndicator />
      <ChatApplet />
    </div>
  );
};

export default memo(MainLayoutdoctor);
