import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  LayoutDashboard,
  FileText,
  Building2,
  Users,
  BarChart3,
  MessageSquare,
  Settings,
  HelpCircle,
  LogOut,
  Shield,
  Activity,
  ClipboardList,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  DollarSign,
  CheckCircle,
  XCircle,
  Clock,
  Link as LinkIcon
} from 'lucide-react';
import { useState } from 'react';

interface SidebarItem {
  icon: React.ComponentType<any>;
  label: string;
  path: string;
  badge?: string;
  color?: string;
  bg?: string;
}

interface SidebarGroup {
  id: string;
  label: string;
  icon?: React.ComponentType<any>;
  color?: string;
  items: SidebarItem[];
}

const TPASidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    main: true,
    operations: true,
    management: true,
    system: true
  });

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  const menuGroups: SidebarGroup[] = [
    {
      id: 'main',
      label: 'Main Menu',
      items: [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/tpa/dashboard', color: 'text-blue-600', bg: 'bg-blue-500/10' },
      ]
    },
    {
      id: 'operations',
      label: 'Claims & Operations',
      icon: FileText,
      color: 'text-purple-600',
      items: [
        { icon: FileText, label: 'Claims Management', path: '/tpa/claims', color: 'text-purple-600', bg: 'bg-purple-500/10' },
        { icon: Activity, label: 'Pre-Authorization', path: '/tpa/pre-auth', color: 'text-orange-600', bg: 'bg-orange-500/10' },
        { icon: CheckCircle, label: 'Approvals', path: '/tpa/approvals', color: 'text-green-600', bg: 'bg-green-500/10' },
      ]
    },
    {
      id: 'management',
      label: 'Client Management',
      icon: Building2,
      color: 'text-indigo-600',
      items: [
        { icon: Building2, label: 'Corporates', path: '/tpa/corporates', color: 'text-indigo-600', bg: 'bg-indigo-500/10' },
        { icon: Users, label: 'Members', path: '/tpa/members', color: 'text-cyan-600', bg: 'bg-cyan-500/10' },
        { icon: ClipboardList, label: 'Policies', path: '/tpa/policies', color: 'text-teal-600', bg: 'bg-teal-500/10' },
      ]
    },
    {
      id: 'analytics',
      label: 'Analytics & Reports',
      icon: TrendingUp,
      color: 'text-emerald-600',
      items: [
        { icon: TrendingUp, label: 'Analytics', path: '/tpa/analytics', color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
        { icon: BarChart3, label: 'Reports', path: '/tpa/reports', color: 'text-blue-600', bg: 'bg-blue-500/10' },
      ]
    },
    {
      id: 'system',
      label: 'System',
      icon: Settings,
      color: 'text-slate-600',
      items: [
        { icon: MessageSquare, label: 'Communication', path: '/tpa/communication', color: 'text-blue-600', bg: 'bg-blue-500/10' },
        { icon: LinkIcon, label: 'Heritage TPA API', path: '/tpa/heritage', color: 'text-purple-600', bg: 'bg-purple-500/10' },
        { icon: Settings, label: 'Settings', path: '/tpa/settings', color: 'text-slate-600', bg: 'bg-slate-500/10' },
        { icon: HelpCircle, label: 'Support', path: '/tpa/support', color: 'text-gray-600', bg: 'bg-gray-500/10' },
      ]
    }
  ];

  const handleLogout = () => {
    localStorage.removeItem('tpaToken');
    localStorage.removeItem('token');
    localStorage.removeItem('userType');
    localStorage.removeItem('tpaData');
    navigate('/tpa/login');
  };

  const NavItem = ({ item }: { item: SidebarItem }) => {
    const isActive = location.pathname === item.path;
    
    return (
      <Link
        to={item.path}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
          isActive
            ? `${item.bg} ${item.color} shadow-md`
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
          collapsed && "justify-center px-2"
        )}
      >
        <item.icon className={cn("w-5 h-5 flex-shrink-0")} />
        {!collapsed && (
          <>
            <span className="flex-1">{item.label}</span>
            {item.badge && (
              <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-red-100 text-red-600">
                {item.badge}
              </span>
            )}
          </>
        )}
      </Link>
    );
  };

  return (
    <aside className={cn(
      "fixed left-0 top-0 z-40 h-screen bg-white border-r border-slate-200 transition-all duration-300",
      collapsed ? "w-20" : "w-64"
    )}>
      {/* Header */}
      <div className="relative overflow-hidden border-b border-slate-200 p-4">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-blue-500/5 to-indigo-500/5" />
        {!collapsed && (
          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-md">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">Mediqzy TPA</h1>
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Third Party Admin</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="w-9 h-9 mx-auto bg-gradient-to-br from-purple-600 to-indigo-600 rounded-lg flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {menuGroups.map((group) => {
          // For main group, render items directly without collapsible header
          if (group.id === 'main') {
            return (
              <div key={group.id} className="space-y-1">
                {group.items.map((item) => (
                  <NavItem key={item.path} item={item} />
                ))}
              </div>
            );
          }

          // For other groups, render collapsible sections
          const GroupIcon = group.icon!;
          const isExpanded = expandedGroups[group.id];
          const hasActiveItem = group.items.some(item => location.pathname === item.path);

          return (
            <div key={group.id}>
              {!collapsed && (
                <>
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors mb-2",
                      hasActiveItem
                        ? `${group.color} bg-gradient-to-r from-slate-100 to-slate-50`
                        : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    <GroupIcon className="w-4 h-4" />
                    <span className="flex-1 text-left">{group.label}</span>
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="space-y-1 ml-2 pl-3 border-l border-slate-200">
                      {group.items.map((item) => (
                        <NavItem key={item.path} item={item} />
                      ))}
                    </div>
                  )}
                </>
              )}
              
              {collapsed && (
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <NavItem key={item.path} item={item} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
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

export default TPASidebar;
