import { ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getUserType } from "@/hooks/auth";
import CorporateSidebar from "./CorporateSidebar";
import { Bell, HeartPulse, User, ChevronDown, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CorporateLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

const CorporateLayout = ({ children, title, subtitle }: CorporateLayoutProps) => {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
        document.documentElement.classList.contains('dark');
    }
    return false;
  });

  useEffect(() => {
    const type = getUserType();
    const corporateToken = localStorage.getItem("corporateToken");
    
    // Allow access if either userType is corporate OR corporateToken exists
    if (type !== "corporate" && !corporateToken) {
      navigate("/corporate/login");
    }
  }, [navigate]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userType");
    localStorage.removeItem("corporateToken");
    localStorage.removeItem("corporateData");
    localStorage.removeItem("userId");
    window.dispatchEvent(new CustomEvent('authChange'));
    navigate("/corporate/login");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50/80 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      {/* Sidebar */}
      <CorporateSidebar />

      {/* Main Content Area */}
      <div className="ml-64 transition-all duration-300">
        {/* Top Header */}
        <header className="sticky top-0 z-30 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-700/50 shadow-sm flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-primary font-semibold">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-sm">
                <HeartPulse className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm text-slate-800 dark:text-white">Mediqzy</span>
              <span className="text-[10px] uppercase font-semibold bg-gradient-to-r from-emerald-600 to-emerald-700 text-white px-2.5 py-1 rounded-full tracking-wider">Corporate</span>
            </div>
            {title && (
              <div className="pl-3 border-l border-slate-200 dark:border-slate-700">
                <h1 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h1>
                {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={toggleDarkMode}
              className="hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {darkMode ? (
                <Sun className="w-5 h-5 text-yellow-500" />
              ) : (
                <Moon className="w-5 h-5 text-slate-600" />
              )}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800">
                  <Bell className="w-5 h-5" />
                  <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive text-[10px] text-white px-1">
                    3
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-slate-200 dark:bg-slate-700" />
                <DropdownMenuItem className="flex flex-col items-start gap-0.5 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <span className="text-sm font-medium text-slate-800 dark:text-white">New claim filed</span>
                  <span className="text-xs text-muted-foreground">5m ago</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex flex-col items-start gap-0.5 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <span className="text-sm font-medium text-slate-800 dark:text-white">Policy approval pending</span>
                  <span className="text-xs text-muted-foreground">Today</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
                  <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-900/50 rounded-full flex items-center justify-center">
                    <User className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="hidden md:block text-left">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">HR Admin</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Corporate</p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <DropdownMenuLabel className="text-slate-800 dark:text-white">My Account</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-slate-200 dark:bg-slate-700" />
                <DropdownMenuItem onClick={() => navigate("/corporate/settings")} className="text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/corporate/support")} className="text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                  Help & Support
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-slate-200 dark:bg-slate-700" />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default CorporateLayout;
