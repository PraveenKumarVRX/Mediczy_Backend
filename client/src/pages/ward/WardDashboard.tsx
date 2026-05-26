import { useState, useEffect, useCallback } from 'react';
import HospDeptLayout from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Bed, Users, AlertTriangle, Clock, CheckCircle2, Activity,
  Pill, ClipboardCheck, ArrowRight, RefreshCw, Plus, User,
  TrendingDown, AlertCircle, Heart, HeartPulse, ClipboardList, FileText, Calendar
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BedRecord {
  id: number;
  bed_number: string;
  bed_type: string;
  status: 'available' | 'occupied' | 'housekeeping' | 'maintenance' | 'blocked';
  ward_id: number;
  ward_name: string;
  ward_type: string;
  floor: number;
  admission_id?: number;
  admission_number?: string;
  patient_id?: number;
  expected_discharge?: string;
  patient_status?: string;
}

interface Alert {
  id: number;
  alert_type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  news2_score: number;
  alert_message: string;
  triggered_at: string;
  bed_number: string;
  ward_name: string;
  admission_number: string;
}

interface DueMed {
  schedule_id: number;
  drug_name: string;
  dose: string;
  route: string;
  scheduled_time: string;
  is_overdue: boolean;
  patient_id: number;
  admission_id: number;
}

interface CensusRow {
  ward_id: number;
  ward_name: string;
  ward_type: string;
  capacity: number;
  available: number;
  occupied: number;
  occupancy_pct: number;
}

// ── Colour helpers ────────────────────────────────────────────────────────────

const statusColour: Record<string, string> = {
  available:   'bg-emerald-50 border-emerald-300 text-emerald-700',
  occupied:    'bg-blue-50 border-blue-300 text-blue-700',
  housekeeping:'bg-amber-50 border-amber-300 text-amber-700',
  maintenance: 'bg-slate-100 border-slate-300 text-slate-500',
  blocked:     'bg-red-50 border-red-300 text-red-500',
};

const alertColour: Record<string, string> = {
  critical: 'bg-red-50 border-l-4 border-red-500',
  high:     'bg-amber-50 border-l-4 border-amber-400',
  medium:   'bg-yellow-50 border-l-4 border-yellow-400',
  low:      'bg-slate-50 border-l-4 border-slate-300',
};

