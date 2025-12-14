import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { 
  Menu, 
  Moon, 
  Sun, 
  LogOut, 
  Home, 
  Calendar, 
  Users, 
  Activity,
  FileText,
  MessageSquare,
  Clock,
  Phone,
  AlertTriangle,
  Settings,
  Video,
  Pill,
  BarChart3,
  FileSearch,
  X
} from "lucide-react";
import { memo, useEffect, useState } from "react";
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
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import VoiceNavigation from '../VoiceNavigation';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import ChatApplet from '@/components/chat/ChatApplet';

const MainLayoutdoctor = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/serviceWorker.js');
      });
    }
  }, []);

  const { toast } = useToast();
  const { setTheme, theme } = useTheme();
  const navigate = useNavigate();
  const { currentDoctor } = useAuth();
  const logoutFun = useLogout();

  const doctorNavItems = [
    { icon: Home, label: "Dashboard", path: "/doctor/dashboard" },
    { icon: Calendar, label: "Appointments", path: "/doctor/appointments" },
    { icon: Activity, label: "Health Monitoring", path: "/doctor/health-monitoring" },
    { icon: FileText, label: "Prescriptions", path: "/doctor/prescriptions" },
    { icon: MessageSquare, label: "Chat", path: "/doctor/chat" },
    { icon: Video, label: "Video Consultation", path: "/doctor/video" },
    { icon: Users, label: "Patients", path: "/doctor/patients" },
    { icon: Clock, label: "Availability", path: "/doctor/availability" },
    { icon: Phone, label: "Contact", path: "/doctor/contact" },
    { icon: AlertTriangle, label: "Alerts", path: "/doctor/alerts" },
    { icon: BarChart3, label: "Analytics", path: "/doctor/analytics" },
    { icon: FileSearch, label: "Reports", path: "/doctor/reports" },
    { icon: Settings, label: "Settings", path: "/doctor/settings" },
  ];

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const getDoctorInitials = () => {
    const first = (currentDoctor?.firstName || "D").trim().charAt(0);
    const last = (currentDoctor?.lastName || "R").trim().charAt(0);
    return `${first}${last}`.toUpperCase();
  };

  const handleLogout = () => {
    logoutFun.mutate(undefined, {
      onSuccess: () => {
        navigate("/doctor/login");
        toast({
          title: "Logged out",
          description: "You have been successfully logged out",
        });
      },
    });
  };

  return (
    <div className="flex min-h-screen w-full">
      {/* Mobile toggle button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed top-4 left-4 z-50 p-2 rounded-md bg-primary text-white md:hidden"
        aria-label="Toggle sidebar"
      >
        {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-screen w-64 border-r bg-background transition-transform duration-300 ease-in-out",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center border-b px-6">
            <Link to="/doctor/dashboard" className="flex items-center gap-2 font-bold text-xl primary-grad">
              <Activity className="h-6 w-6" />
              <span>Mediczy</span>
            </Link>
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1 px-3 py-4">
            <nav className="space-y-1">
              {doctorNavItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    location.pathname === item.path
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              ))}
            </nav>
          </ScrollArea>

          {/* Doctor Info */}
          <div className="border-t p-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback>{getDoctorInitials()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-medium truncate">
                  Dr. {currentDoctor?.firstName} {currentDoctor?.lastName}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {currentDoctor?.email}
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="flex-1 md:ml-64">
        <div className="border-b bg-background">
          <div className="container flex h-16 items-center px-4">
            <div className="ml-auto flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={toggleTheme}>
                {theme === "light" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        {getDoctorInitials()}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        Dr. {currentDoctor?.firstName} {currentDoctor?.lastName}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {currentDoctor?.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/doctor/settings">Settings</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" /> Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        <div className="container mx-auto p-6 pb-20 md:pb-6">{children}</div>
      </main>
      <VoiceNavigation />
      <OfflineIndicator />
      <ChatApplet />
    </div>
  );
};

export default memo(MainLayoutdoctor);