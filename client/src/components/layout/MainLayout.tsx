import { Sidebar } from "./Sidebar";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Menu, Moon, Sun, X, LogOut, CalendarPlus, HeartPulse, Bell, FileText, Calendar, Pill, CheckCircle, AlertCircle, ChevronRight, Sparkles } from "lucide-react";
import {  memo, useCallback, useEffect, useMemo, useState } from "react";
// import { useIsMobile } from "@/hooks/use-mobile";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
// import exp from "constants";
import { Navigation } from "./Navigation";
import { OfflineIndicator } from '@/components/OfflineIndicator';
import QuickAppointmentModal from "@/components/QuickAppointmentModal";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BRAND, getShortRoleLabel } from "@/config/brand";
import VideoCallNotification from "@/components/notifications/VideoCallNotification";
import { useSocketConnection } from "@/hooks/useSocketConnection";
import { PageTransition } from "@/components/PageTransition";
import ChatApplet from "@/components/chat/ChatApplet";
import GlobalSearch from "@/components/GlobalSearch";
import aiHealthServices from "@/services/aiHealthServices";
import { lazy, Suspense } from "react";
import { useVideoCall } from "@/context/VideoCallContext";
import { getUserDashboardUxMeta } from "@/config/userDashboardUxMeta";

const LiveKitRoom = lazy(() => import("@/components/video/LiveKitRoom"));

