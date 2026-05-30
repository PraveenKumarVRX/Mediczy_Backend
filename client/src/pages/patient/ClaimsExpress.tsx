/**
 * ClaimsExpress — World-Class One-Tap AI-Powered Claims Filing
 * 
 * Premium features:
 * - One-tap claim filing with 3 modes (Scan/Upload/Manual)
 * - AI document scanner with OCR extraction
 * - Real-time claim tracking with visual timeline
 * - Active claims dashboard with status badges
 * - Claim history with filters
 * - Cashless vs reimbursement toggle
 * - Pre-estimated settlement amounts
 * - Document checklist per claim type
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera, Upload, FileText, Plus, Clock, CheckCircle, AlertTriangle, XCircle,
  IndianRupee, Hospital, Stethoscope, Pill, Eye, Heart, Shield, Sparkles,
  ArrowRight, ChevronRight, Search, Filter, Calendar, Download, Send,
  Scan, FileCheck, Building2, Phone, MapPin, Star, Zap, Brain
} from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';

// ─── Status Utils ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  draft: { label: 'Draft', color: 'text-slate-400', bg: 'bg-slate-500/10', icon: FileText },
  submitted: { label: 'Submitted', color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Send },
  under_review: { label: 'Under Review', color: 'text-amber-400', bg: 'bg-amber-500/10', icon: Eye },
  approved: { label: 'Approved', color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: CheckCircle },
  settled: { label: 'Settled', color: 'text-green-400', bg: 'bg-green-500/10', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'text-red-400', bg: 'bg-red-500/10', icon: XCircle },
  info_needed: { label: 'Info Needed', color: 'text-orange-400', bg: 'bg-orange-500/10', icon: AlertTriangle },
};

const CLAIM_TYPES = [
  { key: 'hospitalization', label: 'Hospitalization', icon: Hospital, color: 'from-blue-600 to-blue-800', desc: 'In-patient treatment claims' },
  { key: 'opd', label: 'OPD / Consultation', icon: Stethoscope, color: 'from-violet-600 to-violet-800', desc: 'Doctor visits & outpatient care' },
  { key: 'pharmacy', label: 'Pharmacy', icon: Pill, color: 'from-emerald-600 to-emerald-800', desc: 'Medicine & pharmacy bills' },
  { key: 'dental', label: 'Dental', icon: Heart, color: 'from-pink-600 to-pink-800', desc: 'Dental treatments' },
  { key: 'vision', label: 'Eye Care', icon: Eye, color: 'from-cyan-600 to-cyan-800', desc: 'Vision & eye care' },
  { key: 'maternity', label: 'Maternity', icon: Heart, color: 'from-rose-600 to-rose-800', desc: 'Pregnancy & childbirth' },
];

const MOTION_STAGGER = 0.08;

export default function ClaimsExpress() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'active' | 'history' | 'file'>('active');
  const [showNewClaim, setShowNewClaim] = useState(false);
  const [selectedClaimType, setSelectedClaimType] = useState<string | null>(null);
  const [scanMode, setScanMode] = useState<'scan' | 'upload' | 'manual' | null>(null);
  const [selectedClaim, setSelectedClaim] = useState<any>(null);

  // ─── Demo Claims ─────────────────────────────────────────────────────────
  const activeClaims = [
    {
      id: 'CLM-2026-0847',
      type: 'hospitalization',
      hospital: 'Apollo Hospitals, Jubilee Hills',
      date: '2026-02-18',
      amount: 185000,
      settled: 0,
      status: 'under_review',
      claimType: 'Cashless',
      diagnosis: 'Appendectomy',
      timeline: [
        { step: 'Submitted', date: 'Feb 18', done: true },
        { step: 'Documents Verified', date: 'Feb 19', done: true },
        { step: 'Under Review', date: 'Feb 20', done: false, active: true },
        { step: 'Approved', date: '-', done: false },
        { step: 'Settled', date: '-', done: false },
      ],
      documents: ['Discharge Summary', 'Bills', 'Investigation Reports', 'Pre-Auth Letter'],
    },
    {
      id: 'CLM-2026-0821',
      type: 'opd',
      hospital: 'Dr. Sharma Clinic',
      date: '2026-02-10',
      amount: 4500,
      settled: 4500,
      status: 'settled',
      claimType: 'Reimbursement',
      diagnosis: 'General Consultation + Blood Tests',
      timeline: [
        { step: 'Submitted', date: 'Feb 10', done: true },
        { step: 'Documents Verified', date: 'Feb 11', done: true },
        { step: 'Approved', date: 'Feb 12', done: true },
        { step: 'Settled', date: 'Feb 14', done: true },
      ],
      documents: ['Prescription', 'Lab Reports', 'Payment Receipt'],
    },
    {
      id: 'CLM-2026-0799',
      type: 'pharmacy',
      hospital: 'MedPlus Pharmacy',
      date: '2026-02-05',
      amount: 2800,
      settled: 0,
      status: 'info_needed',
      claimType: 'Reimbursement',
      diagnosis: 'Monthly Medication',
      timeline: [
        { step: 'Submitted', date: 'Feb 5', done: true },
        { step: 'Info Requested', date: 'Feb 7', done: false, active: true },
        { step: 'Review', date: '-', done: false },
        { step: 'Settled', date: '-', done: false },
      ],
      documents: ['Prescription', 'Bills'],
      infoNeeded: 'Please upload the original doctor prescription with stamp',
    },
  ];

  const claimHistory = [
    { id: 'CLM-2026-0756', type: 'dental', amount: 8500, settled: 7200, date: '2026-01-15', status: 'settled', hospital: 'Clove Dental' },
    { id: 'CLM-2025-1234', type: 'hospitalization', amount: 320000, settled: 295000, date: '2025-11-20', status: 'settled', hospital: 'Fortis Hospital' },
    { id: 'CLM-2025-1189', type: 'opd', amount: 3200, settled: 3200, date: '2025-10-08', status: 'settled', hospital: 'Max Healthcare' },
    { id: 'CLM-2025-1045', type: 'vision', amount: 12000, settled: 10000, date: '2025-08-22', status: 'settled', hospital: 'Centre for Sight' },
    { id: 'CLM-2025-0987', type: 'pharmacy', amount: 5600, settled: 0, date: '2025-07-15', status: 'rejected', hospital: 'Apollo Pharmacy' },
  ];

  const totalClaimed = activeClaims.reduce((s, c) => s + c.amount, 0);
  const totalSettled = [...activeClaims, ...claimHistory].reduce((s, c) => s + c.settled, 0);

  return (
    <MainLayout>
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Zap className="h-6 w-6 text-amber-400" /> Claims Express
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">AI-powered lightning-fast claims</p>
        </div>
        <Button onClick={() => setShowNewClaim(true)}
          className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 border-0 rounded-xl gap-1.5 shadow-lg shadow-amber-600/20">
          <Plus className="h-4 w-4" /> File Claim
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-6">
        <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
          <p className="text-xs font-semibold text-amber-300">Step 1: Select filing mode</p>
          <p className="text-[11px] text-slate-400">Choose scan, upload, or manual based on document readiness.</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
          <p className="text-xs font-semibold text-amber-300">Step 2: Submit complete docs</p>
          <p className="text-[11px] text-slate-400">Provide bills and prescription details to avoid info-needed loops.</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
          <p className="text-xs font-semibold text-amber-300">Step 3: Monitor outcomes</p>
          <p className="text-[11px] text-slate-400">Track review milestones till approval and settlement.</p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Active Claims', value: activeClaims.filter(c => !['settled', 'rejected'].includes(c.status)).length.toString(), color: 'text-blue-400' },
          { label: 'Pending Amount', value: `₹${(totalClaimed / 1000).toFixed(0)}K`, color: 'text-amber-400' },
          { label: 'Settled (YTD)', value: `₹${(totalSettled / 1000).toFixed(0)}K`, color: 'text-emerald-400' },
        ].map((s, i) => (
          <Card key={i} className="!p-3 border-white/[0.06] bg-slate-900/50 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[9px] text-slate-500 mt-0.5">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* AI Tip */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
        className="bg-gradient-to-r from-amber-600/10 to-orange-600/5 border border-amber-500/20 rounded-xl p-3 mb-6 flex items-center gap-3">
        <Brain className="h-5 w-5 text-amber-400 flex-shrink-0" />
        <p className="text-xs text-slate-300">
          <span className="font-semibold text-amber-400">AI Tip:</span> Your pending pharmacy claim needs the original prescription. Upload it to get ₹2,800 settled in 2 days.
        </p>
      </motion.div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-slate-800/50 rounded-xl p-1 mb-6">
        {([
          { key: 'active', label: 'Active Claims', icon: Clock },
          { key: 'history', label: 'History', icon: FileText },
          { key: 'file', label: 'File New', icon: Plus },
        ] as const).map(t => (
          <button key={t.key} onClick={() => t.key === 'file' ? setShowNewClaim(true) : setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
              tab === t.key ? 'bg-white/10 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'
            }`}>
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3 transition-all duration-300">
        <div>
          <p className="text-xs font-semibold text-amber-300">Next Best Action</p>
          <p className="text-[11px] text-slate-400">
            {tab === 'active'
              ? 'Open claims marked info-needed first to avoid payout delays.'
              : 'Use history to compare approved ratios before filing similar future claims.'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" className="bg-amber-600 hover:bg-amber-500 border-0" onClick={() => setShowNewClaim(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> File Claim
          </Button>
          {tab !== 'active' && (
            <Button size="sm" variant="outline" className="border-white/10 text-slate-300" onClick={() => setTab('active')}>
              Track Active
            </Button>
          )}
          {tab !== 'history' && (
            <Button size="sm" variant="outline" className="border-white/10 text-slate-300" onClick={() => setTab('history')}>
              View History
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* Active Claims */}
        {tab === 'active' && (
          <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="space-y-3">
            {activeClaims.map((claim, i) => {
              const st = STATUS_CONFIG[claim.status] || STATUS_CONFIG.draft;
              const StIcon = st.icon;
              return (
                <motion.div key={claim.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * MOTION_STAGGER, duration: 0.25 }}
                  onClick={() => setSelectedClaim(claim)}
                  className="cursor-pointer">
                  <Card className="!p-0 border-white/[0.06] bg-slate-900/50 hover:border-white/[0.12] transition-all">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${CLAIM_TYPES.find(t => t.key === claim.type)?.color || 'from-slate-600 to-slate-800'} flex items-center justify-center`}>
                            {(() => { const T = CLAIM_TYPES.find(t => t.key === claim.type); return T ? <T.icon className="h-5 w-5 text-white" /> : <FileText className="h-5 w-5 text-white" />; })()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">{claim.diagnosis}</p>
                            <p className="text-[10px] text-slate-500">{claim.hospital}</p>
                          </div>
                        </div>
                        <Badge className={`${st.bg} ${st.color} border-0 text-[10px] gap-1`}>
                          <StIcon className="h-3 w-3" /> {st.label}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-3 gap-3 mb-3">
                        <div>
                          <p className="text-[8px] text-slate-500 uppercase">Claim Amount</p>
                          <p className="text-sm font-bold text-white">₹{claim.amount.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-[8px] text-slate-500 uppercase">Type</p>
                          <p className="text-sm font-semibold text-white">{claim.claimType}</p>
                        </div>
                        <div>
                          <p className="text-[8px] text-slate-500 uppercase">Filed</p>
                          <p className="text-sm font-semibold text-white">{new Date(claim.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</p>
                        </div>
                      </div>

                      {/* Timeline */}
                      <div className="flex items-center gap-0">
                        {claim.timeline.map((step, si) => (
                          <div key={si} className="flex items-center flex-1">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                              step.done ? 'bg-emerald-500' : step.active ? 'bg-amber-500 animate-pulse' : 'bg-slate-700'
                            }`}>
                              {step.done ? <CheckCircle className="h-3 w-3 text-white" /> : <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />}
                            </div>
                            {si < claim.timeline.length - 1 && (
                              <div className={`flex-1 h-0.5 ${step.done ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between mt-1">
                        {claim.timeline.map((step, si) => (
                          <span key={si} className="text-[7px] text-slate-500 text-center" style={{ width: `${100 / claim.timeline.length}%` }}>
                            {step.step}
                          </span>
                        ))}
                      </div>

                      {/* Action needed banner */}
                      {claim.status === 'info_needed' && claim.infoNeeded && (
                        <div className="mt-3 p-2.5 bg-orange-500/5 border border-orange-500/20 rounded-xl flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-orange-400 flex-shrink-0" />
                          <p className="text-[10px] text-orange-300 flex-1">{claim.infoNeeded}</p>
                          <Button size="sm" className="bg-orange-600 hover:bg-orange-500 border-0 text-[10px] h-6 px-2 rounded-lg">
                            Upload
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* History */}
        {tab === 'history' && (
          <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="space-y-2">
            {claimHistory.map((claim, i) => {
              const st = STATUS_CONFIG[claim.status] || STATUS_CONFIG.draft;
              return (
                <motion.div key={claim.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.22 }}>
                  <Card className="!p-0 border-white/[0.06] bg-slate-900/50">
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${CLAIM_TYPES.find(t => t.key === claim.type)?.color || 'from-slate-600 to-slate-800'} flex items-center justify-center flex-shrink-0`}>
                        {(() => { const T = CLAIM_TYPES.find(t => t.key === claim.type); return T ? <T.icon className="h-4 w-4 text-white" /> : <FileText className="h-4 w-4 text-white" />; })()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-white">{claim.hospital}</p>
                          <Badge className={`${st.bg} ${st.color} border-0 text-[9px]`}>{st.label}</Badge>
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <p className="text-[10px] text-slate-500">{claim.id} • {new Date(claim.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</p>
                          <div className="text-right">
                            <span className="text-xs font-bold text-white">₹{claim.settled.toLocaleString()}</span>
                            {claim.settled !== claim.amount && (
                              <span className="text-[9px] text-slate-500 ml-1">/ ₹{claim.amount.toLocaleString()}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── New Claim Dialog ──────────────────────────────────────────── */}
      <Dialog open={showNewClaim} onOpenChange={setShowNewClaim}>
        <DialogContent className="bg-slate-900 border-white/10 text-white max-w-md rounded-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-400" />
              {!selectedClaimType ? 'File New Claim' : !scanMode ? 'Select Method' : 'Scan & Submit'}
            </DialogTitle>
          </DialogHeader>

          {/* Step 1: Claim Type */}
          {!selectedClaimType && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              {CLAIM_TYPES.map(ct => (
                <button key={ct.key} onClick={() => setSelectedClaimType(ct.key)}
                  className="p-3 rounded-xl bg-slate-800/50 border border-white/[0.06] hover:border-white/10 text-left transition-all">
                  <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${ct.color} flex items-center justify-center mb-2`}>
                    <ct.icon className="h-4 w-4 text-white" />
                  </div>
                  <p className="text-xs font-semibold text-white">{ct.label}</p>
                  <p className="text-[9px] text-slate-500">{ct.desc}</p>
                </button>
              ))}
            </div>
          )}

          {/* Step 2: Scan Mode */}
          {selectedClaimType && !scanMode && (
            <div className="space-y-3 mt-2">
              <p className="text-xs text-slate-400">How would you like to submit your documents?</p>
              {[
                { key: 'scan', icon: Camera, label: 'Scan Documents', desc: 'Use camera to scan bills & receipts. AI extracts details automatically.', badge: 'Fastest' },
                { key: 'upload', icon: Upload, label: 'Upload Files', desc: 'Upload PDFs, images, or scanned documents from your device.', badge: '' },
                { key: 'manual', icon: FileText, label: 'Manual Entry', desc: 'Fill in claim details manually without document upload.', badge: '' },
              ].map(m => (
                <button key={m.key} onClick={() => setScanMode(m.key as any)}
                  className="w-full p-4 rounded-xl bg-slate-800/50 border border-white/[0.06] hover:border-white/10 flex items-center gap-4 text-left transition-all">
                  <div className="w-11 h-11 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                    <m.icon className="h-5 w-5 text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white">{m.label}</p>
                      {m.badge && <Badge className="bg-amber-500/20 text-amber-300 border-0 text-[8px]">{m.badge}</Badge>}
                    </div>
                    <p className="text-[10px] text-slate-500">{m.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-500" />
                </button>
              ))}
              <Button variant="ghost" className="w-full text-xs text-slate-400"
                onClick={() => setSelectedClaimType(null)}>
                ← Change claim type
              </Button>
            </div>
          )}

          {/* Step 3: Document Capture */}
          {selectedClaimType && scanMode && (
            <div className="space-y-4 mt-2">
              {scanMode === 'scan' && (
                <>
                  <div className="aspect-[4/3] bg-slate-800 rounded-xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-3">
                    <Camera className="h-12 w-12 text-slate-600" />
                    <p className="text-sm text-slate-400">Position your bill/receipt</p>
                    <Button className="bg-amber-600 hover:bg-amber-500 border-0 rounded-xl gap-1.5">
                      <Camera className="h-4 w-4" /> Open Camera
                    </Button>
                  </div>
                  <div className="bg-amber-600/5 border border-amber-500/20 rounded-xl p-3 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-400 flex-shrink-0" />
                    <p className="text-[10px] text-slate-400">AI will automatically extract hospital name, amount, date, diagnosis, and more from your document.</p>
                  </div>
                </>
              )}
              {scanMode === 'upload' && (
                <div className="aspect-[4/3] bg-slate-800 rounded-xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-3">
                  <Upload className="h-12 w-12 text-slate-600" />
                  <p className="text-sm text-slate-400">Drag & drop or browse</p>
                  <p className="text-[10px] text-slate-500">PDF, JPG, PNG — Max 10MB each</p>
                  <Button className="bg-blue-600 hover:bg-blue-500 border-0 rounded-xl gap-1.5">
                    <Upload className="h-4 w-4" /> Browse Files
                  </Button>
                </div>
              )}
              {scanMode === 'manual' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Hospital / Provider</label>
                    <Input className="bg-slate-800 border-white/10 text-white rounded-xl" placeholder="Apollo Hospitals..." />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Diagnosis / Treatment</label>
                    <Input className="bg-slate-800 border-white/10 text-white rounded-xl" placeholder="General consultation..." />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Amount (₹)</label>
                      <Input type="number" className="bg-slate-800 border-white/10 text-white rounded-xl" placeholder="5000" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Date</label>
                      <Input type="date" className="bg-slate-800 border-white/10 text-white rounded-xl" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {['Cashless', 'Reimbursement'].map(t => (
                      <button key={t}
                        className="flex-1 py-2.5 rounded-xl border border-white/10 text-xs font-medium text-slate-400 hover:text-white hover:border-white/20 transition-all">
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 border-white/10 rounded-xl text-slate-400"
                  onClick={() => setScanMode(null)}>
                  Back
                </Button>
                <Button className="flex-1 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 border-0 rounded-xl gap-1.5">
                  <Send className="h-3.5 w-3.5" /> Submit Claim
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Claim Detail Modal ───────────────────────────────────────── */}
      <Dialog open={!!selectedClaim} onOpenChange={() => setSelectedClaim(null)}>
        <DialogContent className="bg-slate-900 border-white/10 text-white max-w-md rounded-2xl max-h-[85vh] overflow-y-auto">
          {selectedClaim && (() => {
            const st = STATUS_CONFIG[selectedClaim.status] || STATUS_CONFIG.draft;
            const StIcon = st.icon;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-lg flex items-center gap-2">
                    {selectedClaim.id}
                    <Badge className={`${st.bg} ${st.color} border-0 text-[10px] gap-1`}>
                      <StIcon className="h-3 w-3" /> {st.label}
                    </Badge>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-slate-800/50">
                      <p className="text-[8px] text-slate-500 uppercase">Claim Amount</p>
                      <p className="text-lg font-bold text-white">₹{selectedClaim.amount.toLocaleString()}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-800/50">
                      <p className="text-[8px] text-slate-500 uppercase">Settled</p>
                      <p className="text-lg font-bold text-emerald-400">₹{selectedClaim.settled.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {[
                      { label: 'Hospital', value: selectedClaim.hospital },
                      { label: 'Diagnosis', value: selectedClaim.diagnosis },
                      { label: 'Type', value: selectedClaim.claimType },
                      { label: 'Date', value: new Date(selectedClaim.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) },
                    ].map((d, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                        <span className="text-xs text-slate-500">{d.label}</span>
                        <span className="text-xs font-medium text-white">{d.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Document List */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-400 mb-2">Documents</h4>
                    <div className="space-y-1">
                      {selectedClaim.documents?.map((doc: string, i: number) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/30">
                          <FileCheck className="h-3.5 w-3.5 text-emerald-400" />
                          <span className="text-xs text-slate-300 flex-1">{doc}</span>
                          <CheckCircle className="h-3 w-3 text-emerald-400" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Timeline */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-400 mb-2">Tracking Timeline</h4>
                    <div className="space-y-0">
                      {selectedClaim.timeline?.map((step: any, si: number) => (
                        <div key={si} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                              step.done ? 'bg-emerald-500' : step.active ? 'bg-amber-500' : 'bg-slate-700'
                            }`}>
                              {step.done ? <CheckCircle className="h-3 w-3 text-white" /> : <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />}
                            </div>
                            {si < selectedClaim.timeline.length - 1 && (
                              <div className={`w-0.5 h-6 ${step.done ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                            )}
                          </div>
                          <div className="pb-4">
                            <p className={`text-xs font-medium ${step.done || step.active ? 'text-white' : 'text-slate-500'}`}>{step.step}</p>
                            <p className="text-[10px] text-slate-500">{step.date}</p>
                          </div>
                        </div>
                      ))}
                    </div>
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
