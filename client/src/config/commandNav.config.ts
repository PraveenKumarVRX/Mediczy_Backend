import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Siren,
  Activity,
  Stethoscope,
  ScanLine,
  Sparkles,
} from 'lucide-react';

export interface CommandNavItem {
  key: string;
  label: string;
  segment: string;
  icon: LucideIcon;
}

export const COMMAND_CENTER_NAV: CommandNavItem[] = [
  { key: 'overview', label: 'Overview', segment: '', icon: LayoutDashboard },
  { key: 'ed', label: 'ED Board', segment: 'ed', icon: Siren },
  { key: 'icu', label: 'ICU Overview', segment: 'icu', icon: Activity },
  { key: 'ot', label: 'OT Live Board', segment: 'ot', icon: Stethoscope },
  { key: 'diagnostics', label: 'Diagnostics Queue', segment: 'diagnostics', icon: ScanLine },
  { key: 'ai', label: 'AI Recommendations', segment: 'ai', icon: Sparkles },
];