interface Notification {
  id: number;
  title: string;
  description: string;
  time: string;
  type: 'appointment' | 'prescription' | 'report' | 'alert';
  link: string;
  read: boolean;
}

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout = ({ children }: MainLayoutProps) => {
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const videoCall = useVideoCall();

  // Initialize socket connection for notifications
  useSocketConnection();
  
  const { toast } = useToast();
  const { setTheme, theme } = useTheme();
  const navigate = useNavigate();


  const { currentDoctor, currentUser, userType, isLoading } = useAuth();
  const logoutFun = useLogout();
  const location = useLocation();

  // Check if user is a team member
  const teamToken = localStorage.getItem('teamToken');
  const teamUser = teamToken ? JSON.parse(localStorage.getItem('teamUserData') || '{}') : null;
  const isTeamUser = !!teamToken && location.pathname.startsWith('/team');

  // Check if user is an admin
  const adminToken = localStorage.getItem('adminToken');
  const isAdminUser = !!adminToken && location.pathname.startsWith('/admin');

  const nurseToken = localStorage.getItem('nurseToken');
  const nurseData = nurseToken ? JSON.parse(localStorage.getItem('nurseData') || '{}') : null;
  const isNurseRoute = location.pathname.startsWith('/nurse');

  // Check if user is an assistant
  const assistantToken = localStorage.getItem('assistantToken');
  const assistantDataRaw = localStorage.getItem('assistantData');
  const assistantData = assistantDataRaw ? JSON.parse(assistantDataRaw) : null;
  const isAssistantRoute = location.pathname.startsWith('/assistant');
  const isAssistantUser = !!assistantToken && isAssistantRoute;

  // Auto-minimize an active video call when the user navigates to a new page
  // so they can browse freely without the full-screen overlay blocking navigation.
  useEffect(() => {
    if (videoCall.liveKitConnection && !videoCall.isMinimized) {
      videoCall.minimize();
    }
  }, [location.pathname]);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  }

  const handleLogout = () => {
    logoutFun.mutate(undefined, {
      onSuccess: () => {
        if (isTeamUser) {
          navigate('/team/login');
        } else if (isNurseRoute) {
          navigate('/nurse/login');
        } else if (isAssistantRoute) {
          navigate('/assistant/login');
        } else {
          navigate("/login");
        }
        toast({
          title: "Logged out",
          description: "You have been successfully logged out",
        });
      },
    });
  };
  const profileInfo = useMemo(() => {
    const buildName = (first?: string, last?: string, fallback = "") =>
      `${first || ""} ${last || ""}`.trim() || fallback;

    const buildInitials = (first?: string, last?: string, fallback = "MD") => {
      const f = (first || "").trim();
      const l = (last || "").trim();
      const initials = `${f.charAt(0)}${l.charAt(0)}`.toUpperCase().trim();
      return initials || fallback;
    };

    if (isTeamUser) {
      return {
        name: buildName(teamUser?.firstName, teamUser?.lastName, "Team Member"),
        email: teamUser?.email || "team@mediczy.com",
        avatarSrc: teamUser?.profileImage,
        initials: buildInitials(teamUser?.firstName, teamUser?.lastName, "TM"),
      };
    }

    if (isNurseRoute && nurseData) {
      return {
        name: buildName(nurseData?.firstName, nurseData?.lastName, "Nurse"),
        email: nurseData?.email || "nurse@mediczy.com",
        avatarSrc: nurseData?.profileImage,
        initials: buildInitials(nurseData?.firstName, nurseData?.lastName, "NR"),
      };
    }

    if (isAssistantUser) {
      return {
        name: buildName(assistantData?.firstName, assistantData?.lastName, "Assistant"),
        email: assistantData?.email || "assistant@mediczy.com",
        avatarSrc: assistantData?.profileImage,
        initials: buildInitials(assistantData?.firstName, assistantData?.lastName, "AS"),
      };
    }

    if (userType === "user") {
      return {
        name: buildName(currentUser?.firstName, currentUser?.lastName, "SmartHealth User"),
        email: currentUser?.email || "user@smarthealth.com",
        avatarSrc: currentUser?.profileImage,
        initials: buildInitials(currentUser?.firstName, currentUser?.lastName, "SH"),
      };
    }

    return {
      name: buildName(currentDoctor?.firstName, currentDoctor?.lastName, "SmartHealth Doctor"),
      email: currentDoctor?.email || "doctor@smarthealth.com",
      avatarSrc: currentDoctor?.profileImage,
      initials: buildInitials(currentDoctor?.firstName, currentDoctor?.lastName, "SH"),
    };
  }, [
    isTeamUser,
    teamUser,
    isNurseRoute,
    nurseData,
    isAssistantUser,
    assistantData,
    userType,
    currentUser,
    currentDoctor,
  ]);

  // ── Real-time AI notifications from backend ──
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const timeAgo = useCallback((dateStr: string) => {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMin = Math.round((now - then) / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.round(diffHr / 24);
    return `${diffDay}d ago`;
  }, []);

  useEffect(() => {
    let mounted = true;
    const fetchNotifications = async () => {
      // Skip AI notifications for non-patient portals (team, admin, nurse, etc.)
      // They use separate dashboards and these calls use the wrong token context
      const currentUserType = localStorage.getItem('userType');
      if (currentUserType && currentUserType !== 'user') return;
      try {
        const res = await aiHealthServices.getSmartNotifications({ limit: 10 });
        if (mounted && res.success && res.notifications.length > 0) {
          setNotifications(res.notifications.map(n => ({
            id: n.id,
            title: n.title,
            description: n.message,
            time: timeAgo(n.created_at),
            type: (n.type === 'medication_reminder' ? 'prescription' :
                   n.type === 'appointment_reminder' ? 'appointment' :
                   n.type === 'lab_result' ? 'report' : 'alert') as Notification['type'],
            link: n.action_url || '/smart-health',
            read: n.status === 'read',
          })));
        }
      } catch {
        // Silently fail — fallback to empty
      }
    };
    fetchNotifications();
    // Refresh every 2 minutes
    const interval = setInterval(fetchNotifications, 120000);
    return () => { mounted = false; clearInterval(interval); };
  }, [timeAgo]);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'report':
        return <FileText className="h-4 w-4 text-teal-500" />;
      case 'appointment':
        return <Calendar className="h-4 w-4 text-blue-500" />;
      case 'prescription':
        return <Pill className="h-4 w-4 text-purple-500" />;
      case 'alert':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Sparkles className="h-4 w-4 text-teal-500" />;
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const uxMeta = useMemo(() => getUserDashboardUxMeta(location.pathname), [location.pathname]);
  const showUserUxStrip = !isTeamUser && !isNurseRoute && !isAssistantRoute && !isAdminUser;

  return (
    <div className="flex min-h-screen w-full">
      {/* Overlay when Sidebar is open on mobile */}
        <Sidebar />

      {/* Main Content */}
      <main className="flex-1 w-full overflow-auto md:ml-64 bg-gradient-to-br from-slate-50 via-white to-slate-50/80 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-slate-700/50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-sm">
          <div className="flex h-16 items-center px-4 lg:px-6 gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 shadow-sm">
                <HeartPulse className="h-4 w-4 text-white" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-sm font-semibold text-slate-800 dark:text-white tracking-tight">{BRAND.name}</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-medium">
                  {isTeamUser ? getShortRoleLabel('team') : isNurseRoute ? getShortRoleLabel('nurse') : isAssistantUser ? getShortRoleLabel('assistant') : getShortRoleLabel(userType || 'user')}
                </span>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <GlobalSearch />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="hidden md:inline-flex border-teal-200 dark:border-teal-700 text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/30 hover:border-teal-300 dark:hover:border-teal-600"
                      onClick={() => setShowBookingModal(true)}
                    >
                      <CalendarPlus className="h-4 w-4 mr-2" />
                      Quick Booking
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Book an appointment</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button variant="ghost" size="icon" onClick={toggleTheme} className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800">
                {theme === "light" ? (
                  <Sun className="h-5 w-5" />
                ) : (
                  <Moon className="h-5 w-5" />
                )}
              </Button>

              {/* Notifications */}
              <DropdownMenu open={notificationOpen} onOpenChange={setNotificationOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-teal-500 text-[10px] text-white px-1 font-medium">
                        {unreadCount}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-96 shadow-xl border-slate-200 dark:border-slate-700 dark:bg-slate-800" align="end">
                  <div className="flex items-center justify-between px-3 py-2">
                    <DropdownMenuLabel className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider p-0">
                      Notifications
                    </DropdownMenuLabel>
                    {unreadCount > 0 && (
                      <span className="text-xs bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 px-2 py-0.5 rounded-full font-medium">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  <DropdownMenuSeparator className="dark:bg-slate-700" />
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.map((note) => (
                      <DropdownMenuItem 
                        key={note.id} 
                        className="p-0 focus:bg-transparent"
                        asChild
                      >
                        <Link 
                          to={note.link}
                          onClick={() => setNotificationOpen(false)}
                          className={`flex items-start gap-3 px-3 py-3 cursor-pointer transition-colors w-full ${
                            note.read 
                              ? 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700' 
                              : 'bg-teal-50/50 dark:bg-teal-900/10 hover:bg-teal-50 dark:hover:bg-teal-900/20'
                          }`}
                        >
                          <div className={`p-2 rounded-full shrink-0 ${
                            note.read 
                              ? 'bg-slate-100 dark:bg-slate-700' 
                              : 'bg-white dark:bg-slate-700 shadow-sm'
                          }`}>
                            {getNotificationIcon(note.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-medium truncate ${
                                note.read 
                                  ? 'text-slate-700 dark:text-slate-300' 
                                  : 'text-slate-900 dark:text-white'
                              }`}>
                                {note.title}
                              </span>
                              {!note.read && (
                                <span className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />
                              )}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                              {note.description}
                            </p>
                            <span className="text-xs text-slate-400 dark:text-slate-500 mt-1 block">
                              {note.time}
                            </span>
                          </div>
                          <ChevronRight className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0 mt-1" />
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </div>
                  {notifications.length === 0 && (
                    <div className="text-center py-8">
                      <Bell className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                      <p className="text-slate-500 dark:text-slate-400 text-sm">No notifications yet</p>
                    </div>
                  )}
                  <DropdownMenuSeparator className="dark:bg-slate-700" />
                  <div className="p-2">
                    <Link
                      to="/patient/notifications"
                      onClick={() => setNotificationOpen(false)}
                      className="block text-center text-sm text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 font-medium py-2 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
                    >
                      View all notifications
                    </Link>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="relative h-9 w-9 rounded-full border border-border/60"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage
                        src={profileInfo.avatarSrc || undefined}
                        alt={`${profileInfo.name} avatar`}
                      />
                      <AvatarFallback>{profileInfo.initials}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {profileInfo.name}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {profileInfo.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to={isTeamUser ? "/team/profile" : isNurseRoute ? "/nurse/dashboard" : "/profile"}>Profile</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>
        <div className="p-6 pb-20 md:pb-6 space-y-4">
          {showUserUxStrip && (
            <section className="worldclass-panel rounded-2xl p-4 md:p-5 border">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500 font-semibold">{uxMeta.category}</p>
                  <h1 className="text-lg md:text-xl font-semibold text-slate-900 dark:text-white">{uxMeta.title}</h1>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{uxMeta.subtitle}</p>
                </div>
              </div>
            </section>
          )}
          <PageTransition key={location.pathname}>
            {children}
          </PageTransition>
        </div>
      </main>
      <Navigation />
      <OfflineIndicator />
      
      {/* Video Call Notification System */}
      <VideoCallNotification />
      
      {/* Team Chat Communication Module */}
      {isTeamUser && <ChatApplet />}

      {/* Persistent video call overlay — survives page navigation */}
      {videoCall.liveKitConnection && (
        <Suspense fallback={null}>
          <LiveKitRoom
            serverUrl={videoCall.liveKitConnection.serverUrl}
            token={videoCall.liveKitConnection.token}
            roomName={videoCall.liveKitConnection.roomName}
            participantName={videoCall.participantName}
            isMinimized={videoCall.isMinimized}
            onMinimize={videoCall.minimize}
            onRestore={videoCall.restore}
            onDisconnect={videoCall.handleDisconnect}
            onError={videoCall.handleError}
            iceServers={videoCall.liveKitConnection.iceServers}
          />
        </Suspense>
      )}

      {/* Universal Quick Appointment Booking Modal */}
      <QuickAppointmentModal
        open={showBookingModal}
        onOpenChange={setShowBookingModal}
      />
    </div>
  );
};

export default memo(MainLayout);
