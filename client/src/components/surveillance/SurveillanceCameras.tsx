import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { InlineError } from '@/components/ui/inline-error';
import { useToast } from '@/hooks/use-toast';
import { Cctv, Loader2, Lock, Plus, Settings2, Trash2 } from 'lucide-react';
import { Camera, CatalogItem, PrivacyClass, Recorder, Rule, Severity, SEV_CLS, ZONE_TYPES, useSurvQuery, survPost, survPatch, survDelete, errorMessage, timeAgo, pretty } from './surveillanceApi';

const DEFAULT_PRIVACY: Record<string, PrivacyClass> = { entrance: 'public', perimeter: 'public', parking: 'public', corridor: 'public', lobby: 'public', emergency: 'restricted', pharmacy: 'restricted', server_room: 'restricted', store: 'restricted', ward: 'clinical', icu: 'clinical', ot: 'clinical', other: 'restricted' };
const PRIVACY_CLS: Record<PrivacyClass, string> = { public: 'bg-emerald-100 text-emerald-700', restricted: 'bg-amber-100 text-amber-700', clinical: 'bg-purple-100 text-purple-700' };
const PRIVACY_HELP: Record<PrivacyClass, string> = {
  public: 'Entrances, car parks, lobbies — analytics allowed.',
  restricted: 'Staff-only areas such as pharmacy, stores, server room — analytics allowed.',
  clinical: 'Wards, ICU, theatres — patients may be visible. Analytics stay OFF until an administrator records a privacy review.',
};

// ── Camera create / edit ─────────────────────────────────────────────────────
function CameraDialog({ camera, recorders, onClose, onSaved }: { camera: Camera | null; recorders: Recorder[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState({
    name: camera?.name ?? '', zone: camera?.zone ?? '', zoneType: camera?.zone_type ?? 'entrance', recorderId: camera?.recorder_id ? String(camera.recorder_id) : '', channelNo: camera?.channel_no ? String(camera.channel_no) : '',
    privacyClass: (camera?.privacy_class ?? DEFAULT_PRIVACY.entrance) as PrivacyClass, interval: String(camera?.analysis_interval_seconds ?? 60), budget: String(camera?.daily_frame_budget ?? 1440),
  });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const body: any = { name: f.name, zone: f.zone || undefined, zoneType: f.zoneType, channelNo: f.channelNo ? Number(f.channelNo) : undefined, analysisIntervalSeconds: Number(f.interval), dailyFrameBudget: Number(f.budget) };
      if (f.recorderId) body.recorderId = Number(f.recorderId);
      if (!camera || f.privacyClass !== camera.privacy_class) body.privacyClass = f.privacyClass;
      if (camera) await survPatch(`/cameras/${camera.id}`, body); else await survPost('/cameras', body);
      toast({ title: camera ? 'Camera updated' : 'Camera added' }); onSaved(); onClose();
    } catch (e) { toast({ title: 'Could not save camera', description: errorMessage(e), variant: 'destructive' }); } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{camera ? 'Edit camera' : 'Add camera'}</DialogTitle><DialogDescription>One entry per DVR/NVR channel or IP camera.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label htmlFor="cm-name">Camera name</Label><Input id="cm-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Main gate" /></div>
            <div><Label htmlFor="cm-zone">Location</Label><Input id="cm-zone" value={f.zone} onChange={(e) => setF({ ...f, zone: e.target.value })} placeholder="Block A entrance" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label htmlFor="cm-zt">Area type</Label>
              <Select value={f.zoneType} onValueChange={(v) => setF({ ...f, zoneType: v, privacyClass: camera ? f.privacyClass : DEFAULT_PRIVACY[v] })}><SelectTrigger id="cm-zt"><SelectValue /></SelectTrigger>
                <SelectContent>{ZONE_TYPES.map((z) => <SelectItem key={z} value={z} className="capitalize">{pretty(z)}</SelectItem>)}</SelectContent></Select></div>
            <div><Label htmlFor="cm-priv">Privacy class</Label>
              <Select value={f.privacyClass} onValueChange={(v) => setF({ ...f, privacyClass: v as PrivacyClass })}><SelectTrigger id="cm-priv"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="public">Public</SelectItem><SelectItem value="restricted">Restricted</SelectItem><SelectItem value="clinical">Clinical</SelectItem></SelectContent></Select></div>
          </div>
          <p className="text-xs text-slate-500 -mt-2">{PRIVACY_HELP[f.privacyClass]}{camera && f.privacyClass !== camera.privacy_class ? ' Changing the class clears any earlier privacy approval.' : ''}</p>
          <div className="grid grid-cols-2 gap-4">
            <div><Label htmlFor="cm-rec">DVR / recorder</Label>
              <Select value={f.recorderId || 'none'} onValueChange={(v) => setF({ ...f, recorderId: v === 'none' ? '' : v })}><SelectTrigger id="cm-rec"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">Not linked</SelectItem>{recorders.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label htmlFor="cm-ch">Channel no.</Label><Input id="cm-ch" type="number" min={1} value={f.channelNo} onChange={(e) => setF({ ...f, channelNo: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label htmlFor="cm-int">Analyse every (seconds)</Label><Input id="cm-int" type="number" min={10} max={3600} value={f.interval} onChange={(e) => setF({ ...f, interval: e.target.value })} /></div>
            <div><Label htmlFor="cm-bud">Max frames per day</Label><Input id="cm-bud" type="number" min={0} value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} /></div>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving || !f.name.trim()}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Rules + privacy for one camera ───────────────────────────────────────────
