/**
 * Lab PACS Settings — Orthanc status, modality registry, C-FIND / C-MOVE pull.
 * Visual language aligned with Mediqzy Lab Portal (primary cyan + accent emerald).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LabLayout from '@/components/lab/LabLayout';
import ClinicLayout from '@/components/clinic/ClinicLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Activity,
  ArrowRight,
  HardDrive,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Download,
  Trash2,
  Wifi,
  AlertTriangle,
  CheckCircle2,
  ScanLine,
  Server,
  Cable,
  Radio,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/utils/api';

const IS_CLINIC = typeof window !== 'undefined' && window.location.pathname.startsWith('/clinic/');
const TOKEN_KEY = IS_CLINIC ? 'clinicToken' : 'labToken';
const LOGIN_PATH = IS_CLINIC ? '/clinic/login' : '/lab/login';
const RIS_PATH = IS_CLINIC ? '/clinic/ris' : '/lab/ris';
const PortalLayout = IS_CLINIC ? ClinicLayout : LabLayout;

type Modality = {
  id: number;
  name: string;
  ae_title: string;
  host: string;
  port: number;
  modality_type: string;
  manufacturer?: string;
  model?: string;
  location?: string;
  status: string;
  orthanc_synced: boolean;
};

type Preset = { type: string; label: string; defaultPort: number; manufacturer: string };

type QueryHit = {
  studyInstanceUID: string;
  patientName?: string;
  patientId?: string;
  studyDate?: string;
  studyDescription?: string;
  modalitiesInStudy?: string;
  accessionNumber?: string;
};

const emptyForm = {
  name: '',
  ae_title: '',
  host: '',
  port: '104',
  modality_type: 'CT',
  manufacturer: '',
  model: '',
  location: '',
};

const MODALITY_TONE: Record<string, string> = {
  CT: 'from-sky-500/20 to-cyan-500/5 text-sky-700 dark:text-sky-300 border-sky-500/30',
  MR: 'from-violet-500/15 to-indigo-500/5 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
  US: 'from-teal-500/20 to-emerald-500/5 text-teal-700 dark:text-teal-300 border-teal-500/30',
  DX: 'from-amber-500/15 to-orange-500/5 text-amber-800 dark:text-amber-300 border-amber-500/30',
  CR: 'from-amber-500/15 to-orange-500/5 text-amber-800 dark:text-amber-300 border-amber-500/30',
  PX: 'from-cyan-500/20 to-sky-500/5 text-cyan-800 dark:text-cyan-300 border-cyan-500/30',
  IO: 'from-sky-500/15 to-blue-500/5 text-sky-800 dark:text-sky-300 border-sky-500/30',
  RF: 'from-orange-500/20 to-amber-500/5 text-orange-800 dark:text-orange-300 border-orange-500/30',
  XA: 'from-rose-500/15 to-pink-500/5 text-rose-700 dark:text-rose-300 border-rose-500/30',
};

function modalityTone(type: string) {
  return MODALITY_TONE[type] || 'from-primary/15 to-accent/5 text-primary border-primary/25';
}

export default function LabPacsDevices() {
  const navigate = useNavigate();
  const token = localStorage.getItem(TOKEN_KEY);

  const [pacs, setPacs] = useState<{ online?: boolean; aet?: string; dicomPort?: number; url?: string; message?: string } | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [localAet, setLocalAet] = useState('MEDICZY');
  const [localPort, setLocalPort] = useState(4242);
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const [activeDevice, setActiveDevice] = useState<Modality | null>(null);
  const [queryForm, setQueryForm] = useState({
    patient_name: '',
    patient_id: '',
    study_date: '',
    modalities_in_study: '',
  });
  const [queryHits, setQueryHits] = useState<QueryHit[]>([]);
  const [querying, setQuerying] = useState(false);
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [retrieving, setRetrieving] = useState(false);
  const [echoing, setEchoing] = useState<string | null>(null);

  useEffect(() => {
    if (!token) navigate(LOGIN_PATH);
  }, [token, navigate]);

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [healthRes, presetRes, listRes] = await Promise.all([
        api.get('/dicom/health', { headers: authHeaders }).catch((e) => ({ data: e?.response?.data })),
        api.get('/dicom/presets', { headers: authHeaders }),
        api.get('/dicom/modalities', { headers: authHeaders }),
      ]);

      if (healthRes?.data?.pacs) setPacs(healthRes.data.pacs);
      else if (healthRes?.data?.success === false) {
        setPacs({ online: false, message: healthRes.data.message, url: healthRes.data.pacs?.url });
      }

      setPresets(presetRes.data?.presets || []);
      setLocalAet(presetRes.data?.local_aet || 'MEDICZY');
      setLocalPort(presetRes.data?.local_port || 4242);
      setModalities(listRes.data?.modalities || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load PACS devices');
    } finally {
      setLoading(false);
    }
  }, [token, authHeaders]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!success && !error) return;
    const t = setTimeout(() => {
      setSuccess(null);
      setError(null);
    }, 6000);
    return () => clearTimeout(t);
  }, [success, error]);

  const applyPreset = (type: string) => {
    const p = presets.find((x) => x.type === type);
    setForm((f) => ({
      ...f,
      modality_type: type,
      port: String(p?.defaultPort || 104),
      manufacturer: f.manufacturer || p?.manufacturer || '',
      name: f.name || `${type.toLowerCase()}-1`,
      ae_title: f.ae_title || `${type}SCAN01`.slice(0, 16),
    }));
  };

  const saveDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post(
        '/dicom/modalities',
        { ...form, port: Number(form.port) },
        { headers: authHeaders },
      );
      setSuccess(`Registered ${form.modality_type} device “${form.name}”`);
      setShowForm(false);
      setForm(emptyForm);
      await refresh();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to register device');
    } finally {
      setSaving(false);
    }
  };

  const removeDevice = async (name: string) => {
    if (!confirm(`Remove DICOM peer “${name}”?`)) return;
    try {
      await api.delete(`/dicom/modalities/${encodeURIComponent(name)}`, { headers: authHeaders });
      if (activeDevice?.name === name) {
        setActiveDevice(null);
        setQueryHits([]);
      }
      await refresh();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Delete failed');
    }
  };

  const echoDevice = async (name: string) => {
    setEchoing(name);
    setError(null);
    setSuccess(null);
    try {
      await api.post(`/dicom/modalities/${encodeURIComponent(name)}/echo`, {}, { headers: authHeaders });
      setSuccess(`C-ECHO OK — ${name} is reachable`);
    } catch (err: any) {
      setError(err?.response?.data?.message || `C-ECHO failed for ${name}`);
    } finally {
      setEchoing(null);
    }
  };

  const runQuery = async () => {
    if (!activeDevice) return;
    setQuerying(true);
    setError(null);
    setQueryHits([]);
    setSelectedUids(new Set());
    try {
      const body: Record<string, string> = {};
      if (queryForm.patient_name) body.patient_name = queryForm.patient_name;
      if (queryForm.patient_id) body.patient_id = queryForm.patient_id;
      if (queryForm.study_date) body.study_date = queryForm.study_date.replace(/-/g, '');
      body.modalities_in_study = queryForm.modalities_in_study || activeDevice.modality_type;

      const { data } = await api.post(
        `/dicom/modalities/${encodeURIComponent(activeDevice.name)}/query`,
        body,
        { headers: authHeaders, timeout: 120000 },
      );
      setQueryHits(data.answers || []);
      if (!(data.answers || []).length) setSuccess('Query returned no studies');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'C-FIND query failed');
    } finally {
      setQuerying(false);
    }
  };

  const toggleUid = (uid: string) => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const retrieveSelected = async () => {
    if (!activeDevice || !selectedUids.size) return;
    setRetrieving(true);
    setError(null);
    try {
      const { data } = await api.post(
        `/dicom/modalities/${encodeURIComponent(activeDevice.name)}/retrieve`,
        { study_instance_uids: Array.from(selectedUids) },
        { headers: authHeaders, timeout: 300000 },
      );
      setSuccess(data.message || `Retrieve started for ${selectedUids.size} study(ies)`);
      setSelectedUids(new Set());
    } catch (err: any) {
      setError(err?.response?.data?.message || 'C-MOVE retrieve failed');
    } finally {
      setRetrieving(false);
    }
  };

  const syncedCount = modalities.filter((m) => m.orthanc_synced).length;
  const presetList = (presets.length
    ? presets
    : ([
        { type: 'CT', label: 'CT', defaultPort: 104, manufacturer: '' },
        { type: 'MR', label: 'MRI', defaultPort: 104, manufacturer: '' },
        { type: 'US', label: 'USG', defaultPort: 104, manufacturer: '' },
        { type: 'DX', label: 'Digital X-ray', defaultPort: 104, manufacturer: '' },
      ] as Preset[])).slice(0, 12);

  return (
    <PortalLayout title="PACS Settings" subtitle={IS_CLINIC ? 'OPG · C-arm · cath lab · Orthanc' : 'Orthanc · modalities · study pull'}>
      <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
        {/* Atmosphere — brand cyan/emerald wash, not flat grey */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_hsl(var(--primary)_/_0.12),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_hsl(var(--accent)_/_0.10),_transparent_50%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-[0.2]"
          style={{
            backgroundImage:
              'linear-gradient(hsl(var(--foreground) / 0.03) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground) / 0.03) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'linear-gradient(to bottom, black 0%, transparent 85%)',
          }}
        />

        <div className="relative mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 animate-in fade-in duration-500">
          {/* Brand + actions */}
          <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3 max-w-xl">
              <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-600/25">
                  <HardDrive className="h-3.5 w-3.5" />
                </span>
                Mediqzy Imaging
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                PACS Settings
              </h1>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:text-base">
                {IS_CLINIC
                  ? 'Connect dental OPG, intra-oral, C-arm, and cath-lab angiogram units to Orthanc, then open the clinic imaging worklist.'
                  : 'Connect scanners (including cath lab XA) to Orthanc, verify DICOM peers, and pull studies into the RIS worklist.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={refresh}
                disabled={loading}
                className="border-slate-200 bg-white/80 backdrop-blur dark:border-slate-700 dark:bg-slate-900/70"
              >
                <RefreshCw className={cn('mr-2 h-3.5 w-3.5', loading && 'animate-spin')} />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() => setShowForm(true)}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-600/20 hover:from-emerald-600 hover:to-teal-700"
              >
                <Plus className="mr-2 h-3.5 w-3.5" />
                Add modality
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(RIS_PATH)}
                className="border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
              >
                <ScanLine className="mr-2 h-3.5 w-3.5" />
                {IS_CLINIC ? 'Open imaging' : 'Open RIS'}
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          </header>

          {/* Live Orthanc strip */}
          <section
            className={cn(
              'relative overflow-hidden rounded-2xl border p-5 sm:p-6 transition-colors duration-300',
              pacs?.online
                ? 'border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-white/80 to-teal-500/5 dark:from-emerald-500/15 dark:via-slate-900/80 dark:to-teal-500/10'
                : 'border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-white/80 to-orange-500/5 dark:from-amber-500/10 dark:via-slate-900/80 dark:to-orange-500/5',
            )}
          >
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <div
                  className={cn(
                    'mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
                    pacs?.online
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
                  )}
                >
                  {pacs?.online ? <CheckCircle2 className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">
                    {pacs?.online ? 'Orthanc PACS online' : 'Orthanc offline or unreachable'}
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {pacs?.online
                      ? 'Ready to accept C-STORE pushes and modality pulls.'
                      : pacs?.message || 'Start Orthanc on this host, then refresh.'}
                  </p>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:min-w-[22rem]">
                <div className="rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2.5 dark:border-slate-700/80 dark:bg-slate-950/40">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Local AE</dt>
                  <dd className="mt-0.5 font-mono text-sm font-semibold text-slate-900 dark:text-white">{localAet}</dd>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2.5 dark:border-slate-700/80 dark:bg-slate-950/40">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">DICOM port</dt>
                  <dd className="mt-0.5 font-mono text-sm font-semibold text-slate-900 dark:text-white">{localPort}</dd>
                </div>
                <div className="col-span-2 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2.5 sm:col-span-1 dark:border-slate-700/80 dark:bg-slate-950/40">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Devices</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                    {modalities.length} registered
                    <span className="ml-1 font-normal text-slate-500">· {syncedCount} synced</span>
                  </dd>
                </div>
              </dl>
            </div>
            {pacs?.url && (
              <p className="mt-4 truncate font-mono text-[11px] text-slate-500 dark:text-slate-500">{pacs.url}</p>
            )}
          </section>

          {/* How to connect — one purpose */}
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="group rounded-2xl border border-slate-200/90 bg-white/70 p-5 backdrop-blur transition hover:border-primary/30 dark:border-slate-700/80 dark:bg-slate-900/50">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Radio className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Push from the scanner</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Configure C-STORE destination AE{' '}
                <span className="font-mono text-primary">{localAet}</span> on port{' '}
                <span className="font-mono text-primary">{localPort}</span>. Studies land in Orthanc automatically.
              </p>
            </div>
            <div className="group rounded-2xl border border-slate-200/90 bg-white/70 p-5 backdrop-blur transition hover:border-accent/40 dark:border-slate-700/80 dark:bg-slate-900/50">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Cable className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Pull from this console</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Register the modality below, run C-ECHO, then C-FIND / C-MOVE to import studies into the RIS worklist.
              </p>
            </div>
          </section>

          {/* Toasts */}
          {(error || success) && (
            <div
              role="status"
              className={cn(
                'flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm animate-in slide-in-from-top-2 duration-300',
                error
                  ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100',
              )}
            >
              <span className="flex items-start gap-2">
                {error ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
                {error || success}
              </span>
              <button
                type="button"
                className="shrink-0 opacity-60 hover:opacity-100"
                onClick={() => {
                  setError(null);
                  setSuccess(null);
                }}
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Register form */}
          {showForm && (
            <form
              onSubmit={saveDevice}
              className="rounded-2xl border border-primary/20 bg-white/90 p-5 shadow-lg shadow-primary/5 backdrop-blur animate-in zoom-in-95 fade-in duration-200 dark:border-emerald-500/20 dark:bg-slate-900/90 sm:p-6"
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">Register modality</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">AE Title, host, and port for Orthanc DICOM peers</p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>

              <div className="mb-5 flex flex-wrap gap-2">
                {presetList.map((p) => (
                  <button
                    key={p.type}
                    type="button"
                    onClick={() => applyPreset(p.type)}
                    className={cn(
                      'rounded-md border px-3 py-1.5 text-xs font-semibold transition',
                      form.modality_type === p.type
                        ? 'border-transparent bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-sm'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-primary/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
                    )}
                  >
                    {p.label || p.type}
                  </button>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600 dark:text-slate-400">Device name *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="ct-room-1"
                    required
                    className="bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600 dark:text-slate-400">AE Title *</Label>
                  <Input
                    value={form.ae_title}
                    onChange={(e) => setForm({ ...form, ae_title: e.target.value.toUpperCase().slice(0, 16) })}
                    placeholder="CTSCAN01"
                    required
                    className="font-mono bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600 dark:text-slate-400">Host / IP *</Label>
                  <Input
                    value={form.host}
                    onChange={(e) => setForm({ ...form, host: e.target.value })}
                    placeholder="192.168.1.50"
                    required
                    className="font-mono bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600 dark:text-slate-400">DICOM port *</Label>
                  <Input
                    value={form.port}
                    onChange={(e) => setForm({ ...form, port: e.target.value })}
                    required
                    className="font-mono bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600 dark:text-slate-400">Manufacturer</Label>
                  <Input
                    value={form.manufacturer}
                    onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                    placeholder="GE / Siemens / Philips…"
                    className="bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-600 dark:text-slate-400">Model</Label>
                    <Input
                      value={form.model}
                      onChange={(e) => setForm({ ...form, model: e.target.value })}
                      className="bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-600 dark:text-slate-400">Location</Label>
                    <Input
                      value={form.location}
                      onChange={(e) => setForm({ ...form, location: e.target.value })}
                      placeholder="Room"
                      className="bg-white dark:bg-slate-950"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-600/20"
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save & sync to Orthanc
                </Button>
              </div>
            </form>
          )}

          {/* Devices + pull — interaction containers */}
          <section className="grid gap-5 lg:grid-cols-2">
            <div className="flex min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white/80 backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/60">
              <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-3.5 dark:border-slate-700/80">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Registered devices</h2>
                </div>
                <span className="text-xs tabular-nums text-slate-500">{modalities.length}</span>
              </div>

              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex h-48 items-center justify-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    Loading modalities…
                  </div>
                ) : !modalities.length ? (
                  <div className="flex h-48 flex-col items-center justify-center gap-3 px-6 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <HardDrive className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">No scanners yet</p>
                    <p className="max-w-xs text-xs text-slate-500">
                      Add a CT, MRI, USG, or digital X-ray so you can echo and pull studies.
                    </p>
                    <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add modality
                    </Button>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {modalities.map((m) => {
                      const active = activeDevice?.id === m.id;
                      return (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveDevice(m);
                              setQueryForm((q) => ({ ...q, modalities_in_study: m.modality_type }));
                              setQueryHits([]);
                            }}
                            className={cn(
                              'flex w-full items-start gap-3 px-5 py-4 text-left transition',
                              active
                                ? 'bg-gradient-to-r from-primary/10 to-transparent dark:from-emerald-500/15'
                                : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/50',
                            )}
                          >
                            <div
                              className={cn(
                                'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-gradient-to-br text-xs font-bold',
                                modalityTone(m.modality_type),
                              )}
                            >
                              {m.modality_type}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate font-semibold text-slate-900 dark:text-white">{m.name}</span>
                                {m.orthanc_synced ? (
                                  <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                                    Synced
                                  </span>
                                ) : (
                                  <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                                    Pending
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 truncate font-mono text-[11px] text-slate-500">
                                {m.ae_title}@{m.host}:{m.port}
                              </p>
                              {(m.manufacturer || m.location) && (
                                <p className="mt-0.5 truncate text-xs text-slate-500">
                                  {[m.manufacturer, m.model, m.location].filter(Boolean).join(' · ')}
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-8 w-8"
                                disabled={echoing === m.name}
                                title="C-ECHO"
                                onClick={() => echoDevice(m.name)}
                              >
                                {echoing === m.name ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Wifi className="h-3.5 w-3.5" />
                                )}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                                title="Remove"
                                onClick={() => removeDevice(m.name)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white/80 backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/60">
              <div className="flex items-center gap-2 border-b border-slate-200/80 px-5 py-3.5 dark:border-slate-700/80">
                <Activity className="h-4 w-4 text-accent" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Pull studies
                  {activeDevice ? (
                    <span className="ml-1.5 font-normal text-slate-500">from {activeDevice.name}</span>
                  ) : null}
                </h2>
              </div>

              {!activeDevice ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
                    <Search className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Select a device</p>
                  <p className="max-w-xs text-xs text-slate-500">
                    Choose a registered modality to run C-FIND and pull studies with C-MOVE.
                  </p>
                </div>
              ) : (
                <div className="flex flex-1 flex-col gap-4 p-5">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      placeholder="Patient name"
                      value={queryForm.patient_name}
                      onChange={(e) => setQueryForm({ ...queryForm, patient_name: e.target.value })}
                      className="bg-white dark:bg-slate-950"
                    />
                    <Input
                      placeholder="Patient ID"
                      value={queryForm.patient_id}
                      onChange={(e) => setQueryForm({ ...queryForm, patient_id: e.target.value })}
                      className="bg-white dark:bg-slate-950"
                    />
                    <Input
                      type="date"
                      value={queryForm.study_date}
                      onChange={(e) => setQueryForm({ ...queryForm, study_date: e.target.value })}
                      className="bg-white dark:bg-slate-950"
                    />
                    <Input
                      placeholder="Modalities (CT\\MR\\US\\DX)"
                      value={queryForm.modalities_in_study}
                      onChange={(e) => setQueryForm({ ...queryForm, modalities_in_study: e.target.value })}
                      className="font-mono text-xs bg-white dark:bg-slate-950"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={runQuery}
                      disabled={querying}
                      className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-600/20"
                    >
                      {querying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                      Query (C-FIND)
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!selectedUids.size || retrieving}
                      onClick={retrieveSelected}
                      className="border-primary/30"
                    >
                      {retrieving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                      Pull selected ({selectedUids.size})
                    </Button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                    {!queryHits.length ? (
                      <p className="p-5 text-center text-xs text-slate-500">No query results yet.</p>
                    ) : (
                      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {queryHits.map((hit) => {
                          const uid = hit.studyInstanceUID;
                          if (!uid) return null;
                          const checked = selectedUids.has(uid);
                          return (
                            <li key={uid}>
                              <label className="flex cursor-pointer gap-3 px-4 py-3 transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleUid(uid)}
                                  className="mt-1 accent-[hsl(var(--primary))]"
                                />
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-medium text-slate-900 dark:text-white">
                                    {hit.patientName || 'Unknown'} · {hit.patientId || '—'}
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {hit.studyDate || '—'} · {hit.modalitiesInStudy || activeDevice.modality_type} ·{' '}
                                    {hit.studyDescription || 'Study'}
                                  </div>
                                  <div className="truncate font-mono text-[10px] text-slate-400">{uid}</div>
                                </div>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </PortalLayout>
  );
}
