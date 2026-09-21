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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { InlineError } from '@/components/ui/inline-error';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Ticket } from 'lucide-react';
import { Lot, PassType, PASS_LABEL, useParkingQuery, parkingPost, errorMessage, normalizePlate, formatDateTime } from './parkingApi';

interface Pass {
  id: number; vehicle_number: string; pass_type: PassType; holder_name: string | null; holder_type: string | null;
  lot_id: number | null; lot_name: string | null; is_active: boolean; issued_at: string; expires_at: string | null;
  token_balance: number | null; note: string | null; revoked_at: string | null;
}

const HOLDERS = ['staff', 'doctor', 'patient', 'visitor', 'vendor', 'other'];

function statusOf(p: Pass): { label: string; cls: string } {
  if (!p.is_active) return { label: p.revoked_at ? 'Revoked' : 'Inactive', cls: 'bg-slate-100 text-slate-600' };
  if (p.expires_at && new Date(p.expires_at).getTime() < Date.now()) return { label: 'Expired', cls: 'bg-amber-100 text-amber-700' };
  return { label: 'Active', cls: 'bg-emerald-100 text-emerald-700' };
}

function IssueDialog({ lots, onClose, onSaved }: { lots: Lot[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [plate, setPlate] = useState('');
  const [passType, setPassType] = useState<PassType>('monthly');
  const [holderName, setHolderName] = useState('');
  const [holderType, setHolderType] = useState('');
  const [lotId, setLotId] = useState('all');
  const [expires, setExpires] = useState('');
  const [tokens, setTokens] = useState('10');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await parkingPost('/passes', {
        vehicleNumber: normalizePlate(plate), passType, holderName: holderName.trim() || undefined, holderType: holderType || undefined,
        lotId: lotId === 'all' ? undefined : Number(lotId),
        expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : undefined,
        tokenBalance: passType === 'token' ? Number(tokens) : undefined, note: note.trim() || undefined,
      });
      toast({ title: 'Pass issued', description: normalizePlate(plate) });
      onSaved(); onClose();
    } catch (e) {
      toast({ title: 'Could not issue pass', description: errorMessage(e), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue parking pass</DialogTitle>
          <DialogDescription>Issuing a pass replaces the vehicle's current pass of the same type.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label htmlFor="pass-plate">Vehicle number</Label><Input id="pass-plate" className="uppercase" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="MH12AB1234" /></div>
            <div>
              <Label htmlFor="pass-type">Pass type</Label>
              <Select value={passType} onValueChange={(v) => setPassType(v as PassType)}>
                <SelectTrigger id="pass-type"><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(PASS_LABEL) as PassType[]).map((t) => <SelectItem key={t} value={t}>{PASS_LABEL[t]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label htmlFor="pass-holder">Holder name</Label><Input id="pass-holder" value={holderName} onChange={(e) => setHolderName(e.target.value)} /></div>
            <div>
              <Label htmlFor="pass-holder-type">Holder is a</Label>
              <Select value={holderType || 'none'} onValueChange={(v) => setHolderType(v === 'none' ? '' : v)}>
                <SelectTrigger id="pass-holder-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  {HOLDERS.map((h) => <SelectItem key={h} value={h} className="capitalize">{h}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="pass-lot">Valid at</Label>
              <Select value={lotId} onValueChange={setLotId}>
                <SelectTrigger id="pass-lot"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All lots</SelectItem>
                  {lots.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {passType === 'token'
              ? <div><Label htmlFor="pass-tokens">Tokens</Label><Input id="pass-tokens" type="number" min={1} value={tokens} onChange={(e) => setTokens(e.target.value)} /></div>
              : <div><Label htmlFor="pass-exp">{passType === 'monthly' ? 'Expires on' : 'Expires on (optional)'}</Label><Input id="pass-exp" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></div>}
          </div>
          <div><Label htmlFor="pass-note">Note</Label><Input id="pass-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Issue pass</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ParkingPasses({ onChanged }: { onChanged: () => void }) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const passes = useParkingQuery<Pass[]>('/passes', { activeOnly, search: search.trim() || undefined });
  const lots = useParkingQuery<Lot[]>('/lots');

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast({ title: ok }); passes.reload(); onChanged(); }
    catch (e) { toast({ title: 'Action failed', description: errorMessage(e), variant: 'destructive' }); }
  };
  const topUp = (p: Pass) => {
    const v = window.prompt(`Add how many tokens to ${p.vehicle_number}?`, '10');
    if (v === null) return;
    act(() => parkingPost(`/passes/${p.id}/top-up`, { amount: Number(v) }), 'Tokens added');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-4">
          <div><Label htmlFor="pass-search">Search vehicle</Label><Input id="pass-search" className="w-52 uppercase" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="MH12…" /></div>
          <div className="flex items-center gap-2 pb-2"><Switch id="pass-active" checked={activeOnly} onCheckedChange={setActiveOnly} /><Label htmlFor="pass-active">Active only</Label></div>
        </div>
        <Button onClick={() => setIssuing(true)}><Plus className="h-4 w-4 mr-2" />Issue pass</Button>
      </div>

      {passes.loading && !passes.data ? <Skeleton className="h-40 w-full" />
        : passes.error && !passes.data ? <InlineError message="Could not load passes" description={passes.error} onRetry={passes.reload} />
        : !passes.data?.length ? (
          <EmptyState icon={Ticket} title={search || activeOnly ? 'No passes match' : 'No passes issued yet'} description="Monthly, VIP, free, token and staff passes let known vehicles in without a fee check."
            action={{ label: 'Issue a pass', onClick: () => setIssuing(true) }} />
        ) : (
          <Card className="border-slate-200"><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Vehicle</TableHead><TableHead>Type</TableHead><TableHead>Holder</TableHead><TableHead>Valid at</TableHead><TableHead>Expires / tokens</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {passes.data.map((p) => {
                  const st = statusOf(p);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono font-medium">{p.vehicle_number}</TableCell>
                      <TableCell><Badge variant="outline">{PASS_LABEL[p.pass_type]}</Badge></TableCell>
                      <TableCell>{p.holder_name || '—'}{p.holder_type && <span className="text-xs text-slate-500 capitalize"> · {p.holder_type}</span>}</TableCell>
                      <TableCell>{p.lot_name || 'All lots'}</TableCell>
                      <TableCell>{p.pass_type === 'token' ? `${p.token_balance ?? 0} left` : p.expires_at ? formatDateTime(p.expires_at) : 'No expiry'}</TableCell>
                      <TableCell><Badge className={st.cls}>{st.label}</Badge></TableCell>
                      <TableCell className="text-right space-x-1 whitespace-nowrap">
                        {p.pass_type === 'token' && <Button size="sm" variant="outline" onClick={() => topUp(p)}>Top up</Button>}
                        {p.is_active
                          ? <Button size="sm" variant="outline" onClick={() => window.confirm(`Revoke the pass for ${p.vehicle_number}?`) && act(() => parkingPost(`/passes/${p.id}/revoke`), 'Pass revoked')}>Revoke</Button>
                          : <Button size="sm" variant="outline" onClick={() => act(() => parkingPost(`/passes/${p.id}/reactivate`), 'Pass reactivated')}>Reactivate</Button>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent></Card>
        )}
      {issuing && <IssueDialog lots={lots.data ?? []} onClose={() => setIssuing(false)} onSaved={() => { passes.reload(); onChanged(); }} />}
    </div>
  );
}
