import React, { useRef } from 'react';
import { Link, useLocation } from "react-router-dom";
import { BRAND } from "@/config/brand";
import {
  Activity,
  AlignCenterVertical,
  Stethoscope,
  HeartPulse,
  Home,
  MessageSquare,
  Pill,
  Bot,
  Menu,
  X,
  Award,
  AlertCircle,
  Youtube,
  FileSearch,
  Apple,
  Users,
  Calendar,
  Building2,
  Building,
  FlaskConical,
  Heart,
  BarChart3,
  Settings,
  UserCircle,
  Shield,
  Database,
  FileText,
  Wallet,
  CreditCard,
  ShieldCheck,
  Crown,
  Bell,
  CalendarCheck,
  FileHeart,
  FlaskRound,
  FileStack,
  BookHeart,
  Watch,
  Trophy,
  CalendarDays,
  UserPlus,
  ClipboardList,
  Receipt,
  Brain,
  Ticket
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, useEffect } from "react";

interface SidebarItem {
  icon: React.ComponentType<any>;
  label: string;
  path: string;
  category?: string;
  adminOnly?: boolean; // Flag for admin-only items
}

const sidebarItems: SidebarItem[] = [
  // Core Navigation
  { icon: Home, label: "Dashboard", path: "/", category: "Main" },
  { icon: UserCircle, label: "My Profile", path: "/profile", category: "Main" },
  { icon: Bell, label: "Notifications", path: "/patient/notifications", category: "Main" },
  
  // Health Management
  { icon: HeartPulse, label: "Health Dashboard", path: "/health-dashboard", category: "Health" },
  { icon: Brain, label: "Health Intelligence", path: "/health-intelligence", category: "Health" },
  { icon: Shield, label: "SIB Control", path: "/sib-control", category: "Health", adminOnly: true },
  { icon: BookHeart, label: "Health Diary", path: "/health-diary", category: "Health" },
  { icon: ShieldCheck, label: "Health Risk Assessment", path: "/health-risk-assessment", category: "Health" },
  { icon: Trophy, label: "Wellness Challenges", path: "/wellness-challenges", category: "Health" },
  { icon: CalendarDays, label: "Wellness Calendar", path: "/wellness-calendar", category: "Health" },
  { icon: Apple, label: "Diet Plans", path: "/diet", category: "Health" },
  { icon: Bot, label: "AI Doctor", path: "/ai-doctor", category: "Health" },
  
  // Appointments & Consultations
  { icon: CalendarCheck, label: "My Appointments", path: "/appointments", category: "Appointments" },
  { icon: Users, label: "Find & Book Doctor", path: "/doctors", category: "Appointments" },
  { icon: FileHeart, label: "My Prescriptions", path: "/my-prescriptions", category: "Appointments" },
  
  // Medical Records
  { icon: FlaskRound, label: "Lab Tests", path: "/patient/lab-tests", category: "Records" },
  { icon: FileStack, label: "My Reports", path: "/patient/my-reports", category: "Records" },
  { icon: FileSearch, label: "Scan & Share Reports", path: "/reposts", category: "Records" },
  
  // Services & Support
  { icon: Award, label: "Ayushman", path: "/ayushman", category: "Services" },
  { icon: Youtube, label: "Health Feed", path: "/health-feed", category: "Services" },
  { icon: AlertCircle, label: "Emergency", path: "/emergency", category: "Services" },
  
  // Wallet & Plans
  { icon: Wallet, label: "Wallet", path: "/wallet", category: "Finance" },
  { icon: Crown, label: "Membership Plans", path: "/my-plans", category: "Finance" },
  { icon: CreditCard, label: "My Membership Card", path: "/membership-card", category: "Finance" },
  { icon: FileStack, label: "Order History", path: "/billing/orders", category: "Finance" },
  { icon: Receipt, label: "My Invoices", path: "/billing/invoices", category: "Finance" },
];

