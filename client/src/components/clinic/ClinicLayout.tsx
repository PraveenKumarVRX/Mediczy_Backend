import { ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ClinicSidebar from "./ClinicSidebar";
import { Bell, HeartPulse, User, ChevronDown, Building, Calendar, UserPlus, AlertCircle, CheckCircle, Clock, Sun, Moon } from "lucide-react";
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
import { useTheme } from "@/utils/theme.provider";
import api from "@/utils/api";
import { clearClinicSession, getClinicLoginPath } from "@/utils/clinicPortal";

interface ClinicLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

const ClinicLayout = ({ children, title, subtitle }: ClinicLayoutProps) => {
  const navigate = useNavigate();
  const [clinicData, setClinicData] = useState<any>(null);
  const [notifications, setNotifications] = useState<Array<{
    id: number;
    type: string;
    title: string;
    message: string;
    createdAt?: string;
    read: boolean;
    priority?: string;
  }>>([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [notificationsPage, setNotificationsPage] = useState(1);
  const [notificationsHasMore, setNotificationsHasMore] = useState(false);
  const notificationsPageSize = 5;

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = async (id: number) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    try {
      await api.post(`/clinic/dashboard/notifications/${id}/read`);
    } catch (error) {
      console.error("Failed to mark notification as read", error);
    }
  };

  const markAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await api.post("/clinic/dashboard/notifications/read-all");
    } catch (error) {
      console.error("Failed to mark all notifications as read", error);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'appointment': return <Calendar className="w-4 h-4 text-blue-500" />;
      case 'patient': return <UserPlus className="w-4 h-4 text-green-500" />;
      case 'alert': return <AlertCircle className="w-4 h-4 text-orange-500" />;
      case 'success': return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case 'reminder': return <Clock className="w-4 h-4 text-purple-500" />;
      default: return <Bell className="w-4 h-4 text-slate-500" />;
    }
  };

  const formatRelativeTime = (value?: string) => {
    if (!value) return "";
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) return "";
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? "s" : ""} ago`;
  };

  useEffect(() => {
    const token = localStorage.getItem("clinicToken");
    const data = localStorage.getItem("clinicData");
    const userType = localStorage.getItem("userType");
    
    if (!token) {
      navigate(getClinicLoginPath());
      return;
    }
    
    // Fix old sessions without userType set
    if (!userType || userType !== 'clinic') {
      console.log('⚠️ Fixing clinic session: setting userType to clinic');
      localStorage.setItem('userType', 'clinic');
    }
    
    if (data) {
      setClinicData(JSON.parse(data));
    }

    const fetchNotifications = async (page: number, append = false) => {
      setIsLoadingNotifications(true);
      try {
        const response = await api.get("/clinic/dashboard/notifications", {
          params: { page, limit: notificationsPageSize },
        });
        const payload = response.data?.data;
        if (!payload) return;
        const items = (payload.items || []).map((item: any) => ({
          id: item.id,
          type: item.type || "system",
          title: item.title,
          message: item.message,
          createdAt: item.createdAt,
          read: Boolean(item.read),
          priority: item.priority,
        }));
        setNotifications((prev) => (append ? [...prev, ...items] : items));
        setNotificationsHasMore(Boolean(payload.pagination?.hasMore));
        setNotificationsPage(page);
      } catch (error) {
        console.error("Failed to load notifications", error);
      } finally {
        setIsLoadingNotifications(false);
      }
    };

    if (token) {
      fetchNotifications(1, false);
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("clinicToken");
    localStorage.removeItem("clinicData");
    localStorage.removeItem("userType");
    clearClinicSession();
    navigate(getClinicLoginPath());
  };

  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Sidebar */}
      <ClinicSidebar />

      {/* Main Content Area */}
      <div className="ml-64 transition-all duration-300">
        {/* Top Header */}
        <header className="sticky top-0 z-30 h-16 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 font-semibold">
              <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg flex items-center justify-center">
                <HeartPulse className="h-5 w-5 text-white" />
              </div>
              <span className="text-sm">Mediqzy</span>
              <span className="text-[11px] uppercase bg-teal-100 dark:bg-teal-900/50 text-teal-600 dark:text-teal-400 px-2 py-0.5 rounded-full font-semibold">Clinic</span>
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
                <Sun className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              ) : (
                <Moon className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              )}
            </Button>

            {/* Notifications */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                  {unreadCount > 0 && (
                    <Badge className="absolute -top-1 -right-1 h-5 min-w-[1.1rem] flex items-center justify-center p-0 bg-destructive text-white text-[10px]">
                      {unreadCount}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="flex items-center justify-between text-xs text-muted-foreground">
                  Notifications
                  <Button variant="ghost" size="sm" className="text-[11px] h-7" onClick={markAllAsRead}>
                    Mark all
                  </Button>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-slate-500 text-sm">
                      {isLoadingNotifications ? "Loading notifications..." : "No notifications"}
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <DropdownMenuItem 
                        key={notification.id} 
                        className="flex items-start gap-3 p-3 cursor-pointer"
                        onClick={() => markAsRead(notification.id)}
                      >
                        <div className={`p-2 rounded-md ${notification.read ? 'bg-slate-50' : 'bg-primary/10'}`}>
                          {getNotificationIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${!notification.read ? 'font-semibold' : 'font-medium'} text-slate-900`}>
                            {notification.title}
                          </p>
                          <p className="text-xs text-slate-500 truncate">{notification.message}</p>
                          <p className="text-xs text-slate-400 mt-1">{formatRelativeTime(notification.createdAt)}</p>
                        </div>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5" />
                        )}
                      </DropdownMenuItem>
                    ))
                  )}
                  {notificationsHasMore && (
                    <div className="p-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!isLoadingNotifications) {
                            const nextPage = notificationsPage + 1;
                            api
                              .get("/clinic/dashboard/notifications", {
                                params: { page: nextPage, limit: notificationsPageSize },
                              })
                              .then((response) => {
                                const payload = response.data?.data;
                                if (!payload) return;
                                const items = (payload.items || []).map((item: any) => ({
                                  id: item.id,
                                  type: item.type || "system",
                                  title: item.title,
                                  message: item.message,
                                  createdAt: item.createdAt,
                                  read: Boolean(item.read),
                                  priority: item.priority,
                                }));
                                setNotifications((prev) => [...prev, ...items]);
                                setNotificationsHasMore(Boolean(payload.pagination?.hasMore));
                                setNotificationsPage(nextPage);
                              })
                              .catch((error) => {
                                console.error("Failed to load more notifications", error);
                              });
                          }
                        }}
                        disabled={isLoadingNotifications}
                      >
                        {isLoadingNotifications ? "Loading..." : "Load more"}
                      </Button>
                    </div>
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1.5">
                  <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-full flex items-center justify-center">
                    <Building className="w-4 h-4 text-white" />
                  </div>
                  <div className="hidden md:block text-left">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {clinicData?.name || "Clinic Admin"}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Administrator</p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/clinic/settings")}>
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/clinic/support")}>
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
        <main className="p-6 min-h-[calc(100vh-4rem)]">{children}</main>
      </div>
    </div>
  );
};

export default ClinicLayout;
