import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowLeft, RefreshCw, Brain, FlaskConical, Pill, BedDouble, Scissors,
  Heart, Ambulance, Stethoscope, ShieldCheck, CreditCard, BarChart3,
  Users, AlertTriangle, CheckCircle, XCircle, TrendingUp, TrendingDown,
  Clock, Activity, Zap, ChevronRight,
} from 'lucide-react';
import api from '@/utils/api';

// ─── Department config ────────────────────────────────────────────────────────
const DEPARTMENTS = [
  { id: 'lab',          label: 'Laboratory',    icon: FlaskConical, color: 'blue',    gradient: 'from-blue-600 to-cyan-600' },
  { id: 'pharmacy',     label: 'Pharmacy',      icon: Pill,         color: 'green',   gradient: 'from-green-600 to-emerald-600' },
  { id: 'ward',         label: 'Ward',          icon: BedDouble,    color: 'violet',  gradient: 'from-violet-600 to-purple-600' },
  { id: 'ot',           label: 'Operation Theatre', icon: Scissors, color: 'orange',  gradient: 'from-orange-500 to-red-500' },
  { id: 'icu',          label: 'ICU',           icon: Heart,        color: 'red',     gradient: 'from-red-600 to-rose-600' },
  { id: 'er',           label: 'Emergency',     icon: Ambulance,    color: 'rose',    gradient: 'from-rose-600 to-pink-600' },
  { id: 'opd',          label: 'OPD',           icon: Stethoscope,  color: 'teal',    gradient: 'from-teal-600 to-cyan-600' },
  { id: 'surveillance', label: 'Security',      icon: ShieldCheck,  color: 'slate',   gradient: 'from-slate-600 to-gray-600' },
  { id: 'insurance',    label: 'Insurance',     icon: CreditCard,   color: 'indigo',  gradient: 'from-indigo-600 to-blue-600' },
  { id: 'accounts',     label: 'Accounts',      icon: BarChart3,    color: 'amber',   gradient: 'from-amber-500 to-yellow-500' },
  { id: 'hrms',         label: 'HRMS',          icon: Users,        color: 'fuchsia', gradient: 'from-fuchsia-600 to-purple-600' },
] as const;

type DeptId = typeof DEPARTMENTS[number]['id'];

