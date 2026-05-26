import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, Brain, AlertTriangle, Users, Bed, FileCheck, TrendingUp, CheckCircle, XCircle, Clock } from 'lucide-react';
import api from '@/utils/api';

type Tab = 'forecast' | 'docs' | 'workload' | 'beds';

interface ForecastPoint { hour_label: string; predicted_admissions: number; predicted_discharges: number; predicted_census: number; confidence: 'high' | 'medium' | 'low'; }
interface ForecastData { current: { total: number; icu: number; er: number }; planned_discharges: number; capacity_warning: boolean; peak: { hour_label: string; predicted_census: number }; forecast: ForecastPoint[]; }
interface DocGap { type: string; severity: 'critical' | 'high' | 'medium'; message: string; }
interface DocAdmission { admission_id: number; patient_name: string; mrn: string; ward: string; hours_since_admit: number; gap_count: number; overall_risk: string; gaps: DocGap[]; }
interface DocAudit { summary: { total_admissions: number; clear: number; medium: number; high: number; critical: number }; admissions: DocAdmission[]; }
interface WardMetric { ward: string; patient_count: number; patient_to_nurse_ratio: number; ratio_status: string; acuity_weighted_load: number; recommended_action: string; }
interface WorkloadData { summary: { total_wards: number; overloaded_wards: number; total_active_patients: number; system_status: string }; wards: WardMetric[]; recommendations: string[]; }

const RISK_BG: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-300',
  high: 'bg-orange-100 text-orange-700 border-orange-300',
  medium: 'bg-amber-100 text-amber-700 border-amber-300',
  clear: 'bg-emerald-100 text-emerald-700 border-emerald-300',
};
const STATUS_BG: Record<string, string> = {
  overloaded: 'bg-red-100 text-red-700',
  'near-capacity': 'bg-amber-100 text-amber-700',
  balanced: 'bg-emerald-100 text-emerald-700',
};
const CONF_DOT: Record<string, string> = {
  high: 'bg-emerald-400',
  medium: 'bg-amber-400',
  low: 'bg-slate-300',
};

