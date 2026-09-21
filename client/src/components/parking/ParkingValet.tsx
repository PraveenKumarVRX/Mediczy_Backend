import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { InlineError } from '@/components/ui/inline-error';
import { useToast } from '@/hooks/use-toast';
import { CarFront, KeyRound, Loader2, Phone, Plus, Printer, ShieldAlert } from 'lucide-react';
import { Lot, VehicleType, VEHICLE_LABEL, useParkingQuery, parkingPost, errorMessage, normalizePlate, formatDateTime } from './parkingApi';

type Status = 'received' | 'parked' | 'retrieval_requested' | 'ready' | 'delivered' | 'cancelled';
interface Ticket {
  id: number; ticket_no: string; vehicle_number: string; vehicle_type: VehicleType; customer_name: string; customer_phone: string;
  key_tag: string | null; condition_notes: string | null; status: Status; lot_id: number | null; lot_name: string | null; slot_label: string | null;
  received_at: string; parked_at: string | null; requested_at: string | null; ready_at: string | null; delivered_at: string | null;
  handover_verification: string | null; cancel_reason: string | null;
}
interface Stats { received: number; parked: number; awaiting_retrieval: number; ready: number; delivered_today: number; avg_retrieval_minutes_7d: number | null; avg_park_minutes_7d: number | null }

const STATUS: Record<Status, { label: string; cls: string }> = {
  received: { label: 'Received — not parked', cls: 'bg-amber-100 text-amber-800' },
  parked: { label: 'Parked', cls: 'bg-blue-100 text-blue-700' },
  retrieval_requested: { label: 'Retrieval requested', cls: 'bg-red-100 text-red-700' },
  ready: { label: 'Ready at pickup', cls: 'bg-emerald-100 text-emerald-700' },
  delivered: { label: 'Delivered', cls: 'bg-slate-100 text-slate-600' },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-500' },
};
const VERIFY = { ticket: 'Ticket shown', id_check: 'Photo ID checked', phone_match: 'Phone number matched' } as const;
const WAIT_ALERT_MINUTES = 10;

