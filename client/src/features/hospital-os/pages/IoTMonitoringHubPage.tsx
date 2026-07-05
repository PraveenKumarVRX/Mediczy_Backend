import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Radio } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function IoTMonitoringHubPage() {
  const [icu, setIcu] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/display/icu-board').then((r) => r.json()).then(setIcu).catch(() => {});
    fetch('/api/v3/healthos/platform/emergency/summary', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => setEvents(j?.data?.activeSignals || []))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Radio className="h-5 w-5 text-cyan-600" />
        IoT & Ambient Monitoring
      </h2>
      <p className="text-sm text-muted-foreground">
        Vitals from MQTT → display boards.{' '}
        <Link to="/display/icu-board" className="text-teal-600 underline">ICU wall →</Link>
      </p>
      <Card>
        <CardHeader><CardTitle className="text-base">ICU board feed</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {icu?.success ? (
            <pre className="text-xs overflow-auto max-h-48">{JSON.stringify(icu.beds || icu, null, 2)}</pre>
          ) : (
            <p className="text-muted-foreground">ICU display API offline</p>
          )}
        </CardContent>
      </Card>
      {events.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Active signals</CardTitle></CardHeader>
          <CardContent><pre className="text-xs">{JSON.stringify(events, null, 2)}</pre></CardContent>
        </Card>
      )}
    </div>
  );
}
