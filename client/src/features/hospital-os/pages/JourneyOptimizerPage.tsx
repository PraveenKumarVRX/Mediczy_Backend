import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Route } from 'lucide-react';
import { optimizeJourney } from '@/services/hospitalOs.service';

export default function JourneyOptimizerPage() {
  const [patientId, setPatientId] = useState('');
  const [plan, setPlan] = useState<any>(null);

  const optimize = async () => {
    const pid = Number(patientId);
    if (!pid) return;
    const r = await optimizeJourney(pid, ['minimize_waits', 'cluster_appointments']);
    setPlan(r?.data);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Route className="h-5 w-5 text-violet-600" />
        Patient Journey Optimizer (Pillar 14)
      </h2>
      <div className="flex gap-2">
        <Input placeholder="Patient ID" value={patientId} onChange={(e) => setPatientId(e.target.value)} className="max-w-xs" />
        <Button onClick={optimize}>Optimize journey</Button>
      </div>
      {plan && (
        <Card>
          <CardHeader><CardTitle className="text-base">Recommended plan</CardTitle></CardHeader>
          <CardContent><pre className="text-xs whitespace-pre-wrap">{JSON.stringify(plan, null, 2)}</pre></CardContent>
        </Card>
      )}
    </div>
  );
}
