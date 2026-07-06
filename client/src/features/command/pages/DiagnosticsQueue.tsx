import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScanLine } from 'lucide-react';
import { useCommandCenterData } from '@/features/command/hooks/useCommandCenterData';

const DEMO_QUEUE = [
  { id: 1, patient: 'Patient A', modality: 'CT Chest', priority: 'stat', waitMin: 12, status: 'in_scan' },
  { id: 2, patient: 'Patient B', modality: 'MRI Brain', priority: 'urgent', waitMin: 45, status: 'queued' },
  { id: 3, patient: 'Patient C', modality: 'X-Ray', priority: 'routine', waitMin: 8, status: 'report_pending' },
];

export default function DiagnosticsQueue() {
  const { snapshot } = useCommandCenterData();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-sky-600" />
          Diagnostics Queue
        </h2>
        <p className="text-sm text-muted-foreground">
          Radiology & lab order throughput · {snapshot?.preAuthsPending ?? 0} pre-auths pending
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Imaging queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {DEMO_QUEUE.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-3 border rounded-lg p-3 text-sm">
              <span className="font-medium flex-1 min-w-[120px]">{item.modality}</span>
              <span className="text-muted-foreground">{item.patient}</span>
              <Badge variant={item.priority === 'stat' ? 'destructive' : item.priority === 'urgent' ? 'default' : 'secondary'}>
                {item.priority}
              </Badge>
              <span className="text-xs text-muted-foreground">{item.waitMin}m wait</span>
              <Badge variant="outline">{item.status.replace('_', ' ')}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
