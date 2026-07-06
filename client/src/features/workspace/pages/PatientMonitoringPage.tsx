import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity } from 'lucide-react';
import { useWorkspace } from '@/features/workspace/hooks/useWorkspace';
import { ClinicalEmptyState } from '@/components/clinical/ClinicalEmptyState';

export default function PatientMonitoringPage() {
  const { workspace } = useWorkspace();
  const vitals = workspace?.sections?.liveVitals || [];
  const monitoring = workspace?.sections?.monitoring?.summary || [];

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Latest Vitals</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          {vitals.length ? vitals.map((v, i) => (
            <div key={i} className="flex justify-between border-b pb-2">
              <span>{v.label || v.type}</span>
              <span className="font-medium">{v.value} {v.unit}</span>
            </div>
          )) : (
            <ClinicalEmptyState title="No vitals" description="Record vitals from nursing station or connect devices." />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Wearables & Devices</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          {monitoring.length ? monitoring.map((m) => (
            <p key={m.metricType}>{m.metricType}: {m.latest?.value} (avg {Math.round(m.avg || 0)})</p>
          )) : (
            <ClinicalEmptyState title="No device stream" description="Apple Health and IoT bridges sync into this panel." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