const severityBadge: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-yellow-100 text-yellow-700',
  low:      'bg-slate-100 text-slate-600',
};

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiFetch(path: string) {
  const res = await fetch(path, { credentials: 'include' });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function WardDashboard() {
  const navigate = useNavigate();
  const [beds, setBeds] = useState<BedRecord[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dueMeds, setDueMeds] = useState<DueMed[]>([]);
  const [census, setCensus] = useState<CensusRow[]>([]);
  const [selectedWard, setSelectedWard] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const loadData = useCallback(async () => {
    try {
      const [bedMap, activeAlerts, dueList, censusData] = await Promise.all([
        apiFetch(`/api/v1/beds/map${selectedWard ? `?wardId=${selectedWard}` : ''}`).catch(() => []),
        apiFetch('/api/v1/vitals/alerts').catch(() => []),
        apiFetch('/api/v1/emar/due').catch(() => []),
        apiFetch('/api/v1/beds/census').catch(() => []),
      ]);
      setBeds(bedMap);
      setAlerts(activeAlerts);
      setDueMeds(dueList);
      setCensus(censusData);
      setLastUpdated(new Date());
    } catch {}
    setLoading(false);
  }, [selectedWard]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30_000);
    return () => clearInterval(interval);
  }, [loadData]);

  const totalBeds = beds.length;
  const occupiedBeds = beds.filter(b => b.status === 'occupied').length;
  const availableBeds = beds.filter(b => b.status === 'available').length;
  const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
  const overdueMeds = dueMeds.filter(m => m.is_overdue).length;

  const kpis = [
    { label: 'Total Beds',    value: totalBeds,    sub: `${occupiedBeds} occupied`,     icon: Bed,           colour: 'text-blue-600' },
    { label: 'Available',     value: availableBeds, sub: 'Ready to admit',              icon: CheckCircle2,   colour: 'text-emerald-600' },
    { label: 'Active Alerts', value: alerts.length, sub: `${criticalAlerts} critical`,  icon: AlertTriangle,  colour: criticalAlerts > 0 ? 'text-red-600' : 'text-amber-600' },
    { label: 'Meds Due',      value: dueMeds.length, sub: `${overdueMeds} overdue`,     icon: Pill,           colour: overdueMeds > 0 ? 'text-red-600' : 'text-slate-600' },
  ];

  // Group beds by ward for the bed map
  const wardGroups = beds.reduce<Record<string, BedRecord[]>>((acc, bed) => {
    const key = bed.ward_name || 'Unassigned';
    if (!acc[key]) acc[key] = [];
    acc[key].push(bed);
    return acc;
  }, {});

  return (
    <HospDeptLayout>
      <div className="p-4 md:p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Ward Dashboard</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Live bed map · Nurse task board · Early warning alerts
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Updated {lastUpdated.toLocaleTimeString()}</span>
            <Button variant="outline" size="sm" onClick={loadData} className="gap-1">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            <Button size="sm" className="gap-1 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => navigate('/hospital/adt/admit')}>
              <Plus className="h-3.5 w-3.5" /> Admit Patient
            </Button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map(k => (
            <Card key={k.label} className="border shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <k.icon className={`h-8 w-8 ${k.colour}`} />
                <div>
                  <div className="text-2xl font-bold text-slate-800">{loading ? '—' : k.value}</div>
                  <div className="text-xs text-slate-500">{k.label}</div>
                  <div className="text-xs text-slate-400">{k.sub}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Bed Map — 2 columns */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Bed className="h-4 w-4 text-blue-600" /> Live Bed Map
                  </CardTitle>
                  <div className="flex gap-2 text-xs">
                    {[
                      { label: 'Available', cls: 'bg-emerald-100 text-emerald-700' },
                      { label: 'Occupied', cls: 'bg-blue-100 text-blue-700' },
                      { label: 'Housekeeping', cls: 'bg-amber-100 text-amber-700' },
                      { label: 'Maintenance', cls: 'bg-slate-100 text-slate-500' },
                    ].map(l => (
                      <span key={l.label} className={`px-2 py-0.5 rounded-full font-medium ${l.cls}`}>{l.label}</span>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {loading ? (
                  <p className="text-sm text-slate-400 text-center py-8">Loading bed map...</p>
                ) : Object.keys(wardGroups).length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No beds configured yet.</p>
                ) : (
                  Object.entries(wardGroups).map(([wardName, wardBeds]) => (
                    <div key={wardName}>
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{wardName}</div>
                      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                        {wardBeds.map(bed => (
                          <div
                            key={bed.id}
                            className={`border rounded-lg p-2 transition-shadow text-center group relative ${statusColour[bed.status] || 'bg-white border-slate-200'} ${bed.admission_id ? 'cursor-pointer hover:shadow-md' : ''}`}
                          >
                            <div className="text-xs font-bold">{bed.bed_number}</div>
                            {bed.patient_id ? (
                              <User className="h-4 w-4 mx-auto mt-0.5 opacity-70" />
                            ) : (
                              <Bed className="h-4 w-4 mx-auto mt-0.5 opacity-40" />
                            )}
                            {bed.admission_id && bed.patient_id && (
                              <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-20 hidden group-hover:flex flex-col gap-0.5 bg-white border border-slate-200 rounded-lg shadow-lg p-1 min-w-[130px]">
                                <button onClick={() => navigate(`/hmis/patient/${bed.patient_id}/timeline`)}
                                  className="flex items-center gap-1.5 text-xs px-2 py-1 rounded hover:bg-teal-50 text-slate-700 whitespace-nowrap">
                                  <HeartPulse className="h-3 w-3 text-teal-600" /> Timeline
                                </button>
                                <button onClick={() => navigate(`/hmis/admission/${bed.admission_id}/nursing-tasks`)}
                                  className="flex items-center gap-1.5 text-xs px-2 py-1 rounded hover:bg-blue-50 text-slate-700 whitespace-nowrap">
                                  <ClipboardList className="h-3 w-3 text-blue-600" /> Nursing Tasks
                                </button>
                                <button onClick={() => navigate(`/hmis/admission/${bed.admission_id}/discharge`)}
                                  className="flex items-center gap-1.5 text-xs px-2 py-1 rounded hover:bg-emerald-50 text-slate-700 whitespace-nowrap">
                                  <FileText className="h-3 w-3 text-emerald-600" /> Discharge
                                </button>
                                <button onClick={() => navigate(`/hmis/patient/${bed.patient_id}/follow-up`)}
                                  className="flex items-center gap-1.5 text-xs px-2 py-1 rounded hover:bg-purple-50 text-slate-700 whitespace-nowrap">
                                  <Calendar className="h-3 w-3 text-purple-600" /> Follow-up
                                </button>
                                <button onClick={() => navigate(`/hmis/admission/${bed.admission_id}/echart`)}
                                  className="flex items-center gap-1.5 text-xs px-2 py-1 rounded hover:bg-teal-50 text-slate-700 whitespace-nowrap">
                                  <Activity className="h-3 w-3 text-teal-600" /> E-Chart
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Census Table */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Activity className="h-4 w-4 text-teal-600" /> Ward Census
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left py-2 px-4 text-xs font-semibold text-slate-500">Ward</th>
                      <th className="text-center py-2 px-2 text-xs font-semibold text-slate-500">Beds</th>
                      <th className="text-center py-2 px-2 text-xs font-semibold text-slate-500">Occupied</th>
                      <th className="text-center py-2 px-2 text-xs font-semibold text-slate-500">Available</th>
                      <th className="text-center py-2 px-2 text-xs font-semibold text-slate-500">Occupancy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {census.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-4 text-slate-400 text-xs">No wards configured</td></tr>
                    ) : census.map(row => (
                      <tr key={row.ward_id} className="border-b hover:bg-slate-50">
                        <td className="py-2 px-4 font-medium text-slate-700">{row.ward_name}</td>
                        <td className="py-2 px-2 text-center text-slate-500">{row.total_beds || row.capacity}</td>
                        <td className="py-2 px-2 text-center text-blue-600 font-medium">{row.occupied}</td>
                        <td className="py-2 px-2 text-center text-emerald-600 font-medium">{row.available}</td>
                        <td className="py-2 px-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${Number(row.occupancy_pct) > 80 ? 'bg-red-500' : 'bg-emerald-500'}`}
                                style={{ width: `${Math.min(Number(row.occupancy_pct), 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-500">{row.occupancy_pct}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          {/* Right Panel */}
          <div className="space-y-4">

            {/* Active Alerts */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" /> Active Alerts
                  {alerts.length > 0 && <Badge className="bg-red-100 text-red-700 text-xs">{alerts.length}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2 max-h-72 overflow-y-auto">
                {alerts.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">No active alerts</p>
                ) : alerts.map(alert => (
                  <div key={alert.id} className={`rounded-lg p-3 ${alertColour[alert.severity]}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-slate-700">
                          {alert.bed_number || alert.admission_number}
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">{alert.alert_message}</div>
                        <div className="text-xs text-slate-400 mt-1">
                          NEWS2: {alert.news2_score} · {new Date(alert.triggered_at).toLocaleTimeString()}
                        </div>
                      </div>
                      <Badge className={`text-xs shrink-0 ${severityBadge[alert.severity]}`}>
                        {alert.severity}
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Nurse Task Board — Medications Due */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Pill className="h-4 w-4 text-purple-600" /> Medications Due
                  {dueMeds.length > 0 && <Badge className={`text-xs ${overdueMeds > 0 ? 'bg-red-100 text-red-700' : 'bg-purple-100 text-purple-700'}`}>{dueMeds.length}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2 max-h-64 overflow-y-auto">
                {dueMeds.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">All medications up to date</p>
                ) : dueMeds.map(med => (
                  <div key={med.schedule_id}
                    className={`rounded-lg p-3 border ${med.is_overdue ? 'border-red-200 bg-red-50' : 'border-purple-100 bg-purple-50'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-slate-700">{med.drug_name}</div>
                        <div className="text-xs text-slate-500">{med.dose} · {med.route?.toUpperCase()}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          Due: {new Date(med.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      {med.is_overdue && (
                        <Badge className="bg-red-100 text-red-700 text-xs shrink-0">Overdue</Badge>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 h-6 text-xs w-full"
                      onClick={() => navigate(`/hospital/emar/administer/${med.schedule_id}`)}
                    >
                      Mark Given
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-slate-600" /> Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2">
                {[
                  { label: 'Admit Patient',     path: '/hospital/adt/admit',         icon: Plus,          cls: 'bg-blue-600 text-white hover:bg-blue-700' },
                  { label: 'Transfer Bed',       path: '/hospital/adt/transfer',       icon: ArrowRight,    cls: 'bg-amber-500 text-white hover:bg-amber-600' },
                  { label: 'Record Vitals',      path: '/hospital/vitals/record',      icon: Heart,         cls: 'bg-teal-600 text-white hover:bg-teal-700' },
                  { label: 'Initiate Discharge', path: '/hospital/adt/discharge',      icon: TrendingDown,  cls: 'bg-emerald-600 text-white hover:bg-emerald-700' },
                  { label: 'E-Charting',         path: '/hmis/echart',                 icon: ClipboardList, cls: 'bg-purple-600 text-white hover:bg-purple-700' },
                ].map(a => (
                  <Button
                    key={a.label}
                    className={`w-full justify-start gap-2 h-9 text-sm ${a.cls}`}
                    onClick={() => navigate(a.path)}
                  >
                    <a.icon className="h-4 w-4" /> {a.label}
                  </Button>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </HospDeptLayout>
  );
}
