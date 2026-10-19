import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import api from '@/utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HeartPulse, Pill, Activity, RefreshCw, ArrowRight } from 'lucide-react';

export default function HospitalNurseStation() {
  const navigate = useNavigate();
  const [dueMeds, setDueMeds] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [beds, setBeds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [medRes, alertRes, bedRes] = await Promise.allSettled([
        api.get('/v1/emar/due'),
        api.get('/v1/vitals/alerts'),
        api.get('/v1/beds/map'),
      ]);
      if (medRes.status === 'fulfilled') setDueMeds(medRes.value.data?.data ?? []);
      if (alertRes.status === 'fulfilled') setAlerts(alertRes.value.data?.data ?? []);
      if (bedRes.status === 'fulfilled') setBeds((bedRes.value.data?.data ?? []).filter((b: any) => b.status === 'occupied'));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <HospitalLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <HeartPulse className="h-6 w-6 text-rose-500" /> Nurse Station
            </h1>
            <p className="text-sm text-slate-500">Vitals, medications, and ward tasks — hospital session</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Card className="md:col-span-1">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Occupied Beds ({beds.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-64 overflow-y-auto">
              {beds.length === 0 ? <p className="text-xs text-slate-400">No occupied beds</p> : beds.map((b: any) => (
                <button key={b.id} className="w-full text-left p-2 rounded-lg bg-slate-50 hover:bg-teal-50 text-sm"
                  onClick={() => b.patient_id && navigate(`/hospital/patient/${b.patient_id}/workspace`)}>
                  <span className="font-medium">{b.bed_number}</span>
                  <span className="text-slate-500 ml-2">{b.ward_name}</span>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className="md:col-span-1">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Pill className="h-4 w-4" /> Meds Due</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-64 overflow-y-auto">
              {dueMeds.length === 0 ? <p className="text-xs text-slate-400">All up to date</p> : dueMeds.slice(0, 8).map((m: any) => (
                <div key={m.schedule_id || m.id} className="text-xs p-2 bg-purple-50 rounded-lg">
                  <span className="font-medium">{m.drug_name}</span> · {m.dose}
                  {m.is_overdue && <Badge className="ml-1 bg-red-100 text-red-700 text-[10px]">Overdue</Badge>}
                </div>
              ))}
              <Button variant="link" className="text-xs p-0 h-auto" onClick={() => navigate('/hospital/emar')}>Open eMAR →</Button>
            </CardContent>
          </Card>

          <Card className="md:col-span-1">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" /> Alerts</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-64 overflow-y-auto">
              {alerts.length === 0 ? <p className="text-xs text-slate-400">No active alerts</p> : alerts.slice(0, 6).map((a: any) => (
                <div key={a.id} className="text-xs p-2 bg-red-50 rounded-lg text-red-800">{a.alert_message || a.alert_type}</div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Record Vitals', path: '/hospital/vitals/record' },
            { label: 'Nursing Tasks', path: '/hospital/nursing' },
            { label: 'e-Charting', path: '/hospital/echart' },
            { label: 'Ward Dashboard', path: '/hospital/ward' },
          ].map(a => (
            <Button key={a.path} variant="outline" onClick={() => navigate(a.path)}>{a.label} <ArrowRight className="h-3 w-3 ml-1" /></Button>
          ))}
        </div>
      </div>
    </HospitalLayout>
  );
}
