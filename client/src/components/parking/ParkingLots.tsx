import { useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { InlineError } from '@/components/ui/inline-error';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Bike, Camera, Car, Loader2, ParkingSquare, Plus, RotateCcw, ShieldAlert, Trash2, Pencil } from 'lucide-react';
import {
  Lot, VehicleType, VEHICLE_LABEL, PASS_LABEL, useParkingQuery, parkingPost, parkingPut, parkingDelete,
  errorMessage, normalizePlate, formatDateTime, formatDuration,
} from './parkingApi';

interface ActiveVehicle { vehicle_number: string; vehicle_type: VehicleType; entry_time: string }
interface LogRow { id: string; vehicle_type: VehicleType; action: 'entry' | 'exit'; method: 'manual' | 'ai'; vehicle_number: string | null; parking_duration_minutes: number | null; logged_at: string; note: string | null }
interface GateCheck { hasValidPass: boolean; pass: { pass_type: keyof typeof PASS_LABEL; token_balance: number | null; expires_at: string | null } | null; reason?: string; watchlistHit: { reason: string; severity: string } | null; alreadyInside: { lotId: number; since: string } | null }

function Meter({ used, capacity, icon: Icon, label }: { used: number; capacity: number; icon: typeof Car; label: string }) {
  const pct = capacity > 0 ? Math.min(100, Math.round((used / capacity) * 100)) : 0;
  const tone = pct >= 100 ? 'bg-red-500' : pct >= 85 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="flex items-center gap-1.5 text-slate-600"><Icon className="h-4 w-4" aria-hidden />{label}</span>
        <span className="font-medium tabular-nums">{used} / {capacity}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-label={`${label} occupancy`} aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={used}>
        <div className={`h-full ${tone} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Lot create / edit ────────────────────────────────────────────────────────
function LotDialog({ open, lot, onClose, onSaved }: { open: boolean; lot: Lot | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState(lot?.name ?? '');
  const [two, setTwo] = useState(String(lot?.two_wheeler_capacity ?? 0));
  const [car, setCar] = useState(String(lot?.car_capacity ?? 0));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { toast({ title: 'Lot name is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const body = { name: name.trim(), twoWheelerCapacity: Number(two), carCapacity: Number(car) };
      if (lot) await parkingPut(`/lots/${lot.id}`, body); else await parkingPost('/lots', body);
      toast({ title: lot ? 'Lot updated' : 'Lot created' });
      onSaved();
      onClose();
    } catch (e) {
      toast({ title: 'Could not save lot', description: errorMessage(e), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lot ? 'Edit parking lot' : 'New parking lot'}</DialogTitle>
          <DialogDescription>Capacity limits are enforced at the gate.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div><Label htmlFor="lot-name">Name</Label><Input id="lot-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main Basement" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label htmlFor="lot-two">Two-wheeler spaces</Label><Input id="lot-two" type="number" min={0} value={two} onChange={(e) => setTwo(e.target.value)} /></div>
            <div><Label htmlFor="lot-car">Car spaces</Label><Input id="lot-car" type="number" min={0} value={car} onChange={(e) => setCar(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── AI camera count ──────────────────────────────────────────────────────────
// Downscale before upload: a phone photo is several MB, the model needs ~1280px.
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not a readable image'));
      img.onload = () => {
        const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function CameraDialog({ open, lot, onClose, onLogged }: { open: boolean; lot: Lot; onClose: () => void; onLogged: () => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ twoWheelers: number; cars: number; confidence: string; description: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState({ two: '0', car: '0' });

  const analyse = async (file?: File | null) => {
    if (!file) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const imageBase64 = await fileToDataUrl(file);
      const r = await parkingPost('/detect', { imageBase64 });
      setResult(r);
      setCounts({ two: String(r.twoWheelers), car: String(r.cars) });
    } catch (e) {
      setError(errorMessage(e, 'Could not analyse the image'));
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const logAll = async (action: 'entry' | 'exit') => {
    setBusy(true);
    let done = 0;
    try {
      for (const [type, n] of [['two_wheeler', Number(counts.two)], ['car', Number(counts.car)]] as [VehicleType, number][]) {
        for (let i = 0; i < n; i++) { await parkingPost(`/lots/${lot.id}/movements`, { vehicleType: type, action, method: 'ai' }); done++; }
      }
      toast({ title: `${done} ${action === 'entry' ? 'entries' : 'exits'} logged` });
      onLogged();
      onClose();
    } catch (e) {
      toast({ title: `Stopped after ${done} logged`, description: errorMessage(e), variant: 'destructive' });
      onLogged();
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Count vehicles from a camera photo</DialogTitle>
          <DialogDescription>The AI count is a suggestion. Check it against the photo, correct it if needed, then log it.</DialogDescription>
        </DialogHeader>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" id="parking-photo" onChange={(e) => analyse(e.target.files?.[0])} />
        <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}Take or choose a photo
        </Button>
        {error && <InlineError message="Could not count vehicles" description={error} compact />}
        {result && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{result.description} <Badge variant="outline">{result.confidence} confidence</Badge></p>
            <div className="grid grid-cols-2 gap-4">
              <div><Label htmlFor="cnt-two">Two-wheelers</Label><Input id="cnt-two" type="number" min={0} value={counts.two} onChange={(e) => setCounts({ ...counts, two: e.target.value })} /></div>
              <div><Label htmlFor="cnt-car">Cars</Label><Input id="cnt-car" type="number" min={0} value={counts.car} onChange={(e) => setCounts({ ...counts, car: e.target.value })} /></div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {result && <Button variant="outline" disabled={busy} onClick={() => logAll('exit')}>Log as exits</Button>}
          {result && <Button disabled={busy} onClick={() => logAll('entry')}>Log as entries</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Gate panel for one lot ───────────────────────────────────────────────────
function GatePanel({ lot, onChanged }: { lot: Lot; onChanged: () => void }) {
  const { toast } = useToast();
  const active = useParkingQuery<ActiveVehicle[]>(`/lots/${lot.id}/active-vehicles`);
  const logs = useParkingQuery<LogRow[]>(`/lots/${lot.id}/logs`, { limit: 25 });
  const [vehicleType, setVehicleType] = useState<VehicleType>('car');
  const [plate, setPlate] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<GateCheck | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const refreshAll = () => { active.reload(); logs.reload(); onChanged(); };
  const plateNorm = normalizePlate(plate);

  const runCheck = async () => {
    if (plateNorm.length < 4) { toast({ title: 'Enter at least 4 letters/digits of the plate', variant: 'destructive' }); return; }
    try {
      const res = await api.get('/parking/check-vehicle', { params: { vehicleNumber: plateNorm, lotId: lot.id } });
      setCheck(res.data?.data ?? null);
    } catch (e) { toast({ title: 'Check failed', description: errorMessage(e), variant: 'destructive' }); }
  };

  const move = async (action: 'entry' | 'exit', emergencyOverride = false) => {
    setBusy(true);
    try {
      const out = await parkingPost(`/lots/${lot.id}/movements`, {
        vehicleType, action, vehicleNumber: plateNorm || undefined, note: note.trim() || undefined, emergencyOverride: emergencyOverride || undefined,
      });
      const bits: string[] = [];
      if (out.log?.parking_duration_minutes != null) bits.push(`parked ${formatDuration(out.log.parking_duration_minutes)}`);
      if (action === 'entry' && plateNorm) bits.push(out.pass?.hasValidPass ? `${PASS_LABEL[out.pass.pass.pass_type as keyof typeof PASS_LABEL]} pass` : 'no valid pass');
      out.warnings?.forEach((w: string) => bits.push(w));
      toast({ title: action === 'entry' ? 'Entry logged' : 'Exit logged', description: bits.join(' · ') || undefined });
      if (out.watchlistHit) toast({ title: `Watchlist: ${plateNorm}`, description: `${out.watchlistHit.severity.toUpperCase()} — ${out.watchlistHit.reason}`, variant: 'destructive' });
      setPlate(''); setNote(''); setCheck(null);
      refreshAll();
    } catch (e: any) {
      const code = e?.response?.data?.code;
      if (code === 'LOT_FULL' && window.confirm(`${e.response.data.message}\n\nAdmit anyway as an emergency override? This is recorded.`)) {
        await move(action, true);
        return;
      }
      toast({ title: 'Could not log movement', description: errorMessage(e), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
      <Card className="xl:col-span-2 border-slate-200">
        <CardHeader className="pb-3"><CardTitle className="text-base">Gate — {lot.name}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="gate-type">Vehicle type</Label>
            <Select value={vehicleType} onValueChange={(v) => setVehicleType(v as VehicleType)}>
              <SelectTrigger id="gate-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="car">Car</SelectItem>
                <SelectItem value="two_wheeler">Two-wheeler</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="gate-plate">Vehicle number <span className="text-slate-400 font-normal">(optional — leave empty for a headcount)</span></Label>
            <div className="flex gap-2">
              <Input id="gate-plate" value={plate} onChange={(e) => { setPlate(e.target.value.toUpperCase()); setCheck(null); }} placeholder="MH12AB1234" className="uppercase" />
              <Button type="button" variant="outline" onClick={runCheck}>Check</Button>
            </div>
          </div>
          {check && (
            <div className="rounded-lg border p-3 text-sm space-y-1.5 bg-slate-50" aria-live="polite">
              {check.alreadyInside && <p className="flex items-center gap-1.5 text-amber-700"><AlertTriangle className="h-4 w-4" />Already inside a lot since {formatDateTime(check.alreadyInside.since)}</p>}
              {check.hasValidPass && check.pass
                ? <p className="text-emerald-700">✓ {PASS_LABEL[check.pass.pass_type]} pass{check.pass.token_balance != null ? ` · ${check.pass.token_balance} tokens left` : ''}{check.pass.expires_at ? ` · expires ${formatDateTime(check.pass.expires_at)}` : ''}</p>
                : <p className="text-slate-600">No valid pass{check.reason ? ` — ${check.reason}` : ''}</p>}
              {check.watchlistHit && <p className="flex items-center gap-1.5 text-red-700 font-medium"><ShieldAlert className="h-4 w-4" />Watchlist ({check.watchlistHit.severity}): {check.watchlistHit.reason}</p>}
            </div>
          )}
          <div><Label htmlFor="gate-note">Note</Label><Input id="gate-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></div>
          <div className="flex flex-wrap gap-2">
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => move('entry')}><ArrowDownLeft className="h-4 w-4 mr-1.5" />Entry</Button>
            <Button className="flex-1" variant="outline" disabled={busy} onClick={() => move('exit')}><ArrowUpRight className="h-4 w-4 mr-1.5" />Exit</Button>
            <Button variant="outline" onClick={() => setCameraOpen(true)}><Camera className="h-4 w-4 mr-1.5" />Camera count</Button>
          </div>
        </CardContent>
      </Card>

      <div className="xl:col-span-3 space-y-6">
        <Card className="border-slate-200">
          <CardHeader className="pb-3"><CardTitle className="text-base">Vehicles inside with a number ({active.data?.length ?? 0})</CardTitle></CardHeader>
          <CardContent>
            {active.loading && !active.data ? <Skeleton className="h-16 w-full" />
              : active.error ? <InlineError message="Could not load vehicles" description={active.error} onRetry={active.reload} compact />
              : !active.data?.length ? <p className="text-sm text-slate-500">No tracked vehicles inside. Headcount-only entries are counted but not listed.</p>
              : (
                <ul className="divide-y">
                  {active.data.map((v) => (
                    <li key={v.vehicle_number} className="flex items-center justify-between py-2 text-sm">
                      <span className="flex items-center gap-2 font-mono font-medium">{v.vehicle_type === 'car' ? <Car className="h-4 w-4 text-slate-400" /> : <Bike className="h-4 w-4 text-slate-400" />}{v.vehicle_number}</span>
                      <span className="text-slate-500">in since {formatDateTime(v.entry_time)}</span>
                    </li>
                  ))}
                </ul>
              )}
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="pb-3"><CardTitle className="text-base">Recent movements</CardTitle></CardHeader>
          <CardContent>
            {logs.loading && !logs.data ? <Skeleton className="h-24 w-full" />
              : logs.error ? <InlineError message="Could not load movements" description={logs.error} onRetry={logs.reload} compact />
              : !logs.data?.length ? <p className="text-sm text-slate-500">No movements recorded yet.</p>
              : (
                <ul className="divide-y">
                  {logs.data.map((l) => (
                    <li key={l.id} className="flex items-center justify-between py-2 text-sm gap-3">
                      <span className="flex items-center gap-2">
                        <Badge className={l.action === 'entry' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}>{l.action}</Badge>
                        {VEHICLE_LABEL[l.vehicle_type]}{l.vehicle_number && <span className="font-mono">{l.vehicle_number}</span>}
                        {l.method === 'ai' && <Badge variant="outline">AI</Badge>}
                        {l.parking_duration_minutes != null && <span className="text-slate-500">· {formatDuration(l.parking_duration_minutes)}</span>}
                      </span>
                      <span className="text-slate-500 shrink-0">{formatDateTime(l.logged_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
          </CardContent>
        </Card>
      </div>
      {cameraOpen && <CameraDialog open lot={lot} onClose={() => setCameraOpen(false)} onLogged={refreshAll} />}
    </div>
  );
}

// ── Lots tab ─────────────────────────────────────────────────────────────────
export default function ParkingLots({ onChanged }: { onChanged: () => void }) {
  const { toast } = useToast();
  const lots = useParkingQuery<Lot[]>('/lots');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<{ lot: Lot | null } | null>(null);

  const list = lots.data ?? [];
  const selected = list.find((l) => l.id === selectedId) ?? list[0] ?? null;
  const reload = () => { lots.reload(); onChanged(); };

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast({ title: ok }); reload(); } catch (e) { toast({ title: 'Action failed', description: errorMessage(e), variant: 'destructive' }); }
  };

  if (lots.loading && !lots.data) return <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36" />)}</div>;
  if (lots.error && !lots.data) return <InlineError message="Could not load parking lots" description={lots.error} onRetry={lots.reload} />;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setDialog({ lot: null })}><Plus className="h-4 w-4 mr-2" />New lot</Button>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={ParkingSquare} title="No parking lots yet" description="Create a lot with its two-wheeler and car capacity to start logging entries and exits."
          action={{ label: 'Create first lot', onClick: () => setDialog({ lot: null }) }} />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {list.map((lot) => (
              <Card key={lot.id} className={`border-slate-200 cursor-pointer transition-shadow hover:shadow-md ${selected?.id === lot.id ? 'ring-2 ring-primary' : ''}`}
                role="button" tabIndex={0} aria-pressed={selected?.id === lot.id} onClick={() => setSelectedId(lot.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSelectedId(lot.id))}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{lot.name}</CardTitle>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Edit ${lot.name}`} onClick={() => setDialog({ lot })}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Reset counters for ${lot.name}`}
                        onClick={() => window.confirm(`Reset the live counters for ${lot.name} to zero? Movement history is kept.`) && act(() => parkingPost(`/lots/${lot.id}/reset-occupancy`), 'Counters reset')}><RotateCcw className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" aria-label={`Archive ${lot.name}`}
                        onClick={() => window.confirm(`Archive ${lot.name}? It disappears from this list; its history is kept.`) && act(() => parkingDelete(`/lots/${lot.id}`), 'Lot archived')}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Meter used={lot.cars} capacity={lot.car_capacity} icon={Car} label="Cars" />
                  <Meter used={lot.two_wheelers} capacity={lot.two_wheeler_capacity} icon={Bike} label="Two-wheelers" />
                </CardContent>
              </Card>
            ))}
          </div>
          {selected && <GatePanel key={selected.id} lot={selected} onChanged={reload} />}
        </>
      )}
      {dialog && <LotDialog key={dialog.lot?.id ?? 'new'} open lot={dialog.lot} onClose={() => setDialog(null)} onSaved={reload} />}
    </div>
  );
}
