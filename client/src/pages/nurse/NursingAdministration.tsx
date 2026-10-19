import { useCallback, useEffect, useState } from 'react';
import { nursingGet, nursingPost } from '@/services/nursing.service';
import api from '@/utils/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from 'react-router-dom';
export default function NursingAdministration() {
    const [directory, setDirectory] = useState<any>({ nurses: [], wards: [] });
    const [assignments, setAssignments] = useState<any[]>([]);
    const [metrics, setMetrics] = useState<any>(null);
    const [settings, setSettings] = useState<any>({ timezone: 'Asia/Kolkata', barcode_required: true });
    const [form, setForm] = useState({ nurseId: '', wardId: '', shiftName: 'day', startsAt: '', endsAt: '' });
    const [staffLink, setStaffLink] = useState({ actorId: '', userId: '' });
    const [device, setDevice] = useState({ admissionId: '', label: '', publicKey: '' });
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const load = useCallback(async () => {
        try {
            const [d, a, m, s] = await Promise.all([nursingGet('/directory'), nursingGet('/assignments'), nursingGet('/metrics'), nursingGet('/settings')]);
            setDirectory(d);
            setAssignments(a);
            setMetrics(m);
            setSettings(s);
            setError('');
        }
        catch (e: any) {
            setError(e.response?.data?.message || 'Nursing administration could not be loaded.');
        }
    }, []);
    useEffect(() => { load(); }, [load]);
    const create = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        try {
            await nursingPost('/assignments', { ...form, nurseId: Number(form.nurseId), wardId: Number(form.wardId) });
            await load();
        }
        catch (e: any) {
            setError(e.response?.data?.message || 'Assignment failed.');
        }
        finally {
            setBusy(false);
        }
    };
    const policy = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.put('/v1/nursing/settings', { timezone: settings.timezone, barcodeRequired: settings.barcode_required, aiEnabled: settings.ai_enabled === true });
            await load();
        }
        catch (e: any) {
            setError(e.response?.data?.message || 'Policy update failed.');
        }
    };
    return <main className="p-4 md:p-6 max-w-5xl mx-auto space-y-4"><h1 className="text-xl font-semibold">Nursing administration</h1><Link to="/hospital/nursing" className="underline">Open nursing workspace</Link>{error && <p role="alert" className="p-3 bg-red-50">{error}</p>}
    <section className="border rounded p-4 space-y-3"><h2 className="font-semibold">Ward shift assignments</h2><form onSubmit={create} className="grid sm:grid-cols-2 gap-3">{(['nurseId', 'wardId'] as const).map(key => <div key={key}><Label htmlFor={key}>{key === 'nurseId' ? 'Nurse' : 'Ward'}</Label><select id={key} className="block w-full min-h-11 border rounded p-2" required value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}><option value="">Select</option>{(key === 'nurseId' ? directory.nurses : directory.wards).map((row: any) => <option key={row.id} value={row.id}>{row.name || row.email} (#{row.id})</option>)}</select></div>)}{(['shiftName', 'startsAt', 'endsAt'] as const).map(key => <div key={key}><Label htmlFor={key}>{key === 'shiftName' ? 'Shift' : key === 'startsAt' ? 'Starts (include timezone)' : 'Ends (include timezone)'}</Label><Input id={key} className="min-h-11" required value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}/></div>)}<Button disabled={busy} className="min-h-11">Assign shift</Button></form>{assignments.map(a => <div key={a.id} className="border-t py-2 flex flex-wrap items-center gap-2"><p className="flex-1">Nurse {a.nurse_id} · {a.ward_name} · {a.shift_name} · {new Date(a.starts_at).toLocaleString()} → {new Date(a.ends_at).toLocaleString()} {a.revoked_at ? '(revoked)' : ''}</p>{!a.revoked_at && <Button variant="outline" onClick={async () => {
                    try {
                        await api.delete(`/v1/nursing/assignments/${a.id}`);
                        await load();
                    }
                    catch (e: any) {
                        setError(e.response?.data?.message || 'Revocation failed.');
                    }
                }}>Revoke</Button>}</div>)}</section>
    <form onSubmit={policy} className="border rounded p-4 space-y-3"><h2 className="font-semibold">Facility policy</h2><Label htmlFor="facility-timezone">Timezone</Label><Input id="facility-timezone" value={settings.timezone} onChange={e => setSettings((s: any) => ({ ...s, timezone: e.target.value }))}/><label className="flex gap-2 min-h-11 items-center"><input type="checkbox" checked={settings.barcode_required} onChange={e => setSettings((s: any) => ({ ...s, barcode_required: e.target.checked }))}/>Require patient and drug barcodes; exceptions need second-nurse verification</label><label className="flex gap-2 min-h-11 items-center"><input type="checkbox" checked={settings.ai_enabled === true} onChange={e => setSettings((s: any) => ({ ...s, ai_enabled: e.target.checked }))}/>Allow reviewed SBAR draft assistance using the configured AI provider</label><Button>Save policy</Button></form>
    <section className="border rounded p-4 space-y-3"><h2 className="font-semibold">Prescriber identity mapping</h2><p>Link the hospital doctor account to its verified HR staff record. The staff record also needs an active prescribing qualification and privilege.</p><form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); try {
        await nursingPost('/staff-links', { role: 'doctor', actorId: Number(staffLink.actorId), userId: Number(staffLink.userId) });
        setError('');
    }
    catch (e: any) {
        setError(e.response?.data?.message || 'Identity mapping failed.');
    } }}>{(['actorId', 'userId'] as const).map(key => <div key={key}><Label htmlFor={`staff-${key}`}>{key === 'actorId' ? 'Doctor account ID' : 'HR staff user ID'}</Label><Input id={`staff-${key}`} required type="number" min="1" value={staffLink[key]} onChange={e => setStaffLink(s => ({ ...s, [key]: e.target.value }))}/></div>)}<Button>Link verified staff identity</Button></form></section>
        <section className="border rounded p-4 space-y-3"><h2 className="font-semibold">Device admission binding</h2><p>Register the device’s Ed25519 public key. Its private key stays on the device. Observations await nurse review.</p><form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); try {
        const result = await nursingPost('/devices', { ...device, admissionId: Number(device.admissionId) });
        setError(`Device registered: ${result.id}`);
    }
    catch (e: any) {
        setError(e.response?.data?.message || 'Device registration failed.');
    } }}>{(['admissionId', 'label', 'publicKey'] as const).map(key => <div key={key}><Label htmlFor={`device-${key}`}>{key === 'admissionId' ? 'Admission ID' : key === 'label' ? 'Device label' : 'Ed25519 public key (PEM)'}</Label><Input id={`device-${key}`} required value={device[key]} onChange={e => setDevice(s => ({ ...s, [key]: e.target.value }))}/></div>)}<Button>Register device</Button></form></section>
        {metrics && <section className="border rounded p-4 space-y-2"><h2 className="font-semibold">Operational checks</h2>{Object.entries(metrics).map(([key, value]) => <p key={key}>{key.replace(/_/g, ' ')}: {String(value)}</p>)}<Button variant="outline" onClick={async () => {
                try {
                    await nursingPost('/events/dispatch', {});
                    await load();
                }
                catch (e: any) {
                    setError(e.response?.data?.message || 'Event delivery failed.');
                }
            }}>Deliver pending inbox events</Button></section>}
  </main>;
}
