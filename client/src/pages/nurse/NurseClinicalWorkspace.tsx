import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import api from '@/utils/api';
import { nursingGet, nursingPost, nursingWrite } from '@/services/nursing.service';
import { getClinicalPortal } from '@/config/clinicalPortalPaths';
import NursingHandover from '@/components/clinical/NursingHandover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
const tabs = ['notes', 'vitals', 'fluids', 'assessment', 'care plan', 'wounds', 'procedures', 'devices', 'tasks', 'handover', 'history'] as const;
type Tab = typeof tabs[number];
type Draft = Record<string, string>;
const fields: Record<string, Array<[
    string,
    string,
    string?
]>> = {
    notes: [['observationText', 'Nursing note', 'textarea']],
    vitals: [['bpSystolic', 'Systolic BP (mmHg)', 'number'], ['bpDiastolic', 'Diastolic BP (mmHg)', 'number'], ['heartRate', 'Heart rate (bpm)', 'number'], ['spo2', 'SpO₂ (%)', 'number'], ['respiratoryRate', 'Respiratory rate (/min)', 'number'], ['temperature', 'Temperature (°C)', 'number'], ['consciousness', 'Consciousness (A/C/V/P/U)'], ['onOxygen', 'Supplemental oxygen (yes/no)']],
    fluids: [['ioType', 'Type (intake/output)'], ['ioVolumeMl', 'Volume (mL)', 'number'], ['ioDescription', 'Fluid/source'], ['recordedAt', 'Observation time (with timezone)']],
    assessment: [['assessmentType', 'Assessment type (admission/shift/risk/discharge_education)'], ['fallRisk', 'Fall risk'], ['pressureSoreRisk', 'Pressure injury risk'], ['painScore', 'Pain score (0–10)', 'number'], ['mobilityStatus', 'Mobility'], ['nutritionStatus', 'Nutrition'], ['ivAccess', 'IV access'], ['notes', 'Assessment and education notes', 'textarea']],
    'care plan': [['problem', 'Nursing problem', 'textarea'], ['goal', 'Measurable goal', 'textarea'], ['intervention', 'Intervention', 'textarea'], ['dueAt', 'Reassessment due (with timezone)'], ['carePlanId', 'Linked doctor care-plan ID (optional)', 'number']],
    wounds: [['woundType', 'Wound type'], ['bodySite', 'Body site'], ['stage', 'Reviewed stage'], ['lengthCm', 'Length (cm)', 'number'], ['widthCm', 'Width (cm)', 'number'], ['depthCm', 'Depth (cm)', 'number'], ['episodeId', 'Existing episode UUID (blank for new wound)'], ['note', 'Reviewed wound assessment', 'textarea']],
    procedures: [['procedureType', 'Procedure/dressing/device care'], ['note', 'Procedure and response', 'textarea'], ['device', 'Device details'], ['woundRecordId', 'Linked wound record ID (optional)', 'number'], ['reassessAt', 'Reassessment due (with timezone)']],
};
export default function NurseClinicalWorkspace() {
    const portal = getClinicalPortal();
    const location = useLocation();
    const [search, setSearch] = useSearchParams();
    const [alerts, setAlerts] = useState<any[]>([]);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [patients, setPatients] = useState<any[]>([]);
    const [tab, setTab] = useState<Tab>('notes');
    useEffect(() => { if (location.pathname.endsWith('/vitals'))
        setTab('vitals');
    else if (location.pathname.endsWith('/notes'))
        setTab('notes'); }, [location.pathname]);
    const [savedNotes, setSavedNotes] = useState<Record<string, {
        id: number;
        version: number;
        text: string;
    }>>({});
    const autosaving = useRef(false);
    const [drafts, setDrafts] = useState<Record<string, Draft>>({});
    const [data, setData] = useState<any>({ entries: [], goals: [], wounds: [], procedures: [], tasks: [], assessments: [], fluids: [], history: [], devices: [] });
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [actor, setActor] = useState<any>(null);
    const [locked, setLocked] = useState(false);
    const [unlockEmail, setUnlockEmail] = useState('');
    const [password, setPassword] = useState('');
    const [signEntry, setSignEntry] = useState<any>(null);
    const [image, setImage] = useState<File | null>(null);
    const requestGeneration = useRef(0);
    const selected = patients.find(p => String(p.id) === search.get('admissionId'));
    const draftKey = `${selected?.id || ''}:${tab}`;
    const form = drafts[draftKey] || {};
    const dirty = Object.entries(drafts).some(([key, d]) => Object.values(d).some(Boolean) && (key.endsWith(':notes') ? savedNotes[key]?.text !== d.observationText : true));
    const loadPatients = useCallback(async () => {
        setLoading(true);
        try {
            const [rows, context, warningRows, inbox] = await Promise.all([nursingGet('/patients'), nursingGet('/context'), nursingGet('/alerts'), nursingGet('/notifications')]);
            setAlerts(warningRows);
            setNotifications(inbox);
            setPatients(rows);
            setActor(context);
            setError('');
        }
        catch (e: any) {
            setError(e.response?.data?.message || 'Assigned patients could not be loaded.');
        }
        finally {
            setLoading(false);
        }
    }, []);
    const loadChart = useCallback(async () => {
        const generation = ++requestGeneration.current;
        if (!selected)
            return;
        try {
            const id = selected.id;
            const [entries, goals, wounds, procedures, tasks, assessments, fluids, history, devices] = await Promise.all([
                api.get(`/v1/echart/flowsheet/${id}`), nursingGet(`/admissions/${id}/goals`), nursingGet(`/admissions/${id}/wounds`), nursingGet(`/admissions/${id}/interventions`), nursingGet(`/tasks?admissionId=${id}&status=all`), nursingGet(`/assessment/${id}`), api.get(`/v1/echart/io/${id}`), api.get(`/v1/emar/history/${id}`), nursingGet(`/admissions/${id}/device-observations`),
            ]);
            if (generation === requestGeneration.current)
                setData({ entries: entries.data.data, goals, wounds, procedures, tasks, assessments, fluids: fluids.data.data, history: history.data.data, devices });
        }
        catch (e: any) {
            if (generation === requestGeneration.current) {
                setData({ entries: [], goals: [], wounds: [], procedures: [], tasks: [], assessments: [], fluids: [], history: [], devices: [] });
                setError(e.response?.data?.message || 'The chart could not be loaded.');
            }
        }
    }, [selected]);
    useEffect(() => { loadPatients(); }, [loadPatients]);
    useEffect(() => { setData({ entries: [], goals: [], wounds: [], procedures: [], tasks: [], assessments: [], fluids: [], history: [], devices: [] }); setSignEntry(null); setImage(null); loadChart(); return () => { requestGeneration.current++; }; }, [loadChart]);
    useEffect(() => {
        const warn = (e: BeforeUnloadEvent) => {
            if (dirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        const reset = () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                if (portal === 'nurse')
                    setLocked(true);
            }, 5 * 60000);
        };
        ['pointerdown', 'keydown'].forEach(e => window.addEventListener(e, reset));
        reset();
        return () => { clearTimeout(timer); ['pointerdown', 'keydown'].forEach(e => window.removeEventListener(e, reset)); };
    }, [portal]);
    useEffect(() => {
        if (locked || tab !== 'notes' || !selected || !form.observationText?.trim() || savedNotes[draftKey]?.text === form.observationText || autosaving.current)
            return;
        const text = form.observationText;
        const key = draftKey;
        const admissionId = selected.id;
        const timer = setTimeout(async () => {
            autosaving.current = true;
            try {
                const previous = savedNotes[key];
                const result = previous
                    ? await api.patch(`/v1/echart/entries/${previous.id}`, { version: previous.version, observationText: text })
                    : await nursingWrite('/v1/echart/entry', { admissionId, entryType: 'note', observationText: text });
                setSavedNotes(state => ({ ...state, [key]: { id: result.data.data.id, version: result.data.data.version, text } }));
                setMessage('Nursing note draft saved automatically. Review and sign when ready.');
                await loadChart();
            }
            catch (e: any) {
                setError(e.response?.data?.message || 'Automatic save was interrupted. Your draft remains in this session.');
            }
            finally {
                autosaving.current = false;
            }
        }, 2000);
        return () => clearTimeout(timer);
    }, [form.observationText, selected, tab, locked, draftKey, savedNotes]);
    useEffect(() => {
        const lock = () => { setLocked(true); setPassword(''); };
        window.addEventListener('nursing-session-expired', lock);
        return () => window.removeEventListener('nursing-session-expired', lock);
    }, []);
    const unlock = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        try {
            const result = await api.post('/nurse/login', { email: unlockEmail, password }, { skipAuth: true } as any);
            if (Number(result.data.nurse.id) !== Number(actor?.actorId))
                throw new Error('Unlock with the same nurse account to recover your draft.');
            localStorage.setItem('nurseToken', result.data.token);
            setLocked(false);
            setPassword('');
            setError('');
        }
        catch (e: any) {
            setError(e.response?.data?.message || e.message);
        }
        finally {
            setBusy(false);
        }
    };
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selected || autosaving.current)
            return;
        setBusy(true);
        setError('');
        setMessage('');
        try {
            const payload: any = { ...form, admissionId: selected.id };
            for (const [k, , type] of fields[tab] || [])
                if (type === 'number' && payload[k] !== undefined && payload[k] !== '')
                    payload[k] = Number(payload[k]);
            Object.keys(payload).forEach(k => {
                if (payload[k] === '')
                    delete payload[k];
            });
            if (['notes', 'vitals', 'fluids'].includes(tab)) {
                payload.entryType = { notes: 'note', vitals: 'vitals', fluids: 'io' }[tab];
                payload.onOxygen = form.onOxygen?.toLowerCase() === 'yes';
                if (tab === 'notes' && savedNotes[draftKey]) {
                    const saved = savedNotes[draftKey];
                    if (saved.text !== form.observationText)
                        await api.patch(`/v1/echart/entries/${saved.id}`, { version: saved.version, observationText: form.observationText });
                    setSavedNotes(previous => { const next = { ...previous }; delete next[draftKey]; return next; });
                }
                else
                    await nursingWrite('/v1/echart/entry', payload);
            }
            else if (tab === 'assessment')
                await nursingPost('/assessment', payload);
            else if (tab === 'care plan')
                await nursingPost('/goals', payload);
            else if (tab === 'wounds') {
                if (form.reviewed !== 'yes')
                    throw new Error('Confirm your review of the wound measurements and staging.');
                if (image) {
                    const file = new FormData();
                    file.append('image', image);
                    file.append('admissionId', String(selected.id));
                    const uploaded = await api.post('/v1/nursing/images', file);
                    payload.imageRef = uploaded.data.data.imageRef;
                }
                payload.reviewed = true;
                await nursingPost('/wounds', payload);
                setImage(null);
            }
            else if (tab === 'procedures')
                await nursingPost('/interventions', payload);
            setDrafts(previous => { const next = { ...previous }; delete next[draftKey]; return next; });
            setMessage(tab === 'notes' ? 'Draft saved. Sign when reviewed.' : 'Record saved.');
            await loadChart();
        }
        catch (e: any) {
            setError(e.response?.data?.message || e.message || 'Save interrupted. Your draft remains in this session.');
        }
        finally {
            setBusy(false);
        }
    };
    const sign = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selected || !signEntry)
            return;
        setBusy(true);
        try {
            const proof = await nursingPost('/verification', { password, purpose: 'note.sign', targetId: signEntry.id, admissionId: selected.id });
            await nursingWrite(`/v1/echart/entries/${signEntry.id}/sign`, { version: signEntry.version, verificationToken: proof.token });
            setSignEntry(null);
            setPassword('');
            setMessage('Entry signed.');
            await loadChart();
        }
        catch (e: any) {
            setError(e.response?.data?.message || 'Signing failed.');
            setPassword('');
        }
        finally {
            setBusy(false);
        }
    };
    const amend = async (entry: any) => {
        const reason = window.prompt('Reason for amendment');
        if (!reason)
            return;
        const correction: any = { reason };
        if (entry.entry_type === 'io') {
            const volume = window.prompt('Corrected volume in mL', String(entry.io_volume_ml));
            if (volume === null)
                return;
            const direction = window.prompt('Corrected type: intake or output', entry.io_type);
            if (!direction)
                return;
            correction.ioVolumeMl = Number(volume);
            correction.ioType = direction;
        }
        else {
            const text = window.prompt('Corrected note or observation', entry.observation_text || '');
            if (!text)
                return;
            correction.observationText = text;
        }
        try {
            await nursingWrite(`/v1/echart/entries/${entry.id}/amendments`, correction);
            setMessage('Amendment saved. Review and sign it to finalize.');
            await loadChart();
        }
        catch (e: any) {
            setError(e.response?.data?.message || 'Amendment failed.');
        }
    };
    const complete = async (task: any) => {
        try {
            await api.put(`/v1/nursing/tasks/${task.id}/complete`, { version: task.version, notes: '' });
            await loadChart();
        }
        catch (e: any) {
            setError(e.response?.data?.message || 'Task completion failed.');
        }
    };
    const reviewDevice = async (observation: any, decision: string) => {
        const note = window.prompt('Nursing review and reason');
        if (!note)
            return;
        try {
            await nursingPost(`/device-observations/${observation.id}/review`, { decision, note });
            await loadChart();
        }
        catch (e: any) {
            setError(e.response?.data?.message || 'Device review failed.');
        }
    };
    const evaluate = async (goal: any, status: string) => {
        const note = window.prompt('Reassessment findings and progress toward the goal');
        if (!note)
            return;
        try {
            await nursingPost(`/goals/${goal.id}/evaluations`, { version: goal.version, status, note });
            await loadChart();
        }
        catch (e: any) {
            setError(e.response?.data?.message || 'Evaluation failed.');
        }
    };
    if (locked)
        return <main className="p-6 max-w-md mx-auto"><h1 className="text-xl font-semibold">Nursing session locked</h1><p>Sign in with the same nurse account to recover your in-session drafts.</p>{error && <p role="alert">{error}</p>}<form onSubmit={unlock} className="space-y-3"><Label htmlFor="unlock-email">Email</Label><Input id="unlock-email" type="email" required value={unlockEmail} onChange={e => setUnlockEmail(e.target.value)}/><Label htmlFor="unlock-password">Password</Label><Input id="unlock-password" type="password" required value={password} onChange={e => setPassword(e.target.value)}/><Button disabled={busy}>Unlock</Button></form></main>;
    return <main className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
    <header className="flex flex-wrap gap-3 items-center"><h1 className="text-xl font-semibold flex-1">Nursing workspace</h1><Button variant="outline" className="min-h-11" onClick={loadPatients} disabled={busy}>Refresh assignments</Button>{portal === 'nurse' && <Button variant="outline" onClick={() => setLocked(true)}>Lock</Button>}<Link className="underline p-2" to={`/${portal}/emar`}>Ward eMAR</Link></header>
    {error && <p role="alert" className="bg-red-50 border border-red-200 p-3 rounded">{error}</p>}{message && <p role="status" className="bg-green-50 p-3 rounded">{message}</p>}
    <Label htmlFor="nursing-patient">Assigned admission</Label><select id="nursing-patient" className="w-full border rounded p-3 min-h-11" value={selected?.id || ''} onChange={e => setSearch({ admissionId: e.target.value })}><option value="">Select a patient</option>{patients.map(p => <option key={p.id} value={p.id}>{p.ward_name} / {p.bed_number} · {p.patient_name} {p.patient_last_name} · Admission {p.id}</option>)}</select>
    {loading && <p role="status">Loading assigned patients…</p>}{!loading && !patients.length && <p>No active admissions are assigned to your current ward shift. A hospital supervisor can configure assignments in the nursing administration screen.</p>}
    {!!alerts.length && <section aria-label="Clinical alerts" className="border border-red-300 p-3 rounded space-y-2"><h2 className="font-semibold">Clinical alerts requiring review</h2>{alerts.map(a => <article key={a.id}><p>{a.severity} · Admission {a.admission_id} · {a.alert_message}</p>{!a.acknowledged_at && <Button variant="outline" onClick={async () => { try {
        await nursingPost(`/alerts/${a.id}/acknowledge`, {});
        await loadPatients();
    }
    catch (e: any) {
        setError(e.response?.data?.message || 'Alert acknowledgment failed.');
    } }}>Acknowledge clinical review</Button>}</article>)}</section>}
    {!!notifications.filter(n => !n.read_at).length && <section aria-label="Nursing inbox" className="border rounded p-3"><h2 className="font-semibold">Nursing inbox</h2>{notifications.filter(n => !n.read_at).map(n => <article key={n.id}><p>{n.title}: {n.body}</p><Button variant="outline" onClick={async () => { await nursingPost(`/notifications/${n.id}/read`, {}); await loadPatients(); }}>Mark read</Button></article>)}</section>}
    {selected && <>{actor?.role !== 'nurse' && <p className="p-3 bg-blue-50">Sign in with an individual nurse account to document bedside care.</p>}<section className="bg-slate-50 rounded p-3"><h2 className="font-semibold">{selected.patient_name} {selected.patient_last_name} · Patient {selected.patient_id}</h2><p>{selected.ward_name} / {selected.bed_number} · Admission {selected.id}</p><Link className="underline inline-block min-h-11 p-2" to={`/${portal}/emar?admissionId=${selected.id}`}>Open patient eMAR</Link><a className="underline inline-block p-2" href="#" onClick={async (e) => {
                e.preventDefault();
                try {
                    const r = await api.get(`/v1/nursing/admissions/${selected.id}/export`);
                    const url = URL.createObjectURL(new Blob([JSON.stringify(r.data.data, null, 2)], { type: 'application/fhir+json' }));
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `nursing-admission-${selected.id}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                }
                catch {
                    setError('Export failed.');
                }
            }}>Export chart</a></section>
      <nav aria-label="Nursing chart sections" className="flex flex-wrap gap-2">{tabs.map(t => <Button key={t} variant={tab === t ? 'default' : 'outline'} className="min-h-11 capitalize" onClick={() => { setTab(t); setMessage(''); }}>{t}</Button>)}</nav>
      {tab === 'handover' ? <NursingHandover wardId={Number(selected.ward_id)}/> : tab === 'tasks' ? <section className="space-y-3"><Button onClick={async () => {
                    try {
                        await nursingPost('/tasks/auto-generate', { admissionId: selected.id });
                        await loadChart();
                    }
                    catch (e: any) {
                        setError(e.response?.data?.message || 'Could not create tasks.');
                    }
                }}>Create admission tasks</Button>{data.tasks.map((task: any) => <article key={task.id} className="border rounded p-3"><p>{task.priority} · {task.title} · {task.status}</p>{task.status !== 'completed' && <Button className="min-h-11" onClick={() => complete(task)}>Mark complete</Button>}</article>)}</section> : <>
        {fields[tab] && actor?.role === 'nurse' && <form onSubmit={submit} className="border rounded p-4 space-y-4"><h2 className="font-semibold capitalize">Record {tab}</h2><div className="grid sm:grid-cols-2 gap-3">{fields[tab].map(([key, label, type]) => <div key={key} className={type === 'textarea' ? 'sm:col-span-2' : ''}><Label htmlFor={`nursing-${key}`}>{label}</Label>{type === 'textarea' ? <Textarea id={`nursing-${key}`} value={form[key] || ''} onChange={e => setDrafts(previous => ({ ...previous, [draftKey]: { ...form, [key]: e.target.value } }))}/> : <Input id={`nursing-${key}`} className="min-h-11" type={type || 'text'} step={type === 'number' ? 'any' : undefined} value={form[key] || ''} onChange={e => setDrafts(previous => ({ ...previous, [draftKey]: { ...form, [key]: e.target.value } }))}/>}</div>)}</div>
          {tab === 'wounds' && <><Label htmlFor="wound-image">Wound photograph (JPEG/PNG, maximum 5 MB)</Label><Input id="wound-image" type="file" accept="image/jpeg,image/png" onChange={e => setImage(e.target.files?.[0] || null)}/><label className="flex gap-2 min-h-11 items-center"><input type="checkbox" checked={form.reviewed === 'yes'} onChange={e => setDrafts(previous => ({ ...previous, [draftKey]: { ...form, reviewed: e.target.checked ? 'yes' : '' } }))}/>I reviewed the wound measurements and staging.</label></>}
          <p className="text-sm text-slate-600">{tab === 'notes' && savedNotes[draftKey]?.text === form.observationText ? 'Draft saved on the server; review and sign when ready.' : Object.values(form).some(Boolean) ? 'Unsaved changes remain in this session. Save before leaving this page.' : 'No unsaved changes.'}</p><Button className="min-h-11" disabled={busy}>{busy ? 'Saving…' : tab === 'notes' ? 'Save draft' : 'Save record'}</Button>
        </form>}
        {tab === 'fluids' && data.fluids.map((r: any) => <p key={r.summary_date}>{String(r.summary_date).slice(0, 10)} · Intake {r.total_intake_ml} mL · Output {r.total_output_ml} mL · Balance {r.net_balance_ml} mL</p>)}
        {tab === 'assessment' && data.assessments.map((r: any) => <article key={r.id} className="border p-3 rounded"><p>{r.assessment_type} · {new Date(r.assessed_at).toLocaleString()} · Nurse {r.assessed_by}</p><p>{r.notes}</p></article>)}
        {tab === 'care plan' && data.goals.map((g: any) => <article key={g.id} className="border p-3 rounded space-y-2"><strong>{g.problem}</strong><p>Goal: {g.goal} · {g.status}</p><p>Intervention: {g.intervention}</p>{g.evaluations.map((v: any) => <p key={v.id}>{v.status}: {v.note} · Nurse {v.evaluated_by}</p>)}<div className="flex gap-2">{['active', 'met', 'unmet'].map(status => <Button variant="outline" key={status} onClick={() => evaluate(g, status)}>Evaluate: {status}</Button>)}</div></article>)}
        {tab === 'wounds' && data.wounds.map((w: any) => <article key={w.id} className="border p-3 rounded"><p>{w.wound_type} · {w.body_site} · {w.stage} · {w.area_cm2} cm²</p><p>Episode {w.episode_id}</p><p>{w.note} · Reviewed by nurse {w.reviewed_by}</p></article>)}
        {tab === 'devices' && <section className="space-y-3"><h2 className="font-semibold">Device observations awaiting clinical review</h2><p>Device data is never signed or entered in the clinical chart automatically.</p>{data.devices.map((o: any) => <article key={o.id} className="border rounded p-3 space-y-2"><p>{o.label} · {new Date(o.observed_at).toLocaleString()} · {o.status}</p>{Object.entries(o.payload).map(([key, value]) => <p key={key}>{fields.vitals.find(f => f[0] === key)?.[1] || key}: {String(value)}</p>)}{o.status === 'pending' && <div className="flex gap-2"><Button onClick={() => reviewDevice(o, 'accepted')}>Accept reviewed reading</Button><Button variant="outline" onClick={() => reviewDevice(o, 'rejected')}>Reject reading</Button></div>}</article>)}</section>}
        {tab === 'procedures' && data.procedures.map((p: any) => <article key={p.id} className="border p-3 rounded"><p>{p.procedure_type} · {new Date(p.performed_at).toLocaleString()} · Nurse {p.performed_by}</p><p>{p.details.note}</p></article>)}
        {['notes', 'vitals', 'fluids', 'history'].includes(tab) && data.entries.filter((entry: any) => tab === 'history' || entry.entry_type === { notes: 'note', vitals: 'vitals', fluids: 'io' }[tab]).map((entry: any) => <article key={entry.id} className="border rounded p-3 space-y-2"><p>{entry.entry_type} · {new Date(entry.recorded_at).toLocaleString()} · Nurse {entry.recorded_by} · {entry.status}</p>{entry.amends_id && <p>Amends entry #{entry.amends_id}: {entry.amendment_reason}</p>}<p className="whitespace-pre-wrap">{entry.observation_text}</p>{entry.entry_type === 'vitals' && <p>BP {entry.bp_systolic}/{entry.bp_diastolic} · HR {entry.heart_rate} · SpO₂ {entry.spo2} · NEWS2 {entry.entry_data.news2?.score} ({entry.entry_data.news2?.complete ? 'complete' : 'incomplete'})</p>}{entry.entry_type === 'io' && <p>{entry.io_type}: {entry.io_volume_ml} mL</p>}{!entry.signed_at && Number(entry.recorded_by) === Number(actor?.actorId) && actor?.role === 'nurse' && <Button onClick={() => setSignEntry(entry)} variant="outline" className="min-h-11">Review and sign</Button>}{entry.signed_at && <Button onClick={() => amend(entry)} variant="outline" className="min-h-11">Add amendment</Button>}</article>)}
        {tab === 'history' && data.history.map((h: any) => <p key={`dose-${h.id}`}>{h.drug_name} · {h.outcome} · {h.dose_given} {h.dose_unit_given} · Nurse {h.administered_by} · {h.not_given_reason}</p>)}
      </>}
      {signEntry && <form onSubmit={sign} className="border rounded p-4 space-y-3"><h2 className="font-semibold">Sign entry #{signEntry.id}</h2><p>Signing finalizes this entry. Corrections remain visible as amendments.</p><Label htmlFor="nurse-sign-password">Your nurse password</Label><Input id="nurse-sign-password" type="password" autoComplete="off" value={password} onChange={e => setPassword(e.target.value)} required/><div className="flex gap-2"><Button disabled={busy}>Sign entry</Button><Button type="button" variant="outline" onClick={() => { setSignEntry(null); setPassword(''); }}>Cancel</Button></div></form>}
    </>}
  </main>;
}
