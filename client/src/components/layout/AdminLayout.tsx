import { ReactNode, useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BRAND } from "@/config/brand";
import { 
  LayoutDashboard, 
  Users, 
  Stethoscope, 
  FlaskConical, 
  Pill, 
  Building2, 
  LogOut,
  Menu,
  X,
  UserPlus,
  Upload,
  BarChart3,
  FileText,
  Settings,
  Calendar,
  Hospital,
  Home,
  Ambulance,
  Building,
  HeartPulse,
  Plus,
  Crown,
  Shield,
  Heart,
  Landmark,
  CreditCard,
  Truck,
  Briefcase,
  Banknote,
  Calculator,
  Wallet,
  Mail,
  Send,
  Video,
  Phone,
  ArrowRight,
  Activity,
  MessageSquare,
  Package,
  ChevronDown,
  ChevronRight,
  Workflow,
  Bell,
  Search,
  PanelLeftClose,
  PanelLeft,
  Moon,
  Sun,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useTheme } from '@/utils/theme.provider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import ChatApplet from '@/components/chat/ChatApplet';
import api from '@/utils/api';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface AdminLayoutProps {
  children: ReactNode;
}

interface NavItem {
  icon: React.ComponentType<any>;
  label: string;
  path: string;
  color?: string;
  bg?: string;
  badge?: string;
  highlight?: boolean;
}

interface NavGroup {
  id: string;
  label: string;
  icon?: React.ComponentType<any>;
  color?: string;
  items: NavItem[];
}

