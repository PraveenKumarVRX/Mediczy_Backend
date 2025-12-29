/**
 * Corporate Portal Branding Constants
 * Consistent design system for all corporate portal pages
 */

// Primary Colors - Blue theme for corporate/professional look
export const CORPORATE_COLORS = {
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
  },
  accent: {
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',
    500: '#22c55e',
    600: '#16a34a',
  },
  warning: {
    50: '#fffbeb',
    100: '#fef3c7',
    400: '#fbbf24',
    500: '#f59e0b',
    600: '#d97706',
  },
  danger: {
    50: '#fef2f2',
    100: '#fee2e2',
    400: '#f87171',
    500: '#ef4444',
    600: '#dc2626',
  }
};

// Module-specific colors
export const MODULE_COLORS: Record<string, { bg: string; text: string; icon: string; border: string; gradient: string }> = {
  dashboard: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    icon: 'text-blue-600',
    border: 'border-blue-200',
    gradient: 'from-blue-600 to-indigo-700',
  },
  employees: {
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    icon: 'text-teal-600',
    border: 'border-teal-200',
    gradient: 'from-teal-500 to-teal-700',
  },
  appointments: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    icon: 'text-purple-600',
    border: 'border-purple-200',
    gradient: 'from-purple-500 to-purple-700',
  },
  healthAnalysis: {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    icon: 'text-rose-600',
    border: 'border-rose-200',
    gradient: 'from-rose-500 to-rose-700',
  },
  riskMonitor: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    icon: 'text-amber-600',
    border: 'border-amber-200',
    gradient: 'from-amber-500 to-orange-600',
  },
  departments: {
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    icon: 'text-indigo-600',
    border: 'border-indigo-200',
    gradient: 'from-indigo-500 to-indigo-700',
  },
  benefits: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    icon: 'text-emerald-600',
    border: 'border-emerald-200',
    gradient: 'from-emerald-500 to-emerald-700',
  },
  claims: {
    bg: 'bg-cyan-50',
    text: 'text-cyan-700',
    icon: 'text-cyan-600',
    border: 'border-cyan-200',
    gradient: 'from-cyan-500 to-cyan-700',
  },
  reports: {
    bg: 'bg-violet-50',
    text: 'text-violet-700',
    icon: 'text-violet-600',
    border: 'border-violet-200',
    gradient: 'from-violet-500 to-violet-700',
  },
  complaints: {
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    icon: 'text-orange-600',
    border: 'border-orange-200',
    gradient: 'from-orange-500 to-orange-700',
  },
  compliance: {
    bg: 'bg-slate-50',
    text: 'text-slate-700',
    icon: 'text-slate-600',
    border: 'border-slate-200',
    gradient: 'from-slate-600 to-slate-800',
  },
  settings: {
    bg: 'bg-gray-50',
    text: 'text-gray-700',
    icon: 'text-gray-600',
    border: 'border-gray-200',
    gradient: 'from-gray-600 to-gray-800',
  },
  help: {
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    icon: 'text-sky-600',
    border: 'border-sky-200',
    gradient: 'from-sky-500 to-sky-700',
  },
  notifications: {
    bg: 'bg-pink-50',
    text: 'text-pink-700',
    icon: 'text-pink-600',
    border: 'border-pink-200',
    gradient: 'from-pink-500 to-pink-700',
  },
};

// Status colors for badges
export const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  // Health status
  excellent: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300' },
  good: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
  moderate: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
  poor: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
  
  // General status
  active: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
  inactive: { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300' },
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
  approved: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
  rejected: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
  processing: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  paid: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300' },
  
  // Appointment status
  scheduled: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  completed: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
  'no-show': { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
  
  // Complaint/Ticket status
  open: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  'in-progress': { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300' },
  resolved: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
  closed: { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300' },
};

// Risk level colors
export const RISK_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  critical: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300', dot: 'bg-red-500' },
  high: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300', dot: 'bg-orange-500' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300', dot: 'bg-yellow-500' },
  low: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300', dot: 'bg-green-500' },
};

// Priority colors
export const PRIORITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  urgent: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
  high: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
  low: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
};

// Helper functions
export const getStatusColor = (status: string) => {
  return STATUS_COLORS[status?.toLowerCase()] || STATUS_COLORS.inactive;
};

export const getRiskColor = (risk: string) => {
  return RISK_COLORS[risk?.toLowerCase()] || RISK_COLORS.low;
};

export const getPriorityColor = (priority: string) => {
  return PRIORITY_COLORS[priority?.toLowerCase()] || PRIORITY_COLORS.medium;
};

export const getModuleColor = (module: string) => {
  return MODULE_COLORS[module] || MODULE_COLORS.dashboard;
};
