import { pharmacyBenefit, coveragePeriod } from '@/utils/plan-entitlements';
import { BRAND } from '@/config/brand';
/**
 * My Membership Card — Aetna-Grade Digital Health Card
 * World-class UI with 3D flip, glassmorphism, Framer Motion,
 * dark mode, holographic effects, and full insurance-grade layout.
 */

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CreditCard,
  Download,
  QrCode,
  Calendar,
  Phone,
  Mail,
  Crown,
  Smartphone,
  ScanLine,
  ArrowRight,
  Shield,
  Heart,
  Building2,
  Stethoscope,
  Pill,
  Copy,
  Check,
  Share2,
  Printer,
  Sparkles,
  User,
  Star,
  Clock,
  FileText,
  BadgeCheck,
  Wallet,
  Zap,
  Globe,
  HeartPulse,
} from 'lucide-react';
import api from '@/utils/api';
import { useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect, useCallback } from 'react';
import QRCode from 'qrcode';
import html2canvas from 'html2canvas';

/* ─── tier design system (Aetna-grade color palettes) ─── */
const tierConfig: Record<string, {
  gradient: string;
  headerGradient: string;
  accent: string;
  badge: string;
  badgeText: string;
  icon: typeof Crown;
  label: string;
  chipBorder: string;
  glow: string;
  pattern: string;
}> = {
  free: {
    gradient: 'from-slate-700 via-slate-800 to-slate-900',
    headerGradient: 'from-slate-600 to-slate-800',
    accent: 'text-slate-300',
    badge: 'bg-slate-600/80',
    badgeText: 'text-slate-100',
    icon: CreditCard,
    label: 'Standard',
    chipBorder: 'border-slate-500/30',
    glow: 'shadow-slate-500/20',
    pattern: 'from-white/[0.03] to-transparent',
  },
  basic: {
    gradient: 'from-blue-700 via-blue-800 to-indigo-900',
    headerGradient: 'from-blue-600 to-indigo-700',
    accent: 'text-blue-200',
    badge: 'bg-blue-500/80',
    badgeText: 'text-blue-50',
    icon: Shield,
    label: 'Essential',
    chipBorder: 'border-blue-400/30',
    glow: 'shadow-blue-500/25',
    pattern: 'from-blue-400/[0.05] to-transparent',
  },
  standard: {
    gradient: 'from-cyan-700 via-teal-800 to-teal-900',
    headerGradient: 'from-cyan-600 to-teal-700',
    accent: 'text-cyan-200',
    badge: 'bg-teal-500/80',
    badgeText: 'text-teal-50',
    icon: Heart,
    label: 'Standard',
    chipBorder: 'border-teal-400/30',
    glow: 'shadow-teal-500/25',
    pattern: 'from-teal-400/[0.05] to-transparent',
  },
  premium: {
    gradient: 'from-violet-700 via-purple-800 to-indigo-900',
    headerGradient: 'from-violet-600 to-purple-700',
    accent: 'text-violet-200',
    badge: 'bg-violet-500/80',
    badgeText: 'text-violet-50',
    icon: Crown,
    label: 'Premium',
    chipBorder: 'border-violet-400/30',
    glow: 'shadow-violet-500/25',
    pattern: 'from-violet-400/[0.05] to-transparent',
  },
  enterprise: {
    gradient: 'from-amber-600 via-yellow-700 to-amber-900',
    headerGradient: 'from-amber-500 to-yellow-700',
    accent: 'text-amber-200',
    badge: 'bg-amber-500/80',
    badgeText: 'text-amber-50',
    icon: Star,
    label: 'Enterprise',
    chipBorder: 'border-amber-400/30',
    glow: 'shadow-amber-500/25',
    pattern: 'from-amber-400/[0.06] to-transparent',
  },
  silver: {
    gradient: 'from-slate-400 via-slate-500 to-slate-700',
    headerGradient: 'from-slate-400 to-slate-600',
    accent: 'text-slate-100',
    badge: 'bg-slate-400/90',
    badgeText: 'text-white',
    icon: Shield,
    label: 'Silver',
    chipBorder: 'border-slate-300/40',
    glow: 'shadow-slate-500/30',
    pattern: 'from-white/[0.07] to-transparent',
  },
  gold: {
    gradient: 'from-yellow-500 via-amber-600 to-yellow-800',
    headerGradient: 'from-yellow-500 to-amber-700',
    accent: 'text-yellow-100',
    badge: 'bg-yellow-500/90',
    badgeText: 'text-yellow-900',
    icon: Crown,
    label: 'Gold',
    chipBorder: 'border-yellow-300/40',
    glow: 'shadow-yellow-500/35',
    pattern: 'from-yellow-300/[0.09] to-transparent',
  },
  platinum: {
    gradient: 'from-cyan-500 via-teal-600 to-slate-800',
    headerGradient: 'from-cyan-500 to-teal-700',
    accent: 'text-cyan-100',
    badge: 'bg-cyan-500/90',
    badgeText: 'text-cyan-50',
    icon: Sparkles,
    label: 'Platinum',
    chipBorder: 'border-cyan-300/40',
    glow: 'shadow-cyan-500/35',
    pattern: 'from-cyan-300/[0.07] to-transparent',
  },
  corporate: {
    gradient: 'from-emerald-700 via-green-800 to-emerald-900',
    headerGradient: 'from-emerald-600 to-green-700',
    accent: 'text-emerald-200',
    badge: 'bg-emerald-500/80',
    badgeText: 'text-emerald-50',
    icon: Building2,
    label: 'Corporate',
    chipBorder: 'border-emerald-400/30',
    glow: 'shadow-emerald-500/25',
    pattern: 'from-emerald-400/[0.05] to-transparent',
  },
};

