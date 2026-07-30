/**
 * Lab PACS Devices — register CT / MRI / USG / Digital X-ray DICOM peers
 * and pull studies into Orthanc via C-FIND + C-MOVE.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LabLayout from '@/components/lab/LabLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Activity,
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
} from 'lucide-react';
import api from '@/utils/api';

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

export default function LabPacsDevices() {
  const navigate = useNavigate();
  const token = localStorage.getItem('labToken');

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
    if (!token) navigate('/lab/login');
  }, [token, navigate]);

  const authHeaders = { Authorization: `Bearer ${token}` };

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
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
        {
          ...form,
          port: Number(form.port),
        },
        { headers: authHeaders },
      );
      setSuccess(`Registered ${form.modality_type} device "${form.name}"`);
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
    if (!confirm(`Remove DICOM peer "${name}"?`)) return;
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

  return (
    <LabLayout>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
              <HardDrive className="w-6 h-6 text-teal-600" />
              PACS Devices
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Connect CT, MRI, Ultrasound (USG), and Digital X-ray machines. Pull DICOM studies into Mediczy PACS.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={refresh} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add device
            </Button>
            <Button variant="outline" onClick={() => navigate('/lab/ris')}>
              <ScanLine className="w-4 h-4 mr-2" />
              Open RIS / PACS
            </Button>
          </div>
        </div>

        {/* PACS status */}
        <div className={`rounded-lg border p-4 ${pacs?.online ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <div className="flex items-center gap-2 font-medium">
            {pacs?.online ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            )}
            {pacs?.online ? 'Orthanc PACS online' : 'Orthanc PACS offline / not configured'}
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Local AE Title <span className="font-mono">{localAet}</span> · DICOM port{' '}
            <span className="font-mono">{localPort}</span>
            {pacs?.url ? <> · {pacs.url}</> : null}
          </p>
          <p className="text-xs text-slate-500 mt-2">
            Option A — configure each machine to <strong>C-STORE push</strong> to AE <span className="font-mono">{localAet}</span>:{localPort}.
            Option B — register the machine below and <strong>pull</strong> via C-FIND / C-MOVE.
          </p>
          {!pacs?.online && (
            <p className="text-xs text-amber-800 mt-2">
              {pacs?.message || 'Start Orthanc: cd docker/imaging && docker compose up -d'}
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>
        )}
        {success && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{success}</div>
        )}

        {/* Add form */}
        {showForm && (
          <form onSubmit={saveDevice} className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Register modality</h2>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(presets.length ? presets : [
                { type: 'CT', label: 'CT' },
                { type: 'MR', label: 'MRI' },
                { type: 'US', label: 'USG' },
                { type: 'DX', label: 'Digital X-ray' },
              ] as Preset[]).slice(0, 8).map((p) => (
                <button
                  key={p.type}
                  type="button"
                  onClick={() => applyPreset(p.type)}
                  className={`text-xs px-2.5 py-1 rounded-full border ${
                    form.modality_type === p.type ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-700'
                  }`}
                >
                  {p.label || p.type}
                </button>
              ))}
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Device name *</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ct-room-1" required />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">AE Title *</label>
                <Input value={form.ae_title} onChange={(e) => setForm({ ...form, ae_title: e.target.value.toUpperCase().slice(0, 16) })} placeholder="CTSCAN01" required />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Host / IP *</label>
                <Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="192.168.1.50" required />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">DICOM port *</label>
                <Input value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} required />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Manufacturer</label>
                <Input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} placeholder="GE / Siemens / Philips…" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Model / Location</label>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Model" />
                  <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Room" />
                </div>
              </div>
            </div>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save & sync to Orthanc
            </Button>
          </form>
        )}

        {/* Device list */}
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b bg-slate-50 font-medium text-sm">Registered devices</div>
            {loading ? (
              <div className="p-8 text-center text-slate-500"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Loading…</div>
            ) : !modalities.length ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                No scanners yet. Add a CT, MRI, USG, or Digital X-ray device.
              </div>
            ) : (
              <ul className="divide-y">
                {modalities.map((m) => (
                  <li
                    key={m.id}
                    className={`p-4 cursor-pointer hover:bg-slate-50 ${activeDevice?.id === m.id ? 'bg-teal-50' : ''}`}
                    onClick={() => {
                      setActiveDevice(m);
                      setQueryForm((q) => ({ ...q, modalities_in_study: m.modality_type }));
                      setQueryHits([]);
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {m.name}
                          <Badge variant="secondary">{m.modality_type}</Badge>
                          {m.orthanc_synced ? (
                            <Badge variant="outline" className="text-emerald-700 border-emerald-300">synced</Badge>
                          ) : (
                            <Badge variant="outline" className="text-amber-700 border-amber-300">not synced</Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-mono mt-1">
                          {m.ae_title} @ {m.host}:{m.port}
                        </p>
                        {(m.manufacturer || m.location) && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            {[m.manufacturer, m.model, m.location].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="outline" disabled={echoing === m.name} onClick={() => echoDevice(m.name)}>
                          {echoing === m.name ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wifi className="w-3 h-3" />}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => removeDevice(m.name)}>
                          <Trash2 className="w-3 h-3 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Query / retrieve panel */}
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b bg-slate-50 font-medium text-sm flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Pull studies {activeDevice ? `from ${activeDevice.name}` : ''}
            </div>
            {!activeDevice ? (
              <div className="p-8 text-center text-slate-500 text-sm">Select a device to query and retrieve images.</div>
            ) : (
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Patient name"
                    value={queryForm.patient_name}
                    onChange={(e) => setQueryForm({ ...queryForm, patient_name: e.target.value })}
                  />
                  <Input
                    placeholder="Patient ID"
                    value={queryForm.patient_id}
                    onChange={(e) => setQueryForm({ ...queryForm, patient_id: e.target.value })}
                  />
                  <Input
                    type="date"
                    value={queryForm.study_date}
                    onChange={(e) => setQueryForm({ ...queryForm, study_date: e.target.value })}
                  />
                  <Input
                    placeholder="Modalities (CT\\MR\\US\\DX)"
                    value={queryForm.modalities_in_study}
                    onChange={(e) => setQueryForm({ ...queryForm, modalities_in_study: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={runQuery} disabled={querying}>
                    {querying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                    Query (C-FIND)
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!selectedUids.size || retrieving}
                    onClick={retrieveSelected}
                  >
                    {retrieving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                    Pull selected ({selectedUids.size})
                  </Button>
                </div>

                <div className="max-h-80 overflow-y-auto border rounded divide-y">
                  {!queryHits.length ? (
                    <p className="p-4 text-xs text-slate-500">No query results yet.</p>
                  ) : (
                    queryHits.map((hit) => {
                      const uid = hit.studyInstanceUID;
                      if (!uid) return null;
                      const checked = selectedUids.has(uid);
                      return (
                        <label key={uid} className="flex gap-3 p-3 text-sm cursor-pointer hover:bg-slate-50">
                          <input type="checkbox" checked={checked} onChange={() => toggleUid(uid)} className="mt-1" />
                          <div className="min-w-0">
                            <div className="font-medium truncate">{hit.patientName || 'Unknown'} · {hit.patientId || '—'}</div>
                            <div className="text-xs text-slate-500">
                              {hit.studyDate || '—'} · {hit.modalitiesInStudy || activeDevice.modality_type} · {hit.studyDescription || 'Study'}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400 truncate">{uid}</div>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </LabLayout>
  );
}
