import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import HospitalSidebar from "./HospitalSidebar";
import { Bell, HeartPulse, ChevronDown, Building2, Sun, Moon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/utils/theme.provider";
import { useHospitalAuth } from "@/hooks/useHospitalAuth";
import api from "@/utils/api";

interface HospitalLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

interface Notification {
  id: string | number;
  title: string;
  time: string;
}

const HospitalLayout = ({ children, title, subtitle }: HospitalLayoutProps) => {
  const navigate = useNavigate();
  const { setTheme, theme } = useTheme();
  const { hospitalData, isLoading: authLoading, logout } = useHospitalAuth();

  // Fetch module capabilities for sidebar gating
  const { data: capabilities } = useQuery<string[] | undefined>({
    queryKey: ["hospital-capabilities"],
    queryFn: async () => undefined,
    staleTime: 10 * 60_000,
    retry: false,
  });
  const { data: notificationsData } = useQuery<Notification[]>({
    queryKey: ["hospital-notifications"],
    queryFn: async () => [],
    staleTime: 60_000,
    retry: false,
    // Fallback to empty array on error — non-critical UI
  });

  const notifications: Notification[] = notificationsData ?? [];

  const handleLogout = () => logout();

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  // While verifying, show a minimal spinner to avoid flash of login redirect
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Sidebar */}
      <HospitalSidebar capabilities={capabilities && capabilities.length > 0 ? capabilities : undefined} />

      {/* Main Content Area */}
      <div className="ml-64 transition-all duration-300">
        {/* Top Header */}
        <header className="sticky top-0 z-30 h-16 bg-white/90 dark:bg-slate-800/90 backdrop-blur border-b border-slate-200 dark:border-slate-700/50 flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 font-semibold">
              <HeartPulse className="h-5 w-5" />
              <span className="text-sm">Mediqzy</span>
              <span className="text-[11px] uppercase bg-teal-500/10 text-teal-600 dark:text-teal-400 px-2 py-0.5 rounded-full">Hospital</span>
            </div>
            {title && (
              <div className="pl-3 border-l border-slate-200 dark:border-slate-700">
                <h1 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h1>
                {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleTheme}>
              {theme === "light" ? (
                <Sun className="w-5 h-5 text-slate-600" />
              ) : (
                <Moon className="w-5 h-5 text-slate-600" />
              )}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="w-5 h-5 text-slate-600" />
                  <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive text-[10px] text-white px-1">
                    {notifications.length}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-72" align="end">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifications.map((note) => (
                  <DropdownMenuItem key={note.id} className="flex flex-col items-start gap-0.5">
                    <span className="text-sm font-medium">{note.title}</span>
                    <span className="text-xs text-muted-foreground">{note.time}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1.5">
                  <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-teal-600 rounded-full flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-white" />
                  </div>
                  <div className="hidden md:block text-left">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {hospitalData?.name || "Hospital Admin"}
                    </p>
                    <p className="text-xs text-teal-600 dark:text-teal-400">Administrator</p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/hospital/settings")}>
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/hospital/support")}>
                  Help & Support
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
};

export default HospitalLayout;
