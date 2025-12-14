import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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
  Workflow
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useState, useEffect } from 'react';
import { useTheme } from '@/utils/theme.provider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import ChatApplet from '@/components/chat/ChatApplet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Moon, Sun } from 'lucide-react';

// Custom scrollbar styles
const scrollbarStyles = `
  .custom-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
  }
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(156, 163, 175, 0.5);
    border-radius: 3px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(156, 163, 175, 0.7);
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = scrollbarStyles;
  document.head.appendChild(styleElement);
}

interface AdminLayoutProps {
  children: ReactNode;
}

const AdminLayout = ({ children }: AdminLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { setTheme, theme } = useTheme();
  const [isTeamMember, setIsTeamMember] = useState(false);

  // Set admin token immediately for development
  // BUT: if team member is logged in, use their token instead
  useEffect(() => {
    const teamToken = localStorage.getItem('teamToken');
    const adminToken = localStorage.getItem('adminToken');
    
    // Check if current user is a team member
    setIsTeamMember(!!teamToken);
    
    // If team member is logged in, they can access admin routes with their teamToken
    if (teamToken) {
      // Team members use their own token, no need to set adminToken
      return;
    }
    
    // Otherwise, set dev admin token for development
    if (!adminToken) {
      localStorage.setItem('adminToken', 'dev-admin-token');
      localStorage.setItem('adminData', JSON.stringify({
        id: 'admin_dev',
        email: 'admin@mediczy.com',
        role: 'super_admin',
        firstName: 'System',
        lastName: 'Administrator'
      }));
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminData');
    window.location.href = '/admin/login';
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    users: true,
    healthcare: false,
    corporate: false,
    services: false,
    finance: false,
    communication: false,
    system: false,
  });

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const menuGroups = [
    {
      id: 'main',
      label: 'Main',
      items: isTeamMember ? [
        // Team members don't see the dashboard link - they navigate back via team sidebar
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
      color: 'text-green-600',
      items: [
        { icon: Users, label: 'Members', path: '/admin/users', color: 'text-green-500', bg: 'bg-green-500/10' },
        { icon: HeartPulse, label: 'Health Risk', path: '/admin/health-risk', color: 'text-rose-500', bg: 'bg-rose-500/10' },
        { icon: Users, label: 'Team', path: '/admin/team', color: 'text-purple-500', bg: 'bg-purple-500/10' },
        { icon: Stethoscope, label: 'Doctors', path: '/admin/doctors', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
        { icon: Calendar, label: 'Appointments', path: '/admin/appointments', color: 'text-orange-500', bg: 'bg-orange-500/10' },
        { icon: MessageSquare, label: 'Chat', path: '/admin/chat', color: 'text-blue-600', bg: 'bg-blue-600/10' },
      ]
    },
    {
      id: 'healthcare',
      label: 'Healthcare Facilities',
      icon: Hospital,
      color: 'text-red-600',
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
      label: 'Corporate Management',
      icon: Building2,
      color: 'text-amber-600',
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
      icon: Ambulance,
      color: 'text-rose-600',
      items: [
        { icon: FileText, label: 'Plans', path: '/admin/plans', color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
        { icon: Building2, label: 'Insurance', path: '/admin/insurance', color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
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
      label: 'Finance & Billing',
      icon: Banknote,
      color: 'text-emerald-600',
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
      color: 'text-blue-600',
      items: [
        { icon: Mail, label: 'Email', path: '/admin/email', color: 'text-orange-500', bg: 'bg-orange-500/10' },
        { icon: Send, label: 'SMS', path: '/admin/sms', color: 'text-green-500', bg: 'bg-green-500/10' },
        { icon: MessageSquare, label: 'WhatsApp', path: '/admin/whatsapp', color: 'text-green-600', bg: 'bg-green-600/10' },
        { icon: Video, label: 'Video Calls', path: '/admin/video', color: 'text-blue-500', bg: 'bg-blue-500/10' },
        { icon: Phone, label: 'Voice Calls', path: '/admin/voice', color: 'text-teal-500', bg: 'bg-teal-500/10' },
      ]
    },
    {
      id: 'system',
      label: 'System',
      icon: Settings,
      color: 'text-slate-600',
      items: [
        { icon: Activity, label: 'Activity Log', path: '/admin/activity-log', color: 'text-purple-500', bg: 'bg-purple-500/10' },
        { icon: Workflow, label: 'Workflow Automation', path: '/admin/workflow-automation', color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
        { icon: Settings, label: 'Settings', path: '/admin/settings', color: 'text-slate-500', bg: 'bg-slate-500/10' },
      ]
    }
  ];

  const SidebarContent = () => (
    <div className="flex h-full flex-col bg-gradient-to-b from-background via-background/98 to-background/95 backdrop-blur-xl border-r border-border/30">
      {/* Logo Section with Enhanced Gradient */}
      <div className="relative overflow-hidden border-b border-border/30 p-4 lg:p-6">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/8 via-purple-500/5 to-emerald-500/8" />
        <div className="relative flex items-center gap-2 lg:gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500/15 to-purple-500/15 border border-blue-500/20 shadow-sm">
            <HeartPulse className="h-5 w-5 lg:h-6 lg:w-6 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg lg:text-xl font-bold text-foreground flex items-center gap-2">
              <span className="truncate">Mediqzy Admin</span>
              <Crown className="h-3 w-3 lg:h-4 lg:w-4 text-amber-500 flex-shrink-0" />
            </h2>
            <p className="text-xs text-muted-foreground hidden lg:block">Healthcare Management System</p>
          </div>
        </div>
        
        {/* Enhanced decorative elements */}
        <div className="absolute -right-6 -top-6 opacity-[0.03] pointer-events-none">
          <Plus className="w-16 h-16 lg:w-20 lg:h-20 text-blue-500 rotate-12" />
        </div>
        <div className="absolute -left-3 -bottom-3 opacity-[0.02] pointer-events-none">
          <HeartPulse className="w-12 h-12 text-purple-500 -rotate-12" />
        </div>
      </div>
      
      {/* Enhanced Navigation with grouped sub-menus */}
      <nav className="flex-1 p-2 lg:p-4 space-y-1 overflow-y-auto custom-scrollbar">
        {menuGroups.map((group) => {
          // For main group, render items directly without collapsible header
          if (group.id === 'main') {
            return (
              <div key={group.id} className="space-y-0.5 mb-3">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setSidebarOpen(false)}
                      className={`group relative flex items-center gap-2 lg:gap-3 rounded-lg px-2 lg:px-3 py-2.5 lg:py-3 text-xs lg:text-sm transition-all duration-200 overflow-hidden ${
                        isActive
                          ? `${item.bg} ${item.color} border border-current/15 shadow-sm backdrop-blur-sm`
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent/60 border border-transparent hover:border-border/50'
                      }`}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-current rounded-r-full" />
                      )}
                      {!isActive && (
                        <div className="absolute inset-0 bg-gradient-to-r from-accent/30 via-accent/50 to-accent/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg" />
                      )}
                      <div className={`relative p-1.5 lg:p-2 rounded-md transition-all duration-200 group-hover:scale-105 ${
                        isActive ? item.bg + ' shadow-sm' : 'group-hover:bg-accent/60'
                      }`}>
                        <Icon className="h-4 w-4 lg:h-5 lg:w-5" />
                      </div>
                      <span className={`relative font-medium transition-colors duration-200 ${
                        isActive ? 'text-current' : 'group-hover:text-foreground'
                      }`}>
                        {item.label}
                      </span>
                      {isActive && (
                        <div className="ml-auto opacity-60">
                          <ArrowRight className="h-3 w-3" />
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          }

          // For other groups, render collapsible sections
          const GroupIcon = group.icon!;
          const isExpanded = expandedGroups[group.id];
          const hasActiveItem = group.items.some(item => location.pathname === item.path);

          return (
            <div key={group.id} className="mb-1">
              {/* Group Header */}
              <button
                onClick={() => toggleGroup(group.id)}
                className={`w-full group relative flex items-center gap-2 lg:gap-3 rounded-lg px-2 lg:px-3 py-2 lg:py-2.5 text-xs lg:text-sm transition-all duration-200 overflow-hidden ${
                  hasActiveItem
                    ? `${group.color} bg-gradient-to-r from-accent/40 to-accent/20 border border-current/10`
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/40 border border-transparent hover:border-border/30'
                }`}
              >
                <div className={`relative p-1 lg:p-1.5 rounded-md transition-all duration-200 ${
                  hasActiveItem ? 'bg-accent/60' : 'group-hover:bg-accent/60'
                }`}>
                  <GroupIcon className="h-4 w-4" />
                </div>
                <span className="relative font-semibold text-xs lg:text-sm">
                  {group.label}
                </span>
                <div className="ml-auto">
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3 lg:h-4 lg:w-4 transition-transform duration-200" />
                  ) : (
                    <ChevronRight className="h-3 w-3 lg:h-4 lg:w-4 transition-transform duration-200" />
                  )}
                </div>
              </button>

              {/* Group Items */}
              {isExpanded && (
                <div className="mt-0.5 ml-2 lg:ml-3 space-y-0.5 border-l border-border/30 pl-2 lg:pl-3">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setSidebarOpen(false)}
                        className={`group relative flex items-center gap-2 rounded-md px-2 lg:px-3 py-2 lg:py-2.5 text-xs lg:text-sm transition-all duration-200 overflow-hidden ${
                          isActive
                            ? `${item.bg} ${item.color} border border-current/15 shadow-sm`
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50 border border-transparent hover:border-border/30'
                        }`}
                      >
                        {isActive && (
                          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-current rounded-r-full" />
                        )}
                        <div className={`relative p-1 lg:p-1.5 rounded-md transition-all duration-200 ${
                          isActive ? item.bg + ' shadow-sm' : 'group-hover:bg-accent/60'
                        }`}>
                          <Icon className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
                        </div>
                        <span className={`relative font-medium transition-colors duration-200 ${
                          isActive ? 'text-current' : 'group-hover:text-foreground'
                        }`}>
                          {item.label}
                        </span>
                        {isActive && (
                          <div className="ml-auto opacity-60">
                            <ArrowRight className="h-3 w-3" />
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      
      {/* Enhanced footer section */}
      <div className="border-t border-border/30 p-3 lg:p-4 bg-accent/20">
        <div className="text-xs text-muted-foreground text-center">
          <div className="font-medium mb-1">Mediqzy Platform v2.0</div>
          <div className="opacity-70">Healthcare Excellence</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gradient-to-br from-background via-background/95 to-muted/20">
      {/* Desktop Sidebar - Hidden for team members as they use team sidebar */}
      {!isTeamMember && (
        <aside className="hidden w-64 lg:block">
          <SidebarContent />
        </aside>
      )}

      {/* Mobile Sidebar - Hidden for team members as they use team sidebar */}
      {!isTeamMember && (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-64 p-0">
            <SidebarContent />
          </SheetContent>
        </Sheet>
      )}

      {/* Main Content */}
      <div className="flex flex-1 flex-col">
        {/* Header with gradient and backdrop blur */}
        <header className="relative border-b border-border/50 bg-background/80 backdrop-blur-xl px-6 py-4">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-transparent to-purple-500/5" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Mobile menu toggle - Hidden for team members as they use team sidebar */}
              {!isTeamMember && (
                <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                  <SheetTrigger asChild className="lg:hidden">
                    <Button variant="ghost" size="icon" className="relative overflow-hidden group">
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-md" />
                      <Menu className="h-6 w-6 relative z-10" />
                    </Button>
                  </SheetTrigger>
                </Sheet>
              )}
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  {isTeamMember ? 'Team Management' : 'Admin Dashboard'}
                </h1>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  Healthcare Management System
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Theme Toggle */}
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={toggleTheme}
                className="relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-orange-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-md" />
                {theme === 'light' ? (
                  <Sun className="h-5 w-5 relative z-10 text-amber-500" />
                ) : (
                  <Moon className="h-5 w-5 relative z-10 text-blue-400" />
                )}
              </Button>
              
              {/* Admin Profile Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="relative h-10 w-10 rounded-full overflow-hidden group"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-full" />
                    <Avatar className="h-9 w-9 relative z-10">
                      <AvatarImage src="/admin-avatar.png" alt="Admin" />
                      <AvatarFallback className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 text-blue-600">
                        <Crown className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none flex items-center gap-2">
                        <Crown className="h-3 w-3 text-amber-500" />
                        System Administrator
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">
                        admin@mediczy.com
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Settings className="mr-2 h-4 w-4" />
                    Admin Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                    <LogOut className="mr-2 h-4 w-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Content Area with gradient background */}
        <main className="flex-1 overflow-y-auto relative">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.02] via-transparent to-purple-500/[0.02]" />
          <div className="relative container mx-auto p-6 pb-20 md:pb-6">
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
