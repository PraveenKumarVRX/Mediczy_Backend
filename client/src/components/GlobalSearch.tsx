import { rankPageSearch } from '@/utils/page-search';
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Home,
  Calendar,
  Bot,
  HeartPulse,
  Stethoscope,
  Pill,
  FileText,
  Shield,
  Wallet,
  Apple,
  Activity,
  User,
  Video,
  Search,
  AlertCircle,
  Brain,
  Building2,
  Crown,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

interface SearchItem {
  label: string;
  path: string;
  icon: import("lucide-react").LucideIcon;
  keywords: string[];
  group: string;
}

const searchItems: SearchItem[] = [
  // Quick Actions
  { label: "Home", path: "/", icon: Home, keywords: ["dashboard", "home", "main"], group: "Navigate" },
  { label: "AI Doctor (Dr. iSHA)", path: "/ai-doctor", icon: Bot, keywords: ["ai", "chat", "doctor", "isha", "ask", "symptom"], group: "Quick Actions" },
  { label: "Book Appointment", path: "/doctors", icon: Calendar, keywords: ["book", "appointment", "doctor", "schedule", "consult"], group: "Quick Actions" },
  { label: "Emergency", path: "/emergency", icon: AlertCircle, keywords: ["emergency", "sos", "help", "urgent", "112"], group: "Quick Actions" },
  { label: "Video Consultation", path: "/consultation", icon: Video, keywords: ["video", "call", "telemedicine", "online"], group: "Quick Actions" },

  // Health
  { label: "AI Health Dashboard", path: "/smart-health", icon: Brain, keywords: ["ai", "health", "score", "risk", "dashboard", "smart"], group: "Health" },
  { label: "AI Report Scanner", path: "/report-scanner", icon: FileText, keywords: ["scan", "report", "upload", "lab", "xray", "analyze", "photo"], group: "Quick Actions" },
  { label: "AI Symptom Triage", path: "/symptom-checker", icon: Stethoscope, keywords: ["symptom", "triage", "check", "pain", "esi", "emergency", "assess"], group: "Quick Actions" },
  { label: "Health Dashboard", path: "/health-dashboard", icon: HeartPulse, keywords: ["health", "dashboard", "vitals", "stats"], group: "Health" },
  { label: "Health Tracker", path: "/health-tracker", icon: Activity, keywords: ["tracker", "steps", "sleep", "heart", "vitals"], group: "Health" },
  { label: "Symptom Checker", path: "/symptoms", icon: Brain, keywords: ["symptoms", "check", "log", "track"], group: "Health" },
  { label: "Health Risk Assessment", path: "/health-risk-assessment", icon: Shield, keywords: ["risk", "assessment", "hra", "score"], group: "Health" },
  { label: "Health Intelligence", path: "/health-intelligence", icon: Sparkles, keywords: ["intelligence", "insights", "ai", "reminders"], group: "Health" },

  // Services
  { label: "Find Doctors", path: "/doctors", icon: Stethoscope, keywords: ["find", "doctor", "specialist", "search"], group: "Services" },
  { label: "Find Clinics", path: "/patient/network-clinics", icon: Building2, keywords: ["clinic", "near", "find", "network"], group: "Services" },
  { label: "Medicine & Pharmacy", path: "/medicine", icon: Pill, keywords: ["medicine", "pharmacy", "drug", "medication"], group: "Services" },
  { label: "Diet & Nutrition", path: "/diet", icon: Apple, keywords: ["diet", "nutrition", "food", "calories", "meal"], group: "Services" },
  { label: "Lab Tests", path: "/patient/lab-tests", icon: FileText, keywords: ["lab", "test", "blood", "reports"], group: "Services" },

  // My Stuff
  { label: "My Appointments", path: "/appointments", icon: Calendar, keywords: ["my", "appointments", "bookings", "upcoming"], group: "My Account" },
  { label: "My Prescriptions", path: "/my-prescriptions", icon: FileText, keywords: ["prescription", "medicine", "rx"], group: "My Account" },
  { label: "My Reports", path: "/patient/my-reports", icon: FileText, keywords: ["reports", "results", "lab"], group: "My Account" },
  { label: "Wallet & Rewards", path: "/wallet", icon: Wallet, keywords: ["wallet", "coins", "rewards", "streak", "money"], group: "My Account" },
  { label: "Membership Plans", path: "/my-plans", icon: Crown, keywords: ["plan", "membership", "premium", "upgrade"], group: "My Account" },
  { label: "Profile", path: "/profile", icon: User, keywords: ["profile", "settings", "account", "personal"], group: "My Account" },
  { label: "Health Diary", path: "/health-diary", icon: FileText, keywords: ["diary", "journal", "notes", "daily"], group: "My Account" },
];

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [query, setQuery] = useState("");

  // Ctrl+K / Cmd+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSelect = useCallback(
    (path: string) => {
      setOpen(false);
      navigate(path);
    },
    [navigate]
  );

  const term = query.trim().toLowerCase();
  const rankedItems = rankPageSearch(searchItems, query);
  const groups = term ? { Results: rankedItems } : rankedItems.reduce<Record<string, SearchItem[]>>((acc, item) => {
    (acc[item.group] ||= []).push(item);
    return acc;
  }, {});

  return (
    <>
      {/* Search Trigger Button — shown in header */}
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="hidden md:inline-flex items-center gap-2 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-teal-300 dark:hover:border-teal-600 hover:text-teal-600 dark:hover:text-teal-400 h-9 px-3"
      >
        <Search className="w-4 h-4" />
        <span className="text-sm">Search…</span>
        <kbd className="ml-2 pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      {/* Mobile search icon */}
      {isMobile && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Search className="h-5 w-5" />
        </Button>
      )}

      {/* Command Palette Dialog */}
      <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
        <CommandInput value={query} onValueChange={setQuery} placeholder="Search pages, features, or actions..." />
        <CommandList>
          <CommandEmpty>
            <div className="py-4 text-center">
              <p className="text-sm text-slate-500">No results found.</p>
              <p className="text-xs text-slate-400 mt-1">Try searching for "doctor", "appointment", or "health"</p>
            </div>
          </CommandEmpty>
          {Object.entries(groups).map(([group, items], idx) => (
            <div key={group}>
              {idx > 0 && <CommandSeparator />}
              <CommandGroup heading={group}>
                {items.map((item) => (
                  <CommandItem
                    key={item.path + item.label}
                    value={`${item.label} ${item.keywords.join(" ")}`}
                    onSelect={() => handleSelect(item.path)}
                    className="cursor-pointer"
                  >
                    <item.icon className="mr-2 h-4 w-4 text-slate-500" />
                    <span>{item.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </div>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}

export default GlobalSearch;
