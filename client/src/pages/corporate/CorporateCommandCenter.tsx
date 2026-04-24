/**
 * CorporateCommandCenter — World-Class Executive Health Analytics
 * 
 * Premium corporate dashboard with:
 * - Real-time employee wellness heatmap
 * - Claims cost analytics & predictions
 * - Department-wise health scorecards
 * - ROI tracking for wellness programs
 * - Absenteeism cost analysis
 * - Risk stratification engine
 * - Predictive health alerts
 * - Executive summary & reports
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Users, Heart, TrendingUp, TrendingDown, Shield, Activity,
  AlertTriangle, Brain, BarChart3, PieChart as PieIcon, Calendar, Clock,
  FileText, Download, RefreshCw, ChevronRight, Sparkles, Zap, Target,
  IndianRupee, Stethoscope, Pill, Award, Flame, Crown, Eye, ArrowRight,
  ArrowUp, ArrowDown, Minus, CheckCircle, XCircle, Bell, Settings
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, RadialBarChart,
  RadialBar
} from 'recharts';
import api from '@/utils/api';
import { useAuth } from '@/auth/AuthProvider';
import CorporateLayout from '@/components/corporate/CorporateLayout';

// ─── Colors ──────────────────────────────────────────────────────────────────
const RISK_COLORS = { low: '#10b981', medium: '#f59e0b', high: '#f97316', critical: '#ef4444' };
const DEPT_COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];
const PIE_COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmt = (n: number) => n >= 10000000 ? `₹${(n / 10000000).toFixed(1)}Cr` : n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : `₹${(n / 1000).toFixed(0)}K`;
const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
const TrendIcon = ({ val }: { val: number }) => val > 0 ? <ArrowUp className="h-3 w-3 text-emerald-400" /> : val < 0 ? <ArrowDown className="h-3 w-3 text-red-400" /> : <Minus className="h-3 w-3 text-slate-400" />;

// ─── Component ───────────────────────────────────────────────────────────────
export default function CorporateCommandCenter() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'overview' | 'claims' | 'wellness' | 'departments'>('overview');
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'month' | 'quarter' | 'year'>('quarter');

  // ─── Live Data State ──────────────────────────────────────────────────────
  const [kpis, setKpis] = useState({
    totalEmployees: 0,
    activeParticipants: 0,
    participationRate: 0,
    participationTrend: 0,
    avgHealthScore: null as number | null,
    healthScoreTrend: 0,
    totalClaimsCost: 0,
    claimsTrend: 0,
    absenteeismRate: null as number | null,
    absenteeismTrend: 0,
    wellnessROI: null as number | null,
    roiTrend: 0,
    avgClaimPerEmployee: null as number | null,
    highRiskEmployees: 0,
    criticalAlerts: 0,
  });
  const [riskDistribution, setRiskDistribution] = useState<Array<{ name: string; value: number; pct: number; color: string }>>([]);
  const [claimsTrend, setClaimsTrend] = useState<Array<{ month: string; claims: number; members: number }>>([]);
  const [departmentHealth, setDepartmentHealth] = useState<Array<{ dept: string; employees: number; healthScore: number | null; claimsCost: number; participation: number | null; absenteeism: number | null }>>([]);
  const [topConditions, setTopConditions] = useState<Array<{ condition: string; claims: number; cost: number; pct: number }>>([]);
  const [wellnessPrograms, setWellnessPrograms] = useState<Array<{ name: string; participants: number; completion: number; impact: string; cost: number; roi: number }>>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [summaryRes, analyticsRes] = await Promise.all([
          api.get('/corporate/dashboard/summary').catch(() => ({ data: null })),
          api.get('/corporate/dashboard/health-analytics').catch(() => ({ data: null })),
        ]);

        const summary = summaryRes.data?.data;
        const analytics = analyticsRes.data?.data;

        if (analytics) {
          const rd = analytics.riskDistribution || {};
          const total = analytics.totalEmployees || 0;
          const rdArr = [
            { name: 'Low Risk', value: rd.low || 0, pct: total ? Math.round((rd.low || 0) / total * 100 * 10) / 10 : 0, color: RISK_COLORS.low },
            { name: 'Medium Risk', value: rd.medium || 0, pct: total ? Math.round((rd.medium || 0) / total * 100 * 10) / 10 : 0, color: RISK_COLORS.medium },
            { name: 'High Risk', value: rd.high || 0, pct: total ? Math.round((rd.high || 0) / total * 100 * 10) / 10 : 0, color: RISK_COLORS.high },
            { name: 'Critical', value: rd.critical || 0, pct: total ? Math.round((rd.critical || 0) / total * 100 * 10) / 10 : 0, color: RISK_COLORS.critical },
          ];
          setRiskDistribution(rdArr.filter(r => r.value > 0));

          const deptRisks = analytics.departmentRisks || [];
          setDepartmentHealth(deptRisks.map((d: any) => ({
            dept: d.department,
            employees: d.totalEmployees,
            healthScore: null,
            claimsCost: 0,
            participation: null,
            absenteeism: null,
          })));

          const conditions = analytics.commonConditions || [];
          setTopConditions(conditions.map((c: any) => ({
            condition: c.condition,
            claims: c.count,
            cost: 0,
            pct: c.percentage || 0,
          })));

          setKpis(prev => ({
            ...prev,
            totalEmployees: analytics.totalEmployees || 0,
            highRiskEmployees: (rd.high || 0) + (rd.critical || 0),
            criticalAlerts: rd.critical || 0,
          }));
        }

        if (summary) {
          setKpis(prev => ({
            ...prev,
            totalEmployees: summary.KPIs?.activeEmployees || prev.totalEmployees,
          }));
        }
      } catch (e) {
        console.error('Command center load error', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <CorporateLayout>
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6">
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Building2 className="h-6 w-6 text-violet-400" /> Command Center
          </h1>
          <p className="text-sm text-slate-400 mt-1">{kpis.totalEmployees.toLocaleString()} employees • Real-time analytics</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-slate-800/50 rounded-lg p-0.5">
            {(['month', 'quarter', 'year'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  period === p ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'
                }`}>
                {p === 'month' ? '1M' : p === 'quarter' ? '3M' : '1Y'}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" className="border-white/10 text-slate-400 rounded-xl gap-1">
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        </div>
      </div>

      {/* ─── AI Insight Banner ────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-violet-600/15 to-blue-600/10 border border-violet-500/20 rounded-2xl p-4 mb-6 flex items-center gap-4">
        <div className="w-10 h-10 bg-violet-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
          <Sparkles className="h-5 w-5 text-violet-400" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-white font-medium">AI Insight</p>
          <p className="text-xs text-slate-400">Connect employee health data to unlock AI-driven risk insights and actionable wellness recommendations.</p>
        </div>
        <Button size="sm" className="bg-violet-600 hover:bg-violet-500 border-0 rounded-xl text-xs flex-shrink-0">
          View Details
        </Button>
      </motion.div>

      {/* ─── KPI Hero Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Employee Health Score', value: kpis.avgHealthScore != null ? kpis.avgHealthScore.toString() : '—', unit: '/100', trend: kpis.healthScoreTrend, icon: Heart, gradient: 'from-emerald-600/20 to-emerald-800/5', border: 'border-emerald-500/20', iconColor: 'text-emerald-400' },
          { label: 'Total Claims Cost', value: kpis.totalClaimsCost > 0 ? fmt(kpis.totalClaimsCost) : '—', unit: '', trend: kpis.claimsTrend, icon: IndianRupee, gradient: 'from-blue-600/20 to-blue-800/5', border: 'border-blue-500/20', iconColor: 'text-blue-400' },
          { label: 'Participation Rate', value: kpis.participationRate > 0 ? `${kpis.participationRate}` : '—', unit: kpis.participationRate > 0 ? '%' : '', trend: kpis.participationTrend, icon: Users, gradient: 'from-violet-600/20 to-violet-800/5', border: 'border-violet-500/20', iconColor: 'text-violet-400' },
          { label: 'Wellness ROI', value: kpis.wellnessROI != null ? `${kpis.wellnessROI}` : '—', unit: kpis.wellnessROI != null ? 'x' : '', trend: kpis.roiTrend, icon: TrendingUp, gradient: 'from-amber-600/20 to-amber-800/5', border: 'border-amber-500/20', iconColor: 'text-amber-400' },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
              <Card className={`!p-0 overflow-hidden bg-gradient-to-br ${kpi.gradient} ${kpi.border} border backdrop-blur-sm`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                      <Icon className={`h-4 w-4 ${kpi.iconColor}`} />
                    </div>
                    <div className={`flex items-center gap-0.5 text-[10px] font-medium ${kpi.trend > 0 && kpi.label !== 'Total Claims Cost' ? 'text-emerald-400' : kpi.trend < 0 && kpi.label === 'Total Claims Cost' ? 'text-emerald-400' : kpi.trend < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      <TrendIcon val={kpi.label === 'Total Claims Cost' ? -kpi.trend : kpi.trend} />
                      {Math.abs(kpi.trend).toFixed(1)}%
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-white">
                    {kpi.value}<span className="text-sm font-normal text-slate-400">{kpi.unit}</span>
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">{kpi.label}</p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* ─── Tab Navigation ──────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-slate-800/50 rounded-xl p-1 mb-6">
        {([
          { key: 'overview', label: 'Overview', icon: BarChart3 },
          { key: 'claims', label: 'Claims Intel', icon: IndianRupee },
          { key: 'wellness', label: 'Wellness', icon: Heart },
          { key: 'departments', label: 'Departments', icon: Building2 },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
              tab === t.key ? 'bg-white/10 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'
            }`}>
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ─── Overview Tab ────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            
            {/* Risk Distribution */}
            <Card className="!p-0 border-white/[0.06] bg-slate-900/50">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-violet-400" /> Risk Stratification
                </h3>
                <div className="flex items-center gap-6">
                  <div className="w-32 h-32 flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={riskDistribution} cx="50%" cy="50%" innerRadius={32} outerRadius={55}
                          paddingAngle={3} dataKey="value" stroke="none">
                          {riskDistribution.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 flex-1">
                    {riskDistribution.map((r, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: r.color }} />
                          <span className="text-xs text-slate-300">{r.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-white">{r.value}</span>
                          <span className="text-[10px] text-slate-500">({r.pct}%)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {kpis.criticalAlerts > 0 && (
                  <div className="mt-3 p-2.5 bg-red-500/5 border border-red-500/20 rounded-xl flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
                    <p className="text-xs text-red-300">
                      <span className="font-semibold">{kpis.criticalAlerts} critical alerts</span> — {kpis.highRiskEmployees} employees need immediate attention
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Claims Trend */}
            <Card className="!p-0 border-white/[0.06] bg-slate-900/50">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-400" /> Claims Trend
                </h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={claimsTrend}>
                      <defs>
                        <linearGradient id="claimsGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false}
                        tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} />
                      <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px' }}
                        formatter={(v: number) => [`₹${(v / 100000).toFixed(1)}L`, 'Claims']} />
                      <Area type="monotone" dataKey="claims" stroke="#3b82f6" fill="url(#claimsGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Top Conditions */}
            <Card className="!p-0 border-white/[0.06] bg-slate-900/50">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-amber-400" /> Top Claim Conditions
                </h3>
                <div className="space-y-3">
                  {topConditions.map((c, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-300">{c.condition}</span>
                        <span className="text-xs font-semibold text-white">{fmt(c.cost)}</span>
                      </div>
                      <div className="relative h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${c.pct}%` }}
                          transition={{ delay: 0.3 + i * 0.1, duration: 0.5 }}
                          className="h-full rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[9px] text-slate-500">{c.claims} claims</span>
                        <span className="text-[9px] text-slate-500">{c.pct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Alerts & Actions */}
            <Card className="!p-0 border-white/[0.06] bg-slate-900/50">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Bell className="h-4 w-4 text-red-400" /> Priority Actions
                </h3>
                <div className="space-y-2">
                  {kpis.criticalAlerts > 0 && (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/30 border border-white/[0.04] hover:border-white/[0.08] transition-all">
                      <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle className="h-4 w-4 text-red-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-white truncate">{kpis.criticalAlerts} employees with critical health risk</p>
                        <p className="text-[10px] text-slate-500">Require immediate intervention</p>
                      </div>
                      <Button size="sm" variant="outline" className="border-white/10 text-xs h-7 px-2.5 rounded-lg text-slate-400 flex-shrink-0">
                        Review
                      </Button>
                    </div>
                  )}
                  {kpis.highRiskEmployees > 0 && (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/30 border border-white/[0.04] hover:border-white/[0.08] transition-all">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle className="h-4 w-4 text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-white truncate">{kpis.highRiskEmployees} employees in high/critical risk band</p>
                        <p className="text-[10px] text-slate-500">Schedule health interventions</p>
                      </div>
                      <Button size="sm" variant="outline" className="border-white/10 text-xs h-7 px-2.5 rounded-lg text-slate-400 flex-shrink-0">
                        Plan
                      </Button>
                    </div>
                  )}
                  {kpis.criticalAlerts === 0 && kpis.highRiskEmployees === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                      <CheckCircle className="h-8 w-8 mb-2 text-emerald-500/40" />
                      <p className="text-xs">No priority actions at this time</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ─── Claims Intel Tab ────────────────────────────────────────── */}
        {tab === 'claims' && (
          <motion.div key="claims" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              {[
                { label: 'Total Claims', value: '—', trend: 0 as number, icon: FileText, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                { label: 'Avg Claim/Employee', value: kpis.avgClaimPerEmployee != null ? fmt(kpis.avgClaimPerEmployee) : '—', trend: 0 as number, icon: IndianRupee, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                { label: 'Cashless Ratio', value: '—', trend: 0 as number, icon: CheckCircle, color: 'text-violet-400', bg: 'bg-violet-500/10' },
                { label: 'Claim Rejection', value: '—', trend: 0 as number, icon: XCircle, color: 'text-amber-400', bg: 'bg-amber-500/10' },
              ].map((s, i) => (
                <Card key={i} className="!p-3 border-white/[0.06] bg-slate-900/50">
                  <div className={`w-7 h-7 rounded-lg ${s.bg} flex items-center justify-center mb-2`}>
                    <s.icon className={`h-3.5 w-3.5 ${s.color}`} />
                  </div>
                  <p className="text-lg font-bold text-white">{s.value}</p>
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] text-slate-500">{s.label}</p>
                    <span className="text-[9px] font-medium text-slate-600">No data</span>
                  </div>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Claims by Type Bar Chart */}
              <Card className="!p-0 border-white/[0.06] bg-slate-900/50">
                <CardContent className="p-5">
                  <h3 className="text-sm font-semibold text-white mb-4">Claims by Category</h3>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topConditions} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                        <XAxis type="number" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false}
                          tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} />
                        <YAxis type="category" dataKey="condition" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} width={100} />
                        <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '11px' }}
                          formatter={(v: number) => [`₹${(v / 100000).toFixed(1)}L`, 'Cost']} />
                        <Bar dataKey="cost" radius={[0, 4, 4, 0]} barSize={16}>
                          {topConditions.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Cost Prediction */}
              <Card className="!p-0 border-white/[0.06] bg-slate-900/50">
                <CardContent className="p-5">
                  <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                    <Brain className="h-4 w-4 text-violet-400" /> AI Cost Prediction
                  </h3>
                  <div className="flex flex-col items-center justify-center py-10 text-slate-500">
                    <Brain className="h-10 w-10 mb-3 text-violet-500/30" />
                    <p className="text-xs font-medium text-slate-400">AI Cost Prediction unavailable</p>
                    <p className="text-[10px] text-slate-600 mt-1 text-center max-w-48">Connect claims data to unlock AI-powered cost forecasting</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        )}

        {/* ─── Wellness Tab ────────────────────────────────────────────── */}
        {tab === 'wellness' && (
          <motion.div key="wellness" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="space-y-4">
              {/* Wellness ROI Summary */}
              <Card className="!p-0 border-white/[0.06] bg-gradient-to-br from-emerald-600/10 to-emerald-800/5 border-emerald-500/20">
                <CardContent className="p-5 flex items-center gap-6">
                  <div className="text-center flex-shrink-0">
                    <p className="text-3xl font-bold text-emerald-400">{kpis.wellnessROI != null ? `${kpis.wellnessROI}x` : '—'}</p>
                    <p className="text-[10px] text-slate-500 uppercase">Wellness ROI</p>
                  </div>
                  <div className="flex-1 h-0.5 bg-slate-800 rounded-full" />
                  <div className="text-center flex-shrink-0">
                    <p className="text-lg font-bold text-white">—</p>
                    <p className="text-[10px] text-slate-500">Invested</p>
                  </div>
                  <div className="flex-1 h-0.5 bg-emerald-500/30 rounded-full" />
                  <div className="text-center flex-shrink-0">
                    <p className="text-lg font-bold text-emerald-400">—</p>
                    <p className="text-[10px] text-slate-500">Claims Saved</p>
                  </div>
                </CardContent>
              </Card>

              {/* Programs */}
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Target className="h-4 w-4 text-violet-400" /> Active Programs
              </h3>
              {wellnessPrograms.map((prog, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}>
                  <Card className="!p-0 border-white/[0.06] bg-slate-900/50">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="text-sm font-semibold text-white">{prog.name}</h4>
                          <p className="text-[10px] text-slate-500">{prog.participants} participants • Cost: {fmt(prog.cost)}</p>
                        </div>
                        <Badge className="bg-emerald-500/10 text-emerald-400 border-0 text-[10px]">
                          ROI {prog.roi}x
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-3 mb-3">
                        <div>
                          <p className="text-[9px] text-slate-500 uppercase">Completion</p>
                          <p className="text-sm font-bold text-white">{prog.completion}%</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-[9px] text-slate-500 uppercase">Impact</p>
                          <p className="text-sm font-semibold text-emerald-400">{prog.impact}</p>
                        </div>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${prog.completion}%` }}
                          transition={{ delay: 0.3, duration: 0.5 }}
                          className="h-full bg-gradient-to-r from-violet-500 to-blue-500 rounded-full" />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ─── Departments Tab ─────────────────────────────────────────── */}
        {tab === 'departments' && (
          <motion.div key="departments" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="space-y-3">
              {departmentHealth.sort((a, b) => (b.healthScore ?? 0) - (a.healthScore ?? 0)).map((dept, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}>
                  <Card className="!p-0 border-white/[0.06] bg-slate-900/50 hover:border-white/[0.12] transition-all">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: `${DEPT_COLORS[i % DEPT_COLORS.length]}15` }}>
                          <Building2 className="h-5 w-5" style={{ color: DEPT_COLORS[i % DEPT_COLORS.length] }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="text-sm font-semibold text-white">{dept.dept}</h4>
                            <span className={`text-sm font-bold ${(dept.healthScore ?? 0) >= 75 ? 'text-emerald-400' : (dept.healthScore ?? 0) >= 65 ? 'text-amber-400' : 'text-red-400'}`}>
                              {dept.healthScore ?? '—'}
                            </span>
                          </div>
                          <div className="grid grid-cols-4 gap-4 mt-2">
                            <div>
                              <p className="text-[8px] text-slate-500 uppercase">Employees</p>
                              <p className="text-xs font-semibold text-white">{dept.employees}</p>
                            </div>
                            <div>
                              <p className="text-[8px] text-slate-500 uppercase">Claims</p>
                              <p className="text-xs font-semibold text-white">{dept.claimsCost > 0 ? fmt(dept.claimsCost) : '—'}</p>
                            </div>
                            <div>
                              <p className="text-[8px] text-slate-500 uppercase">Engagement</p>
                              <p className="text-xs font-semibold text-white">{dept.participation != null ? `${dept.participation}%` : '—'}</p>
                            </div>
                            <div>
                              <p className="text-[8px] text-slate-500 uppercase">Absent</p>
                              <p className={`text-xs font-semibold ${(dept.absenteeism ?? 0) > 3.5 ? 'text-red-400' : 'text-white'}`}>{dept.absenteeism != null ? `${dept.absenteeism}%` : '—'}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </CorporateLayout>
  );
}
