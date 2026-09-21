import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { InlineError } from '@/components/ui/inline-error';
import { useToast } from '@/hooks/use-toast';
import { Cpu, Info, Loader2, Plus } from 'lucide-react';
import { Lot, useParkingQuery, parkingPost, parkingPatch, parkingDelete, errorMessage, formatDateTime } from './parkingApi';

type DeviceType = 'boom_barrier' | 'led_display' | 'token_printer';
interface Device { id: number; lot_id: number; lot_name: string; name: string; device_type: DeviceType; status: 'online' | 'offline' | 'error'; is_enabled: boolean; serial_number: string | null; ip_address: string | null; port: number | null; position: string | null; last_heartbeat: string | null }
const TYPE_LABEL: Record<DeviceType, string> = { boom_barrier: 'Boom barrier', led_display: 'LED display', token_printer: 'Token printer' };
const STATUS_CLS = { online: 'bg-emerald-100 text-emerald-700', offline: 'bg-slate-100 text-slate-600', error: 'bg-red-100 text-red-700' };

function RegisterDialog({ lots, onClose, onSaved }: { lots: Lot[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState({ lotId: String(lots[0]?.id ?? ''), name: '', deviceType: 'boom_barrier' as DeviceType, position: 'entry', serialNumber: '', ipAddress: '', port: '' });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await parkingPost('/devices', { ...f, lotId: Number(f.lotId), port: f.port ? Number(f.port) : undefined, serialNumber: f.serialNumber || undefined, ipAddress: f.ipAddress || undefined });
      toast({ title: 'Device registered' }); onSaved(); onClose();
    } catch (e) { toast({ title: 'Could not register', description: errorMessage(e), variant: 'destructive' }); } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Register a device</DialogTitle><DialogDescription>Adds the device to the registry so its status and location are tracked.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label htmlFor="dv-name">Name</Label><Input id="dv-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Entry barrier 1" /></div>
            <div><Label htmlFor="dv-lot">Lot</Label>
              <Select value={f.lotId} onValueChange={(v) => setF({ ...f, lotId: v })}><SelectTrigger id="dv-lot"><SelectValue /></SelectTrigger><SelectContent>{lots.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label htmlFor="dv-type">Type</Label>
              <Select value={f.deviceType} onValueChange={(v) => setF({ ...f, deviceType: v as DeviceType })}><SelectTrigger id="dv-type"><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(TYPE_LABEL) as DeviceType[]).map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}</SelectContent></Select></div>
            <div><Label htmlFor="dv-pos">Position</Label>
              <Select value={f.position} onValueChange={(v) => setF({ ...f, position: v })}><SelectTrigger id="dv-pos"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="entry">Entry</SelectItem><SelectItem value="exit">Exit</SelectItem><SelectItem value="both">Both</SelectItem></SelectContent></Select></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><Label htmlFor="dv-serial">Serial no.</Label><Input id="dv-serial" value={f.serialNumber} onChange={(e) => setF({ ...f, serialNumber: e.target.value })} /></div>
            <div><Label htmlFor="dv-ip">IP address</Label><Input id="dv-ip" value={f.ipAddress} onChange={(e) => setF({ ...f, ipAddress: e.target.value })} /></div>
            <div><Label htmlFor="dv-port">Port</Label><Input id="dv-port" type="number" value={f.port} onChange={(e) => setF({ ...f, port: e.target.value })} /></div>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving || !f.name.trim() || !f.lotId}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Register</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ParkingDevices() {
  const { toast } = useToast();
  const devices = useParkingQuery<Device[]>('/devices');
  const lots = useParkingQuery<Lot[]>('/lots');
  const [registering, setRegistering] = useState(false);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast({ title: ok }); devices.reload(); } catch (e) { toast({ title: 'Action failed', description: errorMessage(e), variant: 'destructive' }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
        <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
        <span>This is a device registry. Status here is set by staff; nothing sends open/close or display commands to the hardware yet, so a barrier is still operated at the gate.</span>
      </div>
      <div className="flex justify-end"><Button onClick={() => setRegistering(true)} disabled={!lots.data?.length}><Plus className="h-4 w-4 mr-2" />Register device</Button></div>
      {devices.loading && !devices.data ? <Skeleton className="h-32 w-full" />
        : devices.error && !devices.data ? <InlineError message="Could not load devices" description={devices.error} onRetry={devices.reload} />
        : !devices.data?.length ? <EmptyState icon={Cpu} title="No devices registered" description={lots.data?.length ? 'Register boom barriers, LED displays and token printers per lot.' : 'Create a parking lot first, then register its devices.'} />
        : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {devices.data.map((d) => (
              <Card key={d.id} className={`border-slate-200 ${d.is_enabled ? '' : 'opacity-60'}`}>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div><p className="font-semibold">{d.name}</p><p className="text-xs text-slate-500">{TYPE_LABEL[d.device_type]} · {d.lot_name}{d.position ? ` · ${d.position}` : ''}</p></div>
                    <Badge className={STATUS_CLS[d.status]}>{d.status}</Badge>
                  </div>
                  <p className="text-xs text-slate-500">{[d.ip_address && `${d.ip_address}${d.port ? `:${d.port}` : ''}`, d.serial_number && `S/N ${d.serial_number}`].filter(Boolean).join(' · ') || 'No network details'}</p>
                  <p className="text-xs text-slate-400">Last heartbeat: {formatDateTime(d.last_heartbeat)}</p>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2"><Switch id={`dv-en-${d.id}`} checked={d.is_enabled} onCheckedChange={(v) => act(() => parkingPatch(`/devices/${d.id}`, { isEnabled: v }), v ? 'Device enabled' : 'Device disabled')} /><Label htmlFor={`dv-en-${d.id}`} className="text-xs">Enabled</Label></div>
                    <div className="flex gap-1.5">
                      <Select value={d.status} onValueChange={(v) => act(() => parkingPatch(`/devices/${d.id}/status`, { status: v }), 'Status updated')}>
                        <SelectTrigger className="h-8 w-28 text-xs" aria-label={`Status of ${d.name}`}><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="online">Online</SelectItem><SelectItem value="offline">Offline</SelectItem><SelectItem value="error">Error</SelectItem></SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" onClick={() => window.confirm(`Remove ${d.name}?`) && act(() => parkingDelete(`/devices/${d.id}`), 'Device removed')}>Remove</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      {registering && <RegisterDialog lots={lots.data ?? []} onClose={() => setRegistering(false)} onSaved={devices.reload} />}
    </div>
  );
}
