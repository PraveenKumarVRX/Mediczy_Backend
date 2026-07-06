import type { LucideIcon } from 'lucide-react';
import {
  Mic,
  ClipboardCheck,
  FileAudio,
  Building2,
  User,
  FlaskConical,
  Network,
  Home,
  HeartPulse,
  Radio,
  Languages,
  Users,
  Route,
  Pill,
  Stethoscope,
  Video,
  Microscope,
  Landmark,
  BarChart3,
  Bot,
  Map,
  Navigation,
  Monitor,
} from 'lucide-react';

export interface HospitalOsNavItem {
  key: string;
  label: string;
  segment: string;
  icon: LucideIcon;
  phase: number;
}

export interface HospitalOsNavSection {
  phase: number;
  title: string;
  items: HospitalOsNavItem[];
}

const BASE = '/hospital/os';

export function hospitalOsPath(segment: string) {
  if (!segment) return BASE;
  return `${BASE}/${segment}`;
}

/** Phases 4–10 — Hospital OS 2035 advanced surfaces (Pillars 4–20, Wave 4) */
export const HOSPITAL_OS_NAV: HospitalOsNavSection[] = [
  {
    phase: 4,
    title: 'Phase 4 — Voice & Documentation',
    items: [
      { key: 'voice', label: 'Voice Commands', segment: 'voice', icon: Mic, phase: 4 },
      { key: 'approvals', label: 'Approval Inbox', segment: 'approvals', icon: ClipboardCheck, phase: 4 },
      { key: 'ambient', label: 'Ambient Documentation', segment: 'ambient', icon: FileAudio, phase: 4 },
    ],
  },
  {
    phase: 5,
    title: 'Phase 5 — Digital Twins',
    items: [
      { key: 'twin-hospital', label: 'Hospital Twin', segment: 'twin/hospital', icon: Building2, phase: 5 },
      { key: 'twin-patient', label: 'Patient Twin', segment: 'twin/patient', icon: User, phase: 5 },
      { key: 'simulator', label: 'What-If Simulator', segment: 'simulator', icon: FlaskConical, phase: 5 },
      { key: 'knowledge-graph', label: 'Knowledge Graph', segment: 'knowledge-graph', icon: Network, phase: 5 },
    ],
  },
  {
    phase: 6,
    title: 'Phase 6 — Smart Care',
    items: [
      { key: 'smart-rooms', label: 'Smart Rooms', segment: 'smart-rooms', icon: Home, phase: 6 },
      { key: 'handover', label: 'Nurse Handover', segment: 'nursing/handover', icon: HeartPulse, phase: 6 },
      { key: 'iot', label: 'IoT Monitoring', segment: 'iot', icon: Radio, phase: 6 },
    ],
  },
  {
    phase: 7,
    title: 'Phase 7 — Ops Intelligence',
    items: [
      { key: 'translator', label: 'Clinical Translator', segment: 'translator', icon: Languages, phase: 7 },
      { key: 'workforce', label: 'Workforce AI', segment: 'workforce', icon: Users, phase: 7 },
      { key: 'journey', label: 'Journey Optimizer', segment: 'journey', icon: Route, phase: 7 },
    ],
  },
  {
    phase: 8,
    title: 'Phase 8 — Clinical Systems',
    items: [
      { key: 'pharmacy-ai', label: 'Pharmacy Safety', segment: 'pharmacy-ai', icon: Pill, phase: 8 },
      { key: 'ot-intel', label: 'OT Intelligence', segment: 'ot-intelligence', icon: Stethoscope, phase: 8 },
      { key: 'telepresence', label: 'Telepresence Hub', segment: 'telepresence', icon: Video, phase: 8 },
    ],
  },
  {
    phase: 9,
    title: 'Phase 9 — Network & Research',
    items: [
      { key: 'research', label: 'Research Intelligence', segment: 'research', icon: Microscope, phase: 9 },
      { key: 'government', label: 'Government Health', segment: 'government', icon: Landmark, phase: 9 },
      { key: 'population', label: 'Population Analytics', segment: 'population', icon: BarChart3, phase: 9 },
      { key: 'robotics', label: 'Robotics Gateway', segment: 'robotics', icon: Bot, phase: 9 },
    ],
  },
  {
    phase: 10,
    title: 'Phase 10 — Spatial Hospital',
    items: [
      { key: 'floor-map', label: 'Digital Floor Map', segment: 'floor-map', icon: Map, phase: 10 },
      { key: 'wayfinding', label: 'Wayfinding', segment: 'wayfinding', icon: Navigation, phase: 10 },
      { key: 'control', label: 'OS Control Plane', segment: 'control', icon: Monitor, phase: 10 },
    ],
  },
];

export const ALL_HOSPITAL_OS_ITEMS = HOSPITAL_OS_NAV.flatMap((s) => s.items);
