import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '@/utils/api';
import NursingMedicationExtras from '@/components/clinical/NursingMedicationExtras';
import NursingSessionGate from '@/components/clinical/NursingSessionGate';
import { nursingWrite, nursingPost } from '@/services/nursing.service';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
type Dose = {
    scheduleId: number;
    orderId: number;
    orderVersion: number;
    version: number;
    admissionId: number;
    patientId: number;
    patientName: string;
    drugName: string;
    drugCode?: string;
    dose: string;
    doseUnit: string;
    route: string;
    scheduledTime: string;
    wardId: number;
    ward: string;
    status: 'due' | 'late';
};
function MedicationAdministration() {
    const [search] = useSearchParams();
    const navigate = useNavigate();
    const [items, setItems] = useState<Dose[]>([]);
    const [windowMinutes, setWindowMinutes] = useState(240);
    const [wardId, setWardId] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selected, setSelected] = useState<Dose | null>(null);
    const [form, setForm] = useState({ outcome: 'given', doseGiven: '', doseUnitGiven: '', routeUsed: '', administeredTime: '', scannedPatientId: '', scannedDrugCode: '', notGivenReason: '', nurseNotes: '', allergyAcknowledged: false, overrideReason: '', timingReason: '', barcodeExceptionReason: '', witnessEmail: '', witnessPassword: '' });
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await api.get('/v1/emar/due', { params: { windowMinutes, ...(wardId ? { wardId } : {}), ...(search.get('admissionId') ? { admissionId: search.get('admissionId') } : {}) } });
            setItems(result.data.data);
            setError('');
        }
        catch (e: any) {
            setError(e.response?.data?.message || 'Medications could not be loaded. Refresh to retry.');
        }
        finally {
            setLoading(false);
        }
    }, [windowMinutes, wardId, search]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        const warn = (event: BeforeUnloadEvent) => {
            if (selected) {
                event.preventDefault();
                event.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [selected]);
    const choose = (item: Dose) => {
        setSelected(item);
        setMessage('');
        setError('');
        setForm({ outcome: 'given', doseGiven: String(item.dose), doseUnitGiven: item.doseUnit, routeUsed: item.route, administeredTime: new Date().toISOString().slice(0, 16), scannedPatientId: '', scannedDrugCode: '', notGivenReason: '', nurseNotes: '', allergyAcknowledged: false, overrideReason: '', timingReason: '', barcodeExceptionReason: '', witnessEmail: '', witnessPassword: '' });
    };
    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!selected)
            return;
        setBusy(true);
        setError('');
        try {
            let witnessToken: string | undefined;
            if (form.witnessEmail || form.witnessPassword) {
                const verification = await nursingPost('/verification', { email: form.witnessEmail, password: form.witnessPassword, purpose: 'emar.cosign', targetId: selected.scheduleId, admissionId: selected.admissionId });
                witnessToken = verification.token;
            }
            const { witnessEmail, witnessPassword, ...clinical } = form;
            await nursingWrite('/v1/emar/administer', { ...clinical, administeredTime: `${form.administeredTime}:00.000Z`, scheduleId: selected.scheduleId, orderId: selected.orderId, orderVersion: selected.orderVersion, version: selected.version, admissionId: selected.admissionId, patientId: selected.patientId, ...(witnessToken ? { witnessToken } : {}) });
            setSelected(null);
            setMessage('Dose outcome saved.');
            await load();
        }
        catch (e: any) {
            setError(e.response?.data?.message || 'Save was interrupted. Check the dose history before retrying; the same dose cannot be recorded twice.');
            setForm(f => ({ ...f, witnessPassword: '' }));
        }
        finally {
            setBusy(false);
        }
    };
    const field = (key: keyof typeof form, label: string, type = 'text', required = false) => <div className="space-y-1"><Label htmlFor={`emar-${key}`}>{label}</Label><Input id={`emar-${key}`} type={type} value={String(form[key])} required={required} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="min-h-11" autoComplete={type === 'password' ? 'off' : undefined}/></div>;
    const wards = [...new Map(items.map(i => [i.wardId, i.ward])).entries()];
    return <main className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
    <div className="flex flex-wrap gap-3 items-center"><Button variant="outline" onClick={() => navigate(-1)}>Back</Button><h1 className="text-xl font-semibold flex-1">Medication administration</h1><Button variant="outline" disabled={loading || busy} onClick={load}>Refresh</Button></div>
    <p>Verify patient, drug, dose, route, and time against the authorized order.</p>
    <div className="flex flex-wrap gap-3"><label>Due within <select className="border rounded p-2 min-h-11" value={windowMinutes} onChange={e => setWindowMinutes(Number(e.target.value))}>{[120, 240, 480].map(m => <option key={m} value={m}>{m / 60} hours</option>)}</select></label><label>Ward <select className="border rounded p-2 min-h-11" value={wardId} onChange={e => setWardId(e.target.value)}><option value="">All assigned wards</option>{wards.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label></div>
    {error && <p role="alert" className="border border-red-300 bg-red-50 p-3 rounded">{error}</p>}{message && <p role="status" className="bg-green-50 p-3 rounded">{message}</p>}
    {selected && <Card><CardContent className="p-4"><form onSubmit={save} className="space-y-4">
      <h2 className="font-semibold">{selected.patientName} · Patient {selected.patientId} · {selected.drugName}</h2><p>{selected.dose} {selected.doseUnit} via {selected.route} · Scheduled {new Date(selected.scheduledTime).toLocaleString()}</p>
      <label className="block">Outcome <select className="border rounded p-2 min-h-11 ml-2" value={form.outcome} onChange={e => setForm(f => ({ ...f, outcome: e.target.value }))}>{['given', 'late', 'refused', 'held', 'not_given'].map(v => <option key={v}>{v}</option>)}</select></label>
      {['given', 'late'].includes(form.outcome) ? <><div className="grid sm:grid-cols-2 gap-3">{field('doseGiven', 'Actual dose', 'number', true)}{field('doseUnitGiven', 'Dose unit', 'text', true)}{field('routeUsed', 'Actual route', 'text', true)}{field('administeredTime', 'Actual administration time (UTC)', 'datetime-local', true)}{field('scannedPatientId', 'Scan patient wristband ID')}{field('scannedDrugCode', 'Scan medication code')}</div><label className="flex gap-2 items-center min-h-11"><input type="checkbox" checked={form.allergyAcknowledged} onChange={e => setForm(f => ({ ...f, allergyAcknowledged: e.target.checked }))}/>I checked the patient’s allergy status.</label>{field('timingReason', 'Timing exception reason (if outside the scheduled window)')}{field('barcodeExceptionReason', 'Barcode exception reason (requires a second nurse)')}{field('overrideReason', 'Allergy override reason (requires a second nurse)')}<fieldset className="border rounded p-3 space-y-3"><legend>Second nurse verification, when required</legend>{field('witnessEmail', 'Second nurse email', 'email')}{field('witnessPassword', 'Second nurse password', 'password')}</fieldset></> : field('notGivenReason', 'Reason for not giving this dose', 'text', true)}
      <Label htmlFor="emar-notes">Nursing notes</Label><Textarea id="emar-notes" value={form.nurseNotes} onChange={e => setForm(f => ({ ...f, nurseNotes: e.target.value }))}/>
      <div className="flex gap-3"><Button type="submit" disabled={busy} className="min-h-11">{busy ? 'Saving…' : 'Save outcome'}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setSelected(null)}>Cancel</Button></div>
    </form></CardContent></Card>}
    {loading ? <p role="status">Loading due doses…</p> : !items.length ? <p>{error ? 'Medication status is unavailable. Refresh before continuing.' : 'No due doses in your assigned admissions.'}</p> : <div className="space-y-2">{items.map(item => <Card key={item.scheduleId}><CardContent className="p-4 flex flex-wrap gap-3 items-center"><div className="flex-1"><p className="font-semibold">{item.patientName} · {item.ward}</p><p>{item.drugName} · {item.dose} {item.doseUnit} · {item.route}</p><p className={item.status === 'late' ? 'text-red-700' : ''}>{new Date(item.scheduledTime).toLocaleString()} · {item.status === 'late' ? 'Overdue' : 'Due'}</p></div><Button className="min-h-11" disabled={busy} onClick={() => choose(item)}>Record outcome</Button></CardContent></Card>)}</div>}
  <NursingMedicationExtras admissionId={search.get('admissionId')} onDosePrepared={load}/>
  </main>;
}
export default function EMARPage() { return <NursingSessionGate><MedicationAdministration /></NursingSessionGate>; }
