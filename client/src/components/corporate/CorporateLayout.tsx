import { ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getUserType } from "@/hooks/auth";
import CorporateSidebar from "./CorporateSidebar";
import { Bell, HeartPulse, User, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const [corporateName, setCorporateName] = useState<string>('');
  const [adminName, setAdminName] = useState<string>('HR Admin');

  // Force dark mode for the corporate portal — rich dark theme
  useEffect(() => {
    document.documentElement.classList.add('dark');
    localStorage.setItem('theme', 'dark');
  }, []);

  // Load corporate name from stored data
  useEffect(() => {
    try {
      const corporateDataStr = localStorage.getItem('corporateData');
      if (corporateDataStr) {
        const corporateData = JSON.parse(corporateDataStr);
        if (corporateData?.name) setCorporateName(corporateData.name);
        if (corporateData?.contactPerson) setAdminName(corporateData.contactPerson);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    const type = getUserType();
    const corporateToken = localStorage.getItem("corporateToken");
    if (type !== "corporate" && !corporateToken) {
      navigate("/corporate/login");
    }
  }, [navigate]);

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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Ambient glow effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-blue-500/4 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/3 w-64 h-64 bg-violet-500/3 rounded-full blur-3xl" />
      </div>

      {/* Sidebar */}
      <CorporateSidebar />

      {/* Main Content Area */}
      <div className="ml-64 transition-all duration-300 relative">
        {/* Top Header — frosted glass */}
        <header className="sticky top-0 z-30 h-16 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800/80 flex items-center justify-between px-6 shadow-xl shadow-slate-950/50">
          <div className="flex items-center gap-4">
            {/* Brand pill */}
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-md shadow-emerald-500/25">
                <HeartPulse className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-semibold text-white">{corporateName || 'Mediqzy'}</span>
              <span className="text-[10px] uppercase font-bold bg-gradient-to-r from-emerald-500 to-emerald-400 text-white px-2.5 py-0.5 rounded-full tracking-widest">
                Corporate
              </span>
            </div>

            {title && (
              <div className="pl-4 border-l border-slate-700/60">
                <h1 className="text-sm font-semibold text-slate-100">{title}</h1>
                {subtitle && <p className="text-xs text-slate-500 leading-tight">{subtitle}</p>}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                placeholder="Quick search…"
                className="h-9 w-48 pl-9 pr-3 text-sm bg-slate-800/60 border border-slate-700/60 rounded-xl text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 focus:bg-slate-800 transition-all"
              />
            </div>

            {/* Notifications */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-xl">
                  <Bell className="w-4.5 h-4.5" />
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-slate-900" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 bg-slate-900 border-slate-800 shadow-2xl shadow-slate-950/60">
                <DropdownMenuLabel className="text-slate-300 font-semibold px-4 py-3 border-b border-slate-800">
                  Notifications
                  <span className="ml-2 text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">3 new</span>
                </DropdownMenuLabel>
                <DropdownMenuItem className="flex flex-col items-start gap-0.5 px-4 py-3 hover:bg-slate-800/60 cursor-pointer">
                  <span className="text-sm font-medium text-slate-200">New claim filed</span>
                  <span className="text-xs text-slate-500">5 minutes ago</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex flex-col items-start gap-0.5 px-4 py-3 hover:bg-slate-800/60 cursor-pointer">
                  <span className="text-sm font-medium text-slate-200">Policy approval pending</span>
                  <span className="text-xs text-slate-500">2 hours ago</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex flex-col items-start gap-0.5 px-4 py-3 hover:bg-slate-800/60 cursor-pointer">
                  <span className="text-sm font-medium text-slate-200">Health report ready</span>
                  <span className="text-xs text-slate-500">Today, 9:00 AM</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2.5 bg-slate-800/60 border border-slate-700/60 hover:border-slate-600 hover:bg-slate-800 rounded-xl px-3 py-2 h-auto transition-all">
                  <div className="w-7 h-7 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center shadow-sm">
                    <User className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="hidden md:block text-left">
                    <p className="text-xs font-semibold text-slate-200 leading-none">{adminName}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Corporate Admin</p>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-slate-900 border-slate-800 shadow-2xl shadow-slate-950/60">
                <DropdownMenuLabel className="text-slate-300 px-4 py-3 border-b border-slate-800">
                  <p className="font-semibold text-sm text-slate-100">{adminName}</p>
                  <p className="text-xs text-slate-500">Corporate Administrator</p>
                </DropdownMenuLabel>
                <div className="py-1">
                  <DropdownMenuItem onClick={() => navigate("/corporate/settings")} className="text-slate-300 hover:text-white hover:bg-slate-800/60 px-4 py-2.5 cursor-pointer">
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/corporate/support")} className="text-slate-300 hover:text-white hover:bg-slate-800/60 px-4 py-2.5 cursor-pointer">
                    Help & Support
                  </DropdownMenuItem>
                </div>
                <DropdownMenuSeparator className="bg-slate-800" />
                <DropdownMenuItem onClick={handleLogout} className="text-red-400 hover:text-red-300 hover:bg-red-900/20 px-4 py-2.5 cursor-pointer">
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-6 min-h-[calc(100vh-4rem)]">
          {children}
        </main>
      </div>
    </div>
  );
};

export default CorporateLayout;
