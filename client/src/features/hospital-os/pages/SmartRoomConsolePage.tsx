import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Home } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function SmartRoomConsolePage() {
  const [rooms, setRooms] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/display/ward')
      .then((r) => r.json())
      .then((json) => {
        const beds = json.beds || [];
        setRooms(
          beds.slice(0, 12).map((b: any) => ({
            bed: b.bed_number,
            patient: b.patient_name,
            status: b.status,
            nurseCall: b.status === 'alert',
            vitals: b.vitals,
          }))
        );
      })
      .catch(() => setRooms([]));
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Home className="h-5 w-5 text-emerald-600" />
        Smart Patient Rooms (Pillar 6)
      </h2>
      <p className="text-sm text-muted-foreground">
        MQTT device bridge + bedside displays.{' '}
        <Link to="/display/bedside" className="text-teal-600 underline">Open bedside display →</Link>
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rooms.map((r) => (
          <Card key={r.bed}>
            <CardHeader className="pb-2 flex flex-row justify-between">
              <CardTitle className="text-base">Bed {r.bed}</CardTitle>
              <Badge variant={r.status === 'alert' ? 'destructive' : 'secondary'}>{r.status}</Badge>
            </CardHeader>
            <CardContent className="text-sm">
              <p>{r.patient || 'Available'}</p>
              {r.vitals && <p className="text-xs text-muted-foreground mt-1">SpO₂ {r.vitals.spo2}% · HR {r.vitals.hr}</p>}
              {r.nurseCall && <Badge className="mt-2" variant="destructive">Nurse call active</Badge>}
            </CardContent>
          </Card>
        ))}
        {!rooms.length && <p className="text-muted-foreground text-sm">No room data — connect IoT MQTT bridge.</p>}
      </div>
    </div>
  );
}
