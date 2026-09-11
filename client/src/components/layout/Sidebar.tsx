import React, { useRef, useState, useEffect } from 'react';
import { Link, useLocation } from "react-router-dom";
import { BRAND } from "@/config/brand";
import {
  Activity, Stethoscope, HeartPulse, Home, MessageSquare, Pill, Bot,
  Menu, X, Award, AlertCircle, Youtube, FileSearch, Apple, Users,
  Calendar, Building2, Building, FlaskConical, Heart, BarChart3,
  Settings, UserCircle, Shield, Database, FileText, Wallet, CreditCard,
  ShieldCheck, Crown, Bell, CalendarCheck, FileHeart, FlaskRound,
  FileStack, BookHeart, Watch, Gift, CalendarDays, UserPlus,
  ClipboardList, Receipt, Brain, Ticket, Sparkles, Briefcase,
  HelpCircle, Phone, Mail, LayoutTemplate, ChevronDown, ChevronRight,
  Zap, UsersRound, Target, Instagram,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface SidebarItem {
  icon: React.ComponentType<any>;
  label: string;
  path: string;
  adminOnly?: boolean;
  permission?: string | string[];
}

interface SidebarSection {
  id: string;
  icon: React.ComponentType<any>;
  label: string;
  items: SidebarItem[];
  adminOnly?: boolean;
}

/* ─── Patient sections (7 top-level) ─────────────────────────────────────── */
const patientSections: SidebarSection[] = [
  {
    id: "health",
    icon: HeartPulse,
    label: "My Health",
    items: [
      { icon: HeartPulse,   label: "Health Dashboard",   path: "/health-dashboard" },
      { icon: Brain,        label: "My Health Score",     path: "/health-intelligence" },
      { icon: ShieldCheck,  label: "Risk Check",          path: "/health-risk-assessment" },
      { icon: BookHeart,    label: "Health Diary",        path: "/health-diary" },
      { icon: Activity,     label: "My Vitals",           path: "/patient/vital-reports" },
      { icon: Watch,        label: "My Wearables",        path: "/patient/watch-analytics" },
      { icon: Target,       label: "My Programs",          path: "/my-programs" },
      { icon: Apple,        label: "Diet Plans",          path: "/diet" },
      { icon: Youtube,      label: "Health Tips",         path: "/health-feed" },
      { icon: Gift,         label: "Rewards & Streaks",   path: "/wellness-rewards" },
      { icon: CalendarDays, label: "Wellness Calendar",   path: "/wellness-calendar" },
      { icon: Shield,       label: "SIB Control",         path: "/sib-control", adminOnly: true },
    ],
  },
  {
    id: "care",
    icon: CalendarCheck,
    label: "Care",
    items: [
      { icon: CalendarCheck, label: "My Appointments",      path: "/appointments" },
      { icon: Users,         label: "Find a Doctor",         path: "/doctors" },
      { icon: Bot,           label: "AI Doctor (iSHA)",      path: "/ai-doctor" },
      { icon: Stethoscope,   label: "Find the Right Doctor", path: "/smart-opd" },
      { icon: FileHeart,     label: "My Prescriptions",      path: "/my-prescriptions" },
      { icon: FlaskRound,    label: "Lab Tests",             path: "/patient/lab-tests" },
      { icon: FileSearch,    label: "Scan a Report",         path: "/report-scanner" },
      { icon: FileStack,     label: "My Reports",            path: "/patient/my-reports" },
      { icon: AlertCircle,   label: "Emergency",             path: "/emergency" },
    ],
  },
  {
    id: "pharmacy",
    icon: Pill,
    label: "Pharmacy",
    items: [
      { icon: Pill, label: "Order Medicines", path: "/patient/pharmacy" },
    ],
  },
  {
    id: "insurance",
    icon: ShieldCheck,
    label: "Insurance & Benefits",
    items: [
      { icon: ShieldCheck, label: "My Insurance",     path: "/my-insurance" },
      { icon: Zap,         label: "File a Claim",     path: "/claims-express" },
      { icon: FileText,    label: "Claims",           path: "/claims-management" },
      { icon: Sparkles,    label: "My Benefits",      path: "/benefits" },
      { icon: Award,       label: "Ayushman",         path: "/ayushman" },
    ],
  },
  {
    id: "family",
    icon: UsersRound,
    label: "Family",
    items: [
      { icon: UsersRound, label: "Family Health Hub", path: "/family-hub" },
    ],
  },
  {
    id: "wallet",
    icon: Wallet,
    label: "Wallet & Plans",
    items: [
      { icon: Wallet,      label: "Health Coins",      path: "/wallet" },
      { icon: Crown,       label: "My Plan",           path: "/my-plans" },
      { icon: CreditCard,  label: "Membership Card",   path: "/membership-card" },
      { icon: FileStack,   label: "Order History",     path: "/billing/orders" },
      { icon: Receipt,     label: "My Invoices",       path: "/billing/invoices" },
    ],
  },
];

/* These always appear at the footer of the patient sidebar (no collapse) */
const patientFooterItems: SidebarItem[] = [
  { icon: Bell,       label: "Notifications", path: "/patient/notifications" },
  { icon: HelpCircle, label: "Help & Support", path: "/help" },
  { icon: Phone,      label: "Contact Us",    path: "/contact-us" },
];

/* ─── Team / Nurse / Assistant items (unchanged) ─────────────────────────── */
const teamSidebarItems: SidebarItem[] = [
  { icon: Home,        label: "Dashboard",               path: "/team/dashboard" },
  { icon: Bot,         label: "Admin Copilot",           path: "/team/copilot" },
  { icon: Users,       label: "Team Directory",          path: "/team/directory",               permission: "User Management" },
  { icon: BarChart3,   label: "Reports",                 path: "/team/reports",                 permission: ["Patient Reports","Analytics Access","Reports Access"] },
  { icon: Activity,    label: "System Tools",            path: "/team/tools",                   adminOnly: true },
  { icon: Users,       label: "Team Members",            path: "/team/user-management",         permission: "User Management" },
  { icon: Stethoscope, label: "Doctors",                 path: "/team/doctor-management",       permission: "Doctor Management" },
  { icon: Building2,   label: "Corporate Management",    path: "/team/corporate-management",    permission: "Corporate Management" },
  { icon: Users,       label: "Corporate Employees",     path: "/team/corporate-employees",     permission: "Corporate Management" },
  { icon: Database,    label: "Provider Network",        path: "/team/provider-network",        permission: "Corporate Management" },
  { icon: Briefcase,   label: "Broker Management",       path: "/team/broker-management",       permission: "Broker Management" },
  { icon: FlaskConical,label: "Corporate Health Booking",path: "/team/corporate-health-booking",permission: "Corporate Management" },
  { icon: Crown,       label: "User Plan Customization", path: "/team/user-plan-customization", permission: "Corporate Management" },
  { icon: Building2,   label: "Hospital Management",     path: "/team/hospital-management",     permission: "Hospital Management" },
  { icon: Building,    label: "Clinic Management",       path: "/team/clinic-management",       permission: "Clinic Management" },
  { icon: FlaskConical,label: "Lab Management",          path: "/team/lab-management",          permission: "Lab Management" },
  { icon: Calendar,    label: "Appointments",            path: "/team/appointments",            permission: "Appointment Management" },
  { icon: MessageSquare,label:"Chat Dashboard",          path: "/team/chat",                    permission: "Chat Dashboard Access" },
  { icon: Ticket,      label: "Support Tickets",         path: "/team/support-tickets",         permission: "Support Tickets" },
  { icon: Mail,        label: "Email Inbox",             path: "/team/email-inbox" },
  { icon: LayoutTemplate,label:"Welcome Emails",         path: "/team/settings?tab=email-templates", adminOnly: true },
  { icon: MessageSquare,label:"WhatsApp Inbox",          path: "/team/whatsapp-inbox",          permission: "Chat Dashboard Access" },
  { icon: Instagram,   label: "Social Inbox",            path: "/team/social-inbox",            permission: "Chat Dashboard Access" },
  { icon: MessageSquare,label:"RC Omnichannel",          path: "/team/rc-omnichannel",          permission: "Chat Dashboard Access" },
  { icon: Pill,        label: "Pharmacies",              path: "/team/pharmacy-management",     permission: "Pharmacy Management" },
  { icon: Heart,       label: "Health Plans",            path: "/team/health-plans",            permission: "Health Plans Access" },
  { icon: ShieldCheck, label: "Plan Governance",         path: "/team/plan-governance",         permission: ["Audit Access","Audit Logs"] },
  { icon: Database,    label: "Activity Logs",           path: "/team/activity",                permission: ["Audit Access","Audit Logs"] },
  { icon: Settings,    label: "Settings",                path: "/team/settings",                adminOnly: true },
];

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const readStoredTeamUser = () => {
  try { return JSON.parse(localStorage.getItem('teamUserData') || 'null'); } catch { return null; }
};

const hasSidebarPermission = (user: any, required?: string | string[]) => {
  if (!required) return true;
  const permissions: string[] = Array.isArray(user?.permissions) ? user.permissions : [];
  const needed = Array.isArray(required) ? required : [required];
  return needed.some(r => permissions.some(p =>
    p.toLowerCase().includes(r.toLowerCase()) || r.toLowerCase().includes(p.toLowerCase())
  ));
};

const isTeamAdmin = (user: any) => (
  user?.isAdmin === true ||
  ['admin','super admin','super_admin'].includes(String(user?.role || '').toLowerCase())
);

/* ─── NavLink helper ──────────────────────────────────────────────────────── */
function NavLink({ item, active, onClick }: { item: SidebarItem; active: boolean; onClick?: () => void }) {
  return (
    <Link
      to={item.path}
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150",
        active
          ? "bg-gradient-to-r from-teal-500/20 to-teal-600/10 text-teal-400 border border-teal-500/30 shadow-sm"
          : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
      )}
    >
      <item.icon className={cn("h-4 w-4 shrink-0 transition-colors",
        active ? "text-teal-400" : "text-slate-500 group-hover:text-teal-400"
      )} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/* ─── Collapsible section ─────────────────────────────────────────────────── */
function SidebarAccordion({
  section,
  currentPath,
  onNavClick,
  isAdmin,
}: {
  section: SidebarSection;
  currentPath: string;
  onNavClick: () => void;
  isAdmin: boolean;
}) {
  const visibleItems = section.items.filter(i => !i.adminOnly || isAdmin);
  const hasActive = visibleItems.some(i => currentPath === i.path || currentPath.startsWith(i.path + '/'));
  const [open, setOpen] = useState(hasActive);

  // Auto-open when navigating into this section
  useEffect(() => { if (hasActive) setOpen(true); }, [hasActive]);

  if (visibleItems.length === 0) return null;

  // Single-item sections: render directly without accordion chrome
  if (visibleItems.length === 1) {
    return <NavLink item={visibleItems[0]} active={currentPath === visibleItems[0].path} onClick={onNavClick} />;
  }

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-150",
          hasActive ? "text-teal-400" : "text-slate-300 hover:text-white hover:bg-slate-800/40"
        )}
        aria-expanded={open}
      >
        <section.icon className={cn("h-4 w-4 shrink-0", hasActive ? "text-teal-400" : "text-slate-500")} />
        <span className="flex-1 text-left truncate">{section.label}</span>
        {open
          ? <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          : <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
        }
      </button>
      {open && (
        <div className="ml-3 pl-3 border-l border-slate-700/50 mt-0.5 space-y-0.5">
          {visibleItems.map(item => (
            <NavLink
              key={item.path}
              item={item}
              active={currentPath === item.path}
              onClick={onNavClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main Sidebar ────────────────────────────────────────────────────────── */
export function Sidebar() {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isTeamUser, setIsTeamUser] = useState(false);
  const [isNurseUser, setIsNurseUser] = useState(false);
  const [isAssistantUser, setIsAssistantUser] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const teamToken   = localStorage.getItem('teamToken');
    const nurseToken  = localStorage.getItem('nurseToken');
    const assistantToken = localStorage.getItem('assistantToken');
    const userToken   = localStorage.getItem('token');

    let userIsAdmin = false;
    if (userToken) {
      try {
        const payload = JSON.parse(atob(userToken.split('.')[1]));
        userIsAdmin = payload.role === 'admin' || payload.isAdmin === true;
      } catch {}
    }
    setIsAdmin(userIsAdmin);
    setIsTeamUser(!!teamToken && location.pathname.startsWith('/team'));
    setIsNurseUser(!!nurseToken && location.pathname.startsWith('/nurse'));
    setIsAssistantUser(!!assistantToken && location.pathname.startsWith('/assistant'));
  }, [location.pathname]);

  useEffect(() => {
    const update = () => {
      const desktop = window.innerWidth >= 768;
      setIsDesktop(desktop);
      setIsOpen(desktop);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Preserve sidebar scroll on route change
  useEffect(() => {
    const vp = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (vp) {
      const saved = sessionStorage.getItem('sidebarScrollTop');
      if (saved) vp.scrollTop = parseInt(saved, 10);
    }
  }, [location.pathname]);

  const handleNavClick = () => {
    const vp = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (vp) sessionStorage.setItem('sidebarScrollTop', vp.scrollTop.toString());
    if (window.innerWidth < 768) setIsOpen(false);
  };

  /* ── Nurse sidebar ── */
  const nurseSidebarItems: SidebarItem[] = [
    { icon: Home,        label: 'Dashboard',        path: '/nurse/dashboard' },
    { icon: Users,       label: 'Patients',         path: '/nurse/patients' },
    { icon: Activity,    label: 'Record Vitals',    path: '/nurse/vitals' },
    { icon: Pill,        label: 'Medications',      path: '/nurse/medications' },
    { icon: FileText,    label: 'Notes',            path: '/nurse/notes' },
    { icon: Calendar,    label: 'Appointments',     path: '/nurse/appointments' },
    { icon: MessageSquare, label: 'Messages',       path: '/nurse/chat' },
    { icon: UserCircle,  label: 'Register Patient', path: '/nurse/register-patient' },
  ];

  /* ── Assistant sidebar ── */
  const assistantSidebarItems: SidebarItem[] = [
    { icon: Home,          label: 'Dashboard',        path: '/assistant/dashboard' },
    { icon: Users,         label: 'My Patients',      path: '/assistant/patients' },
    { icon: UserPlus,      label: 'Register Patient', path: '/assistant/register-patient' },
    { icon: Calendar,      label: 'Appointments',     path: '/assistant/appointments' },
    { icon: FileText,      label: 'Prescriptions',    path: '/assistant/prescriptions' },
    { icon: Receipt,       label: 'Billing',          path: '/assistant/billing' },
    { icon: MessageSquare, label: 'Messages',         path: '/assistant/messages' },
    { icon: ClipboardList, label: 'Orders & Tasks',   path: '/assistant/orders' },
    { icon: BarChart3,     label: 'Reports',          path: '/assistant/reports' },
    { icon: UserCircle,    label: 'Profile',          path: '/assistant/profile' },
  ];

  /* ── Render team/nurse/assistant items (flat list, categorised) ── */
  const renderFlatItems = (items: SidebarItem[], sections?: { label: string; category?: string }[]) => {
    const teamUser = readStoredTeamUser();
    const teamAdmin = isTeamAdmin(teamUser);
    const visible = items.filter(i =>
      i.adminOnly ? (isTeamUser ? teamAdmin : isAdmin) : (isTeamUser ? hasSidebarPermission(teamUser, i.permission) : true)
    );

    if (!sections) {
      return visible.map(item => (
        <NavLink key={item.path} item={item} active={location.pathname === item.path} onClick={handleNavClick} />
      ));
    }

    // Group by category for team sidebar
    const grouped: Record<string, SidebarItem[]> = {};
    const topItems: SidebarItem[] = [];
    visible.forEach(item => {
      if ((item as any).category) {
        const cat = (item as any).category as string;
        grouped[cat] = [...(grouped[cat] || []), item];
      } else {
        topItems.push(item);
      }
    });

    return (
      <>
        {topItems.map(item => (
          <NavLink key={item.path} item={item} active={location.pathname === item.path} onClick={handleNavClick} />
        ))}
        {Object.entries(grouped).map(([cat, catItems]) => (
          <div key={cat}>
            <div className="px-3 py-2 mt-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{cat}</p>
            </div>
            {catItems.map(item => (
              <NavLink key={item.path} item={item} active={location.pathname === item.path} onClick={handleNavClick} />
            ))}
          </div>
        ))}
      </>
    );
  };

  return (
    <>
      {/* Mobile toggle */}
      <button
        id="sidebar-toggle"
        onClick={() => setIsOpen(o => !o)}
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
        role="navigation"
        aria-label="Main navigation"
        className={cn(
          "fixed inset-y-0 left-0 flex flex-col w-64 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 transform transition-transform duration-300 ease-in-out z-40 shadow-xl",
          (isDesktop || isOpen) ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Close (mobile) */}
        <button
          onClick={() => setIsOpen(false)}
          className="absolute top-4 right-4 p-1 rounded-md text-slate-400 hover:text-white md:hidden"
          aria-label="Close navigation menu"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Logo */}
        <div className="flex items-center border-b border-slate-700/50 px-5 py-4 shrink-0">
          <img src={BRAND.logo} alt={`${BRAND.name} logo`} style={{ height: 38, width: 38, marginRight: 12, borderRadius: 8 }} />
          <span className="text-lg font-bold text-white tracking-tight">{BRAND.name}</span>
        </div>

        {/* ── Home link (always visible, not collapsible) ── */}
        {!isTeamUser && !isNurseUser && !isAssistantUser && (
          <div className="px-3 pt-3 pb-1 shrink-0">
            <Link
              to="/"
              onClick={handleNavClick}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-150",
                location.pathname === "/"
                  ? "bg-gradient-to-r from-teal-500/20 to-teal-600/10 text-teal-400 border border-teal-500/30 shadow-sm"
                  : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
              )}
            >
              <Home className={cn("h-4 w-4 shrink-0", location.pathname === "/" ? "text-teal-400" : "text-slate-500 group-hover:text-teal-400")} />
              <span>Home</span>
            </Link>
            <Link
              to="/profile"
              onClick={handleNavClick}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150 mt-0.5",
                location.pathname === "/profile"
                  ? "bg-gradient-to-r from-teal-500/20 to-teal-600/10 text-teal-400 border border-teal-500/30 shadow-sm"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
              )}
            >
              <UserCircle className={cn("h-4 w-4 shrink-0", location.pathname === "/profile" ? "text-teal-400" : "text-slate-500 group-hover:text-teal-400")} />
              <span>My Profile</span>
            </Link>
          </div>
        )}

        {/* Links */}
        <ScrollArea ref={scrollAreaRef} className="flex-1 px-3 py-2">
          <div className="space-y-0.5">

            {/* Team portal header */}
            {(isTeamUser || isNurseUser || isAssistantUser) && (
              <div className="px-3 py-2 mb-1">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {isTeamUser ? 'Team Dashboard' : isNurseUser ? 'Nurse Portal' : 'Assistant Portal'}
                </p>
              </div>
            )}

            {/* Patient: 7 collapsible sections */}
            {!isTeamUser && !isNurseUser && !isAssistantUser && (
              <>
                {patientSections.map(section => (
                  <SidebarAccordion
                    key={section.id}
                    section={section}
                    currentPath={location.pathname}
                    onNavClick={handleNavClick}
                    isAdmin={isAdmin}
                  />
                ))}
                <div className="pt-3 border-t border-slate-700/30 mt-3 space-y-0.5">
                  {patientFooterItems.map(item => (
                    <NavLink key={item.path} item={item} active={location.pathname === item.path} onClick={handleNavClick} />
                  ))}
                </div>
              </>
            )}

            {/* Nurse */}
            {isNurseUser && renderFlatItems(nurseSidebarItems)}

            {/* Assistant */}
            {isAssistantUser && renderFlatItems(assistantSidebarItems)}

            {/* Team */}
            {isTeamUser && renderFlatItems(
              teamSidebarItems.map(i => ({ ...i })),
              [{ label: "Management" }, { label: "Operations" }, { label: "Support" }]
            )}
          </div>
        </ScrollArea>

        {/* Chat CTA (patient only) */}
        {!isTeamUser && !isNurseUser && !isAssistantUser && (
          <div className="border-t border-slate-700/50 p-4 shrink-0">
            <Button asChild className="w-full bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-lg shadow-teal-500/20 border-0">
              <Link to="/chat" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Chat with Doctor
              </Link>
            </Button>
          </div>
        )}
      </div>

      {/* Mobile overlay */}
      {isOpen && !isDesktop && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  );
}