/* ─── physical card per-tier theme (Amex/Citi Masterpiece) ─── */
const cardThemes: Record<string, {
  bg: string; brush: string; sheen: string;
  accent: string; numColor: string; shadow: string; chip: string;
  tierBg: string; tierText: string; tierBorder: string;
}> = {
  basic: {
    bg: 'linear-gradient(140deg,#0b1729 0%,#0f2044 35%,#112855 60%,#060e1f 100%)',
    brush: 'rgba(96,165,250,0.045)',
    sheen: 'rgba(96,165,250,0.09)',
    accent: '#3b82f6',
    numColor: '#93c5fd',
    shadow: '0 28px 70px rgba(37,99,235,0.55),0 12px 35px rgba(0,0,0,0.7),inset 0 1px 0 rgba(96,165,250,0.15)',
    chip: 'linear-gradient(145deg,#c8a832,#f0d060,#a07820,#d4b040)',
    tierBg: 'rgba(30,64,175,0.85)',
    tierText: '#bfdbfe',
    tierBorder: 'rgba(96,165,250,0.35)',
  },
  silver: {
    bg: 'linear-gradient(140deg,#0e1520 0%,#1a2538 35%,#162038 60%,#09111e 100%)',
    brush: 'rgba(226,232,240,0.038)',
    sheen: 'rgba(226,232,240,0.08)',
    accent: '#94a3b8',
    numColor: '#e2e8f0',
    shadow: '0 28px 70px rgba(100,116,139,0.45),0 12px 35px rgba(0,0,0,0.85),inset 0 1px 0 rgba(203,213,225,0.2)',
    chip: 'linear-gradient(145deg,#c0c8d4,#e4ecf8,#8898b0,#c4ccd8)',
    tierBg: 'rgba(20,30,50,0.95)',
    tierText: '#e2e8f0',
    tierBorder: 'rgba(148,163,184,0.32)',
  },
  gold: {
    bg: 'linear-gradient(140deg,#120b00 0%,#241500 35%,#1e1204 60%,#080500 100%)',
    brush: 'rgba(251,191,36,0.042)',
    sheen: 'rgba(245,158,11,0.1)',
    accent: '#d97706',
    numColor: '#fcd34d',
    shadow: '0 28px 70px rgba(217,119,6,0.65),0 12px 35px rgba(0,0,0,0.85),inset 0 1px 0 rgba(253,211,77,0.2)',
    chip: 'linear-gradient(145deg,#c8a020,#f5d040,#a07010,#daba30)',
    tierBg: 'rgba(120,53,15,0.9)',
    tierText: '#fde68a',
    tierBorder: 'rgba(245,158,11,0.42)',
  },
  platinum: {
    bg: 'linear-gradient(140deg,#060606 0%,#111111 35%,#0d0d0d 60%,#040404 100%)',
    brush: 'rgba(255,255,255,0.026)',
    sheen: 'rgba(255,255,255,0.06)',
    accent: '#cbd5e1',
    numColor: '#f8fafc',
    shadow: '0 28px 70px rgba(0,0,0,0.95),0 12px 35px rgba(0,0,0,0.98),inset 0 1px 0 rgba(255,255,255,0.13),0 0 55px rgba(148,163,184,0.22)',
    chip: 'linear-gradient(145deg,#d0d0d8,#f0f0f8,#a0a0b0,#c8c8d4)',
    tierBg: 'rgba(10,15,30,0.98)',
    tierText: '#f8fafc',
    tierBorder: 'rgba(203,213,225,0.28)',
  },
  enterprise: {
    bg: 'linear-gradient(140deg,#0f0a00 0%,#1a1000 35%,#201500 60%,#080500 100%)',
    brush: 'rgba(245,158,11,0.038)',
    sheen: 'rgba(245,158,11,0.08)',
    accent: '#f59e0b',
    numColor: '#fde68a',
    shadow: '0 28px 70px rgba(217,119,6,0.5),0 12px 35px rgba(0,0,0,0.85)',
    chip: 'linear-gradient(145deg,#c8a832,#f0d060,#a07820,#d4b040)',
    tierBg: 'rgba(120,53,15,0.9)',
    tierText: '#fde68a',
    tierBorder: 'rgba(245,158,11,0.42)',
  },
  corporate: {
    bg: 'linear-gradient(140deg,#011009 0%,#071a0f 35%,#0a1f12 60%,#020a05 100%)',
    brush: 'rgba(52,211,153,0.035)',
    sheen: 'rgba(16,185,129,0.08)',
    accent: '#10b981',
    numColor: '#6ee7b7',
    shadow: '0 28px 70px rgba(16,185,129,0.4),0 12px 35px rgba(0,0,0,0.85)',
    chip: 'linear-gradient(145deg,#c8a832,#f0d060,#a07820,#d4b040)',
    tierBg: 'rgba(6,78,59,0.9)',
    tierText: '#6ee7b7',
    tierBorder: 'rgba(52,211,153,0.38)',
  },
  standard: {
    bg: 'linear-gradient(140deg,#020d14 0%,#061a28 35%,#041520 60%,#020a12 100%)',
    brush: 'rgba(34,211,238,0.038)',
    sheen: 'rgba(6,182,212,0.08)',
    accent: '#06b6d4',
    numColor: '#67e8f9',
    shadow: '0 28px 70px rgba(6,182,212,0.4),0 12px 35px rgba(0,0,0,0.85)',
    chip: 'linear-gradient(145deg,#c8a832,#f0d060,#a07820,#d4b040)',
    tierBg: 'rgba(8,51,68,0.9)',
    tierText: '#67e8f9',
    tierBorder: 'rgba(34,211,238,0.38)',
  },
  premium: {
    bg: 'linear-gradient(140deg,#0d0818 0%,#1a1030 35%,#150d2a 60%,#070413 100%)',
    brush: 'rgba(167,139,250,0.038)',
    sheen: 'rgba(139,92,246,0.08)',
    accent: '#8b5cf6',
    numColor: '#c4b5fd',
    shadow: '0 28px 70px rgba(139,92,246,0.5),0 12px 35px rgba(0,0,0,0.85)',
    chip: 'linear-gradient(145deg,#c8a832,#f0d060,#a07820,#d4b040)',
    tierBg: 'rgba(76,29,149,0.9)',
    tierText: '#c4b5fd',
    tierBorder: 'rgba(167,139,250,0.38)',
  },
  free: {
    bg: 'linear-gradient(140deg,#0f1721 0%,#1e2d3f 35%,#172438 60%,#080e18 100%)',
    brush: 'rgba(148,163,184,0.032)',
    sheen: 'rgba(148,163,184,0.06)',
    accent: '#475569',
    numColor: '#94a3b8',
    shadow: '0 28px 70px rgba(51,65,85,0.4),0 12px 35px rgba(0,0,0,0.85)',
    chip: 'linear-gradient(145deg,#c8a832,#f0d060,#a07820,#d4b040)',
    tierBg: 'rgba(30,41,59,0.92)',
    tierText: '#94a3b8',
    tierBorder: 'rgba(148,163,184,0.3)',
  },
};

