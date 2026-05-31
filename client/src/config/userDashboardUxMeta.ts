export type UxTier = "Needs Work" | "Good" | "Worldclass";

export interface UserDashboardUxMeta {
  path: string;
  category: "Main" | "Health" | "Appointments" | "Records" | "Services" | "Finance" | "Family" | "Support";
  title: string;
  subtitle: string;
  uxTier: UxTier;
  uxScore: number;
}

export const USER_DASHBOARD_UX_META: UserDashboardUxMeta[] = [
  { path: "/", category: "Main", title: "Dashboard", subtitle: "Your full health snapshot and next best actions.", uxTier: "Good", uxScore: 84 },
  { path: "/profile", category: "Main", title: "My Profile", subtitle: "Manage personal details, care preferences, and identity data.", uxTier: "Good", uxScore: 80 },
  { path: "/patient/notifications", category: "Main", title: "Notifications", subtitle: "Time-critical reminders and personalized care updates.", uxTier: "Good", uxScore: 82 },

  { path: "/health-dashboard", category: "Health", title: "Health Dashboard", subtitle: "Vitals, trends, and risk indicators in one view.", uxTier: "Good", uxScore: 83 },
  { path: "/health-intelligence", category: "Health", title: "Health Intelligence", subtitle: "AI-driven insights with transparent recommendations.", uxTier: "Good", uxScore: 81 },
  { path: "/sib-control", category: "Health", title: "SIB Control", subtitle: "System-level controls and protected health operations.", uxTier: "Needs Work", uxScore: 72 },
  { path: "/health-diary", category: "Health", title: "Health Diary", subtitle: "Daily tracking with meaningful progress narratives.", uxTier: "Good", uxScore: 79 },
  { path: "/health-risk-assessment", category: "Health", title: "Health Risk Assessment", subtitle: "Assess risk and get actionable prevention plans.", uxTier: "Good", uxScore: 82 },
  { path: "/wellness-rewards", category: "Health", title: "Wellness & Rewards", subtitle: "Build healthy habits and unlock benefits.", uxTier: "Good", uxScore: 78 },
  { path: "/wellness-calendar", category: "Health", title: "Wellness Calendar", subtitle: "Planned wellness actions with smart reminders.", uxTier: "Good", uxScore: 77 },
  { path: "/diet", category: "Health", title: "Diet Plans", subtitle: "Structured meal guidance for your health goals.", uxTier: "Good", uxScore: 79 },
  { path: "/ai-doctor", category: "Health", title: "AI Doctor", subtitle: "Guided AI interactions with clinical safety boundaries.", uxTier: "Good", uxScore: 80 },
  { path: "/patient/watch-analytics", category: "Health", title: "Wearables Analytics", subtitle: "Wearable-driven trend intelligence and alerts.", uxTier: "Good", uxScore: 81 },

  { path: "/appointments", category: "Appointments", title: "My Appointments", subtitle: "Upcoming bookings, status, and preparation details.", uxTier: "Good", uxScore: 85 },
  { path: "/doctors", category: "Appointments", title: "Find & Book Doctor", subtitle: "Discover trusted clinicians and book with confidence.", uxTier: "Good", uxScore: 86 },
  { path: "/my-prescriptions", category: "Appointments", title: "My Prescriptions", subtitle: "Medication timeline with refill and adherence context.", uxTier: "Good", uxScore: 80 },

  { path: "/patient/lab-tests", category: "Records", title: "Lab Tests", subtitle: "Book and track diagnostics with clear turnaround info.", uxTier: "Good", uxScore: 83 },
  { path: "/patient/my-reports", category: "Records", title: "My Reports", subtitle: "Unified report archive with readable summaries.", uxTier: "Good", uxScore: 82 },
  { path: "/reposts", category: "Records", title: "Scan & Share Reports", subtitle: "Digitize and share medical documents quickly.", uxTier: "Good", uxScore: 78 },

  { path: "/ayushman", category: "Services", title: "Ayushman", subtitle: "Eligibility, benefits, and support for scheme usage.", uxTier: "Needs Work", uxScore: 74 },
  { path: "/health-feed", category: "Services", title: "Health Feed", subtitle: "Curated health education and timely explainers.", uxTier: "Good", uxScore: 77 },
  { path: "/emergency", category: "Services", title: "Emergency", subtitle: "Rapid response guidance with trust-first messaging.", uxTier: "Good", uxScore: 84 },

  { path: "/wallet", category: "Finance", title: "Wallet", subtitle: "Health Coins balance, offers, and transaction clarity.", uxTier: "Good", uxScore: 88 },
  { path: "/my-plans", category: "Finance", title: "Membership Plans", subtitle: "Plan details, renewals, and benefit transparency.", uxTier: "Good", uxScore: 84 },
  { path: "/membership-card", category: "Finance", title: "My Membership Card", subtitle: "Portable identity for care and benefits access.", uxTier: "Good", uxScore: 79 },
  { path: "/benefits", category: "Finance", title: "Smart Benefits", subtitle: "Discover and apply personalized benefits fast.", uxTier: "Good", uxScore: 80 },
  { path: "/claims-express", category: "Finance", title: "Claims Express", subtitle: "Submit and track claims with reduced friction.", uxTier: "Good", uxScore: 81 },
  { path: "/billing/orders", category: "Finance", title: "Order History", subtitle: "Order history temporarily unavailable — API migration pending.", uxTier: "Needs Work", uxScore: 0 },
  { path: "/billing/invoices", category: "Finance", title: "My Invoices", subtitle: "Invoices with clear totals and downloadable records.", uxTier: "Good", uxScore: 82 },
  { path: "/my-insurance", category: "Finance", title: "My Insurance", subtitle: "Policy coverage, utilization, and claims view.", uxTier: "Good", uxScore: 80 },

  { path: "/family-hub", category: "Family", title: "Family Health Hub", subtitle: "Manage family profiles and collective care actions.", uxTier: "Good", uxScore: 79 },

  { path: "/help", category: "Support", title: "Help & Support", subtitle: "Self-serve help with escalation pathways.", uxTier: "Good", uxScore: 80 },
  { path: "/contact-us", category: "Support", title: "Contact Us", subtitle: "Multi-channel support entry with SLA expectations.", uxTier: "Good", uxScore: 78 }
];

const fallbackMeta: UserDashboardUxMeta = {
  path: "*",
  category: "Main",
  title: "User Experience",
  subtitle: "Designed for clarity, confidence, and speed.",
  uxTier: "Good",
  uxScore: 80
};

export const getUserDashboardUxMeta = (pathname: string): UserDashboardUxMeta => {
  const direct = USER_DASHBOARD_UX_META.find((entry) => entry.path === pathname);
  if (direct) return direct;

  const partial = USER_DASHBOARD_UX_META.find(
    (entry) => entry.path !== "/" && pathname.startsWith(entry.path)
  );

  return partial || fallbackMeta;
};
