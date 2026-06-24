import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, BedDouble, AlertCircle } from 'lucide-react';
import api from '@/utils/api';

interface Bed {
  bedId: number;
  bedNumber: string;
  ward: string;
  wardId: number;
  status: 'available' | 'occupied' | 'blocked' | 'housekeeping';
}

interface Census {
  total: number;
  occupied: number;
  available: number;
  blocked: number;
}

const STATUS_STYLE: Record<string, string> = {
  available:   'bg-emerald-100 border-emerald-300 text-emerald-800',
  occupied:    'bg-amber-100 border-amber-300 text-amber-800',
  blocked:     'bg-red-100 border-red-300 text-red-800',
  housekeeping:'bg-purple-100 border-purple-300 text-purple-800',
};

export default function BedMap() {
  const navigate = useNavigate();
  const [beds, setBeds]       = useState<Bed[]>([]);
  const [census, setCensus]   = useState<Census | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [wardFilter, setWardFilter] = useState<string>('all');
  const [reserving, setReserving]   = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const wardParam = wardFilter !== 'all' ? `?wardId=${wardFilter}` : '';
      const [bedsRes, censusRes] = await Promise.allSettled([
        api.get(`/v1/beds/map${wardParam}`),
        api.get('/v1/beds/census'),
      ]);
      if (bedsRes.status === 'fulfilled') {
        const raw = bedsRes.value.data?.data ?? [];
        setBeds(raw.map((b: any) => ({
          bedId: b.id,
          bedNumber: b.bed_number,
          ward: b.ward_name || 'Ward',
          wardId: b.ward_id,
          status: b.status,
        })));
      }
      if (censusRes.status === 'fulfilled') setCensus(censusRes.value.data?.data ?? null);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to load bed map');
    } finally {
      setLoading(false);
    }
  }, [wardFilter]);

  useEffect(() => { load(); }, [load]);

  const reserveBed = async (bedId: number) => {
    setReserving(bedId);
    try {
      await api.post('/v1/beds/reserve', { bedId });
      setBeds(prev => prev.map(b => b.bedId === bedId ? { ...b, status: 'occupied' } : b));
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Reservation failed');
    } finally {
      setReserving(null);
    }
  };

  const wards = ['all', ...Array.from(new Set(beds.map(b => b.ward)))];
  const filtered = wardFilter === 'all' ? beds : beds.filter(b => b.ward === wardFilter);

  const grouped = filtered.reduce<Record<string, Bed[]>>((acc, b) => {
    (acc[b.ward] = acc[b.ward] || []).push(b);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <BedDouble className="h-5 w-5 text-teal-600" /> Live Bed Map
            </h1>
            <p className="text-sm text-muted-foreground">Real-time bed status across all wards</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        {census && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Total', value: census.total, cls: 'bg-slate-100 text-slate-700' },
              { label: 'Occupied', value: census.occupied, cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
              { label: 'Available', value: census.available, cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
              { label: 'Blocked', value: census.blocked, cls: 'bg-red-50 text-red-700 border border-red-200' },
            ].map(s => (
              <div key={s.label} className={`rounded-xl p-4 text-center ${s.cls}`}>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs mt-1 font-medium">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-1 mb-5 bg-white border rounded-lg p-1 w-fit flex-wrap">
          {wards.map(w => (
            <button key={w} onClick={() => setWardFilter(w)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${wardFilter === w ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {w === 'all' ? 'All Wards' : w}
            </button>
          ))}
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}

        {loading ? (
          <div className="text-center py-16 text-muted-foreground">Loading bed map…</div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([ward, wardBeds]) => (
              <Card key={ward}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-700">{ward} <span className="text-muted-foreground font-normal">({wardBeds.length} beds)</span></CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                    {wardBeds.map(bed => (
                      <div key={bed.bedId} className={`border rounded-lg p-2 text-center text-xs flex flex-col gap-1 ${STATUS_STYLE[bed.status]}`}>
                        <span className="font-bold text-sm">{bed.bedNumber}</span>
                        <Badge className={`text-[10px] px-1 ${STATUS_STYLE[bed.status]}`}>{bed.status}</Badge>
                        {bed.status === 'available' && (
                          <button onClick={() => reserveBed(bed.bedId)} disabled={reserving === bed.bedId}
                            className="mt-1 text-[10px] bg-teal-600 text-white rounded px-1 py-0.5 hover:bg-teal-700 disabled:opacity-50">
                            {reserving === bed.bedId ? '…' : 'Reserve'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
            {Object.keys(grouped).length === 0 && (
              <div className="text-center py-12 text-muted-foreground">No beds found</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
