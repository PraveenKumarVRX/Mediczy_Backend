import { useCallback, useEffect, useState } from 'react';
import { nursingGet, nursingPost } from '@/services/nursing.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
type SBAR = Record<string, Record<string, string>>;
export default function NursingHandover({ wardId }: {
    wardId: number;
}) {
    const [patients, setPatients] = useState<any[]>([]);
    const [handovers, setHandovers] = useState<any[]>([]);
    const [sbar, setSbar] = useState<SBAR>({});
    const [shiftName, setShiftName] = useState('day');
    const [receiverId, setReceiverId] = useState('');
    const [context, setContext] = useState<any>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const load = useCallback(async () => {
        try {
            const [snapshot, rows, actor] = await Promise.all([nursingGet(`/wards/${wardId}/snapshot`), nursingGet(`/handovers?wardId=${wardId}`), nursingGet('/context')]);
            setPatients(snapshot.patients);
            setHandovers(rows);
            setContext(actor);
            setError('');
        }
        catch (e: any) {
            setError(e.response?.data?.message || 'Handover could not be loaded. Coverage is unknown.');
        }
    }, [wardId]);
    useEffect(() => { setSbar({}); setPatients([]); load(); }, [load]);
    const send = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        try {
            const draft = await nursingPost('/handovers', { wardId, shiftName, receiverId: Number(receiverId), sbar });
            await nursingPost(`/handovers/${draft.id}/send`, { version: draft.version, receiverId: Number(receiverId), sbar });
            setSbar({});
            await load();
        }
        catch (e: any) {
            setError(e.response?.data?.message || 'Handover could not be sent.');
        }
        finally {
            setBusy(false);
        }
    };
    const accept = async (row: any) => {
        setBusy(true);
        try {
            await nursingPost(`/handovers/${row.id}/accept`, { version: row.version });
            await load();
        }
        catch (e: any) {
            setError(e.response?.data?.message || 'Acceptance failed. Review the current ward census.');
        }
        finally {
            setBusy(false);
        }
    };
    return <section className="space-y-4"><h2 className="text-lg font-semibold">Ward shift handover</h2>{error && <p role="alert" className="bg-red-50 p-3 rounded">{error}</p>}
    <Button variant="outline" onClick={async () => { try {
        const pack = await nursingGet(`/wards/${wardId}/downtime`);
        const url = URL.createObjectURL(new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `ward-${wardId}-downtime.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
    catch (e: any) {
        setError(e.response?.data?.message || 'Downtime pack could not be exported.');
    } }}>Download dated downtime snapshot</Button>
    <p>{patients.length} active admissions in your ward. Every patient needs reviewed SBAR documentation.</p>
    <form onSubmit={send} className="space-y-4"><div className="grid sm:grid-cols-2 gap-3"><div><Label htmlFor="handover-shift">Shift</Label><Input id="handover-shift" className="min-h-11" value={shiftName} onChange={e => setShiftName(e.target.value)} required/></div><div><Label htmlFor="handover-receiver">Incoming nurse ID</Label><Input id="handover-receiver" className="min-h-11" type="number" min="1" value={receiverId} onChange={e => setReceiverId(e.target.value)} required/></div></div>
      {patients.map(p => <fieldset key={p.id} className="border rounded p-3 space-y-2"><legend className="font-medium">{p.patient_name} · {p.bed_number} · Admission {p.id}</legend><p className="text-sm">{p.pending.length} pending tasks · {p.medications.length} scheduled/overdue doses · {p.vitals ? `Latest vital observation: ${new Date(p.vitals.recorded_at).toLocaleString()}` : 'No vital observations recorded'}</p>{p.pending.map((t: any) => <p className="text-sm" key={t.id}>{t.priority}: {t.title}</p>)}{['situation', 'background', 'assessment', 'recommendation'].map(key => <div key={key}><Label htmlFor={`sbar-${p.id}-${key}`} className="capitalize">{key}</Label><Textarea id={`sbar-${p.id}-${key}`} required value={sbar[p.id]?.[key] || ''} onChange={e => setSbar(previous => ({ ...previous, [p.id]: { ...previous[p.id], [key]: e.target.value } }))}/></div>)}</fieldset>)}
      <Button disabled={busy || !patients.length} className="min-h-11">{busy ? 'Saving…' : 'Sign and send handover'}</Button>
    </form>
    <h3 className="font-semibold">Handover history and incoming acknowledgment</h3>{handovers.map(row => <article key={row.id} className="border rounded p-3 space-y-2"><p>#{row.id} · {row.shift_name} · {row.status} · {row.snapshot.patientCount} patients · From nurse {row.created_by} to {row.receiver_id || 'unassigned'}</p><details><summary className="min-h-11 cursor-pointer">Review patient handover</summary>{row.snapshot.patients.map((p: any) => <div key={p.id} className="p-2"><strong>{p.patient_name} · Admission {p.id}</strong>{Object.entries(row.sbar[p.id] || {}).map(([k, v]) => <p key={k}>{k}: {String(v)}</p>)}</div>)}</details>{row.status === 'sent' && Number(row.receiver_id) === Number(context?.actorId) && <Button disabled={busy} onClick={() => accept(row)} className="min-h-11">Accept handover responsibility</Button>}{row.accepted_at && <p>Accepted {new Date(row.accepted_at).toLocaleString()}</p>}</article>)}
  </section>;
}