const minutesSince = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000)) : 0);
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function printSlip(t: Ticket) {
  const w = window.open('', '_blank', 'width=380,height=520');
  if (!w) return;
  w.document.write(`<html><head><title>${esc(t.ticket_no)}</title><style>
    body{font-family:system-ui,sans-serif;padding:16px;max-width:320px} h1{font-size:26px;margin:0 0 4px;letter-spacing:1px}
    .plate{font-size:22px;font-weight:700;font-family:monospace} td{padding:3px 0;font-size:13px;vertical-align:top} td:first-child{color:#555;padding-right:10px}
    .note{border-top:1px dashed #999;margin-top:12px;padding-top:8px;font-size:11px;color:#444}</style></head><body>
    <h1>${esc(t.ticket_no)}</h1><p class="plate">${esc(t.vehicle_number)}</p>
    <table><tr><td>Vehicle</td><td>${esc(VEHICLE_LABEL[t.vehicle_type])}</td></tr>
    <tr><td>Name</td><td>${esc(t.customer_name)}</td></tr><tr><td>Phone</td><td>${esc(t.customer_phone)}</td></tr>
    <tr><td>Key tag</td><td>${esc(t.key_tag || '—')}</td></tr><tr><td>Received</td><td>${esc(formatDateTime(t.received_at))}</td></tr>
    <tr><td>Condition</td><td>${esc(t.condition_notes || 'No damage noted')}</td></tr></table>
    <p class="note">Keep this slip. Present it (or a photo ID) to collect your vehicle. Valet service is not responsible for valuables left inside.</p>
    <script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
}

// ── New ticket ───────────────────────────────────────────────────────────────
function NewTicketDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (t: Ticket, watchlist: { reason: string; severity: string } | null) => void }) {
  const { toast } = useToast();
  const [f, setF] = useState({ vehicleNumber: '', vehicleType: 'car' as VehicleType, customerName: '', customerPhone: '', keyTag: '', conditionNotes: '' });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const out = await parkingPost('/valet/tickets', { ...f, vehicleNumber: normalizePlate(f.vehicleNumber), keyTag: f.keyTag || undefined, conditionNotes: f.conditionNotes || undefined });
      onCreated(out.ticket, out.watchlistHit); onClose();
    } catch (e) { toast({ title: 'Could not create ticket', description: errorMessage(e), variant: 'destructive' }); } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New valet ticket</DialogTitle><DialogDescription>Record the vehicle and how to reach its owner before taking the keys.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label htmlFor="vt-plate">Vehicle number</Label><Input id="vt-plate" className="uppercase" value={f.vehicleNumber} onChange={(e) => setF({ ...f, vehicleNumber: e.target.value.toUpperCase() })} placeholder="MH12AB1234" /></div>
            <div><Label htmlFor="vt-type">Vehicle type</Label>
              <Select value={f.vehicleType} onValueChange={(v) => setF({ ...f, vehicleType: v as VehicleType })}><SelectTrigger id="vt-type"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="car">Car</SelectItem><SelectItem value="two_wheeler">Two-wheeler</SelectItem></SelectContent></Select></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label htmlFor="vt-name">Owner / driver name</Label><Input id="vt-name" value={f.customerName} onChange={(e) => setF({ ...f, customerName: e.target.value })} /></div>
            <div><Label htmlFor="vt-phone">Mobile number</Label><Input id="vt-phone" type="tel" value={f.customerPhone} onChange={(e) => setF({ ...f, customerPhone: e.target.value })} placeholder="+91 98765 43210" /></div>
          </div>
          <div><Label htmlFor="vt-key">Key tag no.</Label><Input id="vt-key" value={f.keyTag} onChange={(e) => setF({ ...f, keyTag: e.target.value })} maxLength={40} /></div>
          <div><Label htmlFor="vt-cond">Condition on arrival (scratches, dents, valuables)</Label><Textarea id="vt-cond" rows={2} value={f.conditionNotes} onChange={(e) => setF({ ...f, conditionNotes: e.target.value })} maxLength={1000} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !f.vehicleNumber || !f.customerName.trim() || !f.customerPhone}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create ticket</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Park / deliver dialogs ───────────────────────────────────────────────────
function ParkDialog({ ticket, lots, onClose, onDone }: { ticket: Ticket; lots: Lot[]; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const usable = lots.filter((l) => (ticket.vehicle_type === 'car' ? l.car_capacity : l.two_wheeler_capacity) > 0);
  const [lotId, setLotId] = useState(String(usable[0]?.id ?? ''));
  const [slot, setSlot] = useState('');
  const [saving, setSaving] = useState(false);
  const free = (l: Lot) => (ticket.vehicle_type === 'car' ? l.car_capacity - l.cars : l.two_wheeler_capacity - l.two_wheelers);

  const park = async (emergencyOverride = false) => {
    setSaving(true);
    try {
      await parkingPost(`/valet/tickets/${ticket.id}/park`, { lotId: Number(lotId), slotLabel: slot.trim() || undefined, emergencyOverride: emergencyOverride || undefined });
      toast({ title: `${ticket.ticket_no} parked`, description: slot ? `Slot ${slot}` : undefined });
      onDone(); onClose();
    } catch (e: any) {
      if (e?.response?.data?.code === 'LOT_FULL' && window.confirm(`${e.response.data.message}\n\nPark anyway as an emergency override? This is recorded.`)) { setSaving(false); return park(true); }
      toast({ title: 'Could not park', description: errorMessage(e), variant: 'destructive' });
    } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Park {ticket.vehicle_number}</DialogTitle><DialogDescription>{ticket.ticket_no} · key tag {ticket.key_tag || '—'}</DialogDescription></DialogHeader>
        {usable.length === 0 ? <InlineError message="No lot has space configured for this vehicle type" description="Create or edit a lot first." compact /> : (
          <div className="space-y-4">
            <div><Label htmlFor="pk-lot">Lot</Label>
              <Select value={lotId} onValueChange={setLotId}><SelectTrigger id="pk-lot"><SelectValue /></SelectTrigger>
                <SelectContent>{usable.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name} — {free(l) > 0 ? `${free(l)} free` : 'full'}</SelectItem>)}</SelectContent></Select></div>
            <div><Label htmlFor="pk-slot">Bay / slot (optional)</Label><Input id="pk-slot" value={slot} onChange={(e) => setSlot(e.target.value)} placeholder="B2-14" maxLength={40} /></div>
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => park()} disabled={saving || !lotId}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Park vehicle</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeliverDialog({ ticket, onClose, onDone }: { ticket: Ticket; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [verification, setVerification] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try { await parkingPost(`/valet/tickets/${ticket.id}/deliver`, { verification, note: note.trim() || undefined }); toast({ title: `${ticket.ticket_no} delivered` }); onDone(); onClose(); }
    catch (e) { toast({ title: 'Could not deliver', description: errorMessage(e), variant: 'destructive' }); } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Hand over {ticket.vehicle_number}</DialogTitle><DialogDescription>Confirm the person collecting is the owner: {ticket.customer_name}, {ticket.customer_phone}.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div><Label htmlFor="dl-ver">How was the person verified?</Label>
            <Select value={verification} onValueChange={setVerification}><SelectTrigger id="dl-ver"><SelectValue placeholder="Choose…" /></SelectTrigger>
              <SelectContent>{Object.entries(VERIFY).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
          <div><Label htmlFor="dl-note">Note (optional)</Label><Input id="dl-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Lost slip — collected by driver" /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving || !verification}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Confirm handover</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Tab ──────────────────────────────────────────────────────────────────────
export default function ParkingValet({ onChanged }: { onChanged: () => void }) {
  const { toast } = useToast();
  const [view, setView] = useState('open');
  const [search, setSearch] = useState('');
  const query = { openOnly: view === 'open' ? true : undefined, status: view !== 'open' && view !== 'all' ? view : undefined, search: search.trim() || undefined };
  const tickets = useParkingQuery<Ticket[]>('/valet/tickets', query);
  const stats = useParkingQuery<Stats>('/valet/stats');
  const lots = useParkingQuery<Lot[]>('/lots');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<Ticket | null>(null);
  const [parking, setParking] = useState<Ticket | null>(null);
  const [delivering, setDelivering] = useState<Ticket | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const { reload: reloadTickets } = tickets; const { reload: reloadStats } = stats;
  const refresh = () => { reloadTickets(); reloadStats(); lots.reload(); onChanged(); };
  // Retrieval requests are time-critical: keep the board fresh while it is open.
  useEffect(() => {
    const id = window.setInterval(() => { if (!document.hidden) { reloadTickets(); reloadStats(); } }, 20000);
    return () => window.clearInterval(id);
  }, [reloadTickets, reloadStats]);

  const step = async (t: Ticket, path: string, ok: string, body?: unknown) => {
    setBusyId(t.id);
    try { await parkingPost(`/valet/tickets/${t.id}/${path}`, body); toast({ title: `${t.ticket_no}: ${ok}` }); refresh(); }
    catch (e) { toast({ title: 'Action failed', description: errorMessage(e), variant: 'destructive' }); refresh(); } finally { setBusyId(null); }
  };
  const cancel = (t: Ticket) => {
    const reason = window.prompt(`Cancel ${t.ticket_no}? Reason (required):`);
    if (reason?.trim()) step(t, 'cancel', 'cancelled', { reason: reason.trim() });
  };

  const s = stats.data;
  const kpis: [string, string | number, string?][] = [
    ['Awaiting parking', s?.received ?? '—'], ['Parked', s?.parked ?? '—'],
    ['Retrieval requested', s?.awaiting_retrieval ?? '—', s?.awaiting_retrieval ? 'text-red-600' : undefined],
    ['Ready at pickup', s?.ready ?? '—'], ['Delivered today', s?.delivered_today ?? '—'],
    ['Avg. retrieval (7d)', s?.avg_retrieval_minutes_7d != null ? `${s.avg_retrieval_minutes_7d} min` : '—'],
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map(([label, value, tone]) => (
          <Card key={label} className="border-slate-200"><CardContent className="pt-3 pb-3"><p className="text-xs text-slate-500">{label}</p>
            {stats.loading && !s ? <Skeleton className="h-7 w-10 mt-1" /> : <p className={`text-2xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</p>}</CardContent></Card>
        ))}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div><Label htmlFor="vl-search">Find ticket</Label><Input id="vl-search" className="w-56" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ticket, plate or last 4+ digits of phone" /></div>
          <div className="w-48"><Label htmlFor="vl-view">Show</Label>
            <Select value={view} onValueChange={setView}><SelectTrigger id="vl-view"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="open">Open tickets</SelectItem><SelectItem value="delivered">Delivered</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem><SelectItem value="all">Everything</SelectItem></SelectContent></Select></div>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-2" />New valet ticket</Button>
      </div>

      {tickets.loading && !tickets.data ? <Skeleton className="h-40 w-full" />
        : tickets.error && !tickets.data ? <InlineError message="Could not load valet tickets" description={tickets.error} onRetry={tickets.reload} />
        : !tickets.data?.length ? <EmptyState icon={CarFront} title={search ? 'No tickets match' : view === 'open' ? 'No open valet tickets' : 'Nothing here'} description="Create a ticket when a driver hands over the keys." action={{ label: 'New valet ticket', onClick: () => setCreating(true) }} />
        : (
          <div className="grid gap-4 lg:grid-cols-2">
            {tickets.data.map((t) => {
              const st = STATUS[t.status];
              const waiting = t.status === 'retrieval_requested' ? minutesSince(t.requested_at) : 0;
              const late = waiting >= WAIT_ALERT_MINUTES;
              return (
                <Card key={t.id} className={`border-slate-200 ${late ? 'ring-2 ring-red-400' : ''}`}>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-lg font-semibold tracking-wide">{t.ticket_no}</p>
                        <p className="font-mono font-medium">{t.vehicle_number} <span className="font-sans text-xs font-normal text-slate-500">· {VEHICLE_LABEL[t.vehicle_type]}</span></p>
                      </div>
                      <Badge className={st.cls}>{st.label}</Badge>
                    </div>
                    <div className="text-sm text-slate-600 space-y-1">
                      <p>{t.customer_name} · <a className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline" href={`tel:${t.customer_phone}`}><Phone className="h-3 w-3" aria-hidden />{t.customer_phone}</a></p>
                      {t.key_tag && <p className="flex items-center gap-1"><KeyRound className="h-3.5 w-3.5" aria-hidden />Key tag {t.key_tag}</p>}
                      {t.lot_name && <p>{t.lot_name}{t.slot_label ? ` · slot ${t.slot_label}` : ''}</p>}
                      {t.condition_notes && <p className="text-xs text-slate-500">Condition: {t.condition_notes}</p>}
                      {t.cancel_reason && <p className="text-xs text-slate-500">Cancelled: {t.cancel_reason}</p>}
                      {t.handover_verification && <p className="text-xs text-slate-500">Handover: {VERIFY[t.handover_verification as keyof typeof VERIFY] ?? t.handover_verification}</p>}
                    </div>
                    {late && <p className="flex items-center gap-1.5 text-sm font-medium text-red-700" role="alert"><ShieldAlert className="h-4 w-4" aria-hidden />Owner has been waiting {waiting} min</p>}
                    <p className="text-xs text-slate-400">Received {formatDateTime(t.received_at)}{t.requested_at && t.status === 'retrieval_requested' ? ` · asked for ${formatDateTime(t.requested_at)}` : ''}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => printSlip(t)}><Printer className="h-3.5 w-3.5 mr-1.5" />Slip</Button>
                      {t.status === 'received' && <><Button size="sm" onClick={() => setParking(t)}>Park vehicle</Button><Button size="sm" variant="outline" onClick={() => cancel(t)}>Cancel</Button></>}
                      {t.status === 'parked' && <Button size="sm" disabled={busyId === t.id} onClick={() => step(t, 'request-retrieval', 'retrieval requested')}>Owner wants the car</Button>}
                      {t.status === 'retrieval_requested' && <Button size="sm" disabled={busyId === t.id} onClick={() => step(t, 'ready', 'vehicle ready at pickup')}>Car is at pickup</Button>}
                      {t.status === 'ready' && <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDelivering(t)}>Hand over</Button>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

      {creating && <NewTicketDialog onClose={() => setCreating(false)} onCreated={(t, hit) => {
        setCreated(t); refresh();
        if (hit) toast({ title: `Watchlist: ${t.vehicle_number}`, description: `${hit.severity.toUpperCase()} — ${hit.reason}. Inform the security supervisor.`, variant: 'destructive' });
      }} />}
      {created && (
        <Dialog open onOpenChange={(o) => !o && setCreated(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Ticket {created.ticket_no}</DialogTitle><DialogDescription>Give the slip to the driver and tag the key.</DialogDescription></DialogHeader>
            <p className="text-3xl font-bold tracking-wide text-center py-3">{created.ticket_no}</p>
            <p className="text-center font-mono">{created.vehicle_number}</p>
            <DialogFooter><Button variant="outline" onClick={() => setCreated(null)}>Done</Button><Button onClick={() => printSlip(created)}><Printer className="h-4 w-4 mr-2" />Print slip</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {parking && <ParkDialog ticket={parking} lots={lots.data ?? []} onClose={() => setParking(null)} onDone={refresh} />}
      {delivering && <DeliverDialog ticket={delivering} onClose={() => setDelivering(null)} onDone={refresh} />}
    </div>
  );
}
