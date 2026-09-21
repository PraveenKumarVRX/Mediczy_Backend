import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { InlineError } from '@/components/ui/inline-error';
import { useToast } from '@/hooks/use-toast';
import { Clock, Loader2, Plus, ShieldAlert, ShieldCheck, Siren } from 'lucide-react';
import { Lot, useParkingQuery, parkingPost, parkingPut, parkingPatch, parkingDelete, errorMessage, normalizePlate, formatDateTime, formatDuration } from './parkingApi';

const SEV_CLS: Record<string, string> = { high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-slate-100 text-slate-700' };
const INCIDENT_TYPES = ['theft', 'vandalism', 'suspicious', 'accident', 'unauthorized', 'overstay', 'other'];

interface WatchRow { id: number; vehicle_number: string; reason: string; severity: string; notes: string | null; added_at: string }
interface IncidentRow { id: number; lot_id: number; lot_name: string; type: string; severity: string; title: string; description: string; vehicle_number: string | null; status: 'open' | 'investigating' | 'resolved'; reported_at: string; resolved_note: string | null }
interface OverstayRow { id: number; lot_name: string; vehicle_number: string; vehicle_type: string; entry_time: string; threshold_minutes: number; is_acknowledged: boolean }

function Section<T>({ q, empty, children }: { q: { data: T[] | null; loading: boolean; error: string | null; reload: () => void }; empty: React.ReactNode; children: (rows: T[]) => React.ReactNode }) {
  if (q.loading && !q.data) return <Skeleton className="h-32 w-full" />;
  if (q.error && !q.data) return <InlineError message="Could not load" description={q.error} onRetry={q.reload} />;
  if (!q.data?.length) return <>{empty}</>;
  return <>{children(q.data)}</>;
}

// ── Watchlist ────────────────────────────────────────────────────────────────
function Watchlist({ onChanged }: { onChanged: () => void }) {
  const { toast } = useToast();
  const q = useParkingQuery<WatchRow[]>('/watchlist');
  const [open, setOpen] = useState(false);
  const [plate, setPlate] = useState(''); const [reason, setReason] = useState(''); const [severity, setSeverity] = useState('medium'); const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const add = async () => {
    setSaving(true);
    try {
      await parkingPost('/watchlist', { vehicleNumber: normalizePlate(plate), reason, severity, notes: notes.trim() || undefined });
      toast({ title: 'Added to watchlist' });
      setOpen(false); setPlate(''); setReason(''); setNotes(''); q.reload(); onChanged();
    } catch (e) { toast({ title: 'Could not add', description: errorMessage(e), variant: 'destructive' }); } finally { setSaving(false); }
  };
  const remove = async (r: WatchRow) => {
    if (!window.confirm(`Remove ${r.vehicle_number} from the watchlist?`)) return;
    try { await parkingDelete(`/watchlist/${r.id}`); toast({ title: 'Removed' }); q.reload(); onChanged(); }
    catch (e) { toast({ title: 'Could not remove', description: errorMessage(e), variant: 'destructive' }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />Flag a vehicle</Button></div>
      <Section q={q} empty={<EmptyState icon={ShieldCheck} size="sm" title="Watchlist is empty" description="Flagged vehicles raise a warning at the gate whenever they enter." />}>
        {(rows) => (
          <ul className="divide-y rounded-lg border bg-white">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="flex items-center gap-2"><span className="font-mono font-medium">{r.vehicle_number}</span><Badge className={SEV_CLS[r.severity]}>{r.severity}</Badge></p>
                  <p className="text-slate-600 truncate">{r.reason}{r.notes ? ` — ${r.notes}` : ''}</p>
                  <p className="text-xs text-slate-400">Added {formatDateTime(r.added_at)}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => remove(r)}>Remove</Button>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Flag a vehicle</DialogTitle><DialogDescription>Staff see this warning every time the vehicle is checked or enters.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label htmlFor="wl-plate">Vehicle number</Label><Input id="wl-plate" className="uppercase" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} /></div>
              <div>
                <Label htmlFor="wl-sev">Severity</Label>
                <Select value={severity} onValueChange={setSeverity}><SelectTrigger id="wl-sev"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent></Select>
              </div>
            </div>
            <div><Label htmlFor="wl-reason">Reason</Label><Input id="wl-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></div>
            <div><Label htmlFor="wl-notes">Notes</Label><Textarea id="wl-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={add} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Incidents ────────────────────────────────────────────────────────────────
function Incidents({ lots, onChanged }: { lots: Lot[]; onChanged: () => void }) {
  const { toast } = useToast();
  const [status, setStatus] = useState('all');
  const q = useParkingQuery<IncidentRow[]>('/incidents', { status: status === 'all' ? undefined : status });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ lotId: '', type: 'suspicious', severity: 'medium', title: '', description: '', vehicleNumber: '' });
  const [saving, setSaving] = useState(false);

  const report = async () => {
    setSaving(true);
    try {
      await parkingPost('/incidents', { ...f, lotId: Number(f.lotId), vehicleNumber: normalizePlate(f.vehicleNumber) || undefined });
      toast({ title: 'Incident reported' });
      setOpen(false); setF({ ...f, title: '', description: '', vehicleNumber: '' }); q.reload(); onChanged();
    } catch (e) { toast({ title: 'Could not report', description: errorMessage(e), variant: 'destructive' }); } finally { setSaving(false); }
  };
  const setState = async (i: IncidentRow, next: 'investigating' | 'resolved') => {
    let resolvedNote: string | undefined;
    if (next === 'resolved') {
      const n = window.prompt('Resolution note (required):');
      if (!n?.trim()) return;
      resolvedNote = n.trim();
    }
    try { await parkingPatch(`/incidents/${i.id}`, { status: next, resolvedNote }); q.reload(); onChanged(); }
    catch (e) { toast({ title: 'Could not update', description: errorMessage(e), variant: 'destructive' }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div className="w-44">
          <Label htmlFor="inc-status">Show</Label>
          <Select value={status} onValueChange={setStatus}><SelectTrigger id="inc-status"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="open">Open</SelectItem><SelectItem value="investigating">Investigating</SelectItem><SelectItem value="resolved">Resolved</SelectItem></SelectContent></Select>
        </div>
        <Button onClick={() => { setF((x) => ({ ...x, lotId: x.lotId || String(lots[0]?.id ?? '') })); setOpen(true); }} disabled={!lots.length}><Plus className="h-4 w-4 mr-2" />Report incident</Button>
      </div>
      <Section q={q} empty={<EmptyState icon={Siren} size="sm" title="No incidents" description={status === 'all' ? 'Nothing has been reported in your parking lots.' : `No ${status} incidents.`} />}>
        {(rows) => (
          <ul className="divide-y rounded-lg border bg-white">
            {rows.map((i) => (
              <li key={i.id} className="p-3 text-sm space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="flex flex-wrap items-center gap-2 font-medium">{i.title}<Badge className={SEV_CLS[i.severity]}>{i.severity}</Badge><Badge variant="outline" className="capitalize">{i.type}</Badge>
                    <Badge className={i.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' : i.status === 'open' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}>{i.status}</Badge></p>
                  <div className="flex gap-2 shrink-0">
                    {i.status === 'open' && <Button size="sm" variant="outline" onClick={() => setState(i, 'investigating')}>Investigate</Button>}
                    {i.status !== 'resolved' && <Button size="sm" onClick={() => setState(i, 'resolved')}>Resolve</Button>}
                  </div>
                </div>
                <p className="text-slate-600">{i.description}</p>
                <p className="text-xs text-slate-400">{i.lot_name}{i.vehicle_number ? ` · ${i.vehicle_number}` : ''} · {formatDateTime(i.reported_at)}{i.resolved_note ? ` · Resolved: ${i.resolved_note}` : ''}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Report an incident</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div><Label htmlFor="in-lot">Lot</Label>
                <Select value={f.lotId} onValueChange={(v) => setF({ ...f, lotId: v })}><SelectTrigger id="in-lot"><SelectValue placeholder="Lot" /></SelectTrigger><SelectContent>{lots.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}</SelectContent></Select></div>
              <div><Label htmlFor="in-type">Type</Label>
                <Select value={f.type} onValueChange={(v) => setF({ ...f, type: v })}><SelectTrigger id="in-type"><SelectValue /></SelectTrigger><SelectContent>{INCIDENT_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent></Select></div>
              <div><Label htmlFor="in-sev">Severity</Label>
                <Select value={f.severity} onValueChange={(v) => setF({ ...f, severity: v })}><SelectTrigger id="in-sev"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent></Select></div>
            </div>
            <div><Label htmlFor="in-title">Title</Label><Input id="in-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={200} /></div>
            <div><Label htmlFor="in-desc">What happened</Label><Textarea id="in-desc" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={2000} /></div>
            <div><Label htmlFor="in-plate">Vehicle number (if known)</Label><Input id="in-plate" className="uppercase" value={f.vehicleNumber} onChange={(e) => setF({ ...f, vehicleNumber: e.target.value.toUpperCase() })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={report} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Report</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Overstay ─────────────────────────────────────────────────────────────────
function Overstay({ lots, onChanged }: { lots: Lot[]; onChanged: () => void }) {
  const { toast } = useToast();
  const q = useParkingQuery<OverstayRow[]>('/overstay-alerts', { unacknowledgedOnly: true });
  const [savingId, setSavingId] = useState<number | null>(null);

  const ack = async (a: OverstayRow) => {
    setSavingId(a.id);
    try { await parkingPost(`/overstay-alerts/${a.id}/acknowledge`); q.reload(); onChanged(); }
    catch (e) { toast({ title: 'Could not acknowledge', description: errorMessage(e), variant: 'destructive' }); } finally { setSavingId(null); }
  };
  const scan = async () => {
    try { const r = await parkingPost('/overstay-alerts/scan'); toast({ title: r.created ? `${r.created} new overstay alert(s)` : 'No new overstays' }); q.reload(); onChanged(); }
    catch (e) { toast({ title: 'Scan failed', description: errorMessage(e), variant: 'destructive' }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600">{lots.some((l) => l.security_enabled && l.max_parking_minutes)
          ? 'Vehicles with a number are checked every 10 minutes against each lot’s limit. VIP, free and staff passes are exempt.'
          : 'No lot has an overstay limit yet. Turn it on below to start raising alerts.'}</p>
        <Button variant="outline" onClick={scan}>Scan now</Button>
      </div>
      <Section q={q} empty={<EmptyState icon={Clock} size="sm" title="No unacknowledged overstays" description="Alerts appear here when a tracked vehicle stays past its lot's limit." />}>
        {(rows) => (
          <ul className="divide-y rounded-lg border bg-white">
            {rows.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div><p className="font-mono font-medium">{a.vehicle_number} <span className="font-sans font-normal text-slate-500">· {a.lot_name}</span></p>
                  <p className="text-slate-600">In since {formatDateTime(a.entry_time)} — over the {formatDuration(a.threshold_minutes)} limit</p></div>
                <Button size="sm" variant="outline" disabled={savingId === a.id} onClick={() => ack(a)}>Acknowledge</Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Card className="border-slate-200">
        <CardHeader className="pb-3"><CardTitle className="text-base">Overstay limits per lot</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {lots.length === 0 ? <p className="text-sm text-slate-500">Create a lot first.</p> : lots.map((l) => <LotSecurityRow key={l.id} lot={l} onSaved={onChanged} />)}
        </CardContent>
      </Card>
    </div>
  );
}

function LotSecurityRow({ lot, onSaved }: { lot: Lot; onSaved: () => void }) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(lot.security_enabled);
  const [mins, setMins] = useState(lot.max_parking_minutes ? String(lot.max_parking_minutes) : '');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try { await parkingPut(`/lots/${lot.id}/security-settings`, { securityEnabled: enabled, maxParkingMinutes: mins ? Number(mins) : null }); toast({ title: `${lot.name} saved` }); onSaved(); }
    catch (e) { toast({ title: 'Could not save', description: errorMessage(e), variant: 'destructive' }); } finally { setSaving(false); }
  };
  return (
    <div className="flex flex-wrap items-end gap-4">
      <p className="w-40 font-medium text-sm pb-2">{lot.name}</p>
      <div className="flex items-center gap-2 pb-2"><Switch id={`sec-${lot.id}`} checked={enabled} onCheckedChange={setEnabled} /><Label htmlFor={`sec-${lot.id}`}>Alert on overstay</Label></div>
      <div><Label htmlFor={`mins-${lot.id}`}>Limit (minutes)</Label><Input id={`mins-${lot.id}`} className="w-32" type="number" min={1} value={mins} onChange={(e) => setMins(e.target.value)} disabled={!enabled} /></div>
      <Button size="sm" onClick={save} disabled={saving || (enabled && !mins)}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
    </div>
  );
}

export default function ParkingSecurity({ onChanged }: { onChanged: () => void }) {
  const lots = useParkingQuery<Lot[]>('/lots');
  return (
    <Tabs defaultValue="watchlist" className="space-y-4">
      <TabsList>
        <TabsTrigger value="watchlist"><ShieldAlert className="h-4 w-4 mr-1.5" />Watchlist</TabsTrigger>
        <TabsTrigger value="incidents"><Siren className="h-4 w-4 mr-1.5" />Incidents</TabsTrigger>
        <TabsTrigger value="overstay"><Clock className="h-4 w-4 mr-1.5" />Overstay</TabsTrigger>
      </TabsList>
      <TabsContent value="watchlist"><Watchlist onChanged={onChanged} /></TabsContent>
      <TabsContent value="incidents"><Incidents lots={lots.data ?? []} onChanged={onChanged} /></TabsContent>
      <TabsContent value="overstay"><Overstay lots={lots.data ?? []} onChanged={() => { lots.reload(); onChanged(); }} /></TabsContent>
    </Tabs>
  );
}
