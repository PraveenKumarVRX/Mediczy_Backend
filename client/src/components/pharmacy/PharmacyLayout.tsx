import { ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PharmacySidebar from "./PharmacySidebar";
import { Bell, Search, Pill, ChevronDown, Sun, Moon } from "lucide-react";
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
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            {title && (
              <div>
                <h1 className="text-xl font-bold text-slate-900">{title}</h1>
                {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={toggleTheme}>
              {theme === "light" ? (
                <Sun className="w-5 h-5 text-slate-600" />
              ) : (
                <Moon className="w-5 h-5 text-slate-600" />
              )}
            </Button>
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                type="text"
                placeholder="Search inventory, prescriptions..."
                className="w-64 pl-10 bg-slate-50 border-slate-200 focus:bg-white"
              />
            </div>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-5 h-5 text-slate-600" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-emerald-500 rounded-full" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2">
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
