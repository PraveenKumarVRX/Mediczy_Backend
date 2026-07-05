import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  HeartPulse,
  Users,
  Sparkles,
  Bed,
  ClipboardList,
  Activity,
  Stethoscope,
  Pill,
  ScanLine,
  Siren,
  BookOpen,
  Cpu,
} from 'lucide-react';

export interface ClinicalNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  capability?: string;
  hospitalOnly?: boolean;
}

export interface ClinicalNavSection {
  section: string;
  items: ClinicalNavItem[];
}

/** Hospital portal — HealthOS + ward ops (§9 clinicalNav.config) */
export const HOSPITAL_HEALTHOS_NAV: ClinicalNavSection[] = [
  {
    section: 'HealthOS',
    items: [
      { label: 'Command Center', href: '/hospital/command-center', icon: LayoutDashboard, capability: 'opd_ipd', hospitalOnly: true },
      { label: 'HealthOS Platform', href: '/hospital/healthos', icon: HeartPulse, capability: 'ehr' },
      { label: 'MDT Inbox', href: '/hospital/mdt/inbox', icon: Users, capability: 'ehr', hospitalOnly: true },
      { label: 'Hospital Copilot', href: '/hospital/copilot', icon: Sparkles, capability: 'ehr' },
      { label: 'Hospital OS 2035', href: '/hospital/os', icon: Cpu, capability: 'ehr', hospitalOnly: true },
      { label: 'Case Library', href: '/hospital/knowledge/cases', icon: BookOpen, capability: 'ehr', hospitalOnly: true },
      { label: 'Federation', href: '/hospital/federation', icon: HeartPulse, capability: 'ehr', hospitalOnly: true },
      { label: 'Referrals', href: '/hospital/referrals', icon: Users, capability: 'ehr', hospitalOnly: true },
      { label: 'Marketplace', href: '/hospital/marketplace', icon: Sparkles, capability: 'ehr', hospitalOnly: true },
      { label: 'Research Hub', href: '/hospital/research', icon: Activity, capability: 'ehr', hospitalOnly: true },
      { label: 'Home Care / RPM', href: '/hospital/home-care', icon: HeartPulse, capability: 'ehr', hospitalOnly: true },
    ],
  },
  {
    section: 'Ward Operations',
    items: [
      { label: 'Bed Map', href: '/hospital/beds/map', icon: Bed, capability: 'bed_management', hospitalOnly: true },
      { label: 'eMAR', href: '/hospital/emar', icon: Pill, capability: 'pharmacy', hospitalOnly: true },
      { label: 'Discharge Board', href: '/hospital/discharge-board', icon: ClipboardList, capability: 'opd_ipd', hospitalOnly: true },
      { label: 'Nursing Tasks', href: '/hospital/patients', icon: ClipboardList, capability: 'patients' },
    ],
  },
  {
    section: 'Departments',
    items: [
      { label: 'ICU Board', href: '/hospital/icu-board', icon: Activity, capability: 'opd_ipd', hospitalOnly: true },
      { label: 'OT Command', href: '/hospital/ot/command-center', icon: Stethoscope, capability: 'opd_ipd', hospitalOnly: true },
      { label: 'ER Queue', href: '/hospital/er/queue', icon: Siren, capability: 'opd_ipd', hospitalOnly: true },
      { label: 'Radiology', href: '/hospital/radiology', icon: ScanLine, capability: 'ehr', hospitalOnly: true },
      { label: 'Pharmacy Dispense', href: '/hospital/pharmacy-dispense', icon: Pill, capability: 'pharmacy', hospitalOnly: true },
    ],
  },
];

/** Doctor portal — collaborative HealthOS surfaces */
export const DOCTOR_HEALTHOS_NAV: ClinicalNavItem[] = [
  { label: 'HealthOS Platform', href: '/doctor/healthos', icon: HeartPulse },
  { label: 'Hospital Copilot', href: '/doctor/copilot', icon: Sparkles },
  { label: 'My Patients', href: '/doctor/patients', icon: Users },
];

export interface WorkspaceNavItem {
  key: string;
  label: string;
  segment: string;
  icon: LucideIcon;
}

/** Left rail inside ClinicalShell — patient workspace sections */
export const WORKSPACE_NAV: WorkspaceNavItem[] = [
  { key: 'overview', label: 'Overview', segment: '', icon: LayoutDashboard },
  { key: 'timeline', label: 'Clinical Timeline', segment: 'timeline', icon: Activity },
  { key: 'team', label: 'Care Team', segment: 'team', icon: Users },
  { key: 'ai-team', label: 'AI Care Team', segment: 'ai-team', icon: Sparkles },
  { key: 'tasks', label: 'Tasks', segment: 'tasks', icon: ClipboardList },
  { key: 'pathway', label: 'Treatment Pathway', segment: 'pathway', icon: HeartPulse },
  { key: 'monitoring', label: 'Monitoring', segment: 'monitoring', icon: Activity },
  { key: 'results', label: 'Labs & Imaging', segment: 'results', icon: ScanLine },
  { key: 'playback', label: 'Clinical Playback', segment: 'playback', icon: Activity },
  { key: 'mdt', label: 'Clinical Board', segment: 'mdt', icon: Users },
  { key: 'family', label: 'Family', segment: 'family', icon: HeartPulse },
  { key: 'documents', label: 'Documents', segment: 'documents', icon: ClipboardList },
  { key: 'similar-cases', label: 'Similar Cases', segment: 'similar-cases', icon: BookOpen },
  { key: 'ecosystem', label: 'Ecosystem', segment: 'ecosystem', icon: HeartPulse },
];