const teamSidebarItems: SidebarItem[] = [
  { icon: Home, label: "Dashboard", path: "/team/dashboard" },
  { icon: Users, label: "Team Directory", path: "/team/directory" },
  { icon: BarChart3, label: "Reports", path: "/team/reports" },
  { icon: Activity, label: "System Tools", path: "/team/tools" },
  { icon: Users, label: "User Management", path: "/team/user-management", category: "Management" },
  { icon: Stethoscope, label: "Doctors", path: "/team/doctor-management", category: "Management" },
  { icon: Building2, label: "Corporate Management", path: "/team/corporate-management", category: "Management" },
  { icon: FlaskConical, label: "Corporate Health Booking", path: "/team/corporate-health-booking", category: "Management" },
  { icon: Building2, label: "Hospital Management", path: "/team/hospital-management", category: "Management" },
  { icon: Building, label: "Clinic Management", path: "/team/clinic-management", category: "Management" },
  { icon: FlaskConical, label: "Lab Management", path: "/team/lab-management", category: "Management" },
  { icon: Calendar, label: "Appointments", path: "/team/appointments", category: "Operations" },
  { icon: MessageSquare, label: "Chat Dashboard", path: "/admin/chat", category: "Support" },
  { icon: Pill, label: "Pharmacies", path: "/team/pharmacy-management", category: "Management" },
  { icon: Heart, label: "Health Plans", path: "/team/health-plans", category: "Business" },
  { icon: Ticket, label: "Coupons", path: "/admin/coupons", category: "Finance" },
  { icon: Database, label: "Activity Logs", path: "/team/activity", category: "Security" },
  { icon: Settings, label: "Settings", path: "/team/settings", category: "Administration" },
];