/* ─── quick-action items ─── */
const quickActions = [
  { icon: Stethoscope, label: 'Find Doctor', path: '/doctors', color: 'text-blue-500 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/40' },
  { icon: Building2, label: 'Hospitals', path: '/network-hospitals', color: 'text-emerald-500 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
  { icon: Pill, label: 'Pharmacy', path: '/pharmacy', color: 'text-orange-500 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/40' },
  { icon: FileText, label: 'Claims', path: '/claims', color: 'text-purple-500 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/40' },
];

const MyMembershipCard = () => {
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);
  const [qrCode, setQrCode] = useState<string>('');
  const [isFlipped, setIsFlipped] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeInfoTab, setActiveInfoTab] = useState<'benefits' | 'coverage' | 'contacts'>('benefits');

  /* ─── data fetching ─── */
  const { data: userData, isLoading: userLoading, isError: userError, refetch: refetchUser } = useQuery({
    queryKey: ['user-profile'],
    queryFn: async () => {
      const { data } = await api.get('/users/profile');
      return data;
    },
    retry: 1,
  });

  const { data: planData, isLoading: planLoading, isError: planError, refetch: refetchPlan } = useQuery({
    queryKey: ['user-plan'],
    queryFn: async () => {
      const { data } = await api.get('/membership/my/current');
      return data;
    },
    retry: 1,
    staleTime: 0,
    refetchOnMount: true,
  });

  const isLoading = userLoading || planLoading;
  const hasError = userError || planError;
  const user = userData?.user || userData;
  const plan = planData?.plan || planData?.userPlan?.plan;
  // The catalog definition (`plan`) has no per-subscription dates - those
  // live on the actual subscription row (`userPlan.endDate`, always set at
  // subscribe time). Reading them from `plan` instead silently fell back to
  // "Lifetime" for every plan, regardless of its real duration.
  const userPlan = planData?.userPlan;

  /* ─── QR code ─── */
  const generateQR = useCallback(async () => {
    if (!user) return;
    try {
      const qrData = JSON.stringify({
        memberId: `MED-${String(user.id).padStart(6, '0')}`,
        name: `${user.firstName} ${user.lastName}`,
        tier: plan?.tier || 'basic',
        ts: Date.now(),
      });
      const url = await QRCode.toDataURL(qrData, {
        width: 240,
        margin: 2,
        color: { dark: '#1e293b', light: '#ffffff' },
      });
      setQrCode(url);
    } catch (err) {
      console.error('QR generation failed:', err);
    }
  }, [user, plan]);

  useEffect(() => {
    if (user) generateQR();
  }, [user, generateQR]);

  /* ─── download card ─── */
  const downloadCard = async () => {
    if (!cardRef.current) return;
    try {
      const canvas = await captureCardSides();
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = `mediqzy-card-${user?.firstName || 'member'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  /* ─── copy member ID ─── */
  const copyMemberId = () => {
    navigator.clipboard.writeText(memberId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /* ─── print card ─── */
  const captureCardSides = async () => {
    if (!cardRef.current) return null;
    return html2canvas(cardRef.current, { scale: 3, useCORS: true, backgroundColor: null, logging: false,
      onclone: document => {
        const card = document.querySelector('[data-membership-card]') as HTMLElement | null;
        if (!card) return;
        card.style.perspective = 'none';
        const flip = card.firstElementChild as HTMLElement;
        flip.style.transform = 'none'; flip.style.transformStyle = 'flat';
        for (const side of Array.from(flip.children) as HTMLElement[]) {
          side.style.position = 'relative'; side.style.transform = 'none'; side.style.backfaceVisibility = 'visible'; side.style.marginBottom = '16px';
        }
      },
    });
  };
  const printCard = async () => {
    const win = window.open('', '_blank');
    if (!win) return;
    const canvas = await captureCardSides();
    if (!canvas) { win.close(); return; }
    win.document.write('<html><head><title>Mediqzy Health Card</title><style>@page{size:A4 portrait;margin:12mm}body{margin:0;text-align:center}img{width:125mm;max-height:265mm;object-fit:contain;break-inside:avoid;page-break-inside:avoid}</style></head><body><img alt="Membership card, front and back" src="' + canvas.toDataURL('image/png') + '"/></body></html>');
    win.document.close();
    const picture = win.document.querySelector('img');
    if (picture) picture.onload = () => { win.focus(); win.print(); };
  };

  /* ─── tier helpers ─── */
  const getTierString = (tierValue: any, planName?: string): string => {
    // Detect Silver / Gold / Platinum from plan name first
    if (planName) {
      const n = planName.toLowerCase();
      if (n.includes('platinum')) return 'platinum';
      if (n.includes('gold')) return 'gold';
      if (n.includes('silver')) return 'silver';
      if (n.includes('corporate')) return 'corporate';
      if (n.includes('enterprise')) return 'enterprise';
      if (n.includes('premium')) return 'premium';
    }
    if (!tierValue) return 'basic';
    if (typeof tierValue === 'string') {
      const s = tierValue.toLowerCase();
      return s in tierConfig ? s : 'basic';
    }
    if (typeof tierValue === 'number') {
      const map: Record<number, string> = { 1: 'basic', 2: 'standard', 3: 'premium', 4: 'enterprise' };
      return map[tierValue] || 'basic';
    }
    if (typeof tierValue === 'object' && tierValue.name) return String(tierValue.name).toLowerCase();
    return 'basic';
  };

  const tier = getTierString(plan?.tier || plan?.tierName, plan?.name);
  const config = tierConfig[tier] || tierConfig.basic;
  const ct = cardThemes[tier] || cardThemes.basic;
  const TierIcon = config.icon;
  const memberId = user ? `MED-${String(user.id).padStart(6, '0')}` : 'MED-000000';
  const memberName = user ? `${user.firstName} ${user.lastName}` : 'Member';
  const memberSince = user?.createdAt ? new Date(user.createdAt).getFullYear() : new Date().getFullYear();
  const groupNumber = plan?.groupNumber || `GRP-${String(user?.id ? Math.floor(user.id / 100) + 1 : 1).padStart(4, '0')}`;
  const validUntil = userPlan?.endDate || userPlan?.validUntil || plan?.validUntil || plan?.endDate;
  const validUntilStr = validUntil ? new Date(validUntil).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Lifetime';

  /* ─── billing cycle label ─── */
  const billingCycleLabel = (() => {
    const months = Number(plan?.durationMonths);
    if (!Number.isFinite(months) || months <= 0) return 'Plan Fee';
    if (months === 1) return 'Monthly Fee';
    if (months === 3) return 'Quarterly Fee';
    if (months === 6) return 'Half-Yearly Fee';
    if (months === 12) return 'Annual Fee';
    return `Fee (every ${months} months)`;
  })();

  /* ─── plan benefits ─── */
  // `plan.benefits` is the real, renderable list (JSONB array); `plan.features`
  // is a loosely-typed flag object ({chat: 'unlimited', audioCalls: 10, ...})
  // used elsewhere for entitlement checks, not display - it was being picked
  // first here purely because a non-empty object is truthy, hiding the real
  // benefits list even when one existed.
  const benefits = Array.isArray(plan?.benefits) ? plan.benefits : [];
  const rawBenefitsList = Array.isArray(benefits)
    ? benefits
    : typeof benefits === 'string'
    ? benefits.split(',').map((b: string) => b.trim())
    : [];

  const coverage = plan?.metadata?.coverageDetails;
  const benefitsList = coverage ? [
    ...rawBenefitsList.filter((value: any) => typeof value === 'string' && !/emergency consultation|pharmacy/i.test(value)),
    ...(Number(coverage.emergencyConsult?.limit) > 0 ? [`${coverage.emergencyConsult.limit} emergency consultations/${coveragePeriod(coverage)}`] : []),
    `Pharmacy: ${pharmacyBenefit(coverage)}`,
  ] : rawBenefitsList.filter((value: any) => typeof value === 'string');
  const monetaryCover = Number(plan?.sumInsured ?? coverage?.insurance?.health ?? 0);

  /* ─── coverage data ─── */
  const coverageItems = [
    { label: 'Sum Insured', value: monetaryCover > 0 ? `₹${monetaryCover.toLocaleString('en-IN')}` : 'No monetary cover', icon: Shield },
    { label: 'OPD Copay', value: plan?.opdCopay || 'See plan terms', icon: Stethoscope },
    { label: 'Room Rent', value: plan?.roomRent || 'Not specified', icon: Building2 },
    { label: 'Pharmacy', value: coverage ? pharmacyBenefit(coverage) : plan?.pharmacyDiscount || "See plan entitlements", icon: Pill },
  ];

  /* ─── loading skeleton ─── */
  if (isLoading) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 px-1">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-60" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <Skeleton className="h-60 w-full max-w-lg rounded-2xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </motion.div>
    );
  }

  /* ─── error state ─── */
  if (hasError && !user) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="h-16 w-16 rounded-2xl bg-red-100 dark:bg-red-950/40 flex items-center justify-center mb-4">
          <Shield className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold mb-2">Unable to Load Health Card</h2>
        <p className="text-muted-foreground text-sm max-w-md mb-6">
          We couldn't retrieve your membership details. This may be due to a session timeout or network issue.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => { refetchUser(); refetchPlan(); }}>
            Try Again
          </Button>
          <Button onClick={() => navigate('/login')}>
            Sign In
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8 pb-8">
      {/* ───────── PAGE HEADER ───────── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}>
        <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${config.headerGradient} p-6 md:p-8 text-white`}>
          {/* subtle pattern overlay */}
          <div className="absolute inset-0 opacity-[0.04]" style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }} />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/20">
                <CreditCard className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">My Health Card</h1>
                <p className="text-white/70 text-sm mt-0.5">Digital insurance card — accepted at all network providers</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={downloadCard} className="gap-2 bg-white/15 hover:bg-white/25 text-white border-0 backdrop-blur-sm">
                <Download className="h-4 w-4" /> Save
              </Button>
              <Button variant="secondary" size="sm" onClick={printCard} className="gap-2 bg-white/15 hover:bg-white/25 text-white border-0 backdrop-blur-sm">
                <Printer className="h-4 w-4" /> Print
              </Button>
              <Button variant="secondary" size="sm" onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: 'MediQzy Health Card', text: `Member ID: ${memberId}` });
                } else {
                  copyMemberId();
                }
              }} className="gap-2 bg-white/15 hover:bg-white/25 text-white border-0 backdrop-blur-sm">
                <Share2 className="h-4 w-4" /> Share
              </Button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ───────── MAIN GRID ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 md:gap-8">

        {/* ═══════ LEFT — CARD (3 cols) ═══════ */}
        <div className="lg:col-span-3 space-y-6">

          {/* ── membership card with 3D flip ── */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}>
            <div
              ref={cardRef} data-membership-card
              className="relative cursor-pointer select-none mx-auto max-w-lg"
              style={{ perspective: '1200px' }}
              onClick={() => {
                setIsFlipped((f) => !f);
                if (!qrCode) generateQR();
              }}
            >
              <motion.div
                className="relative w-full"
                animate={{ rotateY: isFlipped ? 180 : 0 }}
                transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                style={{ transformStyle: 'preserve-3d' }}
              >
                {/* ──── FRONT (Amex · Citi Masterpiece) ──── */}
                <div
                  className="w-full aspect-[1.586/1] rounded-[18px] text-white relative overflow-hidden"
                  style={{ background: ct.bg, boxShadow: ct.shadow, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                >
                  {/* ── Deep-space starfield ── */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                    {[...Array(38)].map((_,i)=>{
                      const x=(i*137+13)%100; const y=(i*89+7)%100;
                      const r=i%5===0?1.1:i%3===0?0.7:0.45;
                      return <circle key={i} cx={`${x}%`} cy={`${y}%`} r={r} fill="white" opacity={0.08+((i*17)%28)/280}/>
                    })}
                  </svg>

                  {/* ── Guilloche engine: 8 nested sine waves ── */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
                    <defs>
                      <pattern id={`gc-${tier}`} x="0" y="0" width="90" height="45" patternUnits="userSpaceOnUse">
                        {[
                          {d:"M0,22 C15,2 30,2 45,22 C60,42 75,42 90,22",op:0.13,sw:1.3},
                          {d:"M0,22 C15,42 30,42 45,22 C60,2 75,2 90,22",op:0.07,sw:0.9},
                          {d:"M0,11 C15,-9 30,-9 45,11 C60,31 75,31 90,11",op:0.05,sw:0.65},
                          {d:"M0,33 C15,53 30,53 45,33 C60,13 75,13 90,33",op:0.05,sw:0.65},
                          {d:"M0,5 C15,-15 30,-15 45,5 C60,25 75,25 90,5",op:0.035,sw:0.5},
                          {d:"M0,38 C15,58 30,58 45,38 C60,18 75,18 90,38",op:0.035,sw:0.5},
                          {d:"M0,17 C15,-3 30,-3 45,17 C60,37 75,37 90,17",op:0.025,sw:0.4},
                          {d:"M0,28 C15,48 30,48 45,28 C60,8 75,8 90,28",op:0.025,sw:0.4},
                        ].map((l,i)=>(
                          <path key={i} d={l.d} fill="none" stroke="white" strokeOpacity={l.op} strokeWidth={l.sw}/>
                        ))}
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill={`url(#gc-${tier})`}/>
                  </svg>

                  {/* ── Radial glamour glow — centre-right (Amex signature) ── */}
                  <div className="absolute inset-0 pointer-events-none" style={{
                    background:`radial-gradient(ellipse 65% 70% at 78% 50%, ${ct.sheen}, transparent 72%)`,
                  }}/>

                  {/* ── Top-left prestige glow ── */}
                  <div className="absolute inset-0 pointer-events-none" style={{
                    background:`radial-gradient(ellipse 45% 55% at 18% 20%, ${ct.sheen}, transparent 70%)`,
                  }}/>

                  {/* ── Brushed-metal horizontal lines ── */}
                  <div className="absolute inset-0 pointer-events-none" style={{
                    backgroundImage:`repeating-linear-gradient(0deg,transparent 0,transparent 3px,${ct.brush} 3px,${ct.brush} 4px)`,
                  }}/>

                  {/* ── Fine microprint outer ring ── */}
                  <div className="absolute inset-[4px] rounded-[14px] pointer-events-none" style={{
                    border:`1px solid ${ct.accent}22`,
                    boxShadow:`inset 0 0 0 1px ${ct.accent}11`,
                  }}/>

                  {/* ── AMEX-style large logo circle watermark ── */}
                  <div className="absolute -right-8 -bottom-10 w-52 h-52 rounded-full pointer-events-none" style={{
                    background:`radial-gradient(circle, ${ct.accent}16 0%, transparent 65%)`,
                    border:`1px solid ${ct.accent}12`,
                  }}/>
                  <div className="absolute -right-16 -bottom-16 w-72 h-72 rounded-full pointer-events-none"
                    style={{border:`1px solid ${ct.accent}09`}}/>

                  {/* ── Card content ── */}
                  <div className="relative z-10 h-full flex flex-col px-5 pt-4 pb-3">

                    {/* ── Row 1: Logo + Chip + Contactless ── */}
                    <div className="flex items-start justify-between">
                      {/* Logotype */}
                      <div className="flex flex-col gap-[1px]">
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{background:`${ct.accent}30`,border:`1px solid ${ct.accent}40`}}>
                            <HeartPulse className="h-3.5 w-3.5" style={{color:ct.accent}}/>
                          </div>
                          <span className="text-[15px] font-black tracking-[0.28em] uppercase leading-none" style={{
                            background:`linear-gradient(135deg,#fff 0%,${ct.numColor} 60%,#fff8 100%)`,
                            WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
                            filter:`drop-shadow(0 0 6px ${ct.accent}60)`,
                          }}>MEDIQZY</span>
                        </div>
                        <div className="text-[5.5px] tracking-[0.4em] uppercase ml-8" style={{color:`${ct.numColor}55`}}>
                          Health · India
                        </div>
                      </div>

                      {/* EMV chip */}
                      <div className="flex flex-col items-center gap-1.5">
                        <div className="w-10 h-[28px] rounded-[4px] relative overflow-hidden" style={{
                          background: ct.chip,
                          boxShadow:`0 2px 8px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.3)`,
                          border:'1px solid rgba(255,220,100,0.35)',
                        }}>
                          <div className="absolute top-[5px] left-0 right-0 h-[1px]" style={{background:'rgba(120,80,0,0.3)'}}/>
                          <div className="absolute bottom-[5px] left-0 right-0 h-[1px]" style={{background:'rgba(120,80,0,0.3)'}}/>
                          <div className="absolute left-[5px] top-0 bottom-0 w-[1px]" style={{background:'rgba(120,80,0,0.2)'}}/>
                          <div className="absolute right-[5px] top-0 bottom-0 w-[1px]" style={{background:'rgba(120,80,0,0.2)'}}/>
                          <div className="absolute inset-[3px] rounded-[2px]" style={{
                            background:'repeating-linear-gradient(45deg,rgba(150,100,0,0.12) 0,rgba(150,100,0,0.12) 2px,transparent 2px,transparent 4px)',
                          }}/>
                        </div>
                        {/* Contactless symbol */}
                        <svg width="14" height="11" viewBox="0 0 14 11" fill="none" xmlns="http://www.w3.org/2000/svg" style={{opacity:0.35}}>
                          <path d="M7,5.5 L7,5.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                          <path d="M5,3.5 C5.8,4.2 5.8,6.8 5,7.5" stroke="white" strokeWidth="1.1" strokeLinecap="round" fill="none"/>
                          <path d="M9,3.5 C8.2,4.2 8.2,6.8 9,7.5" stroke="white" strokeWidth="1.1" strokeLinecap="round" fill="none"/>
                          <path d="M3,1.5 C5,3 5,8 3,9.5" stroke="white" strokeWidth="1" strokeLinecap="round" fill="none"/>
                          <path d="M11,1.5 C9,3 9,8 11,9.5" stroke="white" strokeWidth="1" strokeLinecap="round" fill="none"/>
                        </svg>
                      </div>
                    </div>

                    {/* ── Row 2: Card Number ── */}
                    <div className="mt-3 mb-2">
                      <div className="text-[5.5px] tracking-[0.55em] uppercase mb-[3px]" style={{color:`${ct.numColor}45`}}>Member ID</div>
                      <div className="font-mono font-bold tracking-[0.22em] select-none" style={{
                        fontSize:'16px',
                        color: ct.numColor,
                        letterSpacing:'0.22em',
                        textShadow:`0 0 18px ${ct.accent}70,0 1px 0 rgba(0,0,0,0.5)`,
                      }}>
                        {memberId.replace('MED-','')}
                      </div>
                    </div>

                    {/* ── Row 3: Name + Fields ── */}
                    <div className="flex items-end justify-between flex-1 min-h-0">
                      <div className="flex-1 min-w-0">
                        <div className="text-[5.5px] tracking-[0.52em] uppercase mb-[3px]" style={{color:`${ct.numColor}40`}}>Card Holder</div>
                        <div className="text-[13px] font-bold tracking-[0.06em] uppercase truncate leading-tight" style={{
                          color:'white',
                          textShadow:`0 0 12px ${ct.accent}50`,
                        }}>
                          {memberName}
                        </div>
                        <div className="flex gap-5 mt-2">
                          <div>
                            <div className="text-[5px] tracking-[0.45em] uppercase" style={{color:`${ct.numColor}38`}}>Valid Thru</div>
                            <div className="text-[9.5px] font-bold tracking-wider mt-[1px]" style={{color:`${ct.numColor}cc`}}>{validUntilStr}</div>
                          </div>
                          <div>
                            <div className="text-[5px] tracking-[0.45em] uppercase" style={{color:`${ct.numColor}38`}}>Member Since</div>
                            <div className="text-[9.5px] font-bold tracking-wider mt-[1px]" style={{color:`${ct.numColor}cc`}}>{memberSince}</div>
                          </div>
                          <div>
                            <div className="text-[5px] tracking-[0.45em] uppercase" style={{color:`${ct.numColor}38`}}>Group</div>
                            <div className="text-[9.5px] font-bold font-mono tracking-wider mt-[1px]" style={{color:`${ct.numColor}cc`}}>{groupNumber}</div>
                          </div>
                        </div>
                      </div>

                      {/* ── Tier prestige badge (Amex Centurion style) ── */}
                      <div className="flex-shrink-0 ml-3 flex flex-col items-center gap-1">
                        <div className="w-12 h-[52px] rounded-lg flex flex-col items-center justify-center gap-1 relative overflow-hidden" style={{
                          background: ct.tierBg,
                          border:`1px solid ${ct.tierBorder}`,
                          boxShadow:`0 0 16px ${ct.accent}30,inset 0 1px 0 rgba(255,255,255,0.1)`,
                        }}>
                          {/* Inner glow */}
                          <div className="absolute inset-0" style={{background:`radial-gradient(ellipse at 50% 30%,${ct.accent}20,transparent 70%)`}}/>
                          <TierIcon className="h-4 w-4 relative z-10" style={{color:ct.tierText}}/>
                          <span className="text-[6px] font-black tracking-[0.18em] uppercase relative z-10" style={{color:ct.tierText}}>
                            {config.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* ── MRZ strip ── */}
                    <div className="mt-2 pt-[5px]" style={{borderTop:`1px solid ${ct.accent}15`}}>
                      <div className="text-[6px] tracking-[0.08em] leading-[1.6] select-none" style={{
                        fontFamily:'Courier New,monospace',
                        color:`${ct.numColor}28`,
                      }}>
                        {(()=>{
                          const parts = memberName.split(' ');
                          const sn=(parts.slice(-1)[0]||'MEMBER').toUpperCase().replace(/[^A-Z]/g,'');
                          const gn=parts.slice(0,-1).join('').toUpperCase().replace(/[^A-Z]/g,'');
                          const l1=('MEDQZY<<'+sn+'<<'+gn+'<'.repeat(44)).substring(0,36);
                          const idNum=memberId.replace('MED-','');
                          const pc=(plan?.name||'BASIC').toUpperCase().replace(/[^A-Z]/g,'').substring(0,6);
                          const l2=(idNum+'<'+(plan?.tier||1)+pc+'<'.repeat(36)).substring(0,36);
                          return <><div>{l1}</div><div>{l2}</div></>;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ──── BACK (Amex · Citi Masterpiece) ──── */}
                <div
                  className="absolute inset-0 w-full aspect-[1.586/1] rounded-[18px] text-white relative overflow-hidden"
                  style={{ background: ct.bg, boxShadow: ct.shadow, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                >
                  {/* Same starfield + guilloche */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                    {[...Array(28)].map((_,i)=>{
                      const x=(i*173+41)%100; const y=(i*67+23)%100;
                      return <circle key={i} cx={`${x}%`} cy={`${y}%`} r={i%4===0?0.9:0.4} fill="white" opacity={0.06+((i*19)%22)/260}/>
                    })}
                  </svg>
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
                    <defs>
                      <pattern id={`gcb-${tier}`} x="0" y="0" width="90" height="45" patternUnits="userSpaceOnUse">
                        <path d="M0,22 C15,2 30,2 45,22 C60,42 75,42 90,22" fill="none" stroke="white" strokeOpacity="0.08" strokeWidth="1"/>
                        <path d="M0,22 C15,42 30,42 45,22 C60,2 75,2 90,22" fill="none" stroke="white" strokeOpacity="0.05" strokeWidth="0.7"/>
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill={`url(#gcb-${tier})`}/>
                  </svg>
                  <div className="absolute inset-0 pointer-events-none" style={{
                    background:`radial-gradient(ellipse 50% 60% at 85% 50%,${ct.sheen},transparent 70%)`,
                    backgroundImage:`repeating-linear-gradient(0deg,transparent 0,transparent 3px,${ct.brush} 3px,${ct.brush} 4px)`,
                  }}/>
                  <div className="absolute inset-[4px] rounded-[14px] pointer-events-none" style={{border:`1px solid ${ct.accent}18`}}/>

                  <div className="relative z-10 flex flex-col h-full">
                    {/* Magnetic stripe — full width */}
                    <div className="mt-6 h-10 relative" style={{background:'linear-gradient(180deg,#000 0%,#111 50%,#000 100%)'}}>
                      <div className="absolute inset-y-[2px] left-0 right-0" style={{
                        background:'repeating-linear-gradient(90deg,rgba(55,28,0,1) 0,rgba(55,28,0,1) 3px,rgba(30,14,0,1) 3px,rgba(30,14,0,1) 6px)',
                      }}/>
                    </div>

                    {/* Body */}
                    <div className="flex-1 flex gap-3 px-5 pt-3 pb-4 min-h-0">
                      {/* QR verification panel */}
                      <div className="flex flex-col items-center justify-between flex-shrink-0 py-1">
                        <div className="text-[5.5px] tracking-[0.45em] uppercase" style={{color:`${ct.numColor}40`}}>Scan · Verify</div>
                        {qrCode ? (
                          <div className="p-1.5 rounded-lg shadow-2xl" style={{
                            background:'white',
                            boxShadow:`0 0 24px ${ct.accent}40,0 4px 16px rgba(0,0,0,0.6)`,
                          }}>
                            <img src={qrCode} alt="QR" className="w-[76px] h-[76px] sm:w-[84px] sm:h-[84px] block"/>
                          </div>
                        ) : (
                          <div className="p-3 rounded-lg" style={{background:`${ct.accent}12`,border:`1px solid ${ct.accent}20`}}>
                            <QrCode className="w-14 h-14 opacity-30"/>
                          </div>
                        )}
                        <div className="text-[6px] font-mono tracking-wider" style={{color:`${ct.numColor}35`}}>{memberId}</div>
                      </div>

                      {/* Right info panel */}
                      <div className="flex-1 flex flex-col justify-between min-w-0 pl-2" style={{borderLeft:`1px solid ${ct.accent}14`}}>
                        {/* Card info rows */}
                        <div>
                          <div className="text-[5px] tracking-[0.55em] uppercase mb-2" style={{color:`${ct.numColor}35`}}>Card Information</div>
                          <div className="space-y-1.5">
                            {[
                              {k:'Issuer',   v:'MediQzy Health Systems'},
                              {k:'Network',  v:'Pan India · Cashless'},
                              {k:'Plan',     v:plan?.name||'Basic Plan'},
                              {k:'Helpline', v:BRAND.support.phone},
                            ].map(r=>(
                              <div key={r.k} className="flex items-baseline gap-2 justify-between">
                                <span className="text-[5.5px] tracking-wider uppercase flex-shrink-0" style={{color:`${ct.numColor}35`}}>{r.k}</span>
                                <span className="text-[8px] font-semibold text-right leading-tight truncate" style={{color:`${ct.numColor}cc`}}>{r.v}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Signature strip */}
                        <div>
                          <div className="h-8 rounded-sm mb-2 flex items-end px-2 pb-1 relative overflow-hidden" style={{
                            background:`linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,255,255,0.09))`,
                            border:`1px solid ${ct.accent}18`,
                          }}>
                            <div className="absolute inset-0" style={{
                              backgroundImage:'repeating-linear-gradient(90deg,transparent 0,transparent 6px,rgba(255,255,255,0.02) 6px,rgba(255,255,255,0.02) 7px)',
                            }}/>
                            <div className="w-full border-b absolute bottom-[10px] left-2 right-2" style={{borderColor:`${ct.accent}24`}}/>
                            <div className="text-[5px] tracking-[0.4em] uppercase relative z-10" style={{color:`${ct.numColor}28`}}>Authorized Signature</div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              <HeartPulse className="h-2.5 w-2.5" style={{color:`${ct.accent}60`}}/>
                              <span className="text-[6.5px] font-bold tracking-wider" style={{color:`${ct.numColor}50`}}>mediqzy.com</span>
                            </div>
                            <span className="text-[6px]" style={{color:`${ct.numColor}30`}}>© {new Date().getFullYear()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* flip hint */}
            <motion.p
              className="text-xs text-center text-muted-foreground mt-3 flex items-center justify-center gap-1.5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <span className="inline-block w-4 h-4 rounded-full border border-current text-[9px] leading-4 text-center">↻</span>
              {isFlipped ? 'Tap to see front' : 'Tap to see QR code'}
            </motion.p>
          </motion.div>

          {/* ── member ID quick-copy strip ── */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}>
            <Card className="border-dashed">
              <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <BadgeCheck className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Member ID</div>
                    <div className="text-lg font-bold font-mono tracking-wider">{memberId}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right hidden sm:block">
                    <div className="text-xs text-muted-foreground">Group Number</div>
                    <div className="text-sm font-semibold font-mono">{groupNumber}</div>
                  </div>
                  <Separator orientation="vertical" className="h-8 hidden sm:block" />
                  <Button variant="outline" size="sm" onClick={copyMemberId} className="gap-2 min-w-[100px]">
                    {copied ? (
                      <><Check className="h-3.5 w-3.5 text-green-500" /> Copied!</>
                    ) : (
                      <><Copy className="h-3.5 w-3.5" /> Copy ID</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* ── quick actions grid ── */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {quickActions.map((action) => (
                <motion.button
                  key={action.label}
                  whileHover={{ scale: 1.03, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigate(action.path)}
                  className={`${action.bg} rounded-xl p-4 flex flex-col items-center gap-2 transition-shadow hover:shadow-md border border-transparent hover:border-border/50`}
                >
                  <action.icon className={`h-6 w-6 ${action.color}`} />
                  <span className="text-xs font-medium text-foreground">{action.label}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>

          {/* ── coverage summary cards ── */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Coverage At A Glance</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {coverageItems.map((ci) => (
                <Card key={ci.label} className="group hover:shadow-md transition-shadow">
                  <CardContent className="p-4 text-center">
                    <ci.icon className="h-5 w-5 mx-auto mb-2 text-muted-foreground group-hover:text-primary transition-colors" />
                    <div className="text-lg font-bold">{ci.value}</div>
                    <div className="text-[11px] text-muted-foreground">{ci.label}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.div>
        </div>

        {/* ═══════ RIGHT — INFO PANEL (2 cols) ═══════ */}
        <div className="lg:col-span-2 space-y-6">

          {/* ── plan overview card ── */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}>
            <Card className="overflow-hidden">
              <div className={`h-2 bg-gradient-to-r ${config.headerGradient}`} />
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-lg">{plan?.name || 'Basic Plan'}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{plan?.description || 'Your current healthcare membership'}</p>
                  </div>
                  <Badge className={`${config.badge} ${config.badgeText} border-0`}>
                    <TierIcon className="h-3 w-3 mr-1" />
                    {config.label}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Wallet className="h-3 w-3" /> {billingCycleLabel}</div>
                    <div className="text-xl font-bold mt-1">₹{plan?.price || plan?.priceINR || '0'}</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Valid Until</div>
                    <div className="text-lg font-bold mt-1">{validUntilStr}</div>
                  </div>
                </div>

                <Button className="w-full gap-2" variant="outline" onClick={() => navigate('/my-plans')}>
                  <Sparkles className="h-4 w-4" /> Upgrade Plan <ArrowRight className="h-4 w-4 ml-auto" />
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          {/* ── tabbed info panel ── */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}>
            <Card>
              <CardContent className="p-0">
                {/* tabs */}
                <div className="flex border-b">
                  {(['benefits', 'coverage', 'contacts'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveInfoTab(tab)}
                      className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${
                        activeInfoTab === tab
                          ? 'text-primary border-b-2 border-primary'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                <div className="p-5">
                  <AnimatePresence mode="wait">
                    {activeInfoTab === 'benefits' && (
                      <motion.div
                        key="benefits"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-2.5"
                      >
                        {benefitsList.length > 0 ? benefitsList.map((b: string, i: number) => (
                          <div key={i} className="flex items-center gap-3 group">
                            <div className="h-6 w-6 rounded-full bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                              <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <span className="text-sm">{typeof b === 'string' ? b : (b as any).name || String(b)}</span>
                          </div>
                        )) : (
                          <p className="text-sm text-muted-foreground">No specific benefits listed for this plan.</p>
                        )}
                      </motion.div>
                    )}

                    {activeInfoTab === 'coverage' && (
                      <motion.div
                        key="coverage"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-4"
                      >
                        {coverageItems.map((ci) => (
                          <div key={ci.label} className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                <ci.icon className="h-4 w-4 text-primary" />
                              </div>
                              <span className="text-sm font-medium">{ci.label}</span>
                            </div>
                            <span className="text-sm font-bold">{ci.value}</span>
                          </div>
                        ))}
                        <Separator />
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center">
                              <Globe className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            </div>
                            <span className="text-sm font-medium">Network</span>
                          </div>
                          <span className="text-sm font-bold">{plan?.networkType || 'Pan India'}</span>
                        </div>
                      </motion.div>
                    )}

                    {activeInfoTab === 'contacts' && (
                      <motion.div
                        key="contacts"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-4"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center">
                            <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Member Name</div>
                            <div className="text-sm font-semibold">{memberName}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                            <Mail className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Email</div>
                            <div className="text-sm font-semibold">{user?.email || 'Not available'}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center">
                            <Phone className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Phone</div>
                            <div className="text-sm font-semibold">{user?.phoneNumber || 'Not available'}</div>
                          </div>
                        </div>
                        <Separator />
                        <div className="bg-muted/50 rounded-lg p-4">
                          <div className="text-xs font-semibold text-muted-foreground mb-2">EMERGENCY HELPLINE</div>
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-red-500" />
                            <span className="text-base font-bold">{BRAND.support.phone}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1">Available 24×7 for medical emergencies</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* ── how to use ── */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}>
            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">How To Use Your Card</h3>
                <div className="space-y-4">
                  {[
                    { icon: Smartphone, title: 'Show at Facility', desc: 'Present this digital card at reception for instant check-in', color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-950/40' },
                    { icon: ScanLine, title: 'Quick QR Scan', desc: 'Flip card to reveal QR code for provider verification', color: 'text-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-950/40' },
                    { icon: Download, title: 'Save Offline', desc: 'Download or print your card for offline access anytime', color: 'text-purple-500', bg: 'bg-purple-100 dark:bg-purple-950/40' },
                    { icon: Zap, title: 'Cashless Claims', desc: 'Show card at network hospitals for cashless treatment', color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-950/40' },
                  ].map((step, i) => (
                    <div key={i} className="flex gap-3 group">
                      <div className={`h-9 w-9 rounded-xl ${step.bg} flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform`}>
                        <step.icon className={`h-4 w-4 ${step.color}`} />
                      </div>
                      <div>
                        <div className="text-sm font-semibold">{step.title}</div>
                        <div className="text-xs text-muted-foreground leading-relaxed">{step.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* ── member since badge ── */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}>
            <div className="flex items-center gap-3 text-sm text-muted-foreground px-1">
              <Clock className="h-4 w-4" />
              <span>Member since {memberSince} · Card last refreshed {new Date().toLocaleDateString('en-IN')}</span>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default MyMembershipCard;
