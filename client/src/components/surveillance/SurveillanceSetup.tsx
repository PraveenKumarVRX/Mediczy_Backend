import { useState } from 'react';
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
import { Copy, Loader2, Network, Plus, Server, Trash2 } from 'lucide-react';
import { Gateway, Recorder, VENDORS, useSurvQuery, survPost, survDelete, errorMessage, timeAgo, pretty } from './surveillanceApi';

const CLOUD_URL = typeof window !== 'undefined' ? window.location.origin : 'https://app.mediqzy.com';

function GatewayDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState(''); const [site, setSite] = useState('');
  const [saving, setSaving] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const create = async () => {
    setSaving(true);
    try { const out = await survPost('/gateways', { name, siteLabel: site || undefined }); setKey(out.apiKey); onCreated(); }
    catch (e) { toast({ title: 'Could not create gateway', description: errorMessage(e), variant: 'destructive' }); } finally { setSaving(false); }
  };
  const snippet = key ? JSON.stringify({ cloudUrl: CLOUD_URL, gatewayKey: key, maxWidth: 1280, recorders: { 'Main DVR': { vendor: 'hikvision', scheme: 'http', host: '192.168.1.10', port: 80, username: 'viewer', password: 'the-dvr-viewer-password' } } }, null, 2) : '';
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{key ? 'Gateway key — copy it now' : 'Add an edge gateway'}</DialogTitle>
          <DialogDescription>{key ? 'This key is shown once and cannot be retrieved later.' : 'The gateway is a small program that runs inside your hospital network next to the DVR and sends camera frames to MediQzy.'}</DialogDescription></DialogHeader>
        {!key ? (
          <div className="space-y-4">
            <div><Label htmlFor="gw-name">Name</Label><Input id="gw-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Main building gateway" /></div>
            <div><Label htmlFor="gw-site">Where it runs (optional)</Label><Input id="gw-site" value={site} onChange={(e) => setSite(e.target.value)} placeholder="Server room, block A" /></div>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex gap-2"><Input readOnly value={key} className="font-mono text-xs" aria-label="Gateway key" /><Button variant="outline" onClick={() => navigator.clipboard?.writeText(key).then(() => toast({ title: 'Key copied' }))}><Copy className="h-4 w-4" /></Button></div>
            <p className="font-medium">On a machine inside the hospital network (Node 18+):</p>
            <ol className="list-decimal pl-5 space-y-1 text-slate-600">
              <li>Copy the <code>edge/surveillance-agent</code> folder to it.</li>
              <li>Save this as <code>config.json</code> next to <code>agent.mjs</code> and set the DVR address and a view-only DVR login. The DVR password stays on that machine and is never sent to MediQzy.</li>
              <li>Run <code>node agent.mjs --config config.json</code> (as a service so it restarts on reboot).</li>
            </ol>
            <pre className="rounded-md bg-slate-900 text-slate-100 p-3 text-xs overflow-x-auto">{snippet}</pre>
          </div>
        )}
        <DialogFooter>{!key ? <><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={create} disabled={saving || !name.trim()}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create key</Button></> : <Button onClick={onClose}>I have saved the key</Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecorderDialog({ gateways, onClose, onSaved }: { gateways: Gateway[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState({ name: '', kind: 'dvr', vendor: 'hikvision', model: '', host: '', port: '', channelCount: '', gatewayId: String(gateways.find((g) => g.is_active)?.id ?? '') });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await survPost('/recorders', { name: f.name, kind: f.kind, vendor: f.vendor, model: f.model || undefined, host: f.host || undefined, port: f.port ? Number(f.port) : undefined, channelCount: f.channelCount ? Number(f.channelCount) : undefined, gatewayId: f.gatewayId ? Number(f.gatewayId) : undefined });
      toast({ title: 'Recorder added' }); onSaved(); onClose();
    } catch (e) { toast({ title: 'Could not add recorder', description: errorMessage(e), variant: 'destructive' }); } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add a DVR / NVR</DialogTitle><DialogDescription>Details only. Do not enter the recorder's password here — it belongs in the gateway's local config file.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label htmlFor="rc-name">Name</Label><Input id="rc-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Main DVR" /></div>
            <div><Label htmlFor="rc-kind">Type</Label><Select value={f.kind} onValueChange={(v) => setF({ ...f, kind: v })}><SelectTrigger id="rc-kind"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="dvr">DVR</SelectItem><SelectItem value="nvr">NVR</SelectItem><SelectItem value="ip_camera">Single IP camera</SelectItem></SelectContent></Select></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label htmlFor="rc-vendor">Brand</Label><Select value={f.vendor} onValueChange={(v) => setF({ ...f, vendor: v })}><SelectTrigger id="rc-vendor"><SelectValue /></SelectTrigger><SelectContent>{VENDORS.map((v) => <SelectItem key={v} value={v} className="capitalize">{pretty(v)}</SelectItem>)}</SelectContent></Select></div>
            <div><Label htmlFor="rc-model">Model</Label><Input id="rc-model" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><Label htmlFor="rc-host">Address</Label><Input id="rc-host" value={f.host} onChange={(e) => setF({ ...f, host: e.target.value })} placeholder="192.168.1.10" /></div>
            <div><Label htmlFor="rc-port">Port</Label><Input id="rc-port" type="number" value={f.port} onChange={(e) => setF({ ...f, port: e.target.value })} /></div>
            <div><Label htmlFor="rc-ch">Channels</Label><Input id="rc-ch" type="number" value={f.channelCount} onChange={(e) => setF({ ...f, channelCount: e.target.value })} /></div>
          </div>
          <div><Label htmlFor="rc-gw">Edge gateway that reads it</Label>
            <Select value={f.gatewayId || 'none'} onValueChange={(v) => setF({ ...f, gatewayId: v === 'none' ? '' : v })}><SelectTrigger id="rc-gw"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">None yet (analytics won't run)</SelectItem>{gateways.filter((g) => g.is_active).map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving || !f.name.trim()}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Add</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SurveillanceSetup({ onChanged }: { onChanged: () => void }) {
  const { toast } = useToast();
  const gateways = useSurvQuery<Gateway[]>('/gateways');
  const recorders = useSurvQuery<Recorder[]>('/recorders');
  const [addingGw, setAddingGw] = useState(false);
  const [addingRec, setAddingRec] = useState(false);
  const refresh = () => { gateways.reload(); recorders.reload(); onChanged(); };

  const deactivate = async (g: Gateway) => {
    if (!window.confirm(`Deactivate ${g.name}? Its key stops working immediately and its cameras stop being analysed.`)) return;
    try { await survDelete(`/gateways/${g.id}`); toast({ title: 'Gateway deactivated' }); refresh(); } catch (e) { toast({ title: 'Could not deactivate', description: errorMessage(e), variant: 'destructive' }); }
  };
  const archiveRec = async (r: Recorder) => {
    if (!window.confirm(`Remove ${r.name} and its ${r.cameras} camera(s)? Earlier alerts are kept.`)) return;
    try { await survDelete(`/recorders/${r.id}`); toast({ title: 'Recorder removed' }); refresh(); } catch (e) { toast({ title: 'Could not remove', description: errorMessage(e), variant: 'destructive' }); }
  };

  return (
    <div className="space-y-6">
      <Card className="border-slate-200">
        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0"><CardTitle className="text-base flex items-center gap-2"><Network className="h-4 w-4" aria-hidden />Edge gateways</CardTitle><Button size="sm" onClick={() => setAddingGw(true)}><Plus className="h-4 w-4 mr-1.5" />Add gateway</Button></CardHeader>
        <CardContent>
          {gateways.loading && !gateways.data ? <Skeleton className="h-16 w-full" />
            : gateways.error && !gateways.data ? <InlineError message="Could not load gateways" description={gateways.error} onRetry={gateways.reload} compact />
            : !gateways.data?.length ? <EmptyState icon={Network} size="sm" title="No gateway yet" description="A cloud server cannot reach cameras inside your network, so a small agent inside it reads the DVR and sends frames out. Add one to begin." action={{ label: 'Add gateway', onClick: () => setAddingGw(true) }} />
            : (
              <ul className="divide-y">
                {gateways.data.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div><p className="font-medium flex items-center gap-2">{g.name}{!g.is_active ? <Badge className="bg-slate-100 text-slate-500">deactivated</Badge> : g.online ? <Badge className="bg-emerald-100 text-emerald-700">online</Badge> : <Badge className="bg-red-100 text-red-700">offline</Badge>}</p>
                      <p className="text-xs text-slate-500">{[g.site_label, `${g.recorders} recorder${g.recorders === 1 ? '' : 's'}`, `last seen ${timeAgo(g.last_seen_at)}`, g.agent_version && `agent ${g.agent_version}`].filter(Boolean).join(' · ')}</p></div>
                    {g.is_active && <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" aria-label={`Deactivate ${g.name}`} onClick={() => deactivate(g)}><Trash2 className="h-4 w-4" /></Button>}
                  </li>
                ))}
              </ul>
            )}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0"><CardTitle className="text-base flex items-center gap-2"><Server className="h-4 w-4" aria-hidden />DVRs and recorders</CardTitle><Button size="sm" onClick={() => setAddingRec(true)}><Plus className="h-4 w-4 mr-1.5" />Add recorder</Button></CardHeader>
        <CardContent>
          {recorders.loading && !recorders.data ? <Skeleton className="h-16 w-full" />
            : recorders.error && !recorders.data ? <InlineError message="Could not load recorders" description={recorders.error} onRetry={recorders.reload} compact />
            : !recorders.data?.length ? <EmptyState icon={Server} size="sm" title="No recorders yet" description="Add each DVR or NVR, then add its camera channels on the Cameras tab." action={{ label: 'Add recorder', onClick: () => setAddingRec(true) }} />
            : (
              <ul className="divide-y">
                {recorders.data.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div><p className="font-medium flex items-center gap-2">{r.name}<Badge variant="outline" className="capitalize">{pretty(r.vendor)}</Badge><Badge className={r.status === 'online' ? 'bg-emerald-100 text-emerald-700' : r.status === 'offline' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}>{r.status}</Badge></p>
                      <p className="text-xs text-slate-500">{[r.host && `${r.host}${r.port ? `:${r.port}` : ''}`, `${r.cameras} camera${r.cameras === 1 ? '' : 's'}`, r.gateway_name ? `via ${r.gateway_name}` : 'no gateway assigned — analytics will not run'].filter(Boolean).join(' · ')}</p></div>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" aria-label={`Remove ${r.name}`} onClick={() => archiveRec(r)}><Trash2 className="h-4 w-4" /></Button>
                  </li>
                ))}
              </ul>
            )}
        </CardContent>
      </Card>
      {addingGw && <GatewayDialog onClose={() => setAddingGw(false)} onCreated={refresh} />}
      {addingRec && <RecorderDialog gateways={gateways.data ?? []} onClose={() => setAddingRec(false)} onSaved={refresh} />}
    </div>
  );
}
