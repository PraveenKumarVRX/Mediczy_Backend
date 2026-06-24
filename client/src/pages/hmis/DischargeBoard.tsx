import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, LogOut, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import api from '@/utils/api';

interface Admission {
  id: number;
  patientName: string;
  ward: string;
  bed: string;
  admittedAt: string;
  checklist: {
    clinical: boolean;
    nursing_education: boolean;
    medication_reconciliation: boolean;
    billing: boolean;
    tpa: boolean;
    discharge_summary: boolean;
  };
}

const MANDATORY_KEYS: (keyof Admission['checklist'])[] = ['clinical', 'nursing_education', 'medication_reconciliation', 'billing', 'discharge_summary'];

const CHECKLIST_LABELS: Record<keyof Admission['checklist'], string> = {
  clinical: 'Clinical',
  nursing_education: 'Nursing Ed.',
  medication_reconciliation: 'Med. Recon.',
  billing: 'Billing',
  tpa: 'TPA',
  discharge_summary: 'Discharge Summary',
};

function readinessPct(a: Admission) {
  const keys = Object.keys(a.checklist) as (keyof Admission['checklist'])[];
  const done = keys.filter(k => a.checklist[k]).length;
  return Math.round((done / keys.length) * 100);
}

function isReady(a: Admission) {
  return MANDATORY_KEYS.every(k => a.checklist[k]);
}

function losHours(a: Admission) {
  return Math.round((Date.now() - new Date(a.admittedAt).getTime()) / 3600000);
}

type SortKey = 'readiness' | 'los';

export default function DischargeBoard() {
  const navigate = useNavigate();
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [sort, setSort]             = useState<SortKey>('readiness');
  const [discharging, setDischarging] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/v1/adt/admissions?status=active');
      setAdmissions(res.data?.data ?? []);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to load admissions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const initiateDischarge = async (id: number) => {
    setDischarging(id);
    try {
      await api.post('/v1/adt/discharge', { admissionId: id });
      setAdmissions(prev => prev.filter(a => a.id !== id));
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Discharge initiation failed');
    } finally {
      setDischarging(null);
    }
  };

  const sorted = [...admissions].sort((a, b) =>
    sort === 'readiness'
      ? readinessPct(b) - readinessPct(a)
      : losHours(b) - losHours(a)
  );

  const readyCount   = admissions.filter(isReady).length;
  const pendingCount = admissions.length - readyCount;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <LogOut className="h-5 w-5 text-teal-600" /> Discharge Readiness Board
            </h1>
            <p className="text-sm text-muted-foreground">Discharge readiness for all active inpatients</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        <div className="flex flex-wrap gap-3 mb-6">
          <div className="bg-slate-100 text-slate-700 rounded-xl px-5 py-3 text-center">
            <p className="text-2xl font-bold">{admissions.length}</p><p className="text-xs font-medium">Total Active</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-5 py-3 text-center">
            <p className="text-2xl font-bold">{readyCount}</p><p className="text-xs font-medium">Ready</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-5 py-3 text-center">
            <p className="text-2xl font-bold">{pendingCount}</p><p className="text-xs font-medium">Pending</p>
          </div>
          <div className="flex gap-1 bg-white border rounded-lg p-1 ml-auto self-center">
            {(['readiness', 'los'] as SortKey[]).map(s => (
              <button key={s} onClick={() => setSort(s)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${sort === s ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {s === 'readiness' ? 'Readiness %' : 'LOS'}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm flex gap-2"><AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />{error}</div>}

        {loading ? (
          <div className="text-center py-16 text-muted-foreground">Loading admissions…</div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">No active admissions</div>
        ) : (
          <div className="space-y-3">
            {sorted.map(a => {
              const pct   = readinessPct(a);
              const ready = isReady(a);
              const los   = losHours(a);
              const keys  = Object.keys(a.checklist) as (keyof Admission['checklist'])[];
              return (
                <Card key={a.id} className={`hover:shadow-md transition-shadow ${ready ? 'border-emerald-300' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4 flex-wrap">
                      <div className="min-w-[160px]">
                        <p className="font-semibold text-slate-800">{a.patientName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{a.ward} • Bed {a.bed}</p>
                        <p className="text-xs text-muted-foreground">LOS: {los}h</p>
                      </div>
                      <div className="flex flex-wrap gap-2 flex-1">
                        {keys.map(k => (
                          <div key={k} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${a.checklist[k] ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
                            {a.checklist[k] ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                            {CHECKLIST_LABELS[k]}
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-center">
                          <div className="w-12 h-12 rounded-full border-4 flex items-center justify-center text-xs font-bold" style={{ borderColor: pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444', color: pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444' }}>
                            {pct}%
                          </div>
                        </div>
                        {ready && <Badge className="bg-emerald-100 text-emerald-700 text-xs">Ready</Badge>}
                        <Button size="sm" onClick={() => initiateDischarge(a.id)} disabled={!ready || discharging === a.id}
                          className="bg-teal-600 hover:bg-teal-700 text-white text-xs disabled:opacity-40">
                          {discharging === a.id ? 'Processing…' : 'Initiate Discharge'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
