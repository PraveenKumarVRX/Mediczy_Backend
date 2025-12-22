import React from 'react';
import { Link, useLocation } from "react-router-dom";
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
  Share2,
  Apple,
  Users,
  Calendar,
  Building2,
  Heart,
  BarChart3,
  Settings,
  UserCircle,
  Shield,
  Database,
  FileText
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
}

const sidebarItems: SidebarItem[] = [
  { icon: Home, label: "Dashboard", path: "/" },
  {
    icon: AlignCenterVertical,
    label: "Health Tracker",
    path: "/health-tracker",
  },
  { icon: Stethoscope, label: "Consult Doctor", path: "/consultation" },
  {
    icon: Apple,
    label: "Diet Plans",
    path: "/diet",
  },
  { icon: Award, label: "Ayushman", path: "/ayushman" },
  { icon: Bot, label: "AI Doctor", path: "/ai-doctor" },
  { icon: Youtube, label: "Health Feed", path: "/health-feed" },
  { icon: Share2, label: "Report", path: "/reposts" },
  { icon: AlertCircle, label: "Emergency", path: "/emergency" },
];

const teamSidebarItems: SidebarItem[] = [
  { icon: Home, label: "Dashboard", path: "/team/dashboard" },
  { icon: Users, label: "Team Directory", path: "/team/directory" },
  { icon: BarChart3, label: "Reports", path: "/team/reports" },
  { icon: Activity, label: "System Tools", path: "/team/tools" },
  { icon: Users, label: "User Management", path: "/admin/users", category: "Management" },
  { icon: Stethoscope, label: "Doctors", path: "/admin/doctors", category: "Management" },
  { icon: Calendar, label: "Appointments", path: "/admin/appointments", category: "Operations" },
  { icon: MessageSquare, label: "Chat Dashboard", path: "/admin/chat", category: "Support" },
  { icon: Building2, label: "Hospitals", path: "/admin/hospitals", category: "Management" },
  { icon: Pill, label: "Pharmacies", path: "/admin/pharmacies", category: "Management" },
  { icon: Heart, label: "Health Plans", path: "/admin/plans", category: "Business" },
  { icon: Database, label: "Activity Logs", path: "/admin/activity-log", category: "Security" },
  { icon: Settings, label: "Settings", path: "/admin/system-test", category: "Administration" },
];

export function Sidebar() {
  const location = useLocation();
  const [toggleState, setToggleState] = useState(true);
  const [isTeamUser, setIsTeamUser] = useState(false);
  const [isNurseUser, setIsNurseUser] = useState(false);

  // Check if user is a team member
  useEffect(() => {
    const teamToken = localStorage.getItem('teamToken');
    const nurseToken = localStorage.getItem('nurseToken');
    const isTeamRoute = location.pathname.startsWith('/team') || 
                       (location.pathname.startsWith('/admin') && !!teamToken);
    const isNurseRoute = location.pathname.startsWith('/nurse');
    setIsTeamUser(!!teamToken && isTeamRoute);
    setIsNurseUser(!!nurseToken && isNurseRoute);
  }, [location.pathname]);

  // Function to toggle sidebar using CSS class
  const toggleSidebar = () => {
    const sidebar = document.getElementById("sidebar");
    sidebar.classList.toggle("sidebar-open");
    setToggleState(!toggleState);
    // Toggle aria-expanded attribute for accessibility
    const toggleButton = document.getElementById("sidebar-toggle");
    const isExpanded = toggleButton.getAttribute("aria-expanded") === "true";
    toggleButton.setAttribute("aria-expanded", (!isExpanded).toString());
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

  const getSidebarItems = () => {
    if (isTeamUser) return teamSidebarItems;
    if (isNurseUser) return nurseSidebarItems;
    return sidebarItems;
  };

  const items = getSidebarItems();

  return (
    <>
      {/* Mobile toggle button - outside the sidebar */}
      <button
        id="sidebar-toggle"
        onClick={toggleSidebar}
        className="fixed top-4 left-4 z-50 p-2 rounded-md bg-primary text-white md:hidden"
        style={{
          visibility: !toggleState === true ? "hidden" : "visible",
        }}
        aria-expanded="false"
        aria-controls="sidebar"
        aria-label="Toggle navigation menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Sidebar */}
      <div
        id="sidebar"
        className="fixed inset-y-0 left-0 flex flex-col w-64 bg-primary/5 backdrop-blur-xl transform -translate-x-full transition-transform duration-300 ease-in-out md:translate-x-0 z-40 sidebar-closed"
      >
        {/* Close button - visible only on mobile */}
        <button
          onClick={toggleSidebar}
          className="absolute top-4 right-4 p-1 rounded-md md:hidden"
          aria-label="Close navigation menu"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2 border-b px-6 py-4">
          <HeartPulse className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold">Mediqzy</span>
        </div>

        {/* Sidebar Links */}
        <ScrollArea className="flex-1 px-3 py-4">
          <div className="space-y-1">
            {/* Team Section Header */}
            {(isTeamUser || isNurseUser) && (
              <div className="px-3 py-2 mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {isTeamUser ? 'Team Dashboard' : 'Nurse Portal'}
                </p>
              </div>
            )}
            
            {/* Main navigation items */}
            {items.filter(item => !item.category).map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary",
                  location.pathname === item.path &&
                    "bg-primary/10 text-primary font-medium"
                )}
                onClick={() => {
                  // Close sidebar on mobile when a link is clicked
                  if (window.innerWidth < 768) {
                    toggleSidebar();
                  }
                }}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            ))}

            {/* Module sections for team users */}
            {isTeamUser && (
              <>
                {/* Management Modules */}
                <div className="px-3 py-2 mt-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Management
                  </p>
                </div>
                {items.filter(item => item.category === 'Management').map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary",
                      location.pathname === item.path &&
                        "bg-primary/10 text-primary font-medium"
                    )}
                    onClick={() => {
                      if (window.innerWidth < 768) {
                        toggleSidebar();
                      }
                    }}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                ))}

                {/* Operations Modules */}
                <div className="px-3 py-2 mt-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Operations
                  </p>
                </div>
                {items.filter(item => item.category === 'Operations' || item.category === 'Support').map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary",
                      location.pathname === item.path &&
                        "bg-primary/10 text-primary font-medium"
                    )}
                    onClick={() => {
                      if (window.innerWidth < 768) {
                        toggleSidebar();
                      }
                    }}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                ))}

                {/* Other Modules */}
                {items.filter(item => item.category && !['Management', 'Operations', 'Support'].includes(item.category)).length > 0 && (
                  <>
                    <div className="px-3 py-2 mt-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Other Modules
                      </p>
                    </div>
                    {items.filter(item => item.category && !['Management', 'Operations', 'Support'].includes(item.category)).map((item) => (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={cn(
                          "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary",
                          location.pathname === item.path &&
                            "bg-primary/10 text-primary font-medium"
                        )}
                        onClick={() => {
                          if (window.innerWidth < 768) {
                            toggleSidebar();
                          }
                        }}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        {/* Chat with Doctor */}
        <div className="border-t p-4">
          <Button asChild className="w-full" variant="outline">
            <Link to="/chat" className="flex items-center gap-2 hover:bg-primary">
              <MessageSquare className="h-4 w-4" />
              Chat with Doctor
            </Link>
          </Button>
        </div>
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