export function Sidebar() {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isTeamUser, setIsTeamUser] = useState(false);
  const [isNurseUser, setIsNurseUser] = useState(false);
  const [isAssistantUser, setIsAssistantUser] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Check if user is a team member, nurse, assistant, or admin
  useEffect(() => {
    const teamToken = localStorage.getItem('teamToken');
    const nurseToken = localStorage.getItem('nurseToken');
    const assistantToken = localStorage.getItem('assistantToken');
    const userToken = localStorage.getItem('token');
    
    // Check if user is admin
    let userIsAdmin = false;
    if (userToken) {
      try {
        const payload = JSON.parse(atob(userToken.split('.')[1]));
        userIsAdmin = payload.role === 'admin' || payload.isAdmin === true;
      } catch (e) {
        console.warn('Failed to parse user token:', e);
      }
    }
    setIsAdmin(userIsAdmin);
    
    const isTeamRoute = location.pathname.startsWith('/team') || 
                       (location.pathname.startsWith('/admin') && !!teamToken);
    const isNurseRoute = location.pathname.startsWith('/nurse');
    const isAssistantRoute = location.pathname.startsWith('/assistant');
    setIsTeamUser(!!teamToken && isTeamRoute);
    setIsNurseUser(!!nurseToken && isNurseRoute);
    setIsAssistantUser(!!assistantToken && isAssistantRoute);
  }, [location.pathname]);

  // Track viewport for responsive open/close
  useEffect(() => {
    const updateViewport = () => {
      const desktop = typeof window !== 'undefined' && window.innerWidth >= 768;
      setIsDesktop(desktop);
      setIsOpen(desktop); // default open on desktop, closed on mobile
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  // Preserve sidebar scroll position on route change
  useEffect(() => {
    const scrollViewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (scrollViewport) {
      const savedScrollTop = sessionStorage.getItem('sidebarScrollTop');
      if (savedScrollTop) {
        scrollViewport.scrollTop = parseInt(savedScrollTop, 10);
      }
    }
  }, [location.pathname]);

  // Save scroll position before navigation
  const handleNavClick = () => {
    const scrollViewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (scrollViewport) {
      sessionStorage.setItem('sidebarScrollTop', scrollViewport.scrollTop.toString());
    }
    if (window.innerWidth < 768) {
      toggleSidebar();
    }
  };

  // Function to toggle sidebar
  const toggleSidebar = () => {
    setIsOpen(prev => !prev);
  };

  // Get sidebar items based on user type
  const nurseSidebarItems: SidebarItem[] = [
    { icon: Home, label: 'Dashboard', path: '/nurse/dashboard' },
    { icon: Users, label: 'Patients', path: '/nurse/patients' },
    { icon: Activity, label: 'Record Vitals', path: '/nurse/vitals' },
    { icon: Pill, label: 'Medications', path: '/nurse/medications' },
    { icon: FileText, label: 'Notes', path: '/nurse/notes' },
    { icon: Calendar, label: 'Appointments', path: '/nurse/appointments' },
    { icon: UserCircle, label: 'Register Patient', path: '/nurse/register-patient' },
  ];

  // Assistant Portal Sidebar Items
  const assistantSidebarItems: SidebarItem[] = [
    { icon: Home, label: 'Dashboard', path: '/assistant/dashboard' },
    { icon: Users, label: 'My Patients', path: '/assistant/patients' },
    { icon: UserPlus, label: 'Register Patient', path: '/assistant/register-patient' },
    { icon: Calendar, label: 'Appointments', path: '/assistant/appointments' },
    { icon: FileText, label: 'Prescriptions', path: '/assistant/prescriptions' },
    { icon: Receipt, label: 'Billing', path: '/assistant/billing' },
    { icon: MessageSquare, label: 'Messages', path: '/assistant/messages' },
    { icon: ClipboardList, label: 'Orders & Tasks', path: '/assistant/orders' },
    { icon: BarChart3, label: 'Reports', path: '/assistant/reports' },
    { icon: UserCircle, label: 'Profile', path: '/assistant/profile' },
  ];

  const getSidebarItems = () => {
    if (isTeamUser) return teamSidebarItems;
    if (isNurseUser) return nurseSidebarItems;
    if (isAssistantUser) return assistantSidebarItems;
    
    // Filter out admin-only items for regular users
    return sidebarItems.filter(item => {
      if (item.adminOnly) {
        return isAdmin; // Only show admin items to admin users
      }
      return true; // Show all other items
    });
  };

  const items = getSidebarItems();

  return (
    <>
      {/* Mobile toggle button - outside the sidebar */}
      <button
        id="sidebar-toggle"
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
          "fixed inset-y-0 left-0 flex flex-col w-64 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 transform transition-transform duration-300 ease-in-out z-40 shadow-xl",
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
        <div className="flex items-center gap-3 border-b border-slate-700/50 px-6 py-5">
          <img 
            src={BRAND.logo} 
            alt={BRAND.name} 
            className="h-10 w-auto object-contain"
          />
          <span className="text-xl font-bold text-white tracking-tight">{BRAND.name}</span>
        </div>

        {/* Sidebar Links */}
        <ScrollArea ref={scrollAreaRef} className="flex-1 px-3 py-4">
          <div className="space-y-1">
            {/* Team Section Header */}
            {(isTeamUser || isNurseUser || isAssistantUser) && (
              <div className="px-3 py-2 mb-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {isTeamUser ? 'Team Dashboard' : isNurseUser ? 'Nurse Portal' : 'Assistant Portal'}
                </p>
              </div>
            )}
            
            {/* Regular User Navigation with Categories */}
            {!isTeamUser && !isNurseUser && !isAssistantUser && (
              <>
                {/* Main Section */}
                {items.filter(item => item.category === 'Main').map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      location.pathname === item.path
                        ? "bg-gradient-to-r from-teal-500/20 to-teal-600/10 text-teal-400 border border-teal-500/30 shadow-sm"
                        : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
                    )}
                    onClick={handleNavClick}
                  >
                    <item.icon className={cn(
                      "h-4 w-4 transition-colors",
                      location.pathname === item.path ? "text-teal-400" : "text-slate-500 group-hover:text-teal-400"
                    )} />
                    <span>{item.label}</span>
                  </Link>
                ))}

                {/* Health Section */}
                <div className="px-3 py-2 mt-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Health</p>
                </div>
                {items.filter(item => item.category === 'Health').map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      location.pathname === item.path
                        ? "bg-gradient-to-r from-teal-500/20 to-teal-600/10 text-teal-400 border border-teal-500/30 shadow-sm"
                        : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
                    )}
                    onClick={handleNavClick}
                  >
                    <item.icon className={cn(
                      "h-4 w-4 transition-colors",
                      location.pathname === item.path ? "text-teal-400" : "text-slate-500 group-hover:text-teal-400"
                    )} />
                    <span>{item.label}</span>
                  </Link>
                ))}

                {/* Appointments Section */}
                <div className="px-3 py-2 mt-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Appointments</p>
                </div>
                {items.filter(item => item.category === 'Appointments').map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      location.pathname === item.path
                        ? "bg-gradient-to-r from-teal-500/20 to-teal-600/10 text-teal-400 border border-teal-500/30 shadow-sm"
                        : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
                    )}
                    onClick={handleNavClick}
                  >
                    <item.icon className={cn(
                      "h-4 w-4 transition-colors",
                      location.pathname === item.path ? "text-teal-400" : "text-slate-500 group-hover:text-teal-400"
                    )} />
                    <span>{item.label}</span>
                  </Link>
                ))}

                {/* Records Section */}
                <div className="px-3 py-2 mt-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Records</p>
                </div>
                {items.filter(item => item.category === 'Records').map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      location.pathname === item.path
                        ? "bg-gradient-to-r from-teal-500/20 to-teal-600/10 text-teal-400 border border-teal-500/30 shadow-sm"
                        : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
                    )}
                    onClick={handleNavClick}
                  >
                    <item.icon className={cn(
                      "h-4 w-4 transition-colors",
                      location.pathname === item.path ? "text-teal-400" : "text-slate-500 group-hover:text-teal-400"
                    )} />
                    <span>{item.label}</span>
                  </Link>
                ))}

                {/* Services Section */}
                <div className="px-3 py-2 mt-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Services</p>
                </div>
                {items.filter(item => item.category === 'Services').map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      location.pathname === item.path
                        ? "bg-gradient-to-r from-teal-500/20 to-teal-600/10 text-teal-400 border border-teal-500/30 shadow-sm"
                        : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
                    )}
                    onClick={handleNavClick}
                  >
                    <item.icon className={cn(
                      "h-4 w-4 transition-colors",
                      location.pathname === item.path ? "text-teal-400" : "text-slate-500 group-hover:text-teal-400"
                    )} />
                    <span>{item.label}</span>
                  </Link>
                ))}

                {/* Finance Section */}
                <div className="px-3 py-2 mt-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Wallet & Plans</p>
                </div>
                {items.filter(item => item.category === 'Finance').map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      location.pathname === item.path
                        ? "bg-gradient-to-r from-teal-500/20 to-teal-600/10 text-teal-400 border border-teal-500/30 shadow-sm"
                        : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
                    )}
                    onClick={handleNavClick}
                  >
                    <item.icon className={cn(
                      "h-4 w-4 transition-colors",
                      location.pathname === item.path ? "text-teal-400" : "text-slate-500 group-hover:text-teal-400"
                    )} />
                    <span>{item.label}</span>
                  </Link>
                ))}
              </>
            )}
            
            {/* Team/Nurse/Assistant user navigation - items without category */}
            {(isTeamUser || isNurseUser) && items.filter(item => !item.category).map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  location.pathname === item.path
                    ? "bg-gradient-to-r from-teal-500/20 to-teal-600/10 text-teal-400 border border-teal-500/30 shadow-sm"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
                )}
                onClick={handleNavClick}
              >
                <item.icon className={cn(
                  "h-4 w-4 transition-colors",
                  location.pathname === item.path ? "text-teal-400" : "text-slate-500 group-hover:text-teal-400"
                )} />
                <span>{item.label}</span>
              </Link>
            ))}

            {/* Assistant Portal Navigation - render all items */}
            {isAssistantUser && items.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  location.pathname === item.path
                    ? "bg-gradient-to-r from-teal-500/20 to-teal-600/10 text-teal-400 border border-teal-500/30 shadow-sm"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
                )}
                onClick={handleNavClick}
              >
                <item.icon className={cn(
                  "h-4 w-4 transition-colors",
                  location.pathname === item.path ? "text-teal-400" : "text-slate-500 group-hover:text-teal-400"
                )} />
                <span>{item.label}</span>
              </Link>
            ))}

            {/* Module sections for team users */}
            {isTeamUser && (
              <>
                {/* Management Modules */}
                <div className="px-3 py-2 mt-6">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Management
                  </p>
                </div>
                {items.filter(item => item.category === 'Management').map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      location.pathname === item.path
                        ? "bg-gradient-to-r from-teal-500/20 to-teal-600/10 text-teal-400 border border-teal-500/30 shadow-sm"
                        : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
                    )}
                    onClick={handleNavClick}
                  >
                    <item.icon className={cn(
                      "h-4 w-4 transition-colors",
                      location.pathname === item.path ? "text-teal-400" : "text-slate-500 group-hover:text-teal-400"
                    )} />
                    <span>{item.label}</span>
                  </Link>
                ))}

                {/* Operations Modules */}
                <div className="px-3 py-2 mt-6">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Operations
                  </p>
                </div>
                {items.filter(item => item.category === 'Operations' || item.category === 'Support').map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      location.pathname === item.path
                        ? "bg-gradient-to-r from-teal-500/20 to-teal-600/10 text-teal-400 border border-teal-500/30 shadow-sm"
                        : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
                    )}
                    onClick={handleNavClick}
                  >
                    <item.icon className={cn(
                      "h-4 w-4 transition-colors",
                      location.pathname === item.path ? "text-teal-400" : "text-slate-500 group-hover:text-teal-400"
                    )} />
                    <span>{item.label}</span>
                  </Link>
                ))}

                {/* Other Modules */}
                {items.filter(item => item.category && !['Management', 'Operations', 'Support'].includes(item.category)).length > 0 && (
                  <>
                    <div className="px-3 py-2 mt-6">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Other Modules
                      </p>
                    </div>
                    {items.filter(item => item.category && !['Management', 'Operations', 'Support'].includes(item.category)).map((item) => (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={cn(
                          "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                          location.pathname === item.path
                            ? "bg-gradient-to-r from-teal-500/20 to-teal-600/10 text-teal-400 border border-teal-500/30 shadow-sm"
                            : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
                        )}
                        onClick={handleNavClick}
                      >
                        <item.icon className={cn(
                          "h-4 w-4 transition-colors",
                          location.pathname === item.path ? "text-teal-400" : "text-slate-500 group-hover:text-teal-400"
                        )} />
                        <span>{item.label}</span>
                      </Link>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        {/* Chat with Doctor - Hide for team, nurse, and assistant users */}
        {!isTeamUser && !isNurseUser && !isAssistantUser && (
          <div className="border-t border-slate-700/50 p-4">
            <Button asChild className="w-full bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-lg shadow-teal-500/20 border-0">
              <Link to="/chat" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Chat with Doctor
              </Link>
            </Button>
          </div>
        )}
      </div>

      {/* Overlay for mobile - appears when sidebar is open */}
      <div
        id="sidebar-overlay"
        className="fixed inset-0 bg-black/50 opacity-0 pointer-events-none transition-opacity duration-300 md:hidden z-30"
        onClick={toggleSidebar}
        aria-hidden="true"
      ></div>
    </>
  );
}
