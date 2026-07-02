import { ReactNode, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import InsurancePortalSidebar from "./InsurancePortalSidebar";
import { Bell, HeartPulse, Shield, ChevronDown, Sun, Moon } from "lucide-react";
import '@/styles/InsurancePortal.css';
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
import ModuleCopilot from "@/components/copilot/ModuleCopilot";

interface InsurancePortalLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

const InsurancePortalLayout = ({ children, title, subtitle }: InsurancePortalLayoutProps) => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
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
    localStorage.removeItem("hospitalInsuranceSlug");
    localStorage.removeItem("token");
    localStorage.removeItem("userType");
    navigate("/hospital-insurance/login");
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <div className="min-h-screen flex bg-background">
      <InsurancePortalSidebar />
      <div className="relative flex-1 min-w-0 flex flex-col overflow-hidden bg-gradient-to-br from-blue-500/5 via-background/95 to-purple-500/5">
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.03) 0%, transparent 25%)',
              backgroundSize: '40px 40px',
              backgroundPosition: '0 0, 20px 20px',
            }}
          />
          <div className="absolute -top-24 -right-20 h-72 w-72 rounded-full bg-purple-500/8 blur-3xl" />
          <div className="absolute bottom-0 left-1/4 h-64 w-64 rounded-full bg-blue-500/6 blur-3xl" />
        </div>
        {/* Top gradient accent bar */}
        <div className="h-[2px] flex-shrink-0 bg-gradient-to-r from-purple-500 via-blue-500 to-purple-500" />

        {/* Header */}
        <header
          className="sticky top-0 z-30 h-[54px] flex items-center justify-between px-5 flex-shrink-0 bg-background/80 backdrop-blur-xl border-b border-border/70"
        >
          {/* Left: brand + title */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2">
              <div className="relative rounded-xl p-2 bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20">
                <HeartPulse className="h-4 w-4 text-purple-500" />
                <Shield className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 text-blue-500" />
              </div>
              <span className="text-[13px] font-bold tracking-tight bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">Mediqzy</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400">
                INSURANCE
              </span>
            </div>
            {title && (
              <div className="flex items-center gap-2 pl-3 min-w-0 border-l border-border">
                <div className="min-w-0">
                  <h1 className="text-[13px] font-semibold text-foreground leading-none truncate">{title}</h1>
                  {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5 leading-none truncate">{subtitle}</p>}
                </div>
              </div>
            )}
          </div>

          {/* Right: controls */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Theme toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="h-8 w-8 rounded-lg hover:bg-muted"
            >
              {theme === "light"
                ? <Moon className="w-4 h-4 text-muted-foreground" />
                : <Sun className="w-4 h-4 text-muted-foreground" />
              }
            </Button>

            {/* Notifications */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-muted relative">
                  <Bell className="w-4 h-4 text-muted-foreground" />
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 border border-background" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 shadow-xl border border-border">
                <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-sm text-muted-foreground py-3 justify-center">No new notifications</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* User */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-8 flex items-center gap-2 px-2 rounded-lg hover:bg-muted border border-border"
                >
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[10px] font-bold bg-gradient-to-br from-purple-500 to-blue-500">
                    {(portalData?.name || portalData?.hospitalName || 'I').charAt(0).toUpperCase()}
                  </div>
                  <span className="hidden md:block text-[12px] font-medium text-foreground max-w-[120px] truncate">
                    {portalData?.name || portalData?.hospitalName || "Insurance Desk"}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 shadow-xl border border-border">
                <DropdownMenuLabel className="py-2">
                  <div className="font-semibold text-foreground text-sm truncate">{portalData?.name || portalData?.hospitalName || "Insurance Desk"}</div>
                  <div className="text-xs text-muted-foreground font-normal mt-0.5">{portalData?.email || "Claims Manager"}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate(`/hospital/${slug}/insurance/hospital-profile`)} className="text-sm cursor-pointer">
                  Hospital Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(`/hospital/${slug}/insurance/settings`)} className="text-sm cursor-pointer">
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-sm text-red-600 cursor-pointer focus:text-red-600 focus:bg-red-50">
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main className="relative z-10 flex-1 overflow-auto bg-transparent">
          <div className="ins-portal">
            {children}
          </div>
        </main>
      </div>
      <ModuleCopilot moduleId="insurance" context={{ screen: title, portal: slug }} />
    </div>
  );
};

export default InsurancePortalLayout;
