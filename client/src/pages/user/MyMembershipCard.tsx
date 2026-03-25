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

/* ─── animation variants ─── */
const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
};

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
  });

  const isLoading = userLoading || planLoading;
  const hasError = userError || planError;
  const user = userData?.user || userData;
  const plan = planData?.plan || planData?.userPlan?.plan;

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
      const wasFlipped = isFlipped;
      if (wasFlipped) setIsFlipped(false);
      await new Promise((r) => setTimeout(r, 200));
      const canvas = await html2canvas(cardRef.current, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        logging: false,
      });
      if (wasFlipped) setIsFlipped(true);
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
  const printCard = () => {
    if (!cardRef.current) return;
    html2canvas(cardRef.current, { scale: 3, useCORS: true, backgroundColor: null, logging: false }).then((canvas) => {
      const win = window.open('', '_blank');
      if (!win) return;
      win.document.write(
        '<html><head><title>MediQzy Health Card</title>' +
        '<style>@page{size:landscape;margin:0.5in}body{display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#fff}img{max-width:100%;height:auto;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.12)}</style>' +
        '</head><body><img src="' + canvas.toDataURL('image/png') + '"/>' +
        '<script>setTimeout(function(){window.print();window.close()},300)<\/script></body></html>'
      );
      win.document.close();
    });
  };

  /* ─── tier helpers ─── */
  const getTierString = (tierValue: any): string => {
    if (!tierValue) return 'basic';
    if (typeof tierValue === 'string') return tierValue.toLowerCase();
    if (typeof tierValue === 'number') {
      const map: Record<number, string> = { 1: 'basic', 2: 'standard', 3: 'premium', 4: 'enterprise' };
      return map[tierValue] || 'basic';
    }
    if (typeof tierValue === 'object' && tierValue.name) return String(tierValue.name).toLowerCase();
    return 'basic';
  };

  const tier = getTierString(plan?.tier || plan?.tierName);
  const config = tierConfig[tier] || tierConfig.basic;
  const TierIcon = config.icon;
  const memberId = user ? `MED-${String(user.id).padStart(6, '0')}` : 'MED-000000';
  const memberName = user ? `${user.firstName} ${user.lastName}` : 'Member';
  const memberSince = user?.createdAt ? new Date(user.createdAt).getFullYear() : new Date().getFullYear();
  const groupNumber = plan?.groupNumber || `GRP-${String(user?.id ? Math.floor(user.id / 100) + 1 : 1).padStart(4, '0')}`;
  const validUntil = plan?.validUntil || plan?.endDate;
  const validUntilStr = validUntil ? new Date(validUntil).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Lifetime';

  /* ─── plan benefits ─── */
  const benefits = plan?.features || plan?.benefits || [
    'OPD Consultations',
    'In-Patient Hospitalization',
    'Pharmacy Discounts',
    'Annual Health Check-up',
    'Teleconsultation Access',
    '24/7 Emergency Helpline',
  ];
  const benefitsList = Array.isArray(benefits)
    ? benefits
    : typeof benefits === 'string'
    ? benefits.split(',').map((b: string) => b.trim())
    : [];

  /* ─── coverage data ─── */
  const coverageItems = [
    { label: 'Sum Insured', value: plan?.sumInsured ? `₹${Number(plan.sumInsured).toLocaleString('en-IN')}` : '₹5,00,000', icon: Shield },
    { label: 'OPD Copay', value: plan?.opdCopay || '₹0', icon: Stethoscope },
    { label: 'Room Rent', value: plan?.roomRent || 'Single AC', icon: Building2 },
    { label: 'Pharmacy', value: plan?.pharmacyDiscount || '15% off', icon: Pill },
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
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6 md:space-y-8 pb-8">
      {/* ───────── PAGE HEADER ───────── */}
      <motion.div variants={item}>
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
          <motion.div variants={item}>
            <div
              ref={cardRef}
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
                {/* ──── FRONT ──── */}
                <div
                  className={`w-full aspect-[1.586/1] rounded-2xl bg-gradient-to-br ${config.gradient} p-5 sm:p-7 text-white shadow-2xl ${config.glow} relative overflow-hidden`}
                  style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                >
                  {/* holographic shine */}
                  <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                    <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-to-br from-white/[0.08] via-transparent to-transparent rotate-12" />
                    <div className={`absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t ${config.pattern}`} />
                    {/* EMV chip */}
                    <div className="absolute top-5 right-5 sm:top-7 sm:right-7 w-11 h-8 rounded-md bg-gradient-to-br from-amber-300/80 to-amber-500/60 shadow-inner border border-amber-400/30" />
                    <div className="absolute top-[26px] right-[26px] sm:top-[34px] sm:right-[34px] w-6 h-4 rounded-sm border border-amber-600/20" style={{
                      background: 'repeating-linear-gradient(90deg, rgba(217,169,60,0.4) 0px, rgba(217,169,60,0.4) 2px, transparent 2px, transparent 4px)',
                    }} />
                  </div>

                  <div className="relative z-10 h-full flex flex-col justify-between">
                    {/* top row */}
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <HeartPulse className="h-5 w-5 opacity-90" />
                          <span className="text-sm font-bold tracking-[0.2em] opacity-90">MEDIQZY</span>
                        </div>
                        <span className="text-[10px] font-medium tracking-wider opacity-50 uppercase">Health Insurance Card</span>
                      </div>
                    </div>

                    {/* member ID row */}
                    <div className="space-y-1">
                      <div className="text-[10px] font-medium tracking-wider opacity-50 uppercase">Member ID</div>
                      <div className="text-2xl sm:text-3xl font-bold tracking-[0.15em] font-mono">{memberId}</div>
                    </div>

                    {/* member details grid */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      <div>
                        <div className="text-[10px] tracking-wider opacity-40 uppercase">Member Name</div>
                        <div className="text-sm sm:text-base font-semibold truncate">{memberName}</div>
                      </div>
                      <div>
                        <div className="text-[10px] tracking-wider opacity-40 uppercase">Group No.</div>
                        <div className="text-sm sm:text-base font-semibold font-mono">{groupNumber}</div>
                      </div>
                    </div>

                    {/* bottom row */}
                    <div className="flex items-end justify-between">
                      <div className="flex gap-4">
                        <div>
                          <div className="text-[10px] tracking-wider opacity-40 uppercase">Since</div>
                          <div className="text-xs font-semibold">{memberSince}</div>
                        </div>
                        <div>
                          <div className="text-[10px] tracking-wider opacity-40 uppercase">Valid Thru</div>
                          <div className="text-xs font-semibold">{validUntilStr}</div>
                        </div>
                      </div>
                      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${config.badge} backdrop-blur-sm border ${config.chipBorder}`}>
                        <TierIcon className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-bold tracking-wider uppercase">{config.label}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ──── BACK ──── */}
                <div
                  className={`absolute inset-0 w-full aspect-[1.586/1] rounded-2xl bg-gradient-to-br ${config.gradient} text-white shadow-2xl ${config.glow} overflow-hidden`}
                  style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                >
                  {/* magnetic stripe */}
                  <div className="w-full h-10 bg-black/50 mt-5" />

                  <div className="p-5 sm:p-7 pt-4 flex flex-col items-center flex-1">
                    {/* QR code */}
                    <div className="flex flex-col items-center gap-2 mt-1">
                      <div className="text-[10px] tracking-wider opacity-50 uppercase">Scan for Verification</div>
                      {qrCode ? (
                        <div className="bg-white p-2.5 rounded-xl shadow-lg">
                          <img src={qrCode} alt="QR Code" className="w-28 h-28 sm:w-32 sm:h-32" />
                        </div>
                      ) : (
                        <div className="bg-white/20 p-5 rounded-xl">
                          <QrCode className="w-20 h-20 opacity-50" />
                        </div>
                      )}
                      <div className="text-xs font-mono opacity-60">{memberId}</div>
                    </div>

                    {/* emergency / helpline strip at bottom */}
                    <div className="mt-auto w-full">
                      <Separator className="bg-white/10 mb-3" />
                      <div className="flex items-center justify-between text-[10px] opacity-50">
                        <span>24×7 Helpline: 1800-MEDIQZY</span>
                        <span>mediqzy.com</span>
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
          <motion.div variants={item}>
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
          <motion.div variants={item}>
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
          <motion.div variants={item}>
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
          <motion.div variants={item}>
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
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Wallet className="h-3 w-3" /> Monthly Fee</div>
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
          <motion.div variants={item}>
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
                            <span className="text-base font-bold">1800-MEDIQZY</span>
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
          <motion.div variants={item}>
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
          <motion.div variants={item}>
            <div className="flex items-center gap-3 text-sm text-muted-foreground px-1">
              <Clock className="h-4 w-4" />
              <span>Member since {memberSince} · Card last refreshed {new Date().toLocaleDateString('en-IN')}</span>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default MyMembershipCard;
