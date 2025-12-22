import { Sidebar } from "./Sidebar";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Menu, Moon, Sun, X, LogOut, CalendarPlus } from "lucide-react";
import {  memo, useEffect, useMemo, useState } from "react";
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

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout = ({ children }: MainLayoutProps) => {
  const [showBookingModal, setShowBookingModal] = useState(false);
  
  // Register service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        const swUrl = `${window.location.origin}/serviceWorker.js`;
        navigator.serviceWorker.register(swUrl).then(
          (registration) => {
            console.log('ServiceWorker registration successful');
          },
          (err) => {
            console.log('ServiceWorker registration failed: ', err);
          }
        );
      });
    }
  }, []);

  const { toast } = useToast();
  const { setTheme, theme } = useTheme();
  const navigate = useNavigate();


  const { currentDoctor, currentUser, userType, isLoading } = useAuth();
  const logoutFun = useLogout()
  const location = useLocation();

  // Check if user is a team member
  const teamToken = localStorage.getItem('teamToken');
  const teamUser = teamToken ? JSON.parse(localStorage.getItem('teamUserData') || '{}') : null;
  const isTeamUser = !!teamToken && (location.pathname.startsWith('/team') || location.pathname.startsWith('/admin'));

  // Check if user is an admin
  const adminToken = localStorage.getItem('adminToken');
  const isAdminUser = !!adminToken && location.pathname.startsWith('/admin');

  const nurseToken = localStorage.getItem('nurseToken');
  const nurseData = nurseToken ? JSON.parse(localStorage.getItem('nurseData') || '{}') : null;
  const isNurseRoute = location.pathname.startsWith('/nurse');

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

    if (userType === "user") {
      return {
        name: buildName(currentUser?.firstName, currentUser?.lastName, "Mediczy User"),
        email: currentUser?.email || "user@mediczy.com",
        avatarSrc: currentUser?.profileImage,
        initials: buildInitials(currentUser?.firstName, currentUser?.lastName, "MU"),
      };
    }

    return {
      name: buildName(currentDoctor?.firstName, currentDoctor?.lastName, "Mediczy Doctor"),
      email: currentDoctor?.email || "doctor@mediczy.com",
      avatarSrc: currentDoctor?.profileImage,
      initials: buildInitials(currentDoctor?.firstName, currentDoctor?.lastName, "MD"),
    };
  }, [
    isTeamUser,
    teamUser,
    isNurseRoute,
    nurseData,
    userType,
    currentUser,
    currentDoctor,
  ]);

  return (
    <div className="flex min-h-screen w-full">
      {/* Overlay when Sidebar is open on mobile */}
        <Sidebar />

      {/* Main Content */}
      <main className="flex-1 overflow-auto md:ml-64">
        <div className="border-b bg-background">
          <div className="container flex h-16 items-center px-4">
            <Button
              variant="ghost"
              size="icon"
              className="mr-2 md:hidden"
              // onClick={toggleSidebar}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="ml-auto flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={toggleTheme}>
                {theme === "light" ? (
                  <Sun className="h-5 w-5" />
                ) : (
                  <Moon className="h-5 w-5" />
                )}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="relative h-8 w-8 rounded-full"
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
        </div>
        <div className="container mx-auto p-6 pb-20 md:pb-6">{children}</div>
      </main>
      <Navigation />
      <OfflineIndicator />
      
      {/* Universal Quick Appointment Booking Modal */}
      <QuickAppointmentModal 
        open={showBookingModal} 
        onOpenChange={setShowBookingModal} 
      />
    </div>
  );
};

export default memo(MainLayout);