// Inline mini-bar chart for census forecast
function CensusBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const color = pct > 90 ? 'bg-red-500' : pct > 75 ? 'bg-amber-500' : 'bg-blue-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-20 bg-slate-200 rounded-full h-2">
        <div className={`${color} h-2 rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs text-slate-600 w-8 text-right">{value}</span>
    </div>
  );
}

export default function AIOperationsHub() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('forecast');
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [docAudit, setDocAudit] = useState<DocAudit | null>(null);
  const [workload, setWorkload] = useState<WorkloadData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Bed allocation form
  const [bedForm, setBedForm] = useState({ admissionType: 'general', diagnosisCode: '', requiresIsolation: false, requiresIcu: false });
  const [bedResult, setBedResult] = useState<any>(null);
  const [bedLoading, setBedLoading] = useState(false);

  const loadTab = useCallback(async (tab: Tab) => {
    setLoading(true);
    try {
      if (tab === 'forecast') {
        const r = await api.get('/api/v1/ai-ops/capacity-forecast?hours=24');
        setForecast(r.data?.data ?? null);
      } else if (tab === 'docs') {
        const r = await api.get('/api/v1/ai-ops/documentation-audit');
        setDocAudit(r.data?.data ?? null);
      } else if (tab === 'workload') {
        const r = await api.get('/api/v1/ai-ops/workload-balance');
        setWorkload(r.data?.data ?? null);
      }
      setLastUpdated(new Date());
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTab(activeTab); }, [activeTab, loadTab]);

  const allocateBed = async () => {
    setBedLoading(true);
    setBedResult(null);
    try {
      const r = await api.post('/api/v1/ai-ops/bed-allocation', bedForm);
      setBedResult(r.data?.data ?? null);
    } catch (e: any) {
      setBedResult({ error: e?.response?.data?.message ?? 'Allocation failed' });
    } finally {
      setBedLoading(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'forecast', label: 'Capacity', icon: <TrendingUp className="h-3.5 w-3.5" /> },
    { id: 'docs', label: 'Doc Audit', icon: <FileCheck className="h-3.5 w-3.5" /> },
    { id: 'workload', label: 'Workload', icon: <Users className="h-3.5 w-3.5" /> },
    { id: 'beds', label: 'Bed AI', icon: <Bed className="h-3.5 w-3.5" /> },
  ];

  const maxCensus = forecast ? Math.max(...forecast.forecast.map(f => f.predicted_census), forecast.current.total) : 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white hover:bg-white/10"><ArrowLeft className="h-5 w-5" /></Button>
            <div>
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-blue-400" />
                <h1 className="text-lg font-bold">AI Operations Hub</h1>
              </div>
              <p className="text-xs text-blue-300">Intelligent clinical operations intelligence</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdated && <span className="text-xs text-slate-400">{lastUpdated.toLocaleTimeString()}</span>}
            <Button variant="ghost" size="icon" onClick={() => loadTab(activeTab)} disabled={loading} className="text-white hover:bg-white/10">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 px-4 pb-3 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              activeTab === t.id ? 'bg-blue-500 text-white' : 'bg-white/10 text-slate-300 hover:bg-white/20'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div className="px-4 pb-6 space-y-3">
        {/* ── CAPACITY FORECAST ── */}
        {activeTab === 'forecast' && forecast && (
          <>
            {/* Current snapshot */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Active', value: forecast.current.total, color: 'text-white' },
                { label: 'ICU', value: forecast.current.icu, color: 'text-red-300' },
                { label: 'Planned D/C', value: forecast.planned_discharges, color: 'text-emerald-300' },
              ].map((s, i) => (
                <div key={i} className="bg-white/10 rounded-xl p-3 text-center">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {forecast.capacity_warning && (
              <div className="bg-amber-500/20 border border-amber-500/40 rounded-xl p-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                <p className="text-xs text-amber-200">Capacity surge predicted — peak census {forecast.peak.predicted_census} at {forecast.peak.hour_label}. Consider activating surge protocol.</p>
              </div>
            )}

            <Card className="bg-white/10 border-white/20 text-white">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">24-Hour Census Forecast</CardTitle></CardHeader>
              <CardContent className="space-y-1.5">
                {forecast.forecast.filter((_, i) => i % 3 === 0).map((f, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 w-12">{f.hour_label}</span>
                    <CensusBar value={f.predicted_census} max={maxCensus * 1.2} />
                    <div className={`w-2 h-2 rounded-full ${CONF_DOT[f.confidence]} shrink-0`} title={`${f.confidence} confidence`} />
                    <span className="text-xs text-slate-400">+{f.predicted_admissions} -{f.predicted_discharges}</span>
                  </div>
                ))}
                <div className="flex items-center gap-3 pt-1 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> High confidence</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Medium</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-400 inline-block" /> Low (12h+)</span>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* ── DOCUMENTATION AUDIT ── */}
        {activeTab === 'docs' && docAudit && (
          <>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Critical', value: docAudit.summary.critical, color: 'text-red-300' },
                { label: 'High', value: docAudit.summary.high, color: 'text-orange-300' },
                { label: 'Medium', value: docAudit.summary.medium, color: 'text-amber-300' },
                { label: 'Clear', value: docAudit.summary.clear, color: 'text-emerald-300' },
              ].map((s, i) => (
                <div key={i} className="bg-white/10 rounded-xl p-2 text-center">
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-slate-400">{s.label}</p>
                </div>
              ))}
            </div>

            {docAudit.admissions.length === 0 ? (
              <div className="bg-emerald-500/20 border border-emerald-500/40 rounded-xl p-4 text-center">
                <CheckCircle className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-emerald-300 font-medium">All documentation complete</p>
              </div>
            ) : (
              <div className="space-y-2">
                {docAudit.admissions.map(adm => (
                  <Card key={adm.admission_id} className={`border ${RISK_BG[adm.overall_risk]} bg-transparent`}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-semibold">{adm.patient_name}</p>
                          <p className="text-xs opacity-70">MRN: {adm.mrn} · {adm.ward} · Day {Math.round(adm.hours_since_admit / 24)}</p>
                        </div>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/30 capitalize">{adm.overall_risk}</span>
                      </div>
                      <div className="space-y-1">
                        {adm.gaps.map((g, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-xs">
                            <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-80" />
                            <span className="opacity-90">{g.message}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── WORKLOAD BALANCE ── */}
        {activeTab === 'workload' && workload && (
          <>
            <div className={`rounded-xl p-3 flex items-center gap-2 ${workload.summary.system_status === 'balanced' ? 'bg-emerald-500/20 border border-emerald-500/40' : 'bg-amber-500/20 border border-amber-500/40'}`}>
              <Users className="h-4 w-4 shrink-0" />
              <div>
                <p className="text-sm font-medium">{workload.summary.total_active_patients} patients across {workload.summary.total_wards} wards</p>
                <p className="text-xs opacity-75">{workload.summary.overloaded_wards} overloaded ward(s)</p>
              </div>
            </div>

            {workload.recommendations.map((r, i) => (
              <div key={i} className="bg-blue-500/20 border border-blue-500/30 rounded-lg px-3 py-2 text-xs text-blue-200">{r}</div>
            ))}

            <div className="space-y-2">
              {workload.wards.map(w => (
                <Card key={w.ward} className="bg-white/10 border-white/20 text-white">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-sm">{w.ward}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BG[w.ratio_status]}`}>{w.ratio_status}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div><p className="text-lg font-bold">{w.patient_count}</p><p className="text-slate-400">Patients</p></div>
                      <div><p className="text-lg font-bold">{w.patient_to_nurse_ratio}</p><p className="text-slate-400">Pt:Nurse</p></div>
                      <div><p className="text-lg font-bold">{w.avg_los_days}d</p><p className="text-slate-400">Avg LOS</p></div>
                    </div>
                    {w.ratio_status !== 'balanced' && (
                      <p className="text-xs text-amber-300 mt-2">{w.recommended_action}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {/* ── BED ALLOCATION ── */}
        {activeTab === 'beds' && (
          <>
            <Card className="bg-white/10 border-white/20 text-white">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300 flex items-center gap-2"><Brain className="h-4 w-4 text-blue-400" />Smart Bed Allocator</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Admission Type</label>
                  <select
                    value={bedForm.admissionType}
                    onChange={e => setBedForm(f => ({ ...f, admissionType: e.target.value }))}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white"
                  >
                    {['general', 'surgical', 'maternity', 'paediatric', 'emergency', 'daycare'].map(t => (
                      <option key={t} value={t} className="text-slate-900 bg-white capitalize">{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Primary Diagnosis Code (ICD-10)</label>
                  <input
                    type="text"
                    placeholder="e.g. I21, K80, J18"
                    value={bedForm.diagnosisCode}
                    onChange={e => setBedForm(f => ({ ...f, diagnosisCode: e.target.value }))}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500"
                  />
                </div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={bedForm.requiresIsolation} onChange={e => setBedForm(f => ({ ...f, requiresIsolation: e.target.checked }))} className="rounded" />
                    Isolation Required
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={bedForm.requiresIcu} onChange={e => setBedForm(f => ({ ...f, requiresIcu: e.target.checked }))} className="rounded" />
                    ICU Level Care
                  </label>
                </div>
                <Button onClick={allocateBed} disabled={bedLoading} className="w-full bg-blue-600 hover:bg-blue-700">
                  {bedLoading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Brain className="h-4 w-4 mr-2" />}
                  Find Best Bed
                </Button>
              </CardContent>
            </Card>

            {bedResult && (
              <Card className={`border ${bedResult.available ? 'bg-emerald-900/40 border-emerald-500/40' : 'bg-red-900/40 border-red-500/40'} text-white`}>
                <CardContent className="p-4">
                  {bedResult.error ? (
                    <p className="text-red-300 text-sm">{bedResult.error}</p>
                  ) : bedResult.available ? (
                    <>
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle className="h-5 w-5 text-emerald-400" />
                        <p className="font-semibold text-emerald-300">Recommended Bed</p>
                        <span className="ml-auto text-xs bg-emerald-600 px-2 py-0.5 rounded-full">Score: {bedResult.recommended.suitability_score}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                        <div><span className="text-slate-400 text-xs">Bed</span><p className="font-bold text-lg">{bedResult.recommended.bed_number}</p></div>
                        <div><span className="text-slate-400 text-xs">Ward</span><p className="font-medium">{bedResult.recommended.ward}</p></div>
                        <div><span className="text-slate-400 text-xs">Room</span><p>{bedResult.recommended.room}</p></div>
                        <div><span className="text-slate-400 text-xs">Type</span><p className="capitalize">{bedResult.recommended.type}</p></div>
                      </div>
                      {bedResult.recommended.reason && (
                        <p className="text-xs text-slate-300 italic">{bedResult.recommended.reason}</p>
                      )}
                      {bedResult.alternatives?.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-white/10">
                          <p className="text-xs text-slate-400 mb-1">Alternatives</p>
                          {bedResult.alternatives.map((b: any) => (
                            <div key={b.bed_id} className="flex items-center justify-between text-xs py-1">
                              <span>Bed {b.bed_number}</span>
                              <span className="text-slate-400">{b.ward} · {b.type}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-2">
                      <Bed className="h-8 w-8 text-red-400 mx-auto mb-2" />
                      <p className="text-red-300 text-sm font-medium">{bedResult.message}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
