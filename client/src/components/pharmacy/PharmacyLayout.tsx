import { ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PharmacySidebar from "./PharmacySidebar";
import { Bell, HeartPulse, Pill, ChevronDown, Sun, Moon } from "lucide-react";
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

interface PharmacyLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

const PharmacyLayout = ({ children, title, subtitle }: PharmacyLayoutProps) => {
  const navigate = useNavigate();
  const [pharmacyData, setPharmacyData] = useState<any>(null);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const token = localStorage.getItem("pharmacyToken");
    const data = localStorage.getItem("pharmacyData");

    if (!token) {
      navigate("/pharmacy/login");
      return;
    }

    if (data) {
      setPharmacyData(JSON.parse(data));
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("pharmacyToken");
    localStorage.removeItem("pharmacyData");
    navigate("/pharmacy/login");
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <PharmacySidebar />
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-30 h-16 bg-white/90 backdrop-blur border-b border-slate-200 flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-primary font-semibold">
              <HeartPulse className="h-5 w-5" />
              <span className="text-sm">Mediqzy</span>
              <span className="text-[11px] uppercase bg-primary/10 text-primary px-2 py-0.5 rounded-full">Pharmacy</span>
            </div>
            {title && (
              <div className="pl-3 border-l border-slate-200">
                <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
                {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
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
                  <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-emerald-500 text-white text-[10px] px-1">
                    2
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="flex flex-col items-start gap-0.5">
                  <span className="text-sm font-medium">New order received</span>
                  <span className="text-xs text-muted-foreground">5m ago</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex flex-col items-start gap-0.5">
                  <span className="text-sm font-medium">Inventory alert</span>
                  <span className="text-xs text-muted-foreground">Today</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 border border-slate-200 rounded-full px-3 py-1.5">
                  <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-full flex items-center justify-center">
                    <Pill className="w-4 h-4 text-white" />
                  </div>
                  <div className="hidden md:block text-left">
                    <p className="text-sm font-medium text-slate-900">
                      {pharmacyData?.name || "Pharmacy Admin"}
                    </p>
                    <p className="text-xs text-slate-500">Administrator</p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/pharmacy/settings")}>Settings</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/pharmacy/support")}>Help & Support</DropdownMenuItem>
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
    </div>
  );
};

export default PharmacyLayout;
