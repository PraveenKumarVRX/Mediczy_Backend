import { ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AggregatorSidebar from "./AggregatorSidebar";
import { Bell, Briefcase, User, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import api from "@/utils/api";

interface AggregatorLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

const AggregatorLayout = ({ children, title, subtitle }: AggregatorLayoutProps) => {
  const navigate = useNavigate();
  const [aggregatorData, setAggregatorData] = useState<any>(null);
  const [notifications, setNotifications] = useState<number>(0);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);

  useEffect(() => {
    const data = localStorage.getItem("aggregatorData");
    if (data) {
      try {
        setAggregatorData(JSON.parse(data));
      } catch (error) {
        console.error("Failed to parse aggregator data", error);
      }
    }

    // Load notifications count
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    setIsLoadingNotifications(true);
    try {
      const response = await api.get("/aggregator-auth/notifications");
      setNotifications(response.data?.data?.unreadCount || 0);
    } catch (error) {
      console.error("Failed to load notifications", error);
    } finally {
      setIsLoadingNotifications(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("aggregatorToken");
    localStorage.removeItem("aggregatorData");
    localStorage.removeItem("userType");
    navigate("/aggregator/login");
  };

  return (
    <div className="flex h-screen bg-slate-950">
      {/* Sidebar */}
      <AggregatorSidebar />

      {/* Main Content */}
      <main className="flex-1 ml-64 flex flex-col overflow-hidden">
        {/* Top Navigation Bar */}
        <div className="bg-slate-900 border-b border-slate-700 sticky top-0 z-30">
          <div className="flex items-center justify-between h-16 px-6">
            {/* Left */}
            <div>
              {title && <h1 className="text-lg font-bold text-white">{title}</h1>}
              {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
            </div>

            {/* Right */}
            <div className="flex items-center gap-4">
              {/* Search (optional) */}
              <Input
                type="search"
                placeholder="Search..."
                className="w-48 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
              />

              {/* Notifications */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative text-slate-400 hover:text-white hover:bg-slate-800"
                  >
                    <Bell className="w-5 h-5" />
                    {notifications > 0 && (
                      <Badge className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 bg-red-500 text-white text-xs">
                        {notifications > 9 ? "9+" : notifications}
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <div className="py-2">
                    <DropdownMenuItem className="flex-col items-start px-4 py-2 text-sm text-slate-400">
                      No new notifications
                    </DropdownMenuItem>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Profile Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white hover:bg-slate-800">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mr-2">
                      <User className="w-4 h-4 text-white" />
                    </div>
                    <span className="hidden sm:inline text-sm font-medium max-w-[120px] truncate">
                      {aggregatorData?.brokerName || "Aggregator"}
                    </span>
                    <ChevronDown className="w-4 h-4 ml-1 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/aggregator/profile")}>
                    Profile Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/aggregator/settings")}>
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-red-400 cursor-pointer">
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AggregatorLayout;
