import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, Pill, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import api from '@/services/api';

interface EMARItem {
  orderId: number;
  admissionId: number;
  patientId: number;
  patientName: string;
  drugName: string;
  dose: string;
  route: string;
  scheduledTime: string;
  status: 'due' | 'administered' | 'late' | 'held';
  ward: string;
}

const STATUS_STYLE: Record<string, string> = {
  due:          'bg-amber-100 text-amber-700',
  administered: 'bg-emerald-100 text-emerald-700',
  late:         'bg-red-100 text-red-700',
  held:         'bg-slate-100 text-slate-500',
};

const WINDOWS = ['2h', '4h', '8h'] as const;
type Window = typeof WINDOWS[number];

export default function EMARPage() {
  const navigate = useNavigate();
  const [items, setItems]         = useState<EMARItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [wardFilter, setWardFilter] = useState<string>('all');
  const [window, setWindow]       = useState<Window>('4h');
  const [administering, setAdministering] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const wardParam = wardFilter !== 'all' ? `&wardId=${wardFilter}` : '';
      const res = await api.get(`/api/v1/emar/due?window=${window}${wardParam}`);
      setItems(res.data?.data ?? []);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to load eMAR');
    } finally {
      setLoading(false);
    }
  }, [wardFilter, window]);

  useEffect(() => { load(); }, [load]);

  const administer = async (item: EMARItem) => {
    setAdministering(item.orderId);
    try {
      await api.post('/api/v1/emar/administer', {
        orderId: item.orderId,
        admissionId: item.admissionId,
        patientId: item.patientId,
        routeUsed: item.route,
      });
      setItems(prev => prev.map(i => i.orderId === item.orderId ? { ...i, status: 'administered' } : i));
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Administration failed');
    } finally {
      setAdministering(null);
    }
  };

  const wards = ['all', ...Array.from(new Set(items.map(i => i.ward)))];
  const filtered = wardFilter === 'all' ? items : items.filter(i => i.ward === wardFilter);

  const dueNow  = items.filter(i => i.status === 'due').length;
  const late    = items.filter(i => i.status === 'late').length;
  const given   = items.filter(i => i.status === 'administered').length;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Pill className="h-5 w-5 text-teal-600" /> eMAR — Medication Administration
            </h1>
            <p className="text-sm text-muted-foreground">Electronic Medication Administration Record</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        {/* 5 Rights Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-5 flex flex-wrap gap-3 text-xs text-blue-800 font-medium">
          <span className="flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" /> Verify 5 Rights before administering:</span>
          {['Right Patient', 'Right Drug', 'Right Dose', 'Right Route', 'Right Time'].map(r => (
            <span key={r} className="bg-blue-100 rounded px-2 py-0.5">{r}</span>
          ))}
        </div>

        {/* Counts */}
        <div className="flex gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-1 bg-amber-100 text-amber-700 rounded-full px-3 py-1 text-sm"><Clock className="h-3.5 w-3.5" />{dueNow} Due Now</div>
          <div className="flex items-center gap-1 bg-red-100 text-red-700 rounded-full px-3 py-1 text-sm"><AlertCircle className="h-3.5 w-3.5" />{late} Late</div>
          <div className="flex items-center gap-1 bg-emerald-100 text-emerald-700 rounded-full px-3 py-1 text-sm"><CheckCircle2 className="h-3.5 w-3.5" />{given} Given Today</div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="flex gap-1 bg-white border rounded-lg p-1">
            {wards.map(w => (
              <button key={w} onClick={() => setWardFilter(w)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${wardFilter === w ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {w === 'all' ? 'All Wards' : w}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-white border rounded-lg p-1">
            {WINDOWS.map(w => (
              <button key={w} onClick={() => setWindow(w)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${window === w ? 'bg-slate-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {w}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>}

        {loading ? (
          <div className="text-center py-16 text-muted-foreground">Loading medications…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">No medications due in this window</div>
        ) : (
          <div className="space-y-2">
            {filtered.map(item => (
              <Card key={item.orderId} className={`hover:shadow-sm transition-shadow ${item.status === 'administered' ? 'opacity-60' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-slate-800">{item.patientName}</span>
                        <span className="text-slate-400 text-xs">{item.ward}</span>
                        <Badge className={`text-xs px-1.5 ${STATUS_STYLE[item.status]}`}>{item.status}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                        <span className="font-medium text-slate-800">{item.drugName}</span>
                        <span>{item.dose}</span>
                        <span className="text-slate-400">via {item.route}</span>
                        <span className="flex items-center gap-1 text-xs"><Clock className="h-3 w-3" />
                          {new Date(item.scheduledTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                    {item.status !== 'administered' && item.status !== 'held' && (
                      <Button size="sm" onClick={() => administer(item)} disabled={administering === item.orderId}
                        className="bg-teal-600 hover:bg-teal-700 text-white flex-shrink-0">
                        {administering === item.orderId ? 'Saving…' : 'Administer'}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