function RulesDialog({ camera, catalog, onClose, onChanged }: { camera: Camera; catalog: CatalogItem[]; onClose: () => void; onChanged: () => void }) {
  const { toast } = useToast();
  const rules = useSurvQuery<Rule[]>(`/cameras/${camera.id}/rules`);
  const [analytic, setAnalytic] = useState(catalog[0]?.key ?? '');
  const def = catalog.find((c) => c.key === analytic);
  const [threshold, setThreshold] = useState('5');
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [cooldown, setCooldown] = useState('10');
  const [useSchedule, setUseSchedule] = useState(false);
  const [start, setStart] = useState('22:00'); const [end, setEnd] = useState('06:00');
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const needsSchedule = Boolean(def?.needsSchedule);

  const add = async () => {
    setSaving(true);
    try {
      await survPost(`/cameras/${camera.id}/rules`, {
        analytic, threshold: def?.threshold === 'required' ? Number(threshold) : undefined, severity: severity || undefined, cooldownMinutes: Number(cooldown),
        schedule: needsSchedule || useSchedule ? { start, end } : undefined,
      });
      toast({ title: 'Rule added' }); rules.reload(); onChanged();
    } catch (e) { toast({ title: 'Could not add rule', description: errorMessage(e), variant: 'destructive' }); } finally { setSaving(false); }
  };
  const toggle = async (r: Rule, isEnabled: boolean) => { try { await survPatch(`/rules/${r.id}`, { isEnabled }); rules.reload(); onChanged(); } catch (e) { toast({ title: 'Could not update rule', description: errorMessage(e), variant: 'destructive' }); } };
  const remove = async (r: Rule) => { try { await survDelete(`/rules/${r.id}`); rules.reload(); onChanged(); } catch (e) { toast({ title: 'Could not remove rule', description: errorMessage(e), variant: 'destructive' }); } };
  const approve = async () => {
    const note = window.prompt('Privacy review note (required): who agreed and why analytics is justified here. No faces or identities are stored.');
    if (!note?.trim()) return;
    setApproving(true);
    try { await survPost(`/cameras/${camera.id}/privacy-approval`, { note: note.trim() }); toast({ title: 'Privacy review recorded' }); onChanged(); onClose(); }
    catch (e) { toast({ title: 'Could not record approval', description: errorMessage(e), variant: 'destructive' }); } finally { setApproving(false); }
  };
  const labelOf = (key: string) => catalog.find((c) => c.key === key)?.label ?? pretty(key);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Analytics — {camera.name}</DialogTitle><DialogDescription>What this camera is watched for. Frames are analysed and discarded; only counts and alerts are kept.</DialogDescription></DialogHeader>

        {!camera.analytics_allowed ? (
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 space-y-3 text-sm text-purple-900" role="status">
            <p className="flex items-center gap-2 font-medium"><Lock className="h-4 w-4" aria-hidden />Analytics are off: this camera covers a clinical area.</p>
            <p>Patients may be visible here. An administrator must record a privacy review before any analytics can run.</p>
            <Button size="sm" onClick={approve} disabled={approving}>{approving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Record privacy review (administrator)</Button>
            <p className="text-xs text-purple-700">Only the hospital administrator account can do this; you'll see an error otherwise.</p>
          </div>
        ) : (
          <>
            {camera.privacy_class === 'clinical' && <p className="text-xs text-purple-700">Clinical-area camera — privacy review recorded{camera.privacy_note ? `: ${camera.privacy_note}` : ''}.</p>}
            <div className="space-y-2">
              {rules.loading && !rules.data ? <Skeleton className="h-16 w-full" />
                : rules.error && !rules.data ? <InlineError message="Could not load rules" description={rules.error} onRetry={rules.reload} compact />
                : !rules.data?.length ? <p className="text-sm text-slate-500">No rules yet. Add one below to start analysing this camera.</p>
                : rules.data.map((r) => (
                  <div key={r.id} className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-sm ${r.is_enabled ? '' : 'opacity-60'}`}>
                    <div>
                      <p className="font-medium flex flex-wrap items-center gap-2">{labelOf(r.analytic)}<Badge className={SEV_CLS[r.severity]}>{r.severity}</Badge></p>
                      <p className="text-xs text-slate-500">{r.threshold !== null ? `Limit ${r.threshold} · ` : ''}repeat alert after {r.cooldown_minutes} min{r.schedule ? ` · only ${r.schedule.start}–${r.schedule.end}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={r.is_enabled} onCheckedChange={(v) => toggle(r, v)} aria-label={`Enable ${labelOf(r.analytic)}`} />
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" aria-label={`Remove ${labelOf(r.analytic)}`} onClick={() => remove(r)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
            </div>

            <div className="rounded-lg border p-3 space-y-3">
              <p className="text-sm font-semibold">Add a rule</p>
              <div>
                <Label htmlFor="ru-an">Detect</Label>
                <Select value={analytic} onValueChange={(v) => { setAnalytic(v); const d = catalog.find((c) => c.key === v); setSeverity(d?.defaultSeverity ?? ''); }}>
                  <SelectTrigger id="ru-an"><SelectValue /></SelectTrigger>
                  <SelectContent>{catalog.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
                {def && <p className="text-xs text-slate-500 mt-1">{def.help}</p>}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {def?.threshold === 'required' && <div><Label htmlFor="ru-th">Limit</Label><Input id="ru-th" type="number" min={def.cmp === 'lte' ? 0 : 1} value={threshold} onChange={(e) => setThreshold(e.target.value)} /></div>}
                <div><Label htmlFor="ru-sev">Severity</Label>
                  <Select value={severity || def?.defaultSeverity || 'medium'} onValueChange={(v) => setSeverity(v as Severity)}><SelectTrigger id="ru-sev"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent></Select></div>
                <div><Label htmlFor="ru-cd">Repeat after (min)</Label><Input id="ru-cd" type="number" min={0} value={cooldown} onChange={(e) => setCooldown(e.target.value)} /></div>
              </div>
              <div className="flex flex-wrap items-end gap-4">
                {!needsSchedule && <div className="flex items-center gap-2 pb-2"><Switch id="ru-sch" checked={useSchedule} onCheckedChange={setUseSchedule} /><Label htmlFor="ru-sch">Only during certain hours</Label></div>}
                {(needsSchedule || useSchedule) && <>
                  <div><Label htmlFor="ru-st">From</Label><Input id="ru-st" type="time" value={start} onChange={(e) => setStart(e.target.value)} className="w-32" /></div>
                  <div><Label htmlFor="ru-en">To</Label><Input id="ru-en" type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="w-32" /></div>
                  <p className="text-xs text-slate-500 pb-2">Hospital local time. A window like 22:00–06:00 runs overnight.</p>
                </>}
              </div>
              <Button onClick={add} disabled={saving || !analytic}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Add rule</Button>
            </div>
          </>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Cameras tab ──────────────────────────────────────────────────────────────
export default function SurveillanceCameras({ onChanged }: { onChanged: () => void }) {
  const { toast } = useToast();
  const cameras = useSurvQuery<Camera[]>('/cameras');
  const recorders = useSurvQuery<Recorder[]>('/recorders');
  const catalog = useSurvQuery<{ analytics: CatalogItem[] }>('/catalog');
  const [editing, setEditing] = useState<Camera | 'new' | null>(null);
  const [ruling, setRuling] = useState<Camera | null>(null);
  const refresh = () => { cameras.reload(); onChanged(); };

  const archive = async (c: Camera) => {
    if (!window.confirm(`Remove ${c.name}? Its earlier alerts are kept.`)) return;
    try { await survDelete(`/cameras/${c.id}`); toast({ title: 'Camera removed' }); refresh(); } catch (e) { toast({ title: 'Could not remove', description: errorMessage(e), variant: 'destructive' }); }
  };
  const setEnabled = async (c: Camera, isEnabled: boolean) => { try { await survPatch(`/cameras/${c.id}`, { isEnabled }); refresh(); } catch (e) { toast({ title: 'Could not update', description: errorMessage(e), variant: 'destructive' }); } };

  if (cameras.loading && !cameras.data) return <Skeleton className="h-48 w-full" />;
  if (cameras.error && !cameras.data) return <InlineError message="Could not load cameras" description={cameras.error} onRetry={cameras.reload} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setEditing('new')}><Plus className="h-4 w-4 mr-2" />Add camera</Button></div>
      {!cameras.data?.length ? <EmptyState icon={Cctv} title="No cameras yet" description="Add the DVR under Setup first, then add each camera channel here and choose what to watch for." action={{ label: 'Add a camera', onClick: () => setEditing('new') }} />
        : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cameras.data.map((c) => (
              <Card key={c.id} className={`border-slate-200 ${c.is_enabled ? '' : 'opacity-60'}`}>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div><p className="font-semibold">{c.name}</p><p className="text-xs text-slate-500">{[c.zone, pretty(c.zone_type)].filter(Boolean).join(' · ')}</p></div>
                    <Badge className={c.status === 'online' ? 'bg-emerald-100 text-emerald-700' : c.status === 'offline' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}>{c.status}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <Badge className={PRIVACY_CLS[c.privacy_class]}>{c.privacy_class}</Badge>
                    {!c.analytics_allowed ? <Badge className="bg-purple-100 text-purple-700"><Lock className="h-3 w-3 mr-1" aria-hidden />analytics blocked</Badge>
                      : c.rule_count > 0 ? <Badge variant="outline">{c.rule_count} rule{c.rule_count === 1 ? '' : 's'}</Badge> : <Badge variant="outline">no rules</Badge>}
                    {c.new_events > 0 && <Badge className="bg-red-100 text-red-700">{c.new_events} new alert{c.new_events === 1 ? '' : 's'}</Badge>}
                  </div>
                  <p className="text-xs text-slate-500">{c.recorder_name ? `${c.recorder_name} · channel ${c.channel_no ?? '—'}` : 'Not linked to a recorder'} · every {c.analysis_interval_seconds}s · last frame {timeAgo(c.last_frame_at)}</p>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2"><Switch id={`cam-en-${c.id}`} checked={c.is_enabled} onCheckedChange={(v) => setEnabled(c, v)} /><Label htmlFor={`cam-en-${c.id}`} className="text-xs">Enabled</Label></div>
                    <div className="flex gap-1.5">
                      <Button size="sm" onClick={() => setRuling(c)}><Settings2 className="h-3.5 w-3.5 mr-1.5" />Analytics</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(c)}>Edit</Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" aria-label={`Remove ${c.name}`} onClick={() => archive(c)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      {editing && <CameraDialog camera={editing === 'new' ? null : editing} recorders={recorders.data ?? []} onClose={() => setEditing(null)} onSaved={refresh} />}
      {ruling && <RulesDialog camera={ruling} catalog={catalog.data?.analytics ?? []} onClose={() => setRuling(null)} onChanged={refresh} />}
    </div>
  );
}
