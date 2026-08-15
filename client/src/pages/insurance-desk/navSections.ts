import type { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import {
  ShieldCheck, ClipboardList, FileText, Building2, UserCheck,
  Search, BarChart3, Settings, HelpCircle, Mail, Scale, Landmark,
  ShieldQuestion, MessageSquare, ArrowLeftRight, Bed,
} from 'lucide-react';

export const navSections: DeptNavSection[] = [
  { title: 'Overview', items: [{ icon: ShieldCheck, label: 'Dashboard', href: '/insurance-desk/dashboard' }] },
  { title: 'Claims & Auth', items: [
    { icon: Bed,           label: 'Admissions',          href: '/insurance-desk/admissions' },
    { icon: ClipboardList, label: 'Pre-Authorization',   href: '/insurance-desk/pre-auth' },
    { icon: FileText,      label: 'Active Claims',       href: '/insurance-desk/claims' },
    { icon: FileText,      label: 'Documents',           href: '/insurance-desk/documents' },
    { icon: Scale,         label: 'Appeals',             href: '/insurance-desk/appeals' },
    { icon: Mail,          label: 'Email Inbox',         href: '/insurance-desk/email-inbox' },
    { icon: MessageSquare, label: 'Messages',            href: '/insurance-desk/messages' },
  ]},
  { title: 'Management', items: [
    { icon: Building2,  label: 'TPA Management',      href: '/insurance-desk/tpa' },
    { icon: UserCheck,  label: 'Patient Insurance',   href: '/insurance-desk/patient-insurance' },
    { icon: Search,     label: 'Claim Search',        href: '/insurance-desk/search' },
    { icon: Landmark,   label: 'Settlements',         href: '/insurance-desk/settlements' },
    { icon: ArrowLeftRight, label: 'Reconciliation',  href: '/insurance-desk/reconciliation' },
    { icon: ShieldQuestion, label: 'Compliance',      href: '/insurance-desk/compliance' },
  ]},
  { title: 'Reports', items: [
    { icon: BarChart3,  label: 'Analytics', href: '/insurance-desk/analytics' },
    { icon: Settings,   label: 'Settings',  href: '/insurance-desk/settings' },
    { icon: HelpCircle, label: 'Support',   href: '/insurance-desk/support' },
  ]},
];

export default navSections;
