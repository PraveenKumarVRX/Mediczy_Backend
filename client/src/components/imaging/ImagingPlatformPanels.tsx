/**
 * Consolidated imaging platform panels — workflow, triage, measurements, longitudinal.
 */
import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  Activity, AlertTriangle, Ruler, History, Loader2, CheckCircle2, Users,
} from 'lucide-react';

const API = '/api/imaging/platform';

type Auth = { token: string; studyId: number; studyInstanceUID: string; patientName: string };

export function ImagingWorkflowPanel({ token, studyId }: { token: string; studyId: number }) {
  const [wf, setWf] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    axios.get(`${API}/workflow/study/${studyId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setWf(r.data.workflow))
      .catch(() => setWf(null));
  }, [token, studyId]);
  if (!wf) return <p className="text-[10px] text-gray-600">No workflow instance.</p>;
  return (
    <div className="text-[10px] space-y-1">
      <div className="text-gray-300 font-semibold flex items-center gap-1"><Activity size={10} /> Workflow</div>
      <div className="text-gray-400">State: <span className="text-indigo-300">{String(wf.state)}</span></div>
      {wf.assigned_name ? <div className="text-gray-500">Assigned: {String(wf.assigned_name)}</div> : null}
    </div>
  );
}

export function ImagingTriagePanel({ token, studyId, studyInstanceUID }: Auth) {
  const [triage, setTriage] = useState<Record<string, unknown> | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const load = useCallback(() => {
    axios.get(`${API}/triage/${studyInstanceUID}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setTriage(r.data.triage))
      .catch(() => setTriage(null));
  }, [token, studyInstanceUID]);
  useEffect(() => { load(); }, [load]);

  const review = async (approved: boolean) => {
    if (!triage?.id) return;
    setReviewing(true);
    await axios.post(`${API}/triage/${triage.id}/review`, { approved }, { headers: { Authorization: `Bearer ${token}` } });
    load();
    setReviewing(false);
  };

  if (!triage) return <p className="text-[10px] text-gray-600">Triage pending.</p>;
  const findings = (triage.findings as Array<{ label: string; severity: string; note?: string }>) || [];
  return (
    <div className="text-[10px] space-y-2">
      <div className="text-gray-300 font-semibold flex items-center gap-1"><AlertTriangle size={10} /> AI Triage</div>
      <div className="text-gray-500">Status: {String(triage.status)} · conf: {String(triage.confidence_score)}</div>
      {findings.map((f, i) => (
        <div key={i} className="text-gray-400">• {f.label} ({f.severity})</div>
      ))}
      {triage.status === 'complete' && (
        <div className="flex gap-2">
          <button type="button" disabled={reviewing} onClick={() => review(true)} className="text-emerald-400 hover:underline">Approve</button>
          <button type="button" disabled={reviewing} onClick={() => review(false)} className="text-red-400 hover:underline">Reject</button>
        </div>
      )}
      {!triage && (
        <button type="button" onClick={() => axios.post(`${API}/triage/${studyId}/request`, {}, { headers: { Authorization: `Bearer ${token}` } }).then(load)}
          className="text-indigo-400 hover:underline">Request triage</button>
      )}
    </div>
  );
}

export function ImagingMeasurementsPanel({ token, studyInstanceUID, studyId, patientName }: Auth) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [sizeMm, setSizeMm] = useState('');
  const [label, setLabel] = useState('lesion');
  const load = useCallback(() => {
    axios.get(`${API}/measurements/${studyInstanceUID}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setRows(r.data.measurements || []))
      .catch(() => setRows([]));
  }, [token, studyInstanceUID]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!sizeMm) return;
    await axios.post(`${API}/measurements`, {
      studyId, studyInstanceUID, lesionLabel: label, sizeMm: Number(sizeMm), tool: 'manual',
      data: { patientName },
    }, { headers: { Authorization: `Bearer ${token}` } });
    setSizeMm('');
    load();
  };

  return (
    <div className="text-[10px] space-y-2">
      <div className="text-gray-300 font-semibold flex items-center gap-1"><Ruler size={10} /> Measurements</div>
      <div className="flex gap-1">
        <input value={label} onChange={(e) => setLabel(e.target.value)} className="flex-1 px-1 py-0.5 bg-gray-800 border border-gray-700 rounded text-white" placeholder="Label" />
        <input value={sizeMm} onChange={(e) => setSizeMm(e.target.value)} className="w-16 px-1 py-0.5 bg-gray-800 border border-gray-700 rounded text-white" placeholder="mm" />
        <button type="button" onClick={add} className="px-2 py-0.5 bg-indigo-800 rounded text-white">Add</button>
      </div>
      {rows.length === 0 ? <p className="text-gray-600">No measurements.</p> : rows.map((m) => (
        <div key={String(m.id)} className="text-gray-400">{String(m.lesion_label)}: {String(m.size_mm)} mm {m.growth_mm != null ? `(Δ ${m.growth_mm} mm)` : ''}</div>
      ))}
    </div>
  );
}

export function ImagingLongitudinalPanel({ token, patientName }: { token: string; patientName: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/longitudinal/${encodeURIComponent(patientName)}/summary`, { headers: { Authorization: `Bearer ${token}` } });
      setSummary(r.data.summary || null);
    } finally { setLoading(false); }
  };
  return (
    <div className="text-[10px] space-y-2">
      <div className="text-gray-300 font-semibold flex items-center gap-1"><History size={10} /> Longitudinal</div>
      <button type="button" onClick={load} disabled={loading} className="text-indigo-400 hover:underline flex items-center gap-1">
        {loading ? <Loader2 size={10} className="animate-spin" /> : null} Generate timeline summary
      </button>
      {summary && <p className="text-gray-400 whitespace-pre-wrap line-clamp-6">{summary}</p>}
    </div>
  );
}

export function ImagingInterpretationPanel({ token, studyId }: { token: string; studyId: number }) {
  const [interp, setInterp] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    axios.get(`${API}/interpretation/${studyId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setInterp(r.data.interpretation))
      .catch(() => setInterp(null));
  }, [token, studyId]);
  if (!interp) return null;
  const attrs = (interp.feature_attributions as Array<{ feature: string; attribution: number }>) || [];
  return (
    <div className="text-[10px] space-y-1 rounded border border-gray-800 p-2 bg-gray-950/50">
      <div className="text-gray-300 flex items-center gap-1"><CheckCircle2 size={10} /> AI confidence: {String(interp.confidence_tier)} ({String(interp.confidence_score)})</div>
      {attrs.slice(0, 3).map((a) => (
        <div key={a.feature} className="text-gray-500">{a.feature}: {Math.round(a.attribution * 100)}%</div>
      ))}
    </div>
  );
}

export default function ImagingPlatformPanels(props: Auth) {
  return (
    <div className="space-y-3 rounded-xl border border-gray-800 bg-gray-900/40 p-3">
      <ImagingInterpretationPanel token={props.token} studyId={props.studyId} />
      <ImagingWorkflowPanel token={props.token} studyId={props.studyId} />
      <ImagingTriagePanel {...props} />
      <ImagingMeasurementsPanel {...props} />
      <ImagingLongitudinalPanel token={props.token} patientName={props.patientName} />
    </div>
  );
}
