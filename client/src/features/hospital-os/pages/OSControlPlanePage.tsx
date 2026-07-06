import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Monitor } from 'lucide-react';
import { listDisplayDevices, registerDisplayDevice, listSignageContent, createSignageContent } from '@/services/hospitalOsControl.service';

export default function OSControlPlanePage() {
  const [devices, setDevices] = useState<any[]>([]);
  const [signage, setSignage] = useState<any[]>([]);
  const [zone, setZone] = useState('lobby');
  const [label, setLabel] = useState('');

  const load = () => {
    listDisplayDevices().then((r) => setDevices(r?.data || [])).catch(() => {});
    listSignageContent().then((r) => setSignage(r?.data || [])).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const register = async () => {
    await registerDisplayDevice({
      zone,
      locationLabel: label || zone,
      deviceToken: `device-${Date.now()}`,
      screenType: 'display',
    });
    load();
  };

  const addSignage = async () => {
    await createSignageContent({ title: 'Welcome', body: 'Hospital OS signage', zone });
    load();
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Monitor className="h-5 w-5 text-slate-700" />
        OS Control Plane (GAP-HOS-001)
      </h2>
      <Card>
        <CardHeader><CardTitle className="text-base">Register display device</CardTitle></CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          <Input placeholder="Zone" value={zone} onChange={(e) => setZone(e.target.value)} className="max-w-[120px]" />
          <Input placeholder="Location label" value={label} onChange={(e) => setLabel(e.target.value)} className="max-w-[180px]" />
          <Button onClick={register}>Register</Button>
          <Button variant="outline" onClick={addSignage}>Add signage</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Enrolled devices ({devices.length})</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          {devices.map((d: any) => (
            <p key={d.id}>{d.zone} — {d.location_label || d.locationLabel} · {d.screen_type || d.screenType}</p>
          ))}
          {!devices.length && <p className="text-muted-foreground">No devices enrolled</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">CMS signage</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {signage.map((s: any) => <p key={s.id}>{s.zone}: {s.title}</p>)}
          {!signage.length && <p className="text-muted-foreground">No signage content</p>}
        </CardContent>
      </Card>
    </div>
  );
}