// ─── Severity / status helpers ────────────────────────────────────────────────
const SEV: Record<string, string> = {
  critical: 'text-red-400 bg-red-900/30 border-red-700/50',
  high:     'text-orange-400 bg-orange-900/30 border-orange-700/50',
  medium:   'text-amber-400 bg-amber-900/30 border-amber-700/50',
  low:      'text-emerald-400 bg-emerald-900/30 border-emerald-700/50',
  warning:  'text-amber-400 bg-amber-900/30 border-amber-700/50',
  positive: 'text-emerald-400 bg-emerald-900/30 border-emerald-700/50',
};
const RiskBadge = ({ level }: { level: string }) => (
  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${SEV[level] ?? SEV.medium}`}>{level}</span>
);
const StatBox = ({ label, value, sub, color = 'text-white' }: { label: string; value: any; sub?: string; color?: string }) => (
  <div className="bg-white/10 rounded-xl p-3 text-center">
    <p className={`text-2xl font-bold ${color}`}>{value}</p>
    <p className="text-xs text-slate-400 mt-0.5">{label}</p>
    {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
  </div>
);
const AlertRow = ({ severity, message }: { severity: string; message: string }) => (
  <div className={`flex items-start gap-2 p-2 rounded-lg border text-xs ${SEV[severity] ?? SEV.medium}`}>
    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
    {message}
  </div>
);
const Row = ({ label, value, badge }: { label: string; value: any; badge?: React.ReactNode }) => (
  <div className="flex items-center justify-between py-1.5 border-b border-white/10 last:border-0 text-sm">
    <span className="text-slate-400">{label}</span>
    <div className="flex items-center gap-2">{badge}{typeof value === 'number' ? value.toLocaleString() : value}</div>
  </div>
);
const fmt = (n: number) => n >= 1e5 ? `₹${(n/1e5).toFixed(1)}L` : n >= 1000 ? `₹${(n/1000).toFixed(0)}K` : `₹${n}`;

// ─── Department detail renderers ──────────────────────────────────────────────
function LabView({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      {data.ai_alerts?.map((a: any, i: number) => <AlertRow key={i} severity={a.severity} message={a.message} />)}
      <Card className="bg-white/10 border-white/20 text-white">
        <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-sm text-slate-300">Critical Values Unacknowledged</CardTitle></CardHeader>
        <CardContent className="px-4 pb-3">
          {data.critical_values?.count === 0 ? <p className="text-emerald-400 text-sm flex items-center gap-1"><CheckCircle className="h-4 w-4" /> All critical values acknowledged</p> : (
            <div className="space-y-1.5">
              {data.critical_values?.items?.slice(0, 6).map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs bg-red-900/30 rounded p-2">
                  <span>{r.patient} · {r.ward}</span>
                  <div className="text-right"><span className="text-red-300 font-bold">{r.test}: {r.value}</span><br /><span className="text-slate-400">{r.pending_minutes}min ago</span></div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="bg-white/10 border-white/20 text-white">
        <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-sm text-slate-300">Turnaround Time by Category</CardTitle></CardHeader>
        <CardContent className="px-4 pb-3">
          {data.turnaround_time?.slice(0, 6).map((t: any, i: number) => (
            <Row key={i} label={t.category} value={`${t.avg_minutes} min avg`} badge={<RiskBadge level={t.status === 'delayed' ? 'high' : t.status === 'slow' ? 'medium' : 'low'} />} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function PharmacyView({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <StatBox label="Critical Stock" value={data.inventory_risk?.items?.filter((i:any)=>i.status==='critical').length ?? 0} color="text-red-300" />
        <StatBox label="Expiring (60d)" value={data.expiry_alerts?.filter((e:any)=>e.severity==='critical').length ?? 0} color="text-amber-300" />
      </div>
      {data.inventory_risk?.items?.length > 0 && (
        <Card className="bg-white/10 border-white/20 text-white">
          <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-sm text-slate-300">Stock Depletion Risk</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3 space-y-1">
            {data.inventory_risk.items.slice(0, 8).map((r: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-slate-300">{r.drug}</span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">{r.days_remaining !== null ? `${r.days_remaining}d` : '—'}</span>
                  <RiskBadge level={r.status === 'critical' ? 'critical' : r.status === 'low' ? 'high' : 'medium'} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {data.poly_pharmacy_risk?.length > 0 && (
        <Card className="bg-white/10 border-white/20 text-white">
          <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-sm text-slate-300">Poly-Pharmacy Risk (&gt;7 meds)</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3 space-y-1">
            {data.poly_pharmacy_risk.slice(0, 6).map((r: any, i: number) => (
              <div key={i} className="flex justify-between items-center text-xs">
                <span>{r.patient} · {r.ward}</span>
                <span className="text-amber-300 font-bold">{r.med_count} meds</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function WardView({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <StatBox label="Deteriorating" value={data.deterioration_watch?.length ?? 0} color="text-red-300" />
        <StatBox label="Fall Risk" value={data.fall_risk?.length ?? 0} color="text-amber-300" />
      </div>
      {data.deterioration_watch?.length > 0 && (
        <Card className="bg-white/10 border-white/20 text-white">
          <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-sm text-slate-300">Patient Deterioration Watch (NEWS2)</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3 space-y-1.5">
            {data.deterioration_watch.slice(0, 6).map((r: any, i: number) => (
              <div key={i} className="flex items-center justify-between bg-red-900/20 rounded p-2 text-xs">
                <div><p className="font-medium">{r.patient}</p><p className="text-slate-400">{r.ward}</p></div>
                <div className="text-right"><p className="text-red-300 font-bold">NEWS2: {r.news2_score}</p><p className="text-slate-400">SpO2: {r.vitals?.spo2}% HR: {r.vitals?.hr}</p></div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <Card className="bg-white/10 border-white/20 text-white">
        <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-sm text-slate-300">Ward Task Board</CardTitle></CardHeader>
        <CardContent className="px-4 pb-3 space-y-1">
          {data.ward_task_board?.map((w: any, i: number) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-slate-300">{w.ward} ({w.patients}pts)</span>
              <div className="flex items-center gap-2">
                {w.vitals_overdue > 0 && <span className="text-red-400">{w.vitals_overdue} vitals overdue</span>}
                {w.meds_pending > 0 && <span className="text-amber-400">{w.meds_pending} meds pending</span>}
                {w.vitals_overdue === 0 && w.meds_pending === 0 && <span className="text-emerald-400">All clear</span>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function OTView({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <StatBox label="Cases Today" value={data.todays_schedule?.total_cases ?? 0} />
        <StatBox label="Pre-op Ready" value={data.todays_schedule?.ready ?? 0} color="text-emerald-300" />
        <StatBox label="Not Ready" value={data.todays_schedule?.not_ready ?? 0} color="text-red-300" />
      </div>
      {data.todays_schedule?.cases?.filter((c:any)=>!c.pre_op_ready).map((c: any, i: number) => (
        <div key={i} className="bg-amber-900/30 border border-amber-700/40 rounded-lg p-3 text-xs">
          <p className="font-medium text-amber-300">{c.procedure} — {c.patient}</p>
          {c.gaps.map((g: string, j: number) => <p key={j} className="text-amber-400 mt-0.5">• {g}</p>)}
          <p className="text-slate-400 mt-1">{c.room} · Starts {c.minutes_to_start > 0 ? `in ${c.minutes_to_start}min` : 'now'}</p>
        </div>
      ))}
      <Card className="bg-white/10 border-white/20 text-white">
        <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-sm text-slate-300">Room Utilization (30d)</CardTitle></CardHeader>
        <CardContent className="px-4 pb-3 space-y-1">
          {data.room_utilization?.map((r: any, i: number) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="w-20 text-slate-400">{r.room}</span>
              <div className="flex-1 bg-white/10 rounded-full h-1.5">
                <div className="bg-orange-500 h-1.5 rounded-full" style={{ width: `${Math.min(r.utilization_pct, 100)}%` }} />
              </div>
              <span className="text-slate-300 w-12 text-right">{r.utilization_pct}%</span>
              <RiskBadge level={r.status === 'optimal' ? 'low' : r.status === 'good' ? 'medium' : 'high'} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ICUView({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <StatBox label="High SOFA" value={data.sofa_monitoring?.filter((s:any)=>s.severity==='severe').length ?? 0} color="text-red-300" />
        <StatBox label="Weaning Ready" value={data.weaning_candidates?.length ?? 0} color="text-emerald-300" />
      </div>
      {data.sofa_monitoring?.length > 0 && (
        <Card className="bg-white/10 border-white/20 text-white">
          <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-sm text-slate-300">SOFA Score Monitoring</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3 space-y-1.5">
            {data.sofa_monitoring.slice(0, 6).map((r: any, i: number) => (
              <div key={i} className="flex justify-between items-center text-xs">
                <div><p className="font-medium">{r.patient}</p><p className="text-slate-400">Day {r.icu_days}</p></div>
                <div className="text-right"><p className="font-bold text-red-300">SOFA {r.sofa_score}</p><RiskBadge level={r.severity === 'severe' ? 'critical' : r.severity === 'moderate' ? 'high' : 'medium'} /></div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {data.weaning_candidates?.length > 0 && (
        <Card className="bg-white/10 border-white/20 text-white">
          <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-sm text-slate-300">Ventilator Weaning Candidates</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3 space-y-1">
            {data.weaning_candidates.map((r: any, i: number) => (
              <div key={i} className="flex justify-between items-center text-xs">
                <span className="text-emerald-300">{r.patient} · Day {r.icu_days}</span>
                <span className="text-slate-400">SpO2: {r.spo2}% RR: {r.rr}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {data.fluid_imbalance?.length > 0 && (
        <Card className="bg-white/10 border-white/20 text-white">
          <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-sm text-slate-300">Fluid Imbalance Alerts</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3 space-y-1">
            {data.fluid_imbalance.map((r: any, i: number) => (
              <div key={i} className="text-xs">
                <p className="font-medium">{r.patient}</p>
                <p className="text-amber-300">{r.balance_ml > 0 ? '+' : ''}{r.balance_ml} mL — {r.alert}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ERView({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      {data.alerts?.map((a: any, i: number) => <AlertRow key={i} severity={a.severity} message={a.message} />)}
      <div className="grid grid-cols-2 gap-2">
        <StatBox label="Active ER Patients" value={data.performance?.active_er_patients ?? 0} />
        <StatBox label="Boarding >4h" value={data.boarding_patients?.count ?? 0} color="text-red-300" />
        <StatBox label="D2D Time" value={`${data.performance?.avg_door_to_doctor_minutes ?? 0}min`}
          color={data.performance?.door_to_doctor_status === 'good' ? 'text-emerald-300' : 'text-amber-300'} />
        <StatBox label="Diversion Risk" value={data.performance?.diversion_risk ?? '—'}
          color={data.performance?.diversion_risk === 'high' ? 'text-red-300' : 'text-white'} />
      </div>
      {data.boarding_patients?.items?.length > 0 && (
        <Card className="bg-white/10 border-white/20 text-white">
          <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-sm text-slate-300">Boarding Patients</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3 space-y-1">
            {data.boarding_patients.items.map((r: any, i: number) => (
              <div key={i} className="flex justify-between items-center text-xs">
                <span>{r.patient} (L{r.triage})</span>
                <span className="text-red-300">{r.er_hours}h waiting</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function OPDView({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      <Card className="bg-white/10 border-white/20 text-white">
        <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-sm text-slate-300">No-Show Risk by Doctor</CardTitle></CardHeader>
        <CardContent className="px-4 pb-3 space-y-1">
          {data.no_show_analytics?.slice(0, 6).map((r: any, i: number) => (
            <div key={i} className="flex justify-between items-center text-xs">
              <span className="text-slate-300">{r.doctor}<span className="text-slate-500 ml-1">({r.specialty})</span></span>
              <div className="flex items-center gap-2"><span>{r.no_show_rate}%</span><RiskBadge level={r.risk_level} /></div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="bg-white/10 border-white/20 text-white">
        <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-sm text-slate-300">Doctor Utilization (7d)</CardTitle></CardHeader>
        <CardContent className="px-4 pb-3 space-y-1.5">
          {data.doctor_utilization?.slice(0, 6).map((r: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="w-28 truncate text-slate-300">{r.doctor}</span>
              <div className="flex-1 bg-white/10 rounded-full h-1.5">
                <div className="bg-teal-500 h-1.5 rounded-full" style={{ width: `${r.utilization_pct}%` }} />
              </div>
              <span className="text-slate-400 w-10 text-right">{r.utilization_pct}%</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function SurveillanceView({ data }: { data: any }) {
  const scoreColor = data.security_risk_score >= 60 ? 'text-red-400' : data.security_risk_score >= 30 ? 'text-amber-400' : 'text-emerald-400';
  return (
    <div className="space-y-3">
      {data.alerts?.map((a: any, i: number) => <AlertRow key={i} severity={a.severity} message={a.message} />)}
      <div className="bg-white/10 rounded-xl p-4 text-center">
        <p className={`text-5xl font-bold ${scoreColor}`}>{data.security_risk_score}</p>
        <p className="text-slate-400 text-sm mt-1">Security Risk Score</p>
        <p className={`text-sm font-medium mt-1 capitalize ${scoreColor}`}>{data.risk_level} Risk</p>
      </div>
      {data.access_anomalies?.length > 0 && (
        <Card className="bg-white/10 border-white/20 text-white">
          <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-sm text-slate-300">Access Anomalies</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3 space-y-1">
            {data.access_anomalies.map((r: any, i: number) => (
              <div key={i} className="text-xs text-red-300">{r.alert}</div>
            ))}
          </CardContent>
        </Card>
      )}
      {data.medication_diversion_risk?.length > 0 && (
        <Card className="bg-white/10 border-white/20 text-white">
          <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-sm text-slate-300">Medication Diversion Risk</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3 space-y-1">
            {data.medication_diversion_risk.slice(0, 5).map((r: any, i: number) => (
              <div key={i} className="text-xs"><span className="text-amber-300">{r.drug}</span> → {r.patient} by {r.administered_by}</div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InsuranceView({ data }: { data: any }) {
  const aging = data.claims_aging ?? {};
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <StatBox label="Pending Claims" value={aging.total_pending ?? 0} />
        <StatBox label="90+ Day AR" value={fmt(aging.ar_90_plus ?? aging.bucket_90_plus ?? 0)} color={aging.at_risk ? 'text-red-300' : 'text-white'} />
      </div>
      <Card className="bg-white/10 border-white/20 text-white">
        <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-sm text-slate-300">Claims Aging Buckets</CardTitle></CardHeader>
        <CardContent className="px-4 pb-3 space-y-1">
          {[['0–30 days', aging.bucket_0_30], ['30–60 days', aging.bucket_30_60], ['60–90 days', aging.bucket_60_90], ['90+ days', aging.bucket_90_plus]].map(([label, val], i) => (
            <Row key={i} label={label as string} value={fmt(parseInt(val as any || 0))} badge={i === 3 && parseInt(val as any || 0) > 0 ? <RiskBadge level="high" /> : undefined} />
          ))}
        </CardContent>
      </Card>
      <Card className="bg-white/10 border-white/20 text-white">
        <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-sm text-slate-300">Insurer Scoreboard</CardTitle></CardHeader>
        <CardContent className="px-4 pb-3 space-y-1">
          {data.insurer_scoreboard?.slice(0, 6).map((r: any, i: number) => (
            <div key={i} className="flex justify-between items-center text-xs">
              <span className="text-slate-300 truncate max-w-28">{r.insurer}</span>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">{r.avg_tat_hours}h</span>
                <span className={`font-bold ${r.approval_rate >= 85 ? 'text-emerald-300' : r.approval_rate >= 70 ? 'text-amber-300' : 'text-red-300'}`}>{r.approval_rate}%</span>
                <span className="bg-white/10 px-1 rounded text-slate-300">{r.rating}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function AccountsView({ data }: { data: any }) {
  const rev = data.revenue_summary ?? {};
  return (
    <div className="space-y-3">
      {data.ai_insights?.map((a: any, i: number) => <AlertRow key={i} severity={a.type === 'critical' ? 'critical' : a.type === 'warning' ? 'high' : 'low'} message={a.message} />)}
      <div className="grid grid-cols-2 gap-2">
        <StatBox label="Revenue (30d)" value={fmt(rev.current_30d ?? 0)} />
        <StatBox label="vs Prior Month" value={`${rev.growth_pct >= 0 ? '+' : ''}${rev.growth_pct}%`}
          color={rev.growth_pct >= 0 ? 'text-emerald-300' : 'text-red-300'} />
        <StatBox label="Collected" value={fmt(rev.collected_30d ?? 0)} color="text-green-300" />
        <StatBox label="Collection %" value={`${rev.collection_pct ?? 0}%`} />
      </div>
      <Card className="bg-white/10 border-white/20 text-white">
        <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-sm text-slate-300">Revenue by Department</CardTitle></CardHeader>
        <CardContent className="px-4 pb-3 space-y-1.5">
          {data.revenue_by_dept?.slice(0, 6).map((r: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="w-28 truncate text-slate-300 capitalize">{r.dept}</span>
              <div className="flex-1 bg-white/10 rounded-full h-1.5">
                <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${data.revenue_by_dept[0]?.revenue > 0 ? (r.revenue / data.revenue_by_dept[0].revenue * 100) : 0}%` }} />
              </div>
              <span className="text-slate-400">{fmt(r.revenue)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function HRMSView({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <StatBox label="Overtime Risk" value={data.overtime_risk?.length ?? 0} color="text-amber-300" />
        <StatBox label="Turnover Risk" value={data.turnover_risk?.filter((t:any)=>t.risk==='high').length ?? 0} color="text-red-300" />
      </div>
      {data.overtime_risk?.length > 0 && (
        <Card className="bg-white/10 border-white/20 text-white">
          <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-sm text-slate-300">Overtime Risk Staff</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3 space-y-1">
            {data.overtime_risk.slice(0, 6).map((r: any, i: number) => (
              <div key={i} className="flex justify-between items-center text-xs">
                <div><p>{r.staff} <span className="text-slate-400">({r.role})</span></p></div>
                <div className="flex items-center gap-2"><span className="text-amber-300">{r.weekly_hours}h/wk</span><RiskBadge level={r.risk} /></div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {data.training_compliance?.length > 0 && (
        <Card className="bg-white/10 border-white/20 text-white">
          <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-sm text-slate-300">Training Compliance</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3 space-y-1.5">
            {data.training_compliance.slice(0, 6).map((r: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-32 truncate text-slate-300">{r.module}</span>
                <div className="flex-1 bg-white/10 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full ${r.rate >= 80 ? 'bg-emerald-500' : r.rate >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${r.rate}%` }} />
                </div>
                <span className="text-slate-400 w-8 text-right">{r.rate}%</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const DEPT_VIEWS: Record<string, React.FC<{ data: any }>> = {
  lab: LabView, pharmacy: PharmacyView, ward: WardView, ot: OTView, icu: ICUView,
  er: ERView, opd: OPDView, surveillance: SurveillanceView, insurance: InsuranceView,
  accounts: AccountsView, hrms: HRMSView,
};

// ─── Main component ───────────────────────────────────────────────────────────
export default function AIDepartmentHub() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<DeptId | null>(null);
  const [deptData, setDeptData] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Load summary on mount
  useEffect(() => {
    api.get('/v1/ai-dept/summary').then(r => setSummary(r.data?.data)).catch(() => {});
  }, []);

  const loadDept = useCallback(async (id: DeptId) => {
    setSelected(id);
    setDeptData(null);
    setLoading(true);
    try {
      const r = await api.get(`/v1/ai-dept/${id}`);
      setDeptData(r.data?.data ?? {});
      setLastUpdated(new Date());
    } catch {
      setDeptData({ error: 'Failed to load department data' });
    } finally {
      setLoading(false);
    }
  }, []);

  const dept = DEPARTMENTS.find(d => d.id === selected);
  const DeptView = selected ? DEPT_VIEWS[selected] : null;

  // Summary badge for department grid
  const summaryBadge = (id: string) => {
    if (!summary || !summary[id]) return null;
    const s = summary[id];
    const hasAlert = Object.values(s).some(v => (typeof v === 'number' && v > 0) || v === 'high' || v === 'critical' || v === true);
    return hasAlert ? <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" /> : null;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => selected ? setSelected(null) : navigate(-1)} className="text-white hover:bg-white/10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-blue-400" />
                <h1 className="text-lg font-bold">{selected ? dept?.label : 'AI Department Hub'}</h1>
              </div>
              <p className="text-xs text-slate-400">
                {selected ? 'AI intelligence for this department' : '11 departments · Real-time AI insights'}
              </p>
            </div>
          </div>
          {selected && (
            <div className="flex items-center gap-2">
              {lastUpdated && <span className="text-xs text-slate-500">{lastUpdated.toLocaleTimeString()}</span>}
              <Button variant="ghost" size="icon" onClick={() => loadDept(selected)} disabled={loading} className="text-white hover:bg-white/10">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Department grid */}
      {!selected && (
        <div className="p-4">
          <p className="text-xs text-slate-500 mb-3 uppercase tracking-wider">Select a department</p>
          <div className="grid grid-cols-3 gap-2.5">
            {DEPARTMENTS.map(d => {
              const Icon = d.icon;
              return (
                <button
                  key={d.id}
                  onClick={() => loadDept(d.id)}
                  className="relative group flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all active:scale-95"
                >
                  {summaryBadge(d.id)}
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${d.gradient} flex items-center justify-center shadow-lg`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <span className="text-xs font-medium text-slate-300 text-center leading-tight">{d.label}</span>
                  <ChevronRight className="h-3 w-3 text-slate-600 group-hover:text-slate-400 transition-colors" />
                </button>
              );
            })}
          </div>

          {/* Global headline strip */}
          {summary && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-slate-500 uppercase tracking-wider">Active Signals</p>
              {summary.lab?.critical_values > 0 && <AlertRow severity="critical" message={`Lab: ${summary.lab.critical_values} unacknowledged critical values`} />}
              {summary.er?.boarding > 0 && <AlertRow severity="high" message={`ER: ${summary.er.boarding} patients boarding > 4 hours`} />}
              {summary.surveillance?.alerts > 0 && <AlertRow severity="high" message={`Security: ${summary.surveillance.alerts} active security alerts`} />}
              {summary.pharmacy?.low_stock > 0 && <AlertRow severity="medium" message={`Pharmacy: ${summary.pharmacy.low_stock} drug(s) at critical stock level`} />}
              {summary.icu?.high_sofa > 0 && <AlertRow severity="medium" message={`ICU: ${summary.icu.high_sofa} patient(s) with high SOFA score`} />}
              {summary.accounts?.ar_90plus > 0 && <AlertRow severity="medium" message={`Accounts: ${fmt(summary.accounts.ar_90plus)} in 90+ day accounts receivable`} />}
            </div>
          )}
        </div>
      )}

      {/* Department detail */}
      {selected && (
        <div className="p-4">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <RefreshCw className="h-8 w-8 text-blue-400 animate-spin mx-auto mb-3" />
                <p className="text-slate-400 text-sm">Loading AI insights…</p>
              </div>
            </div>
          )}
          {!loading && deptData?.error && (
            <div className="text-center py-12 text-slate-500">{deptData.error}</div>
          )}
          {!loading && deptData && !deptData.error && DeptView && (
            <DeptView data={deptData} />
          )}
        </div>
      )}
    </div>
  );
}
