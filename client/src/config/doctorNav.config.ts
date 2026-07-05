import type { LucideIcon } from 'lucide-react';
import {
  Home, Calendar, Users, FileText, AlertTriangle, Pill, FilePlus2, BrainCircuit,
  Sparkles, Mic, Calculator, MessageSquare, Video, Phone, Radio, Briefcase, Wallet,
  Clock, BarChart3, FileSearch, Settings, UserCircle, Bell, HeartPulse,
} from 'lucide-react';

export interface DoctorNavItem {
  icon: LucideIcon;
  label: string;
  path: string;
  category: string;
  highlight?: boolean;
  subItems?: { label: string; path: string }[];
}

/** Doctor portal navigation — shared by MainLayoutdoctor & DoctorSidebar */
export const DOCTOR_NAV_ITEMS: DoctorNavItem[] = [
  { icon: Home, label: 'Dashboard', path: '/doctor/dashboard', category: 'Main' },
  { icon: UserCircle, label: 'My Profile', path: '/doctor/settings', category: 'Main' },
  { icon: Bell, label: 'Notifications', path: '/doctor/alerts', category: 'Main' },
  { icon: Users, label: 'My Patients', path: '/doctor/patients', category: 'Patient Care' },
  { icon: HeartPulse, label: 'HealthOS Platform', path: '/doctor/healthos', category: 'Patient Care', highlight: true },
  { icon: Sparkles, label: 'Hospital Copilot', path: '/doctor/copilot', category: 'Patient Care' },
  { icon: Calendar, label: 'Appointments', path: '/doctor/appointments', category: 'Patient Care' },
  { icon: FileText, label: 'Health Records', path: '/doctor/health-records', category: 'Patient Care' },
  { icon: AlertTriangle, label: 'Emergency Triage', path: '/doctor/triage', category: 'Patient Care', highlight: true },
  { icon: Pill, label: 'Write Prescription', path: '/doctor/prescription-writer', category: 'Clinical Tools' },
  { icon: FileText, label: 'Prescriptions', path: '/doctor/prescriptions', category: 'Clinical Tools' },
  {
    icon: FilePlus2,
    label: 'Document Templates',
    path: '/doctor/templates',
    category: 'Clinical Tools',
    subItems: [
      { label: 'All Templates', path: '/doctor/templates' },
      { label: 'Specialty Templates', path: '/doctor/specialty-templates' },
      { label: 'Template Settings', path: '/doctor/template-settings' },
    ],
  },
  { icon: BrainCircuit, label: 'AI Doctor Assist', path: '/doctor/assist', category: 'Clinical Tools', highlight: true },
  { icon: Sparkles, label: 'iSHA Assistant', path: '/doctor/assistant', category: 'Clinical Tools', highlight: true },
  { icon: Mic, label: 'Voice Scribe', path: '/doctor/voice-scribe', category: 'Clinical Tools', highlight: true },
  { icon: Calculator, label: 'Medical Calculators', path: '/doctor/calculators', category: 'Clinical Tools' },
  { icon: MessageSquare, label: 'Messages', path: '/doctor/messages', category: 'Communication' },
  { icon: Video, label: 'Video Consultation', path: '/doctor/video', category: 'Communication' },
  { icon: Phone, label: 'Contact', path: '/doctor/contact', category: 'Communication' },
  { icon: Radio, label: 'Remote Monitoring', path: '/doctor/remote-monitoring', category: 'Monitoring', highlight: true },
  { icon: Briefcase, label: 'Services', path: '/doctor/services', category: 'Management', highlight: true },
  { icon: Wallet, label: 'Billing & Payments', path: '/doctor/billing', category: 'Management' },
  { icon: Clock, label: 'Availability', path: '/doctor/availability', category: 'Management' },
  { icon: BarChart3, label: 'Analytics', path: '/doctor/analytics', category: 'Management' },
  { icon: FileSearch, label: 'Reports', path: '/doctor/reports', category: 'Management' },
  { icon: Settings, label: 'Settings', path: '/doctor/settings', category: 'Management' },
];

export const DOCTOR_NAV_CATEGORIES = ['Main', 'Patient Care', 'Clinical Tools', 'Communication', 'Monitoring', 'Management'];
