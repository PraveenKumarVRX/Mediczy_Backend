import { Link, useLocation } from "react-router-dom";
import { Home, User, Calendar, Activity, Bot, Scan } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { motion } from "framer-motion";

const navItems = [
  { icon: Home, label: "Home", path: "/" },
  { icon: Calendar, label: "Bookings", path: "/appointments" },
  { icon: Bot, label: "Dr. iSHA", path: "/ai-doctor", highlight: true },
  { icon: Activity, label: "Health", path: "/smart-health" },
  { icon: User, label: "Profile", path: "/profile" },
];

export function Navigation() {
  const location = useLocation();
  const isMobile = useIsMobile();

  if (!isMobile) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200/80 dark:border-slate-700/50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-[0_-4px_16px_rgba(0,0,0,0.06)] px-1 pb-[env(safe-area-inset-bottom)]">
      <nav className="flex items-center justify-around py-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const isHighlight = item.highlight;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "relative flex flex-col items-center rounded-xl px-3 py-1.5 text-sm transition-all duration-200",
                isActive
                  ? "text-teal-600 dark:text-teal-400"
                  : isHighlight
                    ? "text-teal-500 dark:text-teal-400"
                    : "text-slate-500 dark:text-slate-400"
              )}
            >
              {/* Active indicator pill */}
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute -top-1 left-1/2 -translate-x-1/2 w-6 h-1 rounded-full bg-teal-500"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}

              <div className={cn(
                "relative",
                isHighlight && !isActive && "p-1.5 -mt-3 rounded-full bg-gradient-to-br from-teal-500 to-teal-600 shadow-lg shadow-teal-500/30"
              )}>
                <item.icon className={cn(
                  "h-5 w-5 transition-transform duration-200",
                  isActive && "scale-110",
                  isHighlight && !isActive && "text-white h-4 w-4"
                )} />
                {isHighlight && !isActive && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-400 border border-white dark:border-slate-900" />
                )}
              </div>
              <span className={cn(
                "text-[10px] mt-0.5 font-medium",
                isHighlight && !isActive && "mt-1"
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
