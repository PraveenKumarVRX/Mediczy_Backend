import { ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import LabSidebar from "./LabSidebar";
import { Bell, HeartPulse, ChevronDown, TestTube, Sun, Moon } from "lucide-react";
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
import { useTheme } from "@/utils/theme.provider";
import ModuleCopilot from "@/components/copilot/ModuleCopilot";

interface LabLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

const LabLayout = ({ children, title, subtitle }: LabLayoutProps) => {
  const navigate = useNavigate();
  const [labData, setLabData] = useState<any>(null);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const token = localStorage.getItem("labToken");
    const data = localStorage.getItem("labData");
    
    if (!token) {
      navigate("/lab/login");
      return;
    }
    
    if (data) {
      setLabData(JSON.parse(data));
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userType");
    localStorage.removeItem("userId");
    localStorage.removeItem("labToken");
    localStorage.removeItem("labData");
    window.dispatchEvent(new CustomEvent('authChange'));
    navigate("/lab/login");
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const notifications = [
    { id: 1, title: "New sample queued", time: "10m ago" },
    { id: 2, title: "Result ready", time: "Today" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <LabSidebar />

      <div className="ml-64 transition-all duration-300">
        <header className="sticky top-0 z-30 h-16 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-primary font-semibold">
              <HeartPulse className="h-5 w-5" />
              <span className="text-sm dark:text-white">Mediqzy</span>
              <span className="text-[11px] uppercase bg-primary/10 text-primary dark:bg-emerald-500/20 dark:text-emerald-400 px-2 py-0.5 rounded-full">Lab</span>
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
                <Moon className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              ) : (
                <Sun className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              )}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="w-5 h-5 text-slate-600" />
                  {notifications.length > 0 && (
                    <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive text-[10px] text-white px-1">
                      {notifications.length}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
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
                  <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center">
                    <TestTube className="w-4 h-4 text-white" />
                  </div>
                  <div className="hidden md:block text-left">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {labData?.name || "Lab Admin"}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Administrator</p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/lab/settings")}>
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/lab/support")}>
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

        <main className="p-6">{children}</main>
      </div>
      <ModuleCopilot moduleId="lab" context={{ title }} />
    </div>
  );
};

export default LabLayout;
