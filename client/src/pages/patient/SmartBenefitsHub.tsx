/**
 * SmartBenefitsHub — World-Class Employee Benefits Dashboard
 * 
 * MediBuddy/GetVisit-tier employee benefits experience with:
 * - Insurance coverage visualization with sunburst cards
 * - One-tap claim filing with document AI
 * - Family coverage management
 * - Real-time claim tracking with timeline
 * - Smart benefit recommendations
 * - Network hospital/clinic finder
 * - E-Card generation & sharing
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSmartBenefits } from '@/hooks/patient/useSmartBenefits';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, ShieldCheck, Heart, Users, CreditCard, FileText, Upload,
  CheckCircle, Clock, AlertCircle, ArrowRight, Search, MapPin,
  Building2, Phone, Star, Navigation, Download, Share2, Camera,
  Sparkles, TrendingUp, IndianRupee, Stethoscope, Pill, Activity,
  Eye, Baby, Bone, Brain, Zap, ChevronRight, ChevronDown, X,
  QrCode, Wallet, Calendar, FileCheck, Send, RefreshCw, Filter,
  Award, Gift, CircleDollarSign, Banknote, Receipt, ThumbsUp
} from 'lucide-react';
import api from '@/utils/api';
import { getToken } from '@/hooks/auth';
import { useAuth } from '@/auth/AuthProvider';
import MainLayout from '@/components/layout/MainLayout';

// ─── Types ───────────────────────────────────────────────────────────────────
interface BenefitPlan {
  id: string;
  name: string;
  type: 'gmc' | 'gpa' | 'gtl' | 'opd' | 'dental' | 'vision' | 'wellness' | 'topup' | 'parents' | 'personal';
  insurer: string;
  insurerLogo?: string;
  policyNumber: string;
  sumInsured: number;
  utilized: number;
  remaining: number;
  familyCovered: number;
  validFrom: string;
  validTo: string;
  features: string[];
  sublimits: { name: string; limit: number; used: number }[];
}

interface FamilyMember {
  id: string;
  name: string;
  relation: string;
  age: number;
  gender: string;
  covered: boolean;
  eCardId?: string;
  lastClaim?: string;
  healthScore?: number;
}

interface Claim {
  id: string;
  claimNumber: string;
  type: string;
  amount: number;
  approvedAmount?: number;
  status: 'submitted' | 'under_review' | 'approved' | 'rejected' | 'settled' | 'info_needed';
  hospital?: string;
  date: string;
  member: string;
  documents: number;
  timeline: { step: string; date: string; status: string }[];
}

// ─── Gradient Helpers ────────────────────────────────────────────────────────
const typeGradient: Record<string, string> = {
  gmc: 'from-blue-600 via-blue-500 to-cyan-400',
  gpa: 'from-violet-600 via-violet-500 to-purple-400',
  gtl: 'from-emerald-600 via-emerald-500 to-teal-400',
  opd: 'from-amber-600 via-amber-500 to-orange-400',
  dental: 'from-pink-600 via-pink-500 to-rose-400',
  vision: 'from-indigo-600 via-indigo-500 to-blue-400',
  wellness: 'from-teal-600 via-teal-500 to-green-400',
  topup: 'from-cyan-600 via-sky-500 to-blue-400',
  parents: 'from-rose-600 via-red-500 to-orange-400',
  personal: 'from-slate-600 via-slate-500 to-zinc-400',
};

const typeIcon: Record<string, any> = {
  gmc: Shield, gpa: ShieldCheck, gtl: Heart, opd: Stethoscope,
  dental: Bone, vision: Eye, wellness: Activity,
  topup: TrendingUp, parents: Users, personal: FileCheck,
};

const eCardEligible = new Set(['gmc', 'parents', 'topup', 'personal']);

const policyBenefitChips: Record<string, { icon: any; label: string; highlight?: boolean }[]> = {
  gmc: [
    { icon: Building2, label: '6,000+ Cashless', highlight: true },
    { icon: Baby, label: 'Maternity ₹50K' },
    { icon: Zap, label: 'Day Care' },
  ],
  gpa: [
    { icon: ShieldCheck, label: 'Accidental Death', highlight: true },
    { icon: Bone, label: 'Disability Cover' },
    { icon: Award, label: 'Edu Benefit' },
  ],
  topup: [
    { icon: TrendingUp, label: 'Family Floater', highlight: true },
    { icon: RefreshCw, label: 'Multi-Claim' },
    { icon: Building2, label: 'Post-Deductible' },
  ],
  parents: [
    { icon: Users, label: 'Parents Covered', highlight: true },
    { icon: Building2, label: 'Cashless Network' },
    { icon: Calendar, label: 'Day Care' },
  ],
  personal: [
    { icon: Shield, label: 'Individual Cover', highlight: true },
    { icon: Stethoscope, label: 'Annual Checkup' },
    { icon: Gift, label: 'NCB Eligible' },
  ],
  opd: [
    { icon: Stethoscope, label: 'Consultations', highlight: true },
    { icon: Pill, label: 'Medicines' },
    { icon: Activity, label: 'Diagnostics' },
  ],
  gtl: [
    { icon: Heart, label: '₹25L Life Cover', highlight: true },
    { icon: Zap, label: '₹50L Accidental' },
    { icon: AlertCircle, label: 'Terminal Illness' },
  ],
  dental: [
    { icon: Bone, label: 'Dental Care', highlight: true },
    { icon: Eye, label: 'Eye Exam' },
    { icon: Star, label: 'Spectacles' },
  ],
};

const statusConfig: Record<string, { color: string; bg: string; icon: any; label: string }> = {
  submitted: { color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Send, label: 'Submitted' },
  under_review: { color: 'text-amber-400', bg: 'bg-amber-500/10', icon: Clock, label: 'Under Review' },
  approved: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: CheckCircle, label: 'Approved' },
  rejected: { color: 'text-red-400', bg: 'bg-red-500/10', icon: X, label: 'Rejected' },
  settled: { color: 'text-green-400', bg: 'bg-green-500/10', icon: ThumbsUp, label: 'Settled' },
  info_needed: { color: 'text-orange-400', bg: 'bg-orange-500/10', icon: AlertCircle, label: 'Info Needed' },
};

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmt = (n: number) => n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : `₹${(n / 1000).toFixed(0)}K`;
const fmtFull = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const MOTION_STAGGER = 0.08;

const defaultBenefitPlans: BenefitPlan[] = [
  {
    id: 'gmc', name: 'Group Mediclaim', type: 'gmc', insurer: 'ICICI Lombard',
    policyNumber: 'GMC-2026-IND-4851', sumInsured: 500000, utilized: 45000,
    remaining: 455000, familyCovered: 4, validFrom: '2026-04-01', validTo: '2027-03-31',
    features: ['Cashless at 6000+ hospitals', 'No waiting period', 'Pre & post hospitalization', 'Day care procedures', 'Ambulance cover ₹2,500', 'Maternity benefit ₹50,000'],
    sublimits: [
      { name: 'Room Rent', limit: 5000, used: 0 },
      { name: 'ICU', limit: 10000, used: 0 },
      { name: 'Maternity', limit: 50000, used: 0 },
      { name: 'Ambulance', limit: 2500, used: 0 },
    ],
  },
  {
    id: 'gpa', name: 'Group Personal Accident', type: 'gpa', insurer: 'Tata AIG',
    policyNumber: 'GPA-2026-TATA-1187', sumInsured: 1000000, utilized: 0,
    remaining: 1000000, familyCovered: 1, validFrom: '2026-04-01', validTo: '2027-03-31',
    features: ['Accidental death cover', 'Permanent disability cover', 'Temporary total disability', 'Education benefit', 'Ambulance support'],
    sublimits: [
      { name: 'Accidental Death', limit: 1000000, used: 0 },
      { name: 'Permanent Disability', limit: 1000000, used: 0 },
      { name: 'Weekly Benefit', limit: 10000, used: 0 },
    ],
  },
  {
    id: 'topup', name: 'Super Top Up', type: 'topup', insurer: 'Care Health',
    policyNumber: 'STU-2026-CARE-5590', sumInsured: 1000000, utilized: 0,
    remaining: 1000000, familyCovered: 4, validFrom: '2026-04-01', validTo: '2027-03-31',
    features: ['Coverage above deductible', 'Family floater top-up', 'Multiple claims aggregation', 'Cashless hospitalization after threshold'],
    sublimits: [
      { name: 'Deductible', limit: 300000, used: 0 },
      { name: 'Top-up Cover', limit: 1000000, used: 0 },
    ],
  },
  {
    id: 'parents', name: 'Parents Mediclaim', type: 'parents', insurer: 'Aditya Birla Health',
    policyNumber: 'PMC-2026-ABHI-4412', sumInsured: 300000, utilized: 0,
    remaining: 300000, familyCovered: 2, validFrom: '2026-04-01', validTo: '2027-03-31',
    features: ['Parent hospitalization cover', 'Cashless network access', 'Day care procedures', 'Pre & post hospitalization'],
    sublimits: [
      { name: 'Hospitalization', limit: 300000, used: 0 },
      { name: 'Room Rent', limit: 3000, used: 0 },
    ],
  },
  {
    id: 'personal', name: 'Personal Health Insurance', type: 'personal', insurer: 'HDFC ERGO',
    policyNumber: 'PHI-2026-HDFC-6729', sumInsured: 500000, utilized: 0,
    remaining: 500000, familyCovered: 1, validFrom: '2026-04-01', validTo: '2027-03-31',
    features: ['Individual health cover', 'Cashless hospitalization', 'Annual health checkup', 'No-claim bonus eligibility'],
    sublimits: [
      { name: 'Hospitalization', limit: 500000, used: 0 },
      { name: 'Health Checkup', limit: 3000, used: 0 },
    ],
  },
  {
    id: 'opd', name: 'OPD Benefit', type: 'opd', insurer: 'Star Health',
    policyNumber: 'OPD-2026-STR-9012', sumInsured: 15000, utilized: 3200,
    remaining: 11800, familyCovered: 4, validFrom: '2026-04-01', validTo: '2027-03-31',
    features: ['Doctor consultations', 'Medicines', 'Diagnostics', 'Physiotherapy'],
    sublimits: [
      { name: 'Consultation', limit: 5000, used: 2000 },
      { name: 'Medicines', limit: 5000, used: 1200 },
      { name: 'Diagnostics', limit: 5000, used: 0 },
    ],
  },
  {
    id: 'gtl', name: 'Group Term Life', type: 'gtl', insurer: 'HDFC Life',
    policyNumber: 'GTL-2026-HDFC-3341', sumInsured: 2500000, utilized: 0,
    remaining: 2500000, familyCovered: 1, validFrom: '2026-04-01', validTo: '2027-03-31',
    features: ['Death benefit 25L', 'Accidental death 50L', 'Terminal illness cover'],
    sublimits: [],
  },
  {
    id: 'dental', name: 'Dental & Vision', type: 'dental', insurer: 'Niva Bupa',
    policyNumber: 'DNT-2026-NIVA-7802', sumInsured: 10000, utilized: 0,
    remaining: 10000, familyCovered: 4, validFrom: '2026-04-01', validTo: '2027-03-31',
    features: ['Dental checkup', 'Cleaning & scaling', 'Eye exam', 'Spectacles allowance'],
    sublimits: [
      { name: 'Dental', limit: 5000, used: 0 },
      { name: 'Vision', limit: 5000, used: 0 },
    ],
  },
];

const mergeExpectedBenefitPlans = (incoming: BenefitPlan[]) => {
  const byType = new Set(incoming.map((plan) => plan.type));
  const byName = new Set(incoming.map((plan) => plan.name.toLowerCase()));
  const missing = defaultBenefitPlans.filter((plan) => !byType.has(plan.type) && !byName.has(plan.name.toLowerCase()));
  return [...incoming, ...missing];
};

// ─── Main Component ──────────────────────────────────────────────────────────
export default function SmartBenefitsHub() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [tab, setTab] = useState<'benefits' | 'claims' | 'family' | 'network'>('benefits');
  const [showECard, setShowECard] = useState(false);
  const [eCardPlan, setECardPlan] = useState<BenefitPlan | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<BenefitPlan | null>(null);
  const [networkSearch, setNetworkSearch] = useState('');

  // ── Data loading delegated to hook ──────────────────────────────────────
  const {
    plans: rawPlans, family, claims, loading, claimsDataStatus, refresh: loadBenefitsData
  } = useSmartBenefits();

  // Apply local merge for expected plan display (preserves existing UX)
  const plans = mergeExpectedBenefitPlans(rawPlans);

  const totalSumInsured = plans.reduce((s, p) => s + p.sumInsured, 0);
  const totalUtilized = plans.reduce((s, p) => s + p.utilized, 0);
  const totalRemaining = plans.reduce((s, p) => s + p.remaining, 0);
  const activeClaims = claims.filter(c => !['settled', 'rejected'].includes(c.status));

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <MainLayout>
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* ─── Hero Banner ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 via-violet-600/10 to-transparent" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="relative px-4 sm:px-6 pt-6 pb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">My Benefits</h1>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm text-slate-400">
                  {plans.length} active plans • {family.length} members covered
                </p>
                <Badge className={claimsDataStatus === 'live' ? 'bg-emerald-500/10 text-emerald-300 border-0' : 'bg-amber-500/10 text-amber-300 border-0'}>
                  {claimsDataStatus === 'live' ? 'Live Claims' : 'Claims Limited'}
                </Badge>
              </div>
            </div>
            <Button size="sm" onClick={() => navigate('/claims-express?source=benefits')}
              className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 border-0 rounded-xl gap-1.5 shadow-lg shadow-blue-600/20">
              <Upload className="h-3.5 w-3.5" /> File Claim
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-4">
            <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
              <p className="text-xs font-semibold text-cyan-300">Step 1: Check available cover</p>
              <p className="text-[11px] text-slate-400">Review each plan limit and current utilization before treatment.</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
              <p className="text-xs font-semibold text-cyan-300">Step 2: File clean claims</p>
              <p className="text-[11px] text-slate-400">Submit the right documents once to reduce rework and delays.</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
              <p className="text-xs font-semibold text-cyan-300">Step 3: Track settlement</p>
              <p className="text-[11px] text-slate-400">Follow timeline updates until approval and payout completion.</p>
            </div>
          </div>

          {/* Coverage Summary Ring */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="bg-gradient-to-br from-blue-600/20 to-blue-800/10 border border-blue-500/20 rounded-2xl p-4 text-center backdrop-blur-sm">
              <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-1">Total Cover</p>
              <p className="text-xl font-bold text-white">{fmt(totalSumInsured)}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{plans.length} policies</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="bg-gradient-to-br from-emerald-600/20 to-emerald-800/10 border border-emerald-500/20 rounded-2xl p-4 text-center backdrop-blur-sm">
              <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">Available</p>
              <p className="text-xl font-bold text-white">{fmt(totalRemaining)}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{((totalRemaining / totalSumInsured) * 100).toFixed(0)}% remaining</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className="bg-gradient-to-br from-amber-600/20 to-amber-800/10 border border-amber-500/20 rounded-2xl p-4 text-center backdrop-blur-sm">
              <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1">Claims</p>
              <p className="text-xl font-bold text-white">{activeClaims.length}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{activeClaims.length > 0 ? 'in progress' : 'all settled'}</p>
            </motion.div>
          </div>
        </div>
      </div>

      {/* ─── Tab Navigation ──────────────────────────────────────────────── */}
      <div className="px-4 sm:px-6">
        <div className="flex gap-1 bg-slate-800/50 rounded-xl p-1 mb-6">
          {([
            { key: 'benefits', label: 'Benefits', icon: Shield },
            { key: 'claims', label: 'Claims', icon: FileText },
            { key: 'family', label: 'Family', icon: Users },
            { key: 'network', label: 'Network', icon: MapPin },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
                tab === t.key
                  ? 'bg-white/10 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}>
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3 transition-all duration-300">
          <div>
            <p className="text-xs font-semibold text-cyan-300">Next Best Action</p>
            <p className="text-[11px] text-slate-400">
              {tab === 'benefits'
                ? 'Review remaining cover and open policy cards to verify limits before treatment.'
                : tab === 'claims'
                  ? 'File new claims with complete docs and monitor current review milestones.'
                  : tab === 'family'
                    ? 'Verify covered members and update dependent details for uninterrupted access.'
                    : 'Use network search to find nearest cashless providers before admission.'}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {tab !== 'network' && (
              <Button size="sm" variant="outline" className="border-white/10 text-slate-300" onClick={() => setTab('network')}>
                <MapPin className="h-3.5 w-3.5 mr-1" /> Find Network
              </Button>
            )}
            {tab !== 'claims' && (
              <Button size="sm" variant="outline" className="border-white/10 text-slate-300" onClick={() => setTab('claims')}>
                Track Claims
              </Button>
            )}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {/* ─── Benefits Tab ────────────────────────────────────────────── */}
          {tab === 'benefits' && (
            <motion.div key="benefits" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
              <div className="space-y-4 pb-8">
                {plans.map((plan, i) => {
                  const Icon = typeIcon[plan.type] || Shield;
                  const gradient = typeGradient[plan.type] || typeGradient.gmc;
                  const pct = plan.sumInsured > 0 ? (plan.utilized / plan.sumInsured) * 100 : 0;
                  return (
                    <motion.div key={plan.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * MOTION_STAGGER, duration: 0.25 }}
                      onClick={() => setSelectedPlan(plan)}
                      className="cursor-pointer group">
                      <Card className="!p-0 overflow-hidden border-white/[0.06] hover:border-white/[0.12] transition-all bg-slate-900/50 backdrop-blur-sm">
                        {/* Gradient header */}
                        <div className={`bg-gradient-to-r ${gradient} p-4 relative overflow-hidden`}>
                          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                          <div className="relative flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                                <Icon className="h-5 w-5 text-white" />
                              </div>
                              <div>
                                <h3 className="font-semibold text-white text-sm">{plan.name}</h3>
                                <p className="text-white/70 text-xs">{plan.insurer} • {plan.policyNumber}</p>
                              </div>
                            </div>
                            <Badge className="bg-white/20 text-white border-0 text-[10px]">
                              {plan.familyCovered} covered
                            </Badge>
                          </div>
                        </div>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Sum Insured</p>
                              <p className="text-lg font-bold text-white">{fmtFull(plan.sumInsured)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Available</p>
                              <p className="text-lg font-bold text-emerald-400">{fmtFull(plan.remaining)}</p>
                            </div>
                          </div>
                          <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden mb-3">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                              transition={{ delay: 0.3, duration: 0.6, ease: 'easeOut' }}
                              className={`h-full bg-gradient-to-r ${gradient} rounded-full`} />
                          </div>

                          {/* Per-policy benefit chips */}
                          {(policyBenefitChips[plan.type] || []).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-3">
                              {(policyBenefitChips[plan.type] || []).map((chip, ci) => {
                                const ChipIcon = chip.icon;
                                return (
                                  <span key={ci} className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                                    chip.highlight
                                      ? `bg-gradient-to-r ${gradient} text-white shadow-sm`
                                      : 'bg-white/[0.04] text-slate-400 border border-white/[0.06]'
                                  }`}>
                                    <ChipIcon className="h-2.5 w-2.5" />
                                    {chip.label}
                                  </span>
                                );
                              })}
                            </div>
                          )}

                          <div className="flex items-center justify-between">
                            <p className="text-[10px] text-slate-500">
                              {pct.toFixed(1)}% used • Valid till {new Date(plan.validTo).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                            </p>
                            <div className="flex items-center gap-2">
                              {eCardEligible.has(plan.type) && (
                                <button
                                  onClick={e => { e.stopPropagation(); setECardPlan(plan); setShowECard(true); }}
                                  className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors border border-blue-500/20">
                                  <CreditCard className="h-3 w-3" /> E-Card
                                </button>
                              )}
                              <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-white transition-colors" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}

                {/* Quick Actions */}
                <div className="grid grid-cols-2 gap-3 mt-6">
                  {[
                    { icon: Building2, label: 'Find Hospital', desc: 'Cashless network', action: () => setTab('network') },
                    { icon: Download, label: 'Download Card', desc: 'E-Health card', action: () => { setECardPlan(plans.find(p => p.type === 'gmc') || plans[0]); setShowECard(true); } },
                    { icon: Phone, label: 'Claim Help', desc: '24/7 support', action: () => navigate('/emergency') },
                    { icon: FileCheck, label: 'Pre-Auth', desc: 'Check status', action: () => setTab('claims') },
                  ].map((a, i) => (
                    <motion.button key={i} onClick={a.action}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * MOTION_STAGGER, duration: 0.25 }}
                      className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-800/50 border border-white/[0.06] hover:border-white/[0.12] hover:bg-slate-800/80 transition-all text-left">
                      <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                        <a.icon className="h-4 w-4 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{a.label}</p>
                        <p className="text-[10px] text-slate-500">{a.desc}</p>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ─── Claims Tab ──────────────────────────────────────────────── */}
          {tab === 'claims' && (
            <motion.div key="claims" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
              <div className="space-y-4 pb-8">
                {/* File New Claim CTA */}
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  className="bg-gradient-to-r from-blue-600/20 to-cyan-600/10 border border-blue-500/20 rounded-2xl p-4 flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Camera className="h-6 w-6 text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-white">Instant Claim Filing</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Snap receipts → AI extracts details → Claim filed in 60 seconds</p>
                  </div>
                  <Button size="sm" onClick={() => navigate('/claims-express?source=benefits-claims-tab')}
                    className="bg-blue-600 hover:bg-blue-500 border-0 rounded-xl text-xs">
                    File Now
                  </Button>
                </motion.div>

                {/* Claims List */}
                {claims.map((claim, i) => {
                  const cfg = statusConfig[claim.status] || statusConfig.submitted;
                  const StatusIcon = cfg.icon;
                  return (
                    <motion.div key={claim.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * MOTION_STAGGER, duration: 0.25 }}>
                      <Card className="!p-0 overflow-hidden border-white/[0.06] bg-slate-900/50">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-sm font-semibold text-white">{claim.claimNumber}</p>
                                <Badge className={`${cfg.bg} ${cfg.color} border-0 text-[10px] gap-1`}>
                                  <StatusIcon className="h-3 w-3" /> {cfg.label}
                                </Badge>
                              </div>
                              <p className="text-xs text-slate-500">{claim.type} • {claim.hospital} • {claim.member}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-white">{fmtFull(claim.amount)}</p>
                              {claim.approvedAmount && (
                                <p className="text-[10px] text-emerald-400">Approved: {fmtFull(claim.approvedAmount)}</p>
                              )}
                            </div>
                          </div>

                          {/* Timeline */}
                          <div className="flex items-center gap-0 mt-3">
                            {claim.timeline.map((step, j) => (
                              <div key={j} className="flex items-center flex-1">
                                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                                  step.status === 'done' ? 'bg-emerald-500' :
                                  step.status === 'current' ? 'bg-amber-500 animate-pulse' :
                                  'bg-slate-700'
                                }`} />
                                {j < claim.timeline.length - 1 && (
                                  <div className={`h-0.5 flex-1 mx-1 ${
                                    step.status === 'done' ? 'bg-emerald-500/50' : 'bg-slate-800'
                                  }`} />
                                )}
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-between mt-1">
                            {claim.timeline.map((step, j) => (
                              <p key={j} className={`text-[8px] ${
                                step.status === 'current' ? 'text-amber-400 font-medium' :
                                step.status === 'done' ? 'text-slate-500' : 'text-slate-700'
                              }`}>{step.step}</p>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}

                {claims.length === 0 && (
                  <div className="text-center py-12">
                    <Receipt className="h-12 w-12 text-slate-700 mx-auto mb-3" />
                    <p className="text-slate-500 text-sm">
                      {claimsDataStatus === 'live' ? 'No claims filed yet' : 'Claims data is currently unavailable'}
                    </p>
                    {claimsDataStatus === 'unavailable' && (
                      <p className="text-slate-600 text-xs mt-1">You can still file a claim. Timeline updates appear once claims service syncs.</p>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ─── Family Tab ──────────────────────────────────────────────── */}
          {tab === 'family' && (
            <motion.div key="family" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
              <div className="space-y-4 pb-8">
                {family.map((member, i) => (
                  <motion.div key={member.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}>
                    <Card className="!p-0 overflow-hidden border-white/[0.06] bg-slate-900/50 hover:border-white/[0.12] transition-all">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-blue-500/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-lg">{member.relation === 'Self' ? '👤' : member.relation === 'Spouse' ? '💑' : member.age < 10 ? '👶' : '👧'}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-semibold text-white truncate">{member.name}</h3>
                              {member.covered && (
                                <Badge className="bg-emerald-500/10 text-emerald-400 border-0 text-[10px]">
                                  <ShieldCheck className="h-3 w-3 mr-0.5" /> Covered
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">{member.relation} • {member.age} yrs • {member.gender === 'M' ? 'Male' : 'Female'}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            {member.healthScore && (
                              <div className="flex items-center gap-1.5">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{
                                  background: `conic-gradient(${member.healthScore > 80 ? '#10b981' : member.healthScore > 60 ? '#f59e0b' : '#ef4444'} ${member.healthScore * 3.6}deg, #1e293b 0deg)`
                                }}>
                                  <div className="w-6 h-6 rounded-full bg-slate-900 flex items-center justify-center">
                                    <span className="text-[9px] font-bold text-white">{member.healthScore}</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}

                {/* Add Family Member */}
                <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                  className="w-full p-4 rounded-xl border-2 border-dashed border-slate-700 hover:border-blue-500/50 text-slate-500 hover:text-blue-400 flex items-center justify-center gap-2 transition-all">
                  <Users className="h-4 w-4" />
                  <span className="text-sm font-medium">Add Family Member</span>
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ─── Network Tab ─────────────────────────────────────────────── */}
          {tab === 'network' && (
            <motion.div key="network" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
              <div className="space-y-4 pb-8">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <Input value={networkSearch} onChange={e => setNetworkSearch(e.target.value)}
                    placeholder="Search hospitals, clinics, labs..."
                    className="pl-10 bg-slate-800/50 border-white/[0.08] text-white placeholder:text-slate-600 rounded-xl" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { count: '6,200+', label: 'Hospitals', icon: Building2, color: 'text-blue-400' },
                    { count: '12,000+', label: 'Clinics', icon: Stethoscope, color: 'text-emerald-400' },
                    { count: '4,500+', label: 'Labs', icon: Activity, color: 'text-violet-400' },
                    { count: '2,800+', label: 'Pharmacies', icon: Pill, color: 'text-amber-400' },
                  ].map((s, i) => (
                    <Card key={i} className="!p-3 border-white/[0.06] bg-slate-900/50 text-center">
                      <s.icon className={`h-5 w-5 ${s.color} mx-auto mb-1`} />
                      <p className="text-lg font-bold text-white">{s.count}</p>
                      <p className="text-[10px] text-slate-500">{s.label}</p>
                    </Card>
                  ))}
                </div>

                {/* Featured Hospitals */}
                <h3 className="text-sm font-semibold text-white mt-4">Near You</h3>
                {[
                  { name: 'Apollo Hospitals', dist: '2.3 km', rating: 4.8, cashless: true, specialties: ['Cardiology', 'Ortho', 'Neuro'] },
                  { name: 'Fortis Healthcare', dist: '3.1 km', rating: 4.6, cashless: true, specialties: ['Oncology', 'Cardiac', 'Gastro'] },
                  { name: 'Max Super Speciality', dist: '4.7 km', rating: 4.7, cashless: true, specialties: ['Transplant', 'Neuro', 'Spine'] },
                ].map((h, i) => (
                  <Card key={i} className="!p-0 overflow-hidden border-white/[0.06] bg-slate-900/50">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                            <Building2 className="h-5 w-5 text-blue-400" />
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-white">{h.name}</h4>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                                <MapPin className="h-3 w-3" /> {h.dist}
                              </span>
                              <span className="text-[10px] text-amber-400 flex items-center gap-0.5">
                                <Star className="h-3 w-3 fill-amber-400" /> {h.rating}
                              </span>
                              {h.cashless && (
                                <Badge className="bg-emerald-500/10 text-emerald-400 border-0 text-[8px]">Cashless</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" className="border-white/10 text-xs rounded-lg h-8">
                          <Navigation className="h-3 w-3 mr-1" /> Navigate
                        </Button>
                      </div>
                      <div className="flex gap-1.5 mt-3">
                        {h.specialties.map(s => (
                          <Badge key={s} variant="outline" className="text-[9px] border-white/10 text-slate-400">{s}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}

                <Button variant="outline" className="w-full border-white/10 text-slate-400 hover:text-white rounded-xl gap-2"
                  onClick={() => navigate('/patient/network-hospitals')}>
                  <MapPin className="h-4 w-4" /> View All Network Providers
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── E-Card Modal ────────────────────────────────────────────────── */}
      <Dialog open={showECard} onOpenChange={setShowECard}>
        <DialogContent className="bg-slate-900 border-white/10 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white text-sm">
              {eCardPlan ? `${eCardPlan.name} — E-Card` : 'Digital Health Card'}
            </DialogTitle>
          </DialogHeader>
          {eCardPlan && (() => {
            const EcIcon = typeIcon[eCardPlan.type] || Shield;
            const ecGradient = typeGradient[eCardPlan.type] || typeGradient.gmc;
            const coveredMembers = family.slice(0, eCardPlan.familyCovered);
            const otherCards = plans.filter(p => eCardEligible.has(p.type) && p.id !== eCardPlan.id);
            return (
              <div className="space-y-4">
                {/* Card visual */}
                <div className={`bg-gradient-to-br ${ecGradient} rounded-2xl p-5 relative overflow-hidden`}>
                  <div className="absolute top-0 right-0 w-28 h-28 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                  <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
                  <div className="relative">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <EcIcon className="h-4 w-4 text-white/80" />
                        <span className="text-[10px] font-semibold text-white/80 uppercase tracking-wider">Mediqzy Health Card</span>
                      </div>
                      <QrCode className="h-6 w-6 text-white/60" />
                    </div>
                    <h3 className="text-base font-bold text-white">{eCardPlan.insurer}</h3>
                    <p className="text-xs text-white/60 mb-3">{eCardPlan.name}</p>
                    {/* Covered members */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {coveredMembers.map(m => (
                        <span key={m.id} className="inline-flex items-center text-[10px] bg-white/15 text-white px-2 py-0.5 rounded-full font-medium">
                          {m.name} <span className="text-white/50 ml-1">({m.relation})</span>
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center justify-between border-t border-white/10 pt-3">
                      <div>
                        <p className="text-[9px] text-white/50 mb-0.5">Policy No.</p>
                        <p className="text-[11px] font-mono text-white/80">{eCardPlan.policyNumber}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] text-white/50 mb-0.5">Cover</p>
                        <p className="text-[11px] font-mono text-white/80">{fmt(eCardPlan.sumInsured)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] text-white/50 mb-0.5">Valid Till</p>
                        <p className="text-[11px] font-mono text-white/80">{new Date(eCardPlan.validTo).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Switch to other policy cards */}
                {otherCards.length > 0 && (
                  <div>
                    <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-2">Your Other Cards</p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {otherCards.map(p => {
                        const PIcon = typeIcon[p.type] || Shield;
                        const pGrad = typeGradient[p.type] || typeGradient.gmc;
                        return (
                          <button key={p.id} onClick={() => setECardPlan(p)}
                            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r ${pGrad} text-white text-[10px] font-medium shadow-sm`}>
                            <PIcon className="h-3 w-3" />
                            {p.name.split(' ').slice(0, 2).join(' ')}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button className="flex-1 bg-blue-600 hover:bg-blue-500 border-0 rounded-xl gap-1 text-sm">
                    <Download className="h-4 w-4" /> Download
                  </Button>
                  <Button variant="outline" className="flex-1 border-white/10 text-slate-300 rounded-xl gap-1 text-sm">
                    <Share2 className="h-4 w-4" /> Share
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ─── Plan Detail Modal ───────────────────────────────────────────── */}
      <Dialog open={!!selectedPlan} onOpenChange={() => setSelectedPlan(null)}>
        <DialogContent className="bg-slate-900 border-white/10 max-w-md max-h-[80vh] overflow-y-auto">
          {selectedPlan && (() => {
            const Icon = typeIcon[selectedPlan.type] || Shield;
            const gradient = typeGradient[selectedPlan.type] || typeGradient.gmc;
            return (
              <>
                <div className={`bg-gradient-to-r ${gradient} -mx-6 -mt-6 p-6 rounded-t-lg`}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h2 className="font-bold text-white">{selectedPlan.name}</h2>
                      <p className="text-xs text-white/70">{selectedPlan.insurer}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-4 mt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-800/50 rounded-xl p-3 text-center">
                      <p className="text-[10px] text-slate-500 uppercase">Sum Insured</p>
                      <p className="text-lg font-bold text-white">{fmt(selectedPlan.sumInsured)}</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-xl p-3 text-center">
                      <p className="text-[10px] text-slate-500 uppercase">Available</p>
                      <p className="text-lg font-bold text-emerald-400">{fmt(selectedPlan.remaining)}</p>
                    </div>
                  </div>

                  {selectedPlan.sublimits.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Sub-Limits</h4>
                      {selectedPlan.sublimits.map((sl, i) => (
                        <div key={i} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                          <span className="text-sm text-slate-300">{sl.name}</span>
                          <div className="text-right">
                            <span className="text-sm text-white font-medium">{fmtFull(sl.limit)}</span>
                            {sl.used > 0 && <span className="text-[10px] text-amber-400 ml-2">{fmtFull(sl.used)} used</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div>
                    <h4 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Coverage Features</h4>
                    <div className="space-y-1.5">
                      {selectedPlan.features.map((f, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                          <span className="text-sm text-slate-300">{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button className="flex-1 bg-blue-600 hover:bg-blue-500 border-0 rounded-xl" onClick={() => { setSelectedPlan(null); navigate('/claims-express?source=benefits-plan'); }}>
                      File Claim
                    </Button>
                    {eCardEligible.has(selectedPlan.type) && (
                      <Button variant="outline" className="flex-1 border-white/10 rounded-xl gap-1" onClick={() => { setECardPlan(selectedPlan); setSelectedPlan(null); setShowECard(true); }}>
                        <CreditCard className="h-4 w-4" /> E-Card
                      </Button>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
    </MainLayout>
  );
}
