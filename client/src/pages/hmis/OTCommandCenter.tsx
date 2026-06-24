import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, Scissors, AlertTriangle, Clock } from 'lucide-react';
import api from '@/utils/api';

interface OTCase {
  id: number;
  case_number: string;
  patient_name: string;
  surgeon: string;
  procedure: string;
  room: string;
  scheduled_start: string;
  actual_start?: string;
  status: 'scheduled' | 'patient_in' | 'prep' | 'incision' | 'closure' | 'completed';
  readiness_pct: number;
  is_emergency: boolean;
}

const STATUS_STYLE: Record<string, string> = {
  scheduled:  'bg-blue-100 text-blue-700',
  patient_in: 'bg-cyan-100 text-cyan-700',
  prep:       'bg-yellow-100 text-yellow-700',
  incision:   'bg-orange-100 text-orange-700',
  closure:    'bg-green-100 text-green-700',
  completed:  'bg-slate-100 text-slate-600',
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled', patient_in: 'Patient In', prep: 'Prep',
  incision: 'Incision', closure: 'Closure', completed: 'Completed',
};

function isDelayed(c: OTCase) {
  if (!c.actual_start || !c.scheduled_start) return false;
  return new Date(c.actual_start).getTime() - new Date(c.scheduled_start).getTime() > 15 * 60 * 1000;
}

export default function OTCommandCenter() {
  const navigate = useNavigate();
  const [cases, setCases]     = useState<OTCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [updating, setUpdating] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/v1/ot/cases/today');
      setCases(res.data?.data ?? []);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to load OT cases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: number) => {
    setUpdating(id);
    try {
      await api.get(`/v1/ot/${id}/checklist-status`);
    } catch {
      /* ignore, UI demo */
    } finally {
      setUpdating(null);
    }
  };

  const total     = cases.length;
  const inProg    = cases.filter(c => !['scheduled', 'completed'].includes(c.status)).length;
  const completed = cases.filter(c => c.status === 'completed').length;
  const delayed   = cases.filter(isDelayed).length;
  const emergency = cases.filter(c => c.is_emergency);
  const regular   = cases.filter(c => !c.is_emergency);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Scissors className="h-5 w-5 text-teal-600" /> OT Command Center
            </h1>
            <p className="text-sm text-muted-foreground">Today's operating theatre schedule</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total Cases', value: total, cls: 'bg-slate-100 text-slate-700' },
            { label: 'In Progress', value: inProg, cls: 'bg-cyan-50 text-cyan-700 border border-cyan-200' },
            { label: 'Completed', value: completed, cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
            { label: 'Delayed', value: delayed, cls: 'bg-red-50 text-red-700 border border-red-200' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl p-4 text-center ${s.cls}`}>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs mt-1 font-medium">{s.label}</p>
            </div>
          ))}
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>}

        {emergency.length > 0 && (
          <Card className="mb-4 border-red-300 bg-red-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-red-700 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Emergency Cases
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CaseTable cases={emergency} updating={updating} onUpdate={updateStatus} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700">Scheduled Cases</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-10 text-muted-foreground">Loading…</div>
            ) : regular.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">No cases for today</div>
            ) : (
              <CaseTable cases={regular} updating={updating} onUpdate={updateStatus} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CaseTable({ cases, updating, onUpdate }: { cases: OTCase[]; updating: number | null; onUpdate: (id: number) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-500 border-b">
            {['Case #', 'Patient', 'Surgeon', 'Procedure', 'Room', 'Sched.', 'Actual', 'Status', 'Ready%', ''].map(h => (
              <th key={h} className="text-left py-2 px-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cases.map(c => (
            <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50">
              <td className="py-2 px-2 font-mono text-xs">{c.case_number}</td>
              <td className="py-2 px-2 font-medium">{c.patient_name}</td>
              <td className="py-2 px-2 text-muted-foreground">{c.surgeon}</td>
              <td className="py-2 px-2">{c.procedure}</td>
              <td className="py-2 px-2">{c.room}</td>
              <td className="py-2 px-2 text-xs flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(c.scheduled_start).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
              <td className="py-2 px-2 text-xs">{c.actual_start ? new Date(c.actual_start).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
              <td className="py-2 px-2"><Badge className={`text-xs ${STATUS_STYLE[c.status]}`}>{STATUS_LABEL[c.status]}</Badge></td>
              <td className="py-2 px-2">
                <div className="flex items-center gap-1">
                  <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-500 rounded-full" style={{ width: `${c.readiness_pct}%` }} />
                  </div>
                  <span className="text-xs text-slate-600">{c.readiness_pct}%</span>
                </div>
              </td>
              <td className="py-2 px-2">
                <Button size="sm" variant="outline" onClick={() => onUpdate(c.id)} disabled={updating === c.id} className="text-xs">
                  {updating === c.id ? '…' : 'Update'}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