const AdminLayout = ({ children }: AdminLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('admin-sidebar-collapsed');
    return saved === 'true';
  });
  const { setTheme, theme } = useTheme();
  const [isTeamMember, setIsTeamMember] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [livekitStatus, setLivekitStatus] = useState<{
    loading: boolean;
    success: boolean | null;
    message: string;
    checkedAt: string | null;
  }>({
    loading: true,
    success: null,
    message: '',
    checkedAt: null
  });

  const adminData = JSON.parse(localStorage.getItem('adminData') || '{}');
  const adminName = adminData?.firstName 
    ? `${adminData.firstName} ${adminData.lastName || ''}`.trim()
    : adminData?.email?.split('@')[0] || 'Admin';
  const adminEmail = adminData?.email || 'admin@mediczy.com';
  
  const notifications = [
    { id: 1, title: 'New provider request', time: '5m ago', unread: true },
    { id: 2, title: '2 invoices need review', time: '30m ago', unread: true },
    { id: 3, title: 'Security audit passed', time: 'Today', unread: false },
  ];
  const unreadCount = notifications.filter(n => n.unread).length;

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    users: false,
    healthcare: false,
    corporate: false,
    services: false,
    finance: false,
    communication: false,
    system: false,
  });

  // Persist collapsed state
  useEffect(() => {
    localStorage.setItem('admin-sidebar-collapsed', String(isCollapsed));
  }, [isCollapsed]);

  // Track viewport for responsive behavior
  useEffect(() => {
    const updateViewport = () => {
      const desktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
      setIsDesktop(desktop);
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  // Determine if current user is a team member
  useEffect(() => {
    const teamToken = localStorage.getItem('teamToken');
    setIsTeamMember(!!teamToken);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const adminToken = localStorage.getItem('adminToken');
    if (!adminToken) {
      setLivekitStatus({ loading: false, success: null });
      return;
    }

    const checkLivekit = async () => {
      try {
        if (!isMounted) return;
        setLivekitStatus((prev) => ({ ...prev, loading: true }));
        const { data } = await api.post('/video-config/provider/livekit/test');
        if (!isMounted) return;
        setLivekitStatus({
          loading: false,
          success: !!data.success,
          message: data.message || '',
          checkedAt: new Date().toISOString()
        });
      } catch (error) {
        if (!isMounted) return;
        setLivekitStatus({
          loading: false,
          success: false,
          message: 'LiveKit health check failed',
          checkedAt: new Date().toISOString()
        });
      }
    };

    checkLivekit();
    const intervalId = window.setInterval(checkLivekit, 120000);

    return () => {
      isMounted = false;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  const refreshLivekitStatus = async () => {
    try {
      setLivekitStatus((prev) => ({ ...prev, loading: true }));
      const { data } = await api.post('/video-config/provider/livekit/test');
      setLivekitStatus({
        loading: false,
        success: !!data.success,
        message: data.message || '',
        checkedAt: new Date().toISOString()
      });
    } catch (error) {
      setLivekitStatus({
        loading: false,
        success: false,
        message: 'LiveKit health check failed',
        checkedAt: new Date().toISOString()
      });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminData');
    window.location.href = '/admin/login';
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const toggleCollapse = () => {
    setIsCollapsed(prev => !prev);
  };

  const getAdminInitials = () => {
    if (adminData?.firstName) {
      const first = adminData.firstName.charAt(0);
      const last = (adminData.lastName || '').charAt(0);
      return `${first}${last}`.toUpperCase();
    }
    return 'AD';
  };

  const handleNavClick = () => {
    if (!isDesktop) {
      setSidebarOpen(false);
    }
  };

  const menuGroups: NavGroup[] = [
    {
      id: 'main',
      label: 'Main',
      items: isTeamMember ? [
        { icon: BarChart3, label: 'Reports', path: '/admin/reports', color: 'text-sky-500', bg: 'bg-sky-500/10' },
        { icon: FileText, label: 'CRM', path: '/admin/crm', color: 'text-fuchsia-500', bg: 'bg-fuchsia-500/10' },
      ] : [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/admin', color: 'text-blue-500', bg: 'bg-blue-500/10' },
        { icon: BarChart3, label: 'Reports', path: '/admin/reports', color: 'text-sky-500', bg: 'bg-sky-500/10' },
        { icon: FileText, label: 'CRM', path: '/admin/crm', color: 'text-fuchsia-500', bg: 'bg-fuchsia-500/10' },
      ]
    },
    {
      id: 'users',
      label: 'Users & Team',
      icon: Users,
      color: 'text-green-500',
      items: [
        { icon: Users, label: 'Members', path: '/admin/users', color: 'text-green-500', bg: 'bg-green-500/10' },
        { icon: HeartPulse, label: 'Health Risk', path: '/admin/health-risk', color: 'text-rose-500', bg: 'bg-rose-500/10', highlight: true },
        { icon: Users, label: 'Team', path: '/admin/team', color: 'text-purple-500', bg: 'bg-purple-500/10' },
        { icon: Stethoscope, label: 'Doctors', path: '/admin/doctors', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
        { icon: Calendar, label: 'Appointments', path: '/admin/appointments', color: 'text-orange-500', bg: 'bg-orange-500/10' },
      ]
    },
    {
      id: 'healthcare',
      label: 'Healthcare Facilities',
      icon: Hospital,
      color: 'text-red-500',
      items: [
        { icon: Hospital, label: 'Hospitals', path: '/admin/hospitals', color: 'text-red-500', bg: 'bg-red-500/10' },
        { icon: Building, label: 'Clinics', path: '/admin/clinics', color: 'text-pink-500', bg: 'bg-pink-500/10' },
        { icon: FlaskConical, label: 'Labs', path: '/admin/labs', color: 'text-lime-500', bg: 'bg-lime-500/10' },
        { icon: Pill, label: 'Pharmacies', path: '/admin/pharmacies', color: 'text-teal-500', bg: 'bg-teal-500/10' },
        { icon: Briefcase, label: 'OHC', path: '/admin/ohc', color: 'text-emerald-600', bg: 'bg-emerald-600/10' },
      ]
    },
    {
      id: 'corporate',
      label: 'Corporate',
      icon: Building2,
      color: 'text-amber-500',
      items: [
        { icon: Building2, label: 'Corporates', path: '/admin/corporates', color: 'text-amber-500', bg: 'bg-amber-500/10' },
        { icon: Package, label: 'Plans', path: '/admin/corporate-plans', color: 'text-purple-500', bg: 'bg-purple-500/10' },
        { icon: HeartPulse, label: 'Health Packages', path: '/admin/corporate-health-packages', color: 'text-red-500', bg: 'bg-red-500/10' },
        { icon: Users, label: 'Employees', path: '/admin/corporate-employees', color: 'text-blue-600', bg: 'bg-blue-600/10' },
      ]
    },
    {
      id: 'services',
      label: 'Services & Insurance',
      icon: Shield,
      color: 'text-indigo-500',
      items: [
        { icon: FileText, label: 'Plans', path: '/admin/plans', color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
        { icon: Shield, label: 'Insurance', path: '/admin/insurance', color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
        { icon: Shield, label: 'Insurer', path: '/admin/insurer', color: 'text-indigo-600', bg: 'bg-indigo-600/10' },
        { icon: CreditCard, label: 'TPA', path: '/admin/tpa', color: 'text-cyan-600', bg: 'bg-cyan-600/10' },
        { icon: Home, label: 'Homecare', path: '/admin/homecare', color: 'text-violet-500', bg: 'bg-violet-500/10' },
        { icon: Ambulance, label: 'Ambulance', path: '/admin/ambulance', color: 'text-rose-500', bg: 'bg-rose-500/10' },
        { icon: Truck, label: 'Medivac', path: '/admin/medivac', color: 'text-red-600', bg: 'bg-red-600/10' },
        { icon: Heart, label: 'NGO', path: '/admin/ngo', color: 'text-pink-600', bg: 'bg-pink-600/10' },
        { icon: Landmark, label: 'PSU', path: '/admin/psu', color: 'text-orange-600', bg: 'bg-orange-600/10' },
      ]
    },
    {
      id: 'finance',
      label: 'Finance',
      icon: Banknote,
      color: 'text-emerald-500',
      items: [
        { icon: Banknote, label: 'Billing', path: '/admin/billing', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
        { icon: Calculator, label: 'Accounting', path: '/admin/accounting', color: 'text-blue-600', bg: 'bg-blue-600/10' },
        { icon: Wallet, label: 'Payments', path: '/admin/payments', color: 'text-green-600', bg: 'bg-green-600/10' },
      ]
    },
    {
      id: 'communication',
      label: 'Communication',
      icon: MessageSquare,
      color: 'text-blue-500',
      items: [
        { icon: MessageSquare, label: 'Chat', path: '/admin/chat', color: 'text-blue-600', bg: 'bg-blue-600/10' },
        { icon: Mail, label: 'Email', path: '/admin/email', color: 'text-orange-500', bg: 'bg-orange-500/10' },
        { icon: Send, label: 'SMS', path: '/admin/sms', color: 'text-green-500', bg: 'bg-green-500/10' },
        { icon: MessageSquare, label: 'WhatsApp', path: '/admin/whatsapp', color: 'text-green-600', bg: 'bg-green-600/10', badge: 'New' },
        { icon: Video, label: 'Video', path: '/admin/video', color: 'text-blue-500', bg: 'bg-blue-500/10' },
        { icon: Phone, label: 'Voice', path: '/admin/voice', color: 'text-teal-500', bg: 'bg-teal-500/10' },
      ]
    },
    {
      id: 'system',
      label: 'System',
      icon: Settings,
      color: 'text-slate-500',
      items: [
        { icon: Shield, label: 'Module Access', path: '/admin/module-access', color: 'text-blue-500', bg: 'bg-blue-500/10', highlight: true },
        { icon: Activity, label: 'Activity Log', path: '/admin/activity-log', color: 'text-teal-500', bg: 'bg-teal-500/10' },
        { icon: Workflow, label: 'Automation', path: '/admin/workflow-automation', color: 'text-indigo-500', bg: 'bg-indigo-500/10', highlight: true },
        { icon: Settings, label: 'Settings', path: '/admin/settings', color: 'text-slate-500', bg: 'bg-slate-500/10' },
      ]
    }
  ];

  // Filter menu items based on search
  const filteredMenuGroups = searchQuery
    ? menuGroups.map(group => ({
        ...group,
        items: group.items.filter(item =>
          item.label.toLowerCase().includes(searchQuery.toLowerCase())
        )
      })).filter(group => group.items.length > 0)
    : menuGroups;

  const renderNavItem = (item: NavItem, isInGroup: boolean = false) => {
    const isActive = location.pathname === item.path;
    const Icon = item.icon;

    // Collapsed mode - show only icons with tooltips
    if (isCollapsed && isDesktop) {
      return (
        <Tooltip key={item.path}>
          <TooltipTrigger asChild>
            <Link
              to={item.path}
              onClick={handleNavClick}
              className={cn(
                "group relative flex items-center justify-center rounded-xl p-2.5 transition-all duration-200",
                isActive
                  ? "bg-gradient-to-r from-teal-500/20 to-teal-600/10 text-teal-400 border border-teal-500/30 shadow-sm"
                  : item.highlight
                    ? "text-amber-500 hover:bg-amber-500/10 border border-amber-500/20"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className={cn(
                "h-5 w-5",
                isActive ? "text-teal-400" : item.highlight ? "text-amber-500" : ""
              )} />
              {item.highlight && !isActive && (
                <span className="absolute top-1 right-1 flex h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              )}
              {item.badge && !isActive && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-blue-500 text-[10px] text-white px-1">
                  !
                </span>
              )}
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" className="flex items-center gap-2">
            {item.label}
            {item.badge && <Badge variant="secondary" className="text-[10px] px-1">{item.badge}</Badge>}
          </TooltipContent>
        </Tooltip>
      );
    }

    // Expanded mode
    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={handleNavClick}
        className={cn(
          "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
          isActive
            ? "bg-gradient-to-r from-teal-500/20 to-teal-600/10 text-teal-400 border border-teal-500/30 shadow-sm"
            : item.highlight
              ? "text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 border border-amber-500/20"
              : "text-muted-foreground hover:bg-accent hover:text-foreground border border-transparent hover:border-border/50",
          isInGroup && "py-2"
        )}
      >
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-teal-500 rounded-r-full" />
        )}
        <Icon className={cn(
          "h-4 w-4 transition-colors",
          isActive ? "text-teal-400" : item.highlight ? "text-amber-500" : "text-muted-foreground group-hover:text-foreground"
        )} />
        <span className="flex-1">{item.label}</span>
        {item.badge && (
          <Badge variant="secondary" className="text-[10px] px-1.5 bg-teal-500/10 text-teal-600 dark:text-teal-400">
            {item.badge}
          </Badge>
        )}
        {item.highlight && !isActive && (
          <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
        )}
        {isActive && (
          <ArrowRight className="h-3 w-3 opacity-60" />
        )}
      </Link>
    );
  };

  const SidebarContent = () => (
    <div className="flex h-full flex-col bg-background/95 backdrop-blur-xl">
      {/* Logo Section */}
      <div className={cn(
        "flex items-center border-b border-border/50 py-4",
        isCollapsed && isDesktop ? "justify-center px-2" : "gap-3 px-4"
      )}>
        <Link 
          to="/admin" 
          className="flex items-center gap-3 flex-1 cursor-pointer hover:opacity-80 transition-opacity"
        >
          <div className="p-2 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 shadow-lg shadow-teal-500/20">
            <HeartPulse className="h-5 w-5 text-white" />
          </div>
          {!(isCollapsed && isDesktop) && (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-foreground tracking-tight">{BRAND.name}</span>
                <Crown className="h-4 w-4 text-amber-500" />
              </div>
              <p className="text-xs text-muted-foreground">Admin Portal</p>
            </div>
          )}
        </Link>
        {/* Collapse Toggle - Desktop only */}
        {isDesktop && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapse}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            {isCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        )}
      </div>

      {/* Search - Only in expanded mode */}
      {!(isCollapsed && isDesktop) && (
        <div className="px-4 py-3 border-b border-border/30">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search menu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-accent/50 border-border/50 text-sm"
            />
          </div>
        </div>
      )}

      {/* Admin Quick Info */}
      {!(isCollapsed && isDesktop) && (
        <div className="px-4 py-3 border-b border-border/30">
          <div className="flex items-center gap-3 p-2 rounded-lg bg-accent/30">
            <Avatar className="h-9 w-9 border-2 border-blue-500/30">
              <AvatarImage src="/admin-avatar.png" />
              <AvatarFallback className="bg-gradient-to-br from-teal-500 to-teal-600 text-white text-sm font-semibold">
                {getAdminInitials()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{adminName}</p>
              <p className="text-xs text-muted-foreground truncate">{adminEmail}</p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <TooltipProvider delayDuration={0}>
        <ScrollArea className="flex-1 px-2 py-2" ref={scrollAreaRef}>
          <nav className="space-y-1">
            {filteredMenuGroups.map((group) => {
              // Main group - render items directly
              if (group.id === 'main') {
                return (
                  <div key={group.id} className="space-y-1 mb-3">
                    {group.items.map((item) => renderNavItem(item))}
                  </div>
                );
              }

              // Collapsible groups
              const GroupIcon = group.icon!;
              const isExpanded = expandedGroups[group.id];
              const hasActiveItem = group.items.some(item => location.pathname === item.path);

              // Collapsed mode - show only group icon
              if (isCollapsed && isDesktop) {
                return (
                  <Tooltip key={group.id}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          setIsCollapsed(false);
                          setExpandedGroups(prev => ({ ...prev, [group.id]: true }));
                        }}
                        className={cn(
                          "w-full flex items-center justify-center rounded-xl p-2.5 transition-all duration-200",
                          hasActiveItem
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                      >
                        <GroupIcon className={cn("h-5 w-5", group.color)} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {group.label}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return (
                <div key={group.id} className="mb-1">
                  {/* Group Header */}
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className={cn(
                      "w-full group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200",
                      hasActiveItem
                        ? "bg-accent/60 text-foreground"
                        : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                    )}
                  >
                    <GroupIcon className={cn("h-4 w-4", group.color)} />
                    <span className="flex-1 text-left">{group.label}</span>
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                    ) : (
                      <ChevronRight className="h-4 w-4 transition-transform duration-200" />
                    )}
                  </button>

                  {/* Group Items */}
                  {isExpanded && (
                    <div className="mt-1 ml-3 space-y-0.5 border-l-2 border-border/50 pl-3">
                      {group.items.map((item) => renderNavItem(item, true))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </ScrollArea>
      </TooltipProvider>

      {/* Footer */}
      <div className="border-t border-border/30 p-3">
        {!(isCollapsed && isDesktop) ? (
          <div className="text-center">
            <p className="text-xs font-medium text-muted-foreground">{BRAND.name} Platform v2.0</p>
            <p className="text-[10px] text-muted-foreground/70">Healthcare Excellence</p>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex justify-center">
                <HeartPulse className="h-4 w-4 text-muted-foreground" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">{BRAND.name} v2.0</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop Sidebar */}
      {!isTeamMember && (
        <aside
          className={cn(
            "hidden lg:flex flex-col border-r border-border/50 transition-all duration-300",
            isCollapsed ? "w-16" : "w-64"
          )}
        >
          <SidebarContent />
        </aside>
      )}

      {/* Mobile Sidebar */}
      {!isTeamMember && (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <SidebarContent />
          </SheetContent>
        </Sheet>
      )}

      {/* Main Content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border/50 bg-background/80 backdrop-blur-xl px-4 lg:px-6">
          {/* Mobile menu toggle */}
          {!isTeamMember && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}

          {/* Title */}
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-foreground">
              {isTeamMember ? 'Team Management' : 'Admin Dashboard'}
            </h1>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Healthcare Management System
            </p>
          </div>

          {/* Header Actions */}
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="hidden sm:flex items-center gap-2 rounded-md border border-input px-2 py-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate('/admin/video')}
                      className="h-7 px-2"
                    >
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full',
                          livekitStatus.loading && 'bg-slate-300 animate-pulse',
                          livekitStatus.success === true && 'bg-emerald-500',
                          livekitStatus.success === false && 'bg-red-500'
                        )}
                      />
                      <span className="ml-2 text-xs">LiveKit</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={refreshLivekitStatus}
                      className="h-7 w-7"
                      title="Refresh LiveKit status"
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5', livekitStatus.loading && 'animate-spin')} />
                    </Button>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs space-y-1">
                    <div>
                      Status:{' '}
                      {livekitStatus.loading
                        ? 'Checking...'
                        : livekitStatus.success
                          ? 'Healthy'
                          : 'Unhealthy'}
                    </div>
                    {livekitStatus.message && <div>{livekitStatus.message}</div>}
                    {livekitStatus.checkedAt && (
                      <div>Checked: {new Date(livekitStatus.checkedAt).toLocaleString()}</div>
                    )}
                    <div>Click refresh to update</div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Quick Add Button */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="hidden sm:flex gap-2">
                  <Plus className="h-4 w-4" />
                  Quick Add
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => navigate('/admin/users')}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  New User
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/admin/doctors')}>
                  <Stethoscope className="mr-2 h-4 w-4" />
                  New Doctor
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/admin/appointments')}>
                  <Calendar className="mr-2 h-4 w-4" />
                  New Appointment
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/admin/corporates')}>
                  <Building2 className="mr-2 h-4 w-4" />
                  New Corporate
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Theme Toggle */}
            <Button variant="ghost" size="icon" onClick={toggleTheme}>
              {theme === 'light' ? (
                <Sun className="h-5 w-5 text-amber-500" />
              ) : (
                <Moon className="h-5 w-5 text-blue-400" />
              )}
            </Button>

            {/* Notifications */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] text-white font-medium">
                      {unreadCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel className="flex items-center justify-between">
                  <span>Notifications</span>
                  {unreadCount > 0 && (
                    <Badge variant="secondary" className="text-[10px]">{unreadCount} new</Badge>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifications.length > 0 ? (
                  notifications.map((note) => (
                    <DropdownMenuItem key={note.id} className="flex flex-col items-start gap-1 py-3">
                      <div className="flex items-center gap-2 w-full">
                        <span className={cn("text-sm font-medium", note.unread && "text-foreground")}>
                          {note.title}
                        </span>
                        {note.unread && (
                          <span className="ml-auto h-2 w-2 rounded-full bg-blue-500" />
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{note.time}</span>
                    </DropdownMenuItem>
                  ))
                ) : (
                  <DropdownMenuItem disabled>No notifications</DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-center justify-center text-blue-600 dark:text-blue-400">
                  View all notifications
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Profile Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                  <Avatar className="h-9 w-9 border-2 border-teal-500/30">
                    <AvatarImage src="/admin-avatar.png" />
                    <AvatarFallback className="bg-gradient-to-br from-teal-500 to-teal-600 text-white text-sm font-semibold">
                      {getAdminInitials()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <Crown className="h-3 w-3 text-amber-500" />
                      {adminName}
                    </p>
                    <p className="text-xs text-muted-foreground">{adminEmail}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/admin/settings')}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/admin/activity-log')}>
                  <Activity className="mr-2 h-4 w-4" />
                  Activity Log
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto p-4 lg:p-6 pb-20 lg:pb-6">
            {children}
          </div>
        </main>

        {/* Chat Applet */}
        <ChatApplet />
      </div>
    </div>
  );
};

export default AdminLayout;
