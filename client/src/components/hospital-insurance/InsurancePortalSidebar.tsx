import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
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
  BedDouble,
  LogOut as DischargeSvg,
  MessageSquare,
  Mail,
  XCircle,
  IndianRupee,
  Building,
  FileBarChart2,
  Activity,
  Landmark,
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
  const { slug } = useParams<{ slug: string }>();
  const base = `/hospital/${slug || localStorage.getItem('hospitalInsuranceSlug') || 'hospital'}/insurance`;
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
    localStorage.removeItem('hospitalInsuranceSlug');
    localStorage.removeItem('token');
    localStorage.removeItem('userType');
    navigate('/hospital-insurance/login');
  };

  const menuSections: MenuSection[] = [
    {
      title: 'Main',
      defaultOpen: true,
      items: [
        { name: 'Dashboard', href: `${base}/dashboard`, icon: LayoutDashboard },
      ],
    },
    {
      title: 'Claims Management',
      defaultOpen: true,
      items: [
        { name: 'Claims Queue', href: `${base}/claims`, icon: FileText },
        { name: 'Claim Drafts', href: `${base}/claims?status=claim_draft`, icon: ClipboardList },
        { name: 'Bulk Upload', href: `${base}/bulk-upload`, icon: Upload },
        { name: 'Search Claims', href: `${base}/search`, icon: Search },
      ],
    },
    {
      title: 'Pre-Authorization',
      defaultOpen: true,
      items: [
        { name: 'New Pre-Auth', href: `${base}/pre-auth/new`, icon: Shield },
        { name: 'Pending', href: `${base}/pre-auth?status=pending`, icon: Clock },
        { name: 'Approved', href: `${base}/pre-auth?status=approved`, icon: FileText },
        { name: 'Rejected', href: `${base}/pre-auth?status=rejected`, icon: AlertTriangle },
      ],
    },
    {
      title: 'Tasks & Escalations',
      items: [
        { name: 'Task Inbox', href: `${base}/tasks`, icon: ClipboardList },
        { name: 'SLA Escalations', href: `${base}/tasks?tab=escalations`, icon: AlertTriangle },
        { name: 'Denials Manager', href: `${base}/denials`, icon: XCircle },
      ],
    },
    {
      title: 'Patient Flow',
      items: [
        { name: 'Admissions', href: `${base}/admission`, icon: BedDouble },
        { name: 'Discharge', href: `${base}/discharge`, icon: DischargeSvg },
      ],
    },
    {
      title: 'Communication',
      items: [
        { name: 'Email Inbox', href: `${base}/email-inbox`, icon: Mail },
        { name: 'TPA Messages', href: `${base}/messages`, icon: MessageSquare },
        { name: 'Notifications', href: `${base}/notifications`, icon: Bell },
      ],
    },
    {
      title: 'Documents',
      items: [
        { name: 'Document Center', href: `${base}/documents`, icon: Upload },
        { name: 'Accreditation', href: `${base}/documents?tab=accreditation`, icon: FileText },
        { name: 'Courier Tracking', href: `${base}/courier`, icon: Truck },
      ],
    },
    {
      title: 'Reconciliation',
      items: [
        { name: 'Reconciliation', href: `${base}/reconciliation`, icon: Receipt },
        { name: 'TAT Reports', href: `${base}/reconciliation?tab=tat`, icon: Clock },
        { name: 'Settlement Status', href: `${base}/reconciliation?tab=settlement`, icon: CreditCard },
      ],
    },
    {
      title: 'Reports & Analytics',
      items: [
        { name: 'Analytics', href: `${base}/analytics`, icon: BarChart3 },
        { name: 'MIS Reports', href: `${base}/reports`, icon: FileBarChart2 },
        { name: 'SLA Dashboard', href: `${base}/sla`, icon: Activity },
      ],
    },
    {
      title: 'Payer Management',
      items: [
        { name: 'Payer Setup', href: `${base}/payer-management`, icon: Building2 },
        { name: 'Payer Emails', href: `${base}/payer-management?tab=emails`, icon: Users },
        { name: 'Announcements', href: `${base}/payer-management?tab=announcements`, icon: Bell },
      ],
    },
    {
      title: 'Hospital Profile',
      items: [
        { name: 'Hospital Details', href: `${base}/hospital-profile`, icon: Building2 },
        { name: 'Infrastructure', href: `${base}/hospital-profile?tab=infrastructure`, icon: Bed },
        { name: 'User Accounts', href: `${base}/hospital-profile?tab=users`, icon: Users },
      ],
    },
    {
      title: 'Inventory',
      items: [
        { name: 'Doctors', href: `${base}/inventory?tab=doctors`, icon: Stethoscope },
        { name: 'Health Packages', href: `${base}/inventory?tab=packages`, icon: Heart },
        { name: 'Lab Tests', href: `${base}/inventory?tab=lab-tests`, icon: FlaskConical },
        { name: 'IP Packages', href: `${base}/inventory?tab=ip-packages`, icon: Bed },
        { name: 'Day Care', href: `${base}/inventory?tab=day-care`, icon: Package },
      ],
    },
    {
      title: 'Compliance',
      items: [
        { name: 'NHCX Onboarding', href: `${base}/nhcx`, icon: Globe },
        { name: 'ABDM / ABHA', href: `${base}/abdm`, icon: Heart },
        { name: 'Tariff Management', href: `${base}/tariff`, icon: IndianRupee },
        { name: 'MOU & Empanelment', href: `${base}/empanelment`, icon: Building },
        { name: 'Govt Schemes', href: `${base}/govt-schemes`, icon: Landmark },
      ],
    },
    {
      title: 'Schedule',
      items: [
        { name: 'Calendar', href: `${base}/calendar`, icon: CalendarDays },
      ],
    },
    {
      title: 'System',
      items: [
        { name: 'Settings', href: `${base}/settings`, icon: Settings },
      ],
    },
  ];

  const isActive = (href: string) => {
    const path = location.pathname + location.search;
    return path === href || location.pathname === href;
  };

  return (
    <div
      className="flex flex-col h-screen w-[240px] flex-shrink-0 relative overflow-hidden"
      style={{ background: 'linear-gradient(175deg, #080d1e 0%, #0b1128 55%, #080c1c 100%)' }}
    >
      {/* Ambient glow orb */}
      <div className="absolute top-24 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)' }} />
      <div className="absolute bottom-32 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)' }} />

      {/* Logo */}
      <div className="relative z-10 px-4 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-3">
          <div className="relative flex-shrink-0">
            <div className="absolute inset-0 rounded-xl blur-md" style={{ background: 'rgba(99,102,241,0.4)' }} />
            <div className="relative rounded-xl p-2 shadow-lg shadow-indigo-500/30 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}>
              <Shield className="h-5 w-5 text-white" />
            </div>
          </div>
          <div className="min-w-0">
            <div className="font-bold text-white text-[14px] leading-tight tracking-tight">Insurance Portal</div>
            <div className="text-[10px] font-medium leading-tight mt-0.5" style={{ color: 'rgba(165,180,252,0.6)' }}>Claims Management</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex-1 overflow-y-auto py-2 px-2.5" style={{ scrollbarWidth: 'none' }}>
        {menuSections.map((section) => {
          const isCollapsed = collapsedSections.has(section.title);
          return (
            <div key={section.title} className="mb-0.5">
              <button
                onClick={() => toggleSection(section.title)}
                className="flex items-center justify-between w-full px-2 py-1.5 rounded-md transition-colors group"
                style={{ color: 'rgba(148,163,184,0.5)' }}
              >
                <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] group-hover:text-indigo-400/80 transition-colors">
                  {section.title}
                </span>
                {isCollapsed
                  ? <ChevronRight className="h-2.5 w-2.5 opacity-50 group-hover:opacity-80 transition-opacity" />
                  : <ChevronDown className="h-2.5 w-2.5 opacity-50 group-hover:opacity-80 transition-opacity" />
                }
              </button>

              {!isCollapsed && (
                <ul className="space-y-[1px] mb-1">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <li key={item.name}>
                        <Link
                          to={item.href}
                          className={cn(
                            'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition-all duration-150 text-[12.5px] font-medium group/item',
                            active
                              ? 'text-white shadow-md'
                              : 'hover:text-slate-100'
                          )}
                          style={active ? {
                            background: 'linear-gradient(90deg, rgba(99,102,241,0.85) 0%, rgba(139,92,246,0.85) 100%)',
                            boxShadow: '0 2px 12px rgba(99,102,241,0.3)',
                          } : {
                            color: 'rgba(148,163,184,0.75)',
                          }}
                          onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
                          onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                        >
                          <Icon className={cn('h-3.5 w-3.5 flex-shrink-0 transition-colors', active ? 'text-white' : 'text-indigo-400/50 group-hover/item:text-indigo-300/70')} />
                          <span className="truncate leading-none">{item.name}</span>
                          {item.badge != null && item.badge > 0 && (
                            <span className={cn('ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center leading-none', active ? 'bg-white/20 text-white' : 'bg-red-500 text-white')}>
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

      {/* Bottom actions */}
      <div className="relative z-10 px-2.5 pb-3 pt-2 flex-shrink-0 space-y-0.5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[12.5px] font-medium transition-all duration-150 group/logout"
          style={{ color: 'rgba(148,163,184,0.6)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)'; (e.currentTarget as HTMLElement).style.color = 'rgba(252,165,165,0.9)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'rgba(148,163,184,0.6)'; }}
        >
          <LogOut className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
};

export default InsurancePortalSidebar;
