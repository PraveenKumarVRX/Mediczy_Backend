import { useEffect, useState } from 'react';
import LabLayout from '@/components/lab/LabLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import api from '@/utils/api';

type Material = { id:number; analyte:string; level:string; lot_number:string; units:string; target_mean:number; target_sd:number; release_status:string; run_count:number; last_run_at?:string };
type Point = { id:number; measured_value:number; z_score:number; decision:string; rule_flags:string[]; run_at:string; operator_id?:string };

export default function LabQcPage() {
  const [materials,setMaterials] = useState<Material[]>([]);
  const [selected,setSelected] = useState<Material|null>(null);
  const [points,setPoints] = useState<Point[]>([]);
  const [value,setValue] = useState('');
  const [note,setNote] = useState('');
  const [reason,setReason] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const load = async () => {
    setError('');
    try { const res = await api.get('/lab/qc/materials'); const next = res.data.materials || []; setMaterials(next); return next as Material[]; }
    catch (e:any) { setError(e?.response?.data?.message || 'Unable to load QC materials'); }
    return [] as Material[];
  };
  const loadChart = async (material:Material) => {
    setSelected(material); setError('');
    try { const res = await api.get(`/lab/qc/materials/${material.id}/chart?limit=50`); setPoints(res.data.points || []); }
    catch (e:any) { setError(e?.response?.data?.message || 'Unable to load QC history'); }
  };
  useEffect(() => { load(); }, []);
  const run = async () => {
    if (!selected || value === '') return;
    setBusy(true); setError('');
    try { await api.post(`/lab/qc/materials/${selected.id}/runs`, { measuredValue:Number(value), notes:note || undefined }); setValue(''); setNote(''); const refreshed = await load(); const next = refreshed.find((m) => m.id === selected.id) || selected; await loadChart(next); }
    catch (e:any) { setError(e?.response?.data?.message || 'Unable to record QC run'); }
    finally { setBusy(false); }
  };
  const unlock = async () => {
    if (!selected || reason.trim().length < 5) return;
    setBusy(true); setError('');
    try { await api.post(`/lab/qc/materials/${selected.id}/unlock`, { reason }); setReason(''); const refreshed = await load(); const next = refreshed.find((m) => m.id === selected.id) || selected; await loadChart(next); }
    catch (e:any) { setError(e?.response?.data?.message || 'Unable to unlock QC material'); }
    finally { setBusy(false); }
  };
  return <LabLayout title="Quality Control" subtitle="QC lots, Westgard decisions, and release lockouts">
    <div className="space-y-6">
      {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      <Card><CardHeader><CardTitle>QC material lots</CardTitle></CardHeader><CardContent className="space-y-2">
        {materials.length === 0 && <p className="text-sm text-muted-foreground">No QC materials configured for this lab.</p>}
        {materials.map((m) => <button type="button" key={m.id} onClick={() => loadChart(m)} className={`w-full rounded-md border p-3 text-left hover:bg-muted/50 ${selected?.id === m.id ? 'ring-2 ring-primary' : ''}`}>
          <div className="flex items-center justify-between"><span className="font-medium">{m.analyte} · {m.level} · lot {m.lot_number}</span><Badge variant={m.release_status === 'released' ? 'default' : 'destructive'}>{m.release_status}</Badge></div>
          <div className="mt-1 text-xs text-muted-foreground">Target {m.target_mean} ± {m.target_sd} {m.units} · {m.run_count || 0} runs</div>
        </button>)}
      </CardContent></Card>
      {selected && <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Record QC run</CardTitle></CardHeader><CardContent className="space-y-3"><div><Label htmlFor="qc-value">Measured value</Label><Input id="qc-value" type="number" value={value} onChange={(e) => setValue(e.target.value)} /></div><div><Label htmlFor="qc-note">Notes</Label><Input id="qc-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Instrument or deviation note" /></div><Button disabled={busy || value === ''} onClick={run}>Evaluate Westgard rules</Button></CardContent></Card>
        <Card><CardHeader><CardTitle>Release control</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm">A failed QC run blocks result release until a supervisor documents an unlock reason.</p><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for supervisor unlock" /><Button variant="outline" disabled={busy || reason.trim().length < 5 || selected.release_status === 'released'} onClick={unlock}>Unlock material</Button></CardContent></Card>
      </div>}
      {selected && <Card><CardHeader><CardTitle>Levey–Jennings history</CardTitle></CardHeader><CardContent><div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Time</th><th className="p-2">Value</th><th className="p-2">Z</th><th className="p-2">Decision</th><th className="p-2">Rules</th></tr></thead><tbody>{points.map((p) => <tr key={p.id} className="border-b"><td className="p-2">{new Date(p.run_at).toLocaleString()}</td><td className="p-2">{p.measured_value}</td><td className="p-2">{p.z_score}</td><td className="p-2"><Badge variant={p.decision === 'pass' ? 'default' : 'destructive'}>{p.decision}</Badge></td><td className="p-2">{Array.isArray(p.rule_flags) ? p.rule_flags.join(', ') : ''}</td></tr>)}</tbody></table></div></CardContent></Card>}
    </div>
  </LabLayout>;
}

export { LabQcPage };
