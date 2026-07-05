import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Home, Loader2 } from 'lucide-react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { getMonitoringSummary, scheduleHomecareVisit } from '@/services/careos.service';

export default function HomeMonitoring() {
  const [patientId, setPatientId] = useState('');
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const pid = Number(patientId);
    if (!pid) return;
    setLoading(true);
    try {
      const r = await getMonitoringSummary(pid);
      setSummary(r?.data);
    } finally {
      setLoading(false);
    }
  };

  const schedule = async () => {
    const pid = Number(patientId);
    if (!pid) return;
    await scheduleHomecareVisit(pid, { type: 'rpm_check', notes: 'Scheduled from home care hub' });
    load();
  };

  return (
    <HospitalLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Home className="h-6 w-6 text-teal-600" />
          <h1 className="text-2xl font-bold">Home Monitoring & RPM</h1>
        </div>
        <div className="flex gap-2">
          <Input placeholder="Patient ID" value={patientId} onChange={(e) => setPatientId(e.target.value)} />
          <Button onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load'}
          </Button>
          <Button variant="outline" onClick={schedule}>Schedule visit</Button>
        </div>
        {summary && (
          <Card>
            <CardHeader><CardTitle className="text-base">Monitoring summary</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <pre className="text-xs overflow-auto">{JSON.stringify(summary, null, 2)}</pre>
            </CardContent>
          </Card>
        )}
      </div>
    </HospitalLayout>
  );
}
