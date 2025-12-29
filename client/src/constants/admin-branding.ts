/**
 * Admin Dashboard Branding Constants
 * Centralized color themes and styling for uniform admin experience
 * 
 * Primary Brand Color: Blue (#3B82F6)
 * Accent Color: Purple (#8B5CF6)
 * Success: Emerald (#10B981)
 * Warning: Amber (#F59E0B)
 * Error: Red (#EF4444)
 */

// Module category colors - consistent across sidebar and page headers
export const MODULE_COLORS = {
  // Main
  dashboard: { text: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20', gradient: 'from-blue-500 to-blue-600' },
  reports: { text: 'text-sky-500', bg: 'bg-sky-500/10', border: 'border-sky-500/20', gradient: 'from-sky-500 to-sky-600' },
  crm: { text: 'text-fuchsia-500', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/20', gradient: 'from-fuchsia-500 to-fuchsia-600' },
  
  // Users & Team
  users: { text: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/20', gradient: 'from-green-500 to-green-600' },
  healthRisk: { text: 'text-rose-500', bg: 'bg-rose-500/10', border: 'border-rose-500/20', gradient: 'from-rose-500 to-rose-600' },
  team: { text: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/20', gradient: 'from-purple-500 to-purple-600' },
  doctors: { text: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', gradient: 'from-emerald-500 to-emerald-600' },
  appointments: { text: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20', gradient: 'from-orange-500 to-orange-600' },
  
  // Healthcare Facilities
  hospitals: { text: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20', gradient: 'from-red-500 to-red-600' },
  clinics: { text: 'text-pink-500', bg: 'bg-pink-500/10', border: 'border-pink-500/20', gradient: 'from-pink-500 to-pink-600' },
  labs: { text: 'text-lime-500', bg: 'bg-lime-500/10', border: 'border-lime-500/20', gradient: 'from-lime-500 to-lime-600' },
  pharmacies: { text: 'text-teal-500', bg: 'bg-teal-500/10', border: 'border-teal-500/20', gradient: 'from-teal-500 to-teal-600' },
  ohc: { text: 'text-emerald-600', bg: 'bg-emerald-600/10', border: 'border-emerald-600/20', gradient: 'from-emerald-600 to-emerald-700' },
  
  // Corporate
  corporates: { text: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20', gradient: 'from-amber-500 to-amber-600' },
  corporatePlans: { text: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/20', gradient: 'from-purple-500 to-purple-600' },
  corporateHealth: { text: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20', gradient: 'from-red-500 to-red-600' },
  corporateEmployees: { text: 'text-blue-600', bg: 'bg-blue-600/10', border: 'border-blue-600/20', gradient: 'from-blue-600 to-blue-700' },
  
  // Services & Insurance
  plans: { text: 'text-cyan-500', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', gradient: 'from-cyan-500 to-cyan-600' },
  insurance: { text: 'text-indigo-500', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', gradient: 'from-indigo-500 to-indigo-600' },
  insurer: { text: 'text-indigo-600', bg: 'bg-indigo-600/10', border: 'border-indigo-600/20', gradient: 'from-indigo-600 to-indigo-700' },
  tpa: { text: 'text-cyan-600', bg: 'bg-cyan-600/10', border: 'border-cyan-600/20', gradient: 'from-cyan-600 to-cyan-700' },
  homecare: { text: 'text-violet-500', bg: 'bg-violet-500/10', border: 'border-violet-500/20', gradient: 'from-violet-500 to-violet-600' },
  ambulance: { text: 'text-rose-500', bg: 'bg-rose-500/10', border: 'border-rose-500/20', gradient: 'from-rose-500 to-rose-600' },
  medivac: { text: 'text-red-600', bg: 'bg-red-600/10', border: 'border-red-600/20', gradient: 'from-red-600 to-red-700' },
  ngo: { text: 'text-pink-600', bg: 'bg-pink-600/10', border: 'border-pink-600/20', gradient: 'from-pink-600 to-pink-700' },
  psu: { text: 'text-orange-600', bg: 'bg-orange-600/10', border: 'border-orange-600/20', gradient: 'from-orange-600 to-orange-700' },
  
  // Finance
  billing: { text: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', gradient: 'from-emerald-500 to-emerald-600' },
  accounting: { text: 'text-blue-600', bg: 'bg-blue-600/10', border: 'border-blue-600/20', gradient: 'from-blue-600 to-blue-700' },
  payments: { text: 'text-green-600', bg: 'bg-green-600/10', border: 'border-green-600/20', gradient: 'from-green-600 to-green-700' },
  
  // Communication
  chat: { text: 'text-blue-600', bg: 'bg-blue-600/10', border: 'border-blue-600/20', gradient: 'from-blue-600 to-blue-700' },
  email: { text: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20', gradient: 'from-orange-500 to-orange-600' },
  sms: { text: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/20', gradient: 'from-green-500 to-green-600' },
  whatsapp: { text: 'text-green-600', bg: 'bg-green-600/10', border: 'border-green-600/20', gradient: 'from-green-600 to-green-700' },
  video: { text: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20', gradient: 'from-blue-500 to-blue-600' },
  voice: { text: 'text-teal-500', bg: 'bg-teal-500/10', border: 'border-teal-500/20', gradient: 'from-teal-500 to-teal-600' },
  
  // System
  moduleAccess: { text: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20', gradient: 'from-blue-500 to-blue-600' },
  activityLog: { text: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/20', gradient: 'from-purple-500 to-purple-600' },
  automation: { text: 'text-indigo-500', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', gradient: 'from-indigo-500 to-indigo-600' },
  settings: { text: 'text-slate-500', bg: 'bg-slate-500/10', border: 'border-slate-500/20', gradient: 'from-slate-500 to-slate-600' },
} as const;

// Status badge colors - unified across all modules
export const STATUS_COLORS = {
  // General statuses
  active: { text: 'text-emerald-600', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  inactive: { text: 'text-slate-500', bg: 'bg-slate-500/10', border: 'border-slate-500/20' },
  pending: { text: 'text-amber-600', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  verified: { text: 'text-blue-600', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  unverified: { text: 'text-orange-600', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  suspended: { text: 'text-red-600', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  
  // Appointment statuses
  scheduled: { text: 'text-blue-600', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  confirmed: { text: 'text-emerald-600', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  completed: { text: 'text-green-600', bg: 'bg-green-500/10', border: 'border-green-500/20' },
  cancelled: { text: 'text-red-600', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  noShow: { text: 'text-slate-600', bg: 'bg-slate-500/10', border: 'border-slate-500/20' },
  rescheduled: { text: 'text-purple-600', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  
  // Payment statuses
  paid: { text: 'text-emerald-600', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  unpaid: { text: 'text-amber-600', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  overdue: { text: 'text-red-600', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  refunded: { text: 'text-purple-600', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  
  // Communication statuses
  sent: { text: 'text-blue-600', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  delivered: { text: 'text-emerald-600', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  failed: { text: 'text-red-600', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  read: { text: 'text-green-600', bg: 'bg-green-500/10', border: 'border-green-500/20' },
  bounced: { text: 'text-orange-600', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  
  // Result statuses  
  success: { text: 'text-emerald-600', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  warning: { text: 'text-amber-600', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  error: { text: 'text-red-600', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  info: { text: 'text-blue-600', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
} as const;

// Priority colors
export const PRIORITY_COLORS = {
  critical: { text: 'text-red-600', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  high: { text: 'text-orange-600', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  medium: { text: 'text-amber-600', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  low: { text: 'text-slate-600', bg: 'bg-slate-500/10', border: 'border-slate-500/20' },
  normal: { text: 'text-blue-600', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
} as const;

// Stat card trend colors
export const TREND_COLORS = {
  positive: { text: 'text-emerald-600', bg: 'bg-emerald-500/10' },
  negative: { text: 'text-red-600', bg: 'bg-red-500/10' },
  neutral: { text: 'text-slate-500', bg: 'bg-slate-500/10' },
} as const;

// Page header standard styles
export const PAGE_HEADER_STYLES = {
  // Icon container style (gradient background)
  iconContainer: 'p-3 rounded-xl bg-gradient-to-br border shadow-sm',
  iconSize: 'h-6 w-6',
  // Title styles
  title: 'text-2xl md:text-3xl font-bold tracking-tight text-foreground',
  description: 'text-muted-foreground text-sm md:text-base',
} as const;

// Card styles for uniformity
export const CARD_STYLES = {
  // Standard card
  default: 'bg-card border border-border/50 shadow-sm hover:shadow-md transition-shadow',
  // Stats card
  stat: 'bg-card border border-border/50 shadow-sm',
  // Highlighted card
  highlighted: 'bg-gradient-to-br from-blue-500/5 to-purple-500/5 border border-blue-500/20',
  // Coming soon / placeholder
  placeholder: 'border-dashed border-2',
} as const;

// Button styles
export const BUTTON_STYLES = {
  // Primary action
  primary: 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-sm',
  // Secondary action
  secondary: 'bg-accent hover:bg-accent/80 text-accent-foreground',
  // Destructive action
  destructive: 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white',
  // Success action
  success: 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white',
} as const;

// Tab styles
export const TAB_STYLES = {
  list: 'bg-muted/50 p-1 rounded-lg',
  trigger: 'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm rounded-md px-3 py-1.5 text-sm font-medium transition-all',
} as const;

// Badge variants for consistency
export const BADGE_VARIANTS = {
  default: 'bg-primary/10 text-primary border-primary/20',
  secondary: 'bg-secondary text-secondary-foreground',
  outline: 'border border-border text-muted-foreground',
  success: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  error: 'bg-red-500/10 text-red-600 border-red-500/20',
  info: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  new: 'bg-blue-500 text-white',
} as const;

// Export helper function to get module colors
export function getModuleColors(moduleKey: keyof typeof MODULE_COLORS) {
  return MODULE_COLORS[moduleKey] || MODULE_COLORS.dashboard;
}

// Export helper function to get status colors
export function getStatusColors(status: string) {
  const normalizedStatus = status.toLowerCase().replace(/[\s-]/g, '') as keyof typeof STATUS_COLORS;
  return STATUS_COLORS[normalizedStatus] || STATUS_COLORS.info;
}

// Export helper function to get priority colors
export function getPriorityColors(priority: string) {
  const normalizedPriority = priority.toLowerCase() as keyof typeof PRIORITY_COLORS;
  return PRIORITY_COLORS[normalizedPriority] || PRIORITY_COLORS.normal;
}
