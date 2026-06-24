import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Activity, ArrowLeft, RefreshCw, Search,
  Bed, Stethoscope, FlaskConical, Syringe, CreditCard,
  Calendar, AlertCircle, FileText, HeartPulse, Scissors
} from 'lucide-react';
import api from '@/utils/api';

interface TimelineEvent {
  id: string | number;
  category: string;
  event_code?: string;
  title: string;
  description?: string;
  status: string;
  performed_by?: string;
  location?: Record<string, string>;
  metadata?: Record<string, unknown>;
  event_at: string;
  source: string;
}

const CATEGORY_ICON: Record<string, React.ElementType> = {
  admission:      Bed,
  consultation:   Stethoscope,
  lab_order:      FlaskConical,
  lab_result:     FlaskConical,
  imaging_order:  FlaskConical,
  imaging_result: FlaskConical,
  triage:         AlertCircle,
  ot_booking:     Scissors,
  ot_status:      Scissors,
  medication:     Syringe,
  discharge:      Activity,
  follow_up:      Calendar,
  payment:        CreditCard,
  registration:   FileText,
  appointment:    Calendar,
  custom:         Activity,
};

const CATEGORY_COLOR: Record<string, string> = {
  admission:   'bg-blue-100 text-blue-700',
  discharge:   'bg-emerald-100 text-emerald-700',
  ot_booking:  'bg-purple-100 text-purple-700',
  ot_status:   'bg-purple-100 text-purple-700',
  triage:      'bg-red-100 text-red-700',
  lab_result:  'bg-amber-100 text-amber-700',
  medication:  'bg-pink-100 text-pink-700',
  payment:     'bg-slate-100 text-slate-600',
};

const STATUS_COLOR: Record<string, string> = {
  completed:  'bg-emerald-100 text-emerald-700',
  pending:    'bg-amber-100 text-amber-700',
  cancelled:  'bg-red-100 text-red-600',
};

export default function PatientTimeline() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();

  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const load = async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const res = await api.get(`/v1/navigation/patient/${patientId}/timeline?limit=200`);
      setEvents(res.data?.data?.events ?? []);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to load timeline');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [patientId]);

  const categories = Array.from(new Set(events.map(e => e.category)));

  const filtered = events.filter(e => {
    const matchSearch = !search || e.title.toLowerCase().includes(search.toLowerCase()) || e.description?.toLowerCase().includes(search.toLowerCase());
    const matchCat = !categoryFilter || e.category === categoryFilter;
    return matchSearch && matchCat;
  });

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <HeartPulse className="h-5 w-5 text-teal-600" /> Patient Timeline
            </h1>
            <p className="text-sm text-muted-foreground">Patient ID: {patientId}</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search events…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select
            className="border rounded-md px-3 py-2 text-sm bg-white"
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
          </select>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>}

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading timeline…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No events found</div>
        ) : (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-slate-200" />

            <div className="space-y-4">
              {filtered.map((ev, i) => {
                const Icon = CATEGORY_ICON[ev.category] ?? Activity;
                const catColor = CATEGORY_COLOR[ev.category] ?? 'bg-slate-100 text-slate-600';
                const statusColor = STATUS_COLOR[ev.status] ?? 'bg-slate-100 text-slate-600';
                return (
                  <div key={`${ev.id}-${i}`} className="flex gap-4 pl-2">
                    {/* Icon bubble */}
                    <div className={`relative z-10 flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${catColor}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    {/* Card */}
                    <Card className="flex-1 hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-slate-800 text-sm">{ev.title}</p>
                              <Badge className={`text-xs px-1.5 ${statusColor}`}>{ev.status}</Badge>
                              {ev.source === 'adt' && <Badge variant="outline" className="text-xs px-1.5">ADT</Badge>}
                            </div>
                            {ev.description && <p className="text-sm text-muted-foreground mt-0.5">{ev.description}</p>}
                            {ev.performed_by && <p className="text-xs text-slate-400 mt-1">By: {ev.performed_by}</p>}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs font-medium text-slate-600">{new Date(ev.event_at).toLocaleDateString('en-IN')}</p>
                            <p className="text-xs text-muted-foreground">{new Date(ev.event_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
