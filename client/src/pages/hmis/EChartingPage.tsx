import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft, RefreshCw, Heart, Activity, Thermometer,
  Droplets, ClipboardList, Save, Plus, TrendingUp
} from 'lucide-react';
import api from '@/utils/api';

interface FlowsheetEntry {
  id: number;
  entry_type: string;
  recorded_at: string;
  recorded_by: number;
  bp_systolic?: number;
  bp_diastolic?: number;
  heart_rate?: number;
  spo2?: number;
  respiratory_rate?: number;
  temperature?: number;
  gcs_eye?: number;
  gcs_verbal?: number;
  gcs_motor?: number;
  pain_score?: number;
  io_type?: string;
  io_description?: string;
  io_volume_ml?: number;
  observation_text?: string;
}

interface IOSummary {
  summary_date: string;
  total_intake_ml: number;
  total_output_ml: number;
  net_balance_ml: number;
}

const TABS = ['vitals', 'io', 'observations', 'assessments'] as const;
type Tab = typeof TABS[number];

export default function EChartingPage() {
  const { admissionId } = useParams<{ admissionId: string }>();
  const navigate = useNavigate();

  const [activeTab, setActiveTab]     = useState<Tab>('vitals');
  const [entries, setEntries]         = useState<FlowsheetEntry[]>([]);
  const [ioSummary, setIOSummary]     = useState<IOSummary[]>([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [showForm, setShowForm]       = useState(false);

  // Vitals form
  const [vitals, setVitals] = useState({
    bpSystolic: '', bpDiastolic: '', heartRate: '', spo2: '',
    respiratoryRate: '', temperature: '', temperatureSite: 'axillary',
    gcsEye: '', gcsVerbal: '', gcsMotor: '', painScore: ''
  });

  // I&O form
  const [io, setIO] = useState({ ioType: 'intake', ioDescription: '', ioVolumeMl: '' });

  // Observation form
  const [obs, setObs] = useState({ observationText: '', skinIntegrity: '', fallRiskScore: '' });

  const loadData = useCallback(async () => {
    if (!admissionId) return;
    setLoading(true);
    try {
      const [flowRes, ioRes] = await Promise.all([
        api.get(`/api/v1/echart/flowsheet/${admissionId}?limit=50`),
        api.get(`/api/v1/echart/io/${admissionId}?days=3`)
      ]);
      setEntries(flowRes.data?.data ?? []);
      setIOSummary(ioRes.data?.data ?? []);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to load chart');
    } finally {
      setLoading(false);
    }
  }, [admissionId]);

  useEffect(() => { loadData(); }, [loadData]);

  const submitVitals = async () => {
    setSaving(true);
    try {
      await api.post('/api/v1/echart/entry', {
        admissionId: parseInt(admissionId!),
        entryType: 'vitals',
        bpSystolic:      vitals.bpSystolic      ? parseInt(vitals.bpSystolic)      : undefined,
        bpDiastolic:     vitals.bpDiastolic     ? parseInt(vitals.bpDiastolic)     : undefined,
        heartRate:       vitals.heartRate       ? parseInt(vitals.heartRate)       : undefined,
        spo2:            vitals.spo2            ? parseFloat(vitals.spo2)          : undefined,
        respiratoryRate: vitals.respiratoryRate ? parseInt(vitals.respiratoryRate) : undefined,
        temperature:     vitals.temperature     ? parseFloat(vitals.temperature)   : undefined,
        temperatureSite: vitals.temperatureSite,
        gcsEye:          vitals.gcsEye          ? parseInt(vitals.gcsEye)          : undefined,
        gcsVerbal:       vitals.gcsVerbal       ? parseInt(vitals.gcsVerbal)       : undefined,
        gcsMotor:        vitals.gcsMotor        ? parseInt(vitals.gcsMotor)        : undefined,
        painScore:       vitals.painScore       ? parseInt(vitals.painScore)       : undefined,
      });
      setVitals({ bpSystolic: '', bpDiastolic: '', heartRate: '', spo2: '',
        respiratoryRate: '', temperature: '', temperatureSite: 'axillary',
        gcsEye: '', gcsVerbal: '', gcsMotor: '', painScore: '' });
      setShowForm(false);
      await loadData();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to save vitals');
    } finally {
      setSaving(false);
    }
  };

  const submitIO = async () => {
    setSaving(true);
    try {
      await api.post('/api/v1/echart/entry', {
        admissionId: parseInt(admissionId!),
        entryType: 'io',
        ioType: io.ioType,
        ioDescription: io.ioDescription,
        ioVolumeMl: io.ioVolumeMl ? parseFloat(io.ioVolumeMl) : undefined,
      });
      setIO({ ioType: 'intake', ioDescription: '', ioVolumeMl: '' });
      setShowForm(false);
      await loadData();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to save I&O entry');
    } finally {
      setSaving(false);
    }
  };

  const submitObs = async () => {
    setSaving(true);
    try {
      await api.post('/api/v1/echart/entry', {
        admissionId: parseInt(admissionId!),
        entryType: 'observation',
        observationText: obs.observationText,
        skinIntegrity: obs.skinIntegrity || undefined,
        fallRiskScore: obs.fallRiskScore ? parseInt(obs.fallRiskScore) : undefined,
      });
      setObs({ observationText: '', skinIntegrity: '', fallRiskScore: '' });
      setShowForm(false);
      await loadData();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to save observation');
    } finally {
      setSaving(false);
    }
  };

  const vitalsEntries = entries.filter(e => e.entry_type === 'vitals');
  const ioEntries     = entries.filter(e => e.entry_type === 'io');
  const obsEntries    = entries.filter(e => !['vitals', 'io'].includes(e.entry_type));

  const gcsTotal = (e: FlowsheetEntry) =>
    (e.gcs_eye ?? 0) + (e.gcs_verbal ?? 0) + (e.gcs_motor ?? 0) || null;

  const fmtTime = (d: string) => new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  });

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Activity className="h-5 w-5 text-teal-600" /> Bedside E-Charting
            </h1>
            <p className="text-sm text-muted-foreground">Admission ID: {admissionId}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowForm(v => !v)}>
            <Plus className="h-4 w-4 mr-1" /> New Entry
          </Button>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>}

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-white border rounded-lg p-1 w-fit">
          {TABS.map(tab => (
            <button key={tab} onClick={() => { setActiveTab(tab); setShowForm(false); }}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors capitalize ${activeTab === tab ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {tab === 'io' ? 'I & O' : tab}
            </button>
          ))}
        </div>

        {/* Entry forms */}
        {showForm && (
          <Card className="mb-5 border-teal-200 bg-teal-50/30">
            <CardHeader className="pb-3"><CardTitle className="text-sm capitalize">{activeTab === 'io' ? 'Record I & O' : `Record ${activeTab}`}</CardTitle></CardHeader>
            <CardContent>
              {activeTab === 'vitals' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-1 block">Systolic</label>
                      <Input type="number" placeholder="mmHg" value={vitals.bpSystolic} onChange={e => setVitals(v => ({ ...v, bpSystolic: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-1 block">Diastolic</label>
                      <Input type="number" placeholder="mmHg" value={vitals.bpDiastolic} onChange={e => setVitals(v => ({ ...v, bpDiastolic: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-1 block">HR (bpm)</label>
                      <Input type="number" value={vitals.heartRate} onChange={e => setVitals(v => ({ ...v, heartRate: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-1 block">SpO₂ (%)</label>
                      <Input type="number" step="0.1" value={vitals.spo2} onChange={e => setVitals(v => ({ ...v, spo2: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-1 block">RR (br/min)</label>
                      <Input type="number" value={vitals.respiratoryRate} onChange={e => setVitals(v => ({ ...v, respiratoryRate: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-1 block">Temp (°C)</label>
                      <Input type="number" step="0.1" value={vitals.temperature} onChange={e => setVitals(v => ({ ...v, temperature: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-1 block">Pain (0-10)</label>
                      <Input type="number" min="0" max="10" value={vitals.painScore} onChange={e => setVitals(v => ({ ...v, painScore: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-600 mb-1">GCS</p>
                    <div className="flex gap-3">
                      {(['gcsEye', 'gcsVerbal', 'gcsMotor'] as const).map((k, i) => (
                        <div key={k} className="flex-1">
                          <label className="text-xs text-slate-500 mb-0.5 block">{['Eye (1-4)', 'Verbal (1-5)', 'Motor (1-6)'][i]}</label>
                          <Input type="number" min="1" max={[4,5,6][i]} value={vitals[k]} onChange={e => setVitals(v => ({ ...v, [k]: e.target.value }))} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <Button onClick={submitVitals} disabled={saving} className="bg-teal-600 hover:bg-teal-700 text-white">
                    <Save className="h-4 w-4 mr-1" />{saving ? 'Saving…' : 'Save Vitals'}
                  </Button>
                </div>
              )}

              {activeTab === 'io' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-1 block">Type</label>
                      <select className="w-full border rounded-md px-3 py-2 text-sm bg-white" value={io.ioType} onChange={e => setIO(v => ({ ...v, ioType: e.target.value }))}>
                        <option value="intake">Intake</option>
                        <option value="output">Output</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-1 block">Description</label>
                      <Input value={io.ioDescription} onChange={e => setIO(v => ({ ...v, ioDescription: e.target.value }))} placeholder="IV fluid, urine, drain…" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-1 block">Volume (mL)</label>
                      <Input type="number" value={io.ioVolumeMl} onChange={e => setIO(v => ({ ...v, ioVolumeMl: e.target.value }))} />
                    </div>
                  </div>
                  <Button onClick={submitIO} disabled={saving} className="bg-teal-600 hover:bg-teal-700 text-white">
                    <Save className="h-4 w-4 mr-1" />{saving ? 'Saving…' : 'Save Entry'}
                  </Button>
                </div>
              )}

              {(activeTab === 'observations' || activeTab === 'assessments') && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600 mb-1 block">Observation / Note</label>
                    <textarea className="w-full border rounded-md px-3 py-2 text-sm min-h-[80px] resize-none"
                      value={obs.observationText} onChange={e => setObs(v => ({ ...v, observationText: e.target.value }))}
                      placeholder="Nursing observation, patient behaviour, wound status…" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-1 block">Skin Integrity</label>
                      <select className="w-full border rounded-md px-3 py-2 text-sm bg-white" value={obs.skinIntegrity} onChange={e => setObs(v => ({ ...v, skinIntegrity: e.target.value }))}>
                        <option value="">Select…</option>
                        <option value="intact">Intact</option>
                        <option value="at_risk">At Risk</option>
                        <option value="stage_1">Stage 1</option>
                        <option value="stage_2">Stage 2</option>
                        <option value="stage_3">Stage 3</option>
                        <option value="stage_4">Stage 4</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-1 block">Fall Risk Score</label>
                      <Input type="number" min="0" value={obs.fallRiskScore} onChange={e => setObs(v => ({ ...v, fallRiskScore: e.target.value }))} placeholder="Morse scale" />
                    </div>
                  </div>
                  <Button onClick={submitObs} disabled={saving} className="bg-teal-600 hover:bg-teal-700 text-white">
                    <Save className="h-4 w-4 mr-1" />{saving ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Data display */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading chart…</div>
        ) : (
          <>
            {/* Vitals flowsheet */}
            {activeTab === 'vitals' && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Heart className="h-4 w-4 text-red-500" /> Vital Signs Flowsheet
                    <span className="text-xs font-normal text-muted-foreground ml-1">({vitalsEntries.length} entries)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  {vitalsEntries.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No vitals recorded yet</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-slate-50 text-slate-500">
                          <th className="py-2 px-3 text-left font-medium">Time</th>
                          <th className="py-2 px-2 text-center font-medium">BP</th>
                          <th className="py-2 px-2 text-center font-medium">HR</th>
                          <th className="py-2 px-2 text-center font-medium">SpO₂</th>
                          <th className="py-2 px-2 text-center font-medium">RR</th>
                          <th className="py-2 px-2 text-center font-medium">Temp</th>
                          <th className="py-2 px-2 text-center font-medium">GCS</th>
                          <th className="py-2 px-2 text-center font-medium">Pain</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {vitalsEntries.map(e => (
                          <tr key={e.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 text-slate-500 whitespace-nowrap">{fmtTime(e.recorded_at)}</td>
                            <td className="py-2 px-2 text-center font-medium">{e.bp_systolic && e.bp_diastolic ? `${e.bp_systolic}/${e.bp_diastolic}` : '—'}</td>
                            <td className={`py-2 px-2 text-center font-medium ${e.heart_rate && (e.heart_rate < 60 || e.heart_rate > 100) ? 'text-red-600' : ''}`}>{e.heart_rate ?? '—'}</td>
                            <td className={`py-2 px-2 text-center font-medium ${e.spo2 && e.spo2 < 94 ? 'text-red-600' : ''}`}>{e.spo2 ? `${e.spo2}%` : '—'}</td>
                            <td className={`py-2 px-2 text-center ${e.respiratory_rate && (e.respiratory_rate < 12 || e.respiratory_rate > 20) ? 'text-amber-600 font-medium' : ''}`}>{e.respiratory_rate ?? '—'}</td>
                            <td className={`py-2 px-2 text-center ${e.temperature && e.temperature > 38.5 ? 'text-red-600 font-medium' : ''}`}>{e.temperature ? `${e.temperature}°C` : '—'}</td>
                            <td className={`py-2 px-2 text-center font-medium ${gcsTotal(e) && gcsTotal(e)! < 9 ? 'text-red-600' : ''}`}>{gcsTotal(e) ?? '—'}</td>
                            <td className={`py-2 px-2 text-center ${e.pain_score && e.pain_score >= 7 ? 'text-red-600 font-bold' : ''}`}>{e.pain_score ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            )}

            {/* I&O */}
            {activeTab === 'io' && (
              <div className="space-y-4">
                {/* Daily summary */}
                {ioSummary.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-blue-500" /> Daily I&O Summary</CardTitle></CardHeader>
                    <CardContent className="p-0">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b bg-slate-50 text-slate-500 text-xs">
                          <th className="py-2 px-4 text-left font-medium">Date</th>
                          <th className="py-2 px-3 text-center font-medium">Intake (mL)</th>
                          <th className="py-2 px-3 text-center font-medium">Output (mL)</th>
                          <th className="py-2 px-3 text-center font-medium">Net Balance</th>
                        </tr></thead>
                        <tbody className="divide-y">
                          {ioSummary.map(row => (
                            <tr key={row.summary_date}>
                              <td className="py-2 px-4">{new Date(row.summary_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                              <td className="py-2 px-3 text-center text-blue-600">{row.total_intake_ml}</td>
                              <td className="py-2 px-3 text-center text-amber-600">{row.total_output_ml}</td>
                              <td className={`py-2 px-3 text-center font-semibold ${row.net_balance_ml < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                {row.net_balance_ml > 0 ? '+' : ''}{row.net_balance_ml}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                )}

                {/* I&O entries */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Droplets className="h-4 w-4 text-blue-500" /> I&O Entries</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {ioEntries.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No I&O recorded</p> : ioEntries.map(e => (
                      <div key={e.id} className={`flex items-center justify-between p-2 rounded-lg ${e.io_type === 'output' ? 'bg-amber-50' : 'bg-blue-50'}`}>
                        <div>
                          <Badge className={`text-xs mr-2 ${e.io_type === 'output' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{e.io_type}</Badge>
                          <span className="text-sm">{e.io_description}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{e.io_volume_ml} mL</p>
                          <p className="text-xs text-slate-400">{fmtTime(e.recorded_at)}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Observations / Assessments */}
            {(activeTab === 'observations' || activeTab === 'assessments') && (
              <div className="space-y-3">
                {obsEntries.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">No observations recorded</div>
                ) : obsEntries.map(e => (
                  <Card key={e.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <Badge className="bg-slate-100 text-slate-600 text-xs">{e.entry_type}</Badge>
                        <span className="text-xs text-slate-400">{fmtTime(e.recorded_at)}</span>
                      </div>
                      {e.observation_text && <p className="text-sm text-slate-700">{e.observation_text}</p>}
                      <div className="flex gap-4 mt-2 text-xs text-slate-500">
                        {e.pain_score != null && <span>Pain: {e.pain_score}/10</span>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
