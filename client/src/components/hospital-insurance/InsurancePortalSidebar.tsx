import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  Shield,
  LayoutDashboard,
  FileText,
  ClipboardList,
  Clock,
  AlertTriangle,
  Gavel,
  Upload,
  Search,
  BarChart3,
  Building2,
  Users,
  CreditCard,
  Receipt,
  CalendarDays,
  Package,
  Bell,
  Truck,
  Heart,
  Stethoscope,
  FlaskConical,
  Bed,
  Globe,
  Settings,
  LogOut,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useState } from 'react';

interface MenuItem {
  name: string;
  href: string;
  icon: any;
  badge?: number;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
  defaultOpen?: boolean;
}

const InsurancePortalSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const toggleSection = (title: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('hospitalInsuranceToken');
    localStorage.removeItem('hospitalInsuranceData');
    localStorage.removeItem('token');
    localStorage.removeItem('userType');
    navigate('/hospital-insurance/login');
  };

  const menuSections: MenuSection[] = [
    {
      title: 'Main',
      defaultOpen: true,
      items: [
        { name: 'Dashboard', href: '/hospital-insurance/dashboard', icon: LayoutDashboard },
        { name: 'Notifications', href: '/hospital-insurance/notifications', icon: Bell },
      ],
    },
    {
      title: 'Claims Management',
      defaultOpen: true,
      items: [
        { name: 'Claims Queue', href: '/hospital-insurance/claims', icon: FileText },
        { name: 'Claim Drafts', href: '/hospital-insurance/claims?tab=drafts', icon: ClipboardList },
        { name: 'Bulk Upload', href: '/hospital-insurance/bulk-upload', icon: Upload },
        { name: 'Search Claims', href: '/hospital-insurance/search', icon: Search },
      ],
    },
    {
      title: 'Pre-Authorization',
      defaultOpen: true,
      items: [
        { name: 'New Pre-Auth', href: '/hospital-insurance/pre-auth/new', icon: Shield },
        { name: 'Pending', href: '/hospital-insurance/pre-auth?status=pending', icon: Clock },
        { name: 'Approved', href: '/hospital-insurance/pre-auth?status=approved', icon: FileText },
        { name: 'Rejected', href: '/hospital-insurance/pre-auth?status=rejected', icon: AlertTriangle },
      ],
    },
    {
      title: 'Tasks & Escalations',
      items: [
        { name: 'Task Inbox', href: '/hospital-insurance/tasks', icon: ClipboardList },
        { name: 'SLA Escalations', href: '/hospital-insurance/tasks?tab=escalations', icon: AlertTriangle },
        { name: 'Denials & Appeals', href: '/hospital-insurance/tasks?tab=appeals', icon: Gavel },
      ],
    },
    {
      title: 'Documents',
      items: [
        { name: 'Document Center', href: '/hospital-insurance/documents', icon: Upload },
        { name: 'Accreditation', href: '/hospital-insurance/documents?tab=accreditation', icon: FileText },
        { name: 'Courier Tracking', href: '/hospital-insurance/courier', icon: Truck },
      ],
    },
    {
      title: 'Reconciliation',
      items: [
        { name: 'Reconciliation', href: '/hospital-insurance/reconciliation', icon: Receipt },
        { name: 'TAT Reports', href: '/hospital-insurance/reconciliation?tab=tat', icon: Clock },
        { name: 'Settlement Status', href: '/hospital-insurance/reconciliation?tab=settlement', icon: CreditCard },
      ],
    },
    {
      title: 'Reports & Analytics',
      items: [
        { name: 'Analytics', href: '/hospital-insurance/analytics', icon: BarChart3 },
        { name: 'Quick Reports', href: '/hospital-insurance/analytics?tab=reports', icon: FileText },
      ],
    },
    {
      title: 'Payer Management',
      items: [
        { name: 'Payer Setup', href: '/hospital-insurance/payer-management', icon: Building2 },
        { name: 'Payer Emails', href: '/hospital-insurance/payer-management?tab=emails', icon: Users },
        { name: 'Announcements', href: '/hospital-insurance/payer-management?tab=announcements', icon: Bell },
      ],
    },
    {
      title: 'Hospital Profile',
      items: [
        { name: 'Hospital Details', href: '/hospital-insurance/hospital-profile', icon: Building2 },
        { name: 'Infrastructure', href: '/hospital-insurance/hospital-profile?tab=infrastructure', icon: Bed },
        { name: 'User Accounts', href: '/hospital-insurance/hospital-profile?tab=users', icon: Users },
      ],
    },
    {
      title: 'Inventory',
      items: [
        { name: 'Doctors', href: '/hospital-insurance/inventory?tab=doctors', icon: Stethoscope },
        { name: 'Health Packages', href: '/hospital-insurance/inventory?tab=packages', icon: Heart },
        { name: 'Lab Tests', href: '/hospital-insurance/inventory?tab=lab-tests', icon: FlaskConical },
        { name: 'IP Packages', href: '/hospital-insurance/inventory?tab=ip-packages', icon: Bed },
        { name: 'Day Care', href: '/hospital-insurance/inventory?tab=day-care', icon: Package },
      ],
    },
    {
      title: 'Compliance',
      items: [
        { name: 'NHCX Onboarding', href: '/hospital-insurance/nhcx', icon: Globe },
        { name: 'ABDM / ABHA', href: '/hospital-insurance/abdm', icon: Heart },
      ],
    },
    {
      title: 'Schedule',
      items: [
        { name: 'Calendar', href: '/hospital-insurance/calendar', icon: CalendarDays },
      ],
    },
    {
      title: 'System',
      items: [
        { name: 'Settings', href: '/hospital-insurance/settings', icon: Settings },
      ],
    },
  ];

  const isActive = (href: string) => {
    const path = location.pathname + location.search;
    return path === href || location.pathname === href;
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-b from-indigo-900 to-indigo-950 text-white w-64 flex-shrink-0">
      {/* Logo */}
      <div className="p-5 border-b border-indigo-800">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-indigo-400 to-blue-500 p-2 rounded-xl shadow-lg">
            <Shield className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">Insurance</h1>
            <p className="text-indigo-300 text-xs">Claims Management Portal</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {menuSections.map((section) => {
          const isCollapsed = collapsedSections.has(section.title);
          return (
            <div key={section.title} className="mb-2">
              <button
                onClick={() => toggleSection(section.title)}
                className="flex items-center justify-between w-full text-xs font-semibold text-indigo-400 uppercase tracking-wider px-3 py-1.5 hover:text-indigo-200 transition-colors"
              >
                {section.title}
                {isCollapsed ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>
              {!isCollapsed && (
                <ul className="space-y-0.5 mt-0.5">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <li key={item.name}>
                        <Link
                          to={item.href}
                          className={cn(
                            'flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 text-sm',
                            active
                              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                              : 'text-indigo-100 hover:bg-indigo-800/50 hover:text-white'
                          )}
                        >
                          <Icon className={cn('h-4 w-4', active ? 'text-white' : 'text-indigo-300')} />
                          <span className="font-medium truncate">{item.name}</span>
                          {item.badge && item.badge > 0 && (
                            <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-indigo-800">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-indigo-100 hover:bg-red-600/20 hover:text-red-300 transition-colors text-sm"
        >
          <LogOut className="h-4 w-4" />
          <span className="font-medium">Logout</span>
        </button>
      </div>
    </div>
  );
};

export default InsurancePortalSidebar;
