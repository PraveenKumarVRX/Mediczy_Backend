import type { LucideIcon } from 'lucide-react';
import {
  Home, Calendar, Users, FileText, AlertTriangle, FilePlus2,
  Sparkles, Calculator, MessageSquare, Video, Wallet, Clock,
  BarChart3, UserCircle, Bell, HeartPulse, ScanLine, ClipboardList,
  BrainCircuit, LayoutGrid,
} from 'lucide-react';

export interface DoctorNavItem {
  icon: LucideIcon;
  label: string;
  path: string;
  category: string;
  highlight?: boolean;
  hospitalOnly?: boolean;
  subItems?: { label: string; path: string }[];
}

/**
 * Doctor portal navigation — reduced IA (~14 top-level items + submenus).
 * Hospital category items are gated via filterDoctorNavItems().
 */
export const DOCTOR_NAV_ITEMS: DoctorNavItem[] = [
  // Main
  { icon: Home, label: 'Dashboard', path: '/doctor/dashboard', category: 'Main' },
  { icon: UserCircle, label: 'My Profile', path: '/doctor/settings', category: 'Main' },
  { icon: Bell, label: 'Notifications', path: '/doctor/alerts', category: 'Main' },

  // Patients
  { icon: Users, label: 'My Patients', path: '/doctor/patients', category: 'Patients' },
  { icon: Calendar, label: 'Appointments', path: '/doctor/appointments', category: 'Patients' },
  { icon: AlertTriangle, label: 'Emergency Triage', path: '/doctor/triage', category: 'Patients', highlight: true },

  // Clinical
  { icon: ClipboardList, label: 'Clinical Notes', path: '/doctor/clinical-workspace', category: 'Clinical' },
  { icon: FileText, label: 'Prescriptions', path: '/doctor/prescriptions', category: 'Clinical' },
  { icon: HeartPulse, label: 'Health Monitoring', path: '/doctor/health-monitoring', category: 'Clinical' },
  {
    icon: FilePlus2,
    label: 'Document Templates',
    path: '/doctor/templates',
    category: 'Clinical',
    subItems: [
      { label: 'All Templates', path: '/doctor/templates' },
      { label: 'Specialty Templates', path: '/doctor/specialty-templates' },
    ],
  },

  // Connect
  { icon: MessageSquare, label: 'Messages', path: '/doctor/messages', category: 'Connect' },
  { icon: Video, label: 'Video Consultation', path: '/doctor/video', category: 'Connect' },

  // Practice
  { icon: Clock, label: 'Availability', path: '/doctor/availability', category: 'Practice' },
  { icon: Wallet, label: 'Billing & Payments', path: '/doctor/billing', category: 'Practice' },
  { icon: BarChart3, label: 'Practice Insights', path: '/doctor/insights', category: 'Practice' },

  // AI
  { icon: BrainCircuit, label: 'AI Hub', path: '/doctor/ai-hub', category: 'AI', highlight: true },

  // Hospital (affiliated doctors only)
  { icon: HeartPulse, label: 'Hospital Platform', path: '/doctor/healthos', category: 'Hospital', hospitalOnly: true },
  { icon: Sparkles, label: 'Hospital Copilot', path: '/doctor/copilot', category: 'Hospital', hospitalOnly: true },

  // More
  { icon: Calculator, label: 'Medical Calculators', path: '/doctor/calculators', category: 'More' },
  {
    icon: ScanLine,
    label: 'Advanced',
    path: '/doctor/imaging',
    category: 'More',
    subItems: [
      { label: 'Medical Imaging', path: '/doctor/imaging' },
      { label: 'Webinars', path: '/doctor/webinars' },
    ],
  },
];

export const DOCTOR_NAV_CATEGORIES = ['Main', 'Patients', 'Clinical', 'Connect', 'Practice', 'AI', 'Hospital', 'More'];

/** Categories that only render for hospital-affiliated doctors */
export const HOSPITAL_NAV_CATEGORIES = new Set(['Hospital']);
