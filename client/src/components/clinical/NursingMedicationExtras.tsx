import { useCallback, useEffect, useState } from 'react';
import api from '@/utils/api';
import { nursingWrite, nursingPost } from '@/services/nursing.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
export default function NursingMedicationExtras({ admissionId, onDosePrepared }: {
    admissionId: string | null;
    onDosePrepared: () => Promise<void>;
}) {
    const [orders, setOrders] = useState<any[]>([]), [history, setHistory] = useState<any[]>([]), [events, setEvents] = useState<any[]>([]);
    const [prn, setPrn] = useState(''), [indication, setIndication] = useState('');
    const [form, setForm] = useState({ slot: '', eventType: 'start', rateMlHr: '', reason: '', witnessEmail: '', witnessPassword: '' });
    const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
    const load = useCallback(async () => { if (!admissionId)
        return; try {
        const [o, h, e] = await Promise.all([api.get(`/v1/emar/orders/${admissionId}`), api.get(`/v1/emar/history/${admissionId}`), api.get(`/v1/emar/infusions/${admissionId}`)]);
        setOrders(o.data.data);
        setHistory(h.data.data);
        setEvents(e.data.data);
    }
    catch (e: any) {
        setError(e.response?.data?.message || 'PRN and infusion information could not be loaded.');
    } }, [admissionId]);
    useEffect(() => { setOrders([]); setHistory([]); setEvents([]); load(); }, [load]);
    const prepare = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); try {
        await nursingWrite(`/v1/emar/orders/${prn}/prn-slot`, { indication });
        setIndication('');
        setMessage('PRN slot prepared. Verify and record its outcome in eMAR.');
        await onDosePrepared();
        await load();
    }
    catch (e: any) {
        setError(e.response?.data?.message || 'PRN preparation failed.');
    }
    finally {
        setBusy(false);
    } };
    const infusion = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        try {
            const dose = history.find(d => String(d.id) === form.slot);
            if (!dose)
                throw new Error('Choose an administered infusion dose.');
            let witnessToken;
            if (form.witnessEmail || form.witnessPassword) {
                const proof = await nursingPost('/verification', { email: form.witnessEmail, password: form.witnessPassword, purpose: 'emar.cosign', action: `infusion.${form.eventType}`, targetId: dose.id, admissionId: Number(admissionId) });
                witnessToken = proof.token;
            }
            await nursingWrite('/v1/emar/infusions', { orderId: dose.order_id, orderVersion: dose.order_version, scheduleId: dose.id, eventType: form.eventType, rateMlHr: Number(form.rateMlHr), reason: form.reason, ...(witnessToken ? { witnessToken } : {}) });
            setForm(f => ({ ...f, witnessPassword: '', reason: '' }));
            setMessage('Infusion event recorded.');
            await load();
        }
        catch (e: any) {
            setError(e.response?.data?.message || e.message || 'Infusion event failed.');
            setForm(f => ({ ...f, witnessPassword: '' }));
        }
        finally {
            setBusy(false);
        }
    };
    if (!admissionId)
        return <p className="text-sm">Select a patient in the nursing workspace to view PRN orders and infusion tracking.</p>;
    const infusions = history.filter(d => d.infusion_rate_ml_hr && ['given', 'late'].includes(d.outcome));
    return <section className="space-y-4">{error && <p role="alert" className="p-3 bg-red-50">{error}</p>}{message && <p role="status" className="p-3 bg-green-50">{message}</p>}
    {!!orders.filter(o => o.prn).length && <form onSubmit={prepare} className="border rounded p-4 space-y-3"><h2 className="font-semibold">PRN medication</h2><Label htmlFor="prn-order">Authorized order</Label><select id="prn-order" required className="min-h-11 border p-2 rounded w-full" value={prn} onChange={e => setPrn(e.target.value)}><option value="">Select PRN order</option>{orders.filter(o => o.prn).map(o => <option key={o.id} value={o.id}>{o.drug_name} · {o.dose} {o.dose_unit} · Minimum {o.prn_min_hours} hours between doses · Maximum {o.prn_max_24h}/24h</option>)}</select><Label htmlFor="prn-indication">Indication and assessment</Label><Input id="prn-indication" required value={indication} onChange={e => setIndication(e.target.value)}/><Button disabled={busy}>Prepare PRN dose</Button></form>}
    {!!infusions.length && <form onSubmit={infusion} className="border rounded p-4 space-y-3"><h2 className="font-semibold">Infusion tracking</h2><Label htmlFor="infusion-dose">Administered infusion dose</Label><select id="infusion-dose" required className="min-h-11 border p-2 rounded w-full" value={form.slot} onChange={e => setForm(f => ({ ...f, slot: e.target.value }))}><option value="">Select infusion</option>{infusions.map(d => <option key={d.id} value={d.id}>{d.drug_name} · Authorized {d.infusion_rate_ml_hr} mL/h · Dose {d.id}</option>)}</select><Label htmlFor="infusion-type">Event</Label><select id="infusion-type" className="min-h-11 border p-2 rounded w-full" value={form.eventType} onChange={e => setForm(f => ({ ...f, eventType: e.target.value }))}>{['start', 'rate_change', 'stop'].map(t => <option key={t}>{t}</option>)}</select>{(['rateMlHr', 'reason', 'witnessEmail', 'witnessPassword'] as const).map(key => <div key={key}><Label htmlFor={`infusion-${key}`}>{({ rateMlHr: 'Actual rate (mL/h; must match the current order)', reason: 'Assessment/reason', witnessEmail: 'Second nurse email (high-alert drugs)', witnessPassword: 'Second nurse password' } as const)[key]}</Label><Input id={`infusion-${key}`} type={key === 'witnessPassword' ? 'password' : key === 'witnessEmail' ? 'email' : key === 'rateMlHr' ? 'number' : 'text'} step={key === 'rateMlHr' ? 'any' : undefined} required={key === 'reason' || (key === 'rateMlHr' && form.eventType !== 'stop')} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}/></div>)}<Button disabled={busy}>Record infusion event</Button></form>}
    {!!events.length && <section className="border rounded p-3"><h2 className="font-semibold">Infusion history</h2>{events.map(e => <p key={e.id}>{new Date(e.created_at).toLocaleString()} · {e.event_type} · {e.rate_ml_hr ?? 'stopped'} mL/h · Nurse {e.recorded_by} · {e.reason}</p>)}</section>}
  </section>;
}
