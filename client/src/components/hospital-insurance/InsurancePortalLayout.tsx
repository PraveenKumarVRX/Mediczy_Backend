import { ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import InsurancePortalSidebar from "./InsurancePortalSidebar";
import { Bell, HeartPulse, Shield, ChevronDown, Sun, Moon } from "lucide-react";
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

interface InsurancePortalLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

const InsurancePortalLayout = ({ children, title, subtitle }: InsurancePortalLayoutProps) => {
  const navigate = useNavigate();
  const [portalData, setPortalData] = useState<any>(null);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const token = localStorage.getItem("hospitalInsuranceToken");
    const data = localStorage.getItem("hospitalInsuranceData");

    if (!token) {
      navigate("/hospital-insurance/login");
      return;
    }

    if (data) {
      try {
        setPortalData(JSON.parse(data));
      } catch {
        setPortalData({ name: 'Insurance Portal' });
      }
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("hospitalInsuranceToken");
    localStorage.removeItem("hospitalInsuranceData");
    localStorage.removeItem("token");
    localStorage.removeItem("userType");
    navigate("/hospital-insurance/login");
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex">
      <InsurancePortalSidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-14 bg-white/90 dark:bg-slate-800/90 backdrop-blur border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-primary font-semibold">
              <HeartPulse className="h-5 w-5" />
              <span className="text-sm">Mediczy</span>
              <span className="text-[11px] uppercase bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200 px-2 py-0.5 rounded-full font-bold">
                Insurance
              </span>
            </div>
            {title && (
              <div className="pl-3 border-l border-slate-200 dark:border-slate-700">
                <h1 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h1>
                {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleTheme}>
              {theme === "light" ? (
                <Sun className="w-5 h-5 text-slate-600" />
              ) : (
                <Moon className="w-5 h-5 text-slate-400" />
              )}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                  <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 text-white text-[10px] px-1">
                    0
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-sm text-muted-foreground">
                  No new notifications
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 border border-slate-200 dark:border-slate-600 rounded-full px-3 py-1.5">
                  <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-full flex items-center justify-center">
                    <Shield className="w-4 h-4 text-white" />
                  </div>
                  <div className="hidden md:block text-left">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {portalData?.name || portalData?.hospitalName || "Insurance Desk"}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Claims Manager</p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/hospital-insurance/hospital-profile")}>
                  Hospital Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/hospital-insurance/settings")}>
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
};

export default InsurancePortalLayout;
